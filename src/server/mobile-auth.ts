import "server-only";

import { randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { DevicePlatform } from "@prisma/client";

import { env } from "@/env";
import { sha256 } from "@/server/crypto";
import { db } from "@/server/db";

/**
 * Token authentication for native clients.
 *
 * The web uses Auth.js httpOnly cookies. A native app cannot rely on a cookie
 * jar, and putting a long-lived session cookie in device storage would be a
 * credential in plaintext with no revocation path. So mobile gets its own pair:
 *
 *   access token   15 minutes, stateless JWT, never stored
 *   refresh token  60 days, random, stored hashed, rotated on every use
 *
 * Deliberately separate from the ApiKey model. API keys are organization-scoped
 * and non-expiring by design; a device session is per-user and revocable on its
 * own. Sharing one table would mean revoking someone's phone also kills their
 * server-to-server integration.
 */

/** Short, because it cannot be revoked before it expires. */
const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_DAYS = 60;

const ISSUER = "aso";
const AUDIENCE = "aso-mobile";
const REFRESH_PREFIX = "asor_";

function secret(): Uint8Array {
  return new TextEncoder().encode(env.AUTH_SECRET);
}

export type TokenPair = {
  accessToken: string;
  /** Returned once. Only its hash is stored. */
  refreshToken: string;
  /** Epoch seconds, so a client does not have to parse the JWT to schedule a refresh. */
  accessExpiresAt: number;
  refreshExpiresAt: number;
  sessionId: string;
};

/** Thrown for every rejection. The message is safe to return to a client. */
export class MobileAuthError extends Error {
  constructor(
    readonly code:
      | "invalid_token"
      | "expired"
      | "revoked"
      | "reused"
      | "not_found",
    message: string,
  ) {
    super(message);
    this.name = "MobileAuthError";
  }
}

async function signAccessToken(userId: string, sessionId: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    // Audience keeps a mobile access token from being accepted anywhere a
    // differently-scoped token signed with the same secret would be.
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + ACCESS_TTL_SECONDS)
    .sign(secret());
}

function newRefreshToken(): { plaintext: string; hashed: string } {
  const plaintext = `${REFRESH_PREFIX}${randomBytes(32).toString("base64url")}`;
  return { plaintext, hashed: sha256(plaintext) };
}

function refreshExpiry(): Date {
  return new Date(Date.now() + REFRESH_TTL_DAYS * 86_400_000);
}

/** Issues a refresh token row for a session and returns the full pair. */
async function issuePair(userId: string, sessionId: string): Promise<TokenPair> {
  const { plaintext, hashed } = newRefreshToken();
  const expiresAt = refreshExpiry();

  await db.refreshToken.create({
    data: { sessionId, hashedToken: hashed, expiresAt },
  });

  return {
    accessToken: await signAccessToken(userId, sessionId),
    refreshToken: plaintext,
    accessExpiresAt: Math.floor(Date.now() / 1000) + ACCESS_TTL_SECONDS,
    refreshExpiresAt: Math.floor(expiresAt.getTime() / 1000),
    sessionId,
  };
}

/**
 * Signs a device in.
 *
 * Called after the app has completed a native OAuth flow and the identity has
 * been verified — this function trusts `userId` and must never be reachable
 * from an unauthenticated route.
 */
export async function createDeviceSession(input: {
  userId: string;
  platform: DevicePlatform;
  deviceName?: string | null;
  appVersion?: string | null;
}): Promise<TokenPair> {
  const session = await db.deviceSession.create({
    data: {
      userId: input.userId,
      platform: input.platform,
      deviceName: input.deviceName?.slice(0, 120) ?? null,
      appVersion: input.appVersion?.slice(0, 40) ?? null,
    },
  });

  return issuePair(input.userId, session.id);
}

/**
 * Exchanges a refresh token for a new pair.
 *
 * Replay handling is the point of this function. A token that has already been
 * used means the value was captured — the legitimate client would only ever
 * hold the newest one. Rejecting just that call would leave the thief holding a
 * working chain, so the whole device session is revoked and the real user is
 * forced to sign in again.
 */
export async function rotateRefreshToken(presented: string): Promise<TokenPair> {
  if (!presented.startsWith(REFRESH_PREFIX)) {
    throw new MobileAuthError("invalid_token", "Malformed refresh token");
  }

  const existing = await db.refreshToken.findUnique({
    where: { hashedToken: sha256(presented) },
    include: { session: true },
  });

  if (!existing) {
    throw new MobileAuthError("not_found", "Unknown refresh token");
  }

  if (existing.usedAt) {
    await revokeDeviceSession(existing.sessionId, "refresh token replayed");
    throw new MobileAuthError(
      "reused",
      "This refresh token was already used. All sessions for this device have been revoked; sign in again.",
    );
  }

  if (existing.session.revokedAt) {
    throw new MobileAuthError("revoked", "This device session has been revoked");
  }

  if (existing.expiresAt < new Date()) {
    throw new MobileAuthError("expired", "Refresh token has expired");
  }

  // Marked used and re-issued in one transaction: a crash between the two must
  // not consume the old token without producing a replacement, which would lock
  // the device out with no way back.
  const { plaintext, hashed } = newRefreshToken();
  const expiresAt = refreshExpiry();
  const now = new Date();

  await db.$transaction([
    db.refreshToken.update({ where: { id: existing.id }, data: { usedAt: now } }),
    db.refreshToken.create({
      data: { sessionId: existing.sessionId, hashedToken: hashed, expiresAt },
    }),
    db.deviceSession.update({
      where: { id: existing.sessionId },
      data: { lastUsedAt: now },
    }),
  ]);

  return {
    accessToken: await signAccessToken(existing.session.userId, existing.sessionId),
    refreshToken: plaintext,
    accessExpiresAt: Math.floor(Date.now() / 1000) + ACCESS_TTL_SECONDS,
    refreshExpiresAt: Math.floor(expiresAt.getTime() / 1000),
    sessionId: existing.sessionId,
  };
}

export async function revokeDeviceSession(sessionId: string, reason: string): Promise<void> {
  await db.deviceSession.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date(), revokedFor: reason.slice(0, 200) },
  });
}

/** Signs out from a refresh token, so the client does not need the session id. */
export async function revokeByRefreshToken(presented: string): Promise<boolean> {
  const existing = await db.refreshToken.findUnique({
    where: { hashedToken: sha256(presented) },
    select: { sessionId: true },
  });

  if (!existing) return false;
  await revokeDeviceSession(existing.sessionId, "signed out");
  return true;
}

export type MobileSession = {
  user: { id: string; email: string; name: string | null };
  deviceSessionId: string;
};

/**
 * Resolves an access token to a session, or null.
 *
 * Returns null rather than throwing so the tRPC context can fall through to the
 * cookie path — an absent or bad bearer must look exactly like no bearer at all.
 *
 * The access token is stateless, so this checks the device session is still live
 * on every call. That is one indexed lookup, and it is the difference between
 * "revoked" meaning immediately and meaning within fifteen minutes.
 */
export async function sessionFromAccessToken(token: string): Promise<MobileSession | null> {
  let payload: { sub?: string; sid?: unknown };

  try {
    const verified = await jwtVerify(token, secret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    payload = verified.payload;
  } catch {
    return null;
  }

  const userId = payload.sub;
  const sessionId = typeof payload.sid === "string" ? payload.sid : null;
  if (!userId || !sessionId) return null;

  const session = await db.deviceSession.findUnique({
    where: { id: sessionId },
    select: {
      revokedAt: true,
      user: { select: { id: true, email: true, name: true } },
    },
  });

  if (!session || session.revokedAt || session.user.id !== userId) return null;

  return { user: session.user, deviceSessionId: sessionId };
}

/** The device list for the settings screen. */
export async function listDeviceSessions(userId: string) {
  return db.deviceSession.findMany({
    where: { userId, revokedAt: null },
    orderBy: { lastUsedAt: "desc" },
    select: {
      id: true,
      platform: true,
      deviceName: true,
      appVersion: true,
      lastUsedAt: true,
      createdAt: true,
    },
  });
}

/**
 * Housekeeping. Used refresh tokens are kept past expiry on purpose: replay
 * detection needs them, and deleting them the moment they expire would turn a
 * stolen-token alarm into a silent "unknown token" rejection.
 */
export async function pruneExpiredRefreshTokens(): Promise<number> {
  const cutoff = new Date(Date.now() - 30 * 86_400_000);
  const { count } = await db.refreshToken.deleteMany({
    where: { expiresAt: { lt: cutoff } },
  });
  return count;
}
