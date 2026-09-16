import { NextResponse, type NextRequest } from "next/server";
import { OAuth2Client } from "google-auth-library";
import { z } from "zod";

import { env } from "@/env";
import { sha256 } from "@/server/crypto";
import { db } from "@/server/db";
import { ensureOrganization } from "@/server/auth";
import { createDeviceSession, MobileAuthError } from "@/server/mobile-auth";
import {
  authErrorResponse,
  clientIp,
  deviceInfo,
  limitOrThrow,
  tokenResponse,
} from "@/server/mobile-http";

export const dynamic = "force-dynamic";

/**
 * Signs a device in.
 *
 *   POST /api/mobile/auth/token
 *   { idToken, platform, deviceName?, appVersion? }
 *
 * The app completes Google's native flow with PKCE and posts the resulting ID
 * token here. The server verifies it against Google's keys — it never sees a
 * password, and it never trusts a client-supplied email.
 */

const googleInput = deviceInfo.extend({
  provider: z.literal("google").default("google"),
  /** Google ID token from expo-auth-session. */
  idToken: z.string().min(20),
});

const devInput = deviceInfo.extend({
  provider: z.literal("dev"),
  email: z.string().email(),
});

const input = z.union([googleInput, devInput]);

export async function POST(request: NextRequest) {
  // Minting credentials is the endpoint worth brute-forcing.
  const limited = await limitOrThrow(`mobile:token:${sha256(clientIp(request.headers))}`, 10, 300);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON", code: "bad_request" }, { status: 400 });
  }

  const parsed = input.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", code: "bad_request", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    const identity =
      parsed.data.provider === "dev"
        ? await devIdentity(parsed.data.email)
        : await googleIdentity(parsed.data.idToken);

    const user = await db.user.upsert({
      where: { email: identity.email },
      create: {
        email: identity.email,
        name: identity.name ?? identity.email.split("@")[0],
        image: identity.image ?? null,
        // Google has already verified it; the dev path is development-only.
        emailVerified: new Date(),
      },
      update: identity.image ? { image: identity.image } : {},
    });

    await ensureOrganization(user.id, user.name, user.email);

    const pair = await createDeviceSession({
      userId: user.id,
      platform: parsed.data.platform,
      deviceName: parsed.data.deviceName,
      appVersion: parsed.data.appVersion,
    });

    await db.auditLog.create({
      data: {
        organizationId: (await db.membership.findFirstOrThrow({ where: { userId: user.id } }))
          .organizationId,
        actorId: user.id,
        action: "device.signin",
        targetType: "DeviceSession",
        targetId: pair.sessionId,
        meta: { platform: parsed.data.platform, deviceName: parsed.data.deviceName ?? null },
      },
    });

    return tokenResponse(pair);
  } catch (error) {
    return authErrorResponse(error);
  }
}

type Identity = { email: string; name: string | null; image: string | null };

async function googleIdentity(idToken: string): Promise<Identity> {
  const clientId = env.AUTH_GOOGLE_ID;
  if (!clientId) {
    throw new MobileAuthError(
      "invalid_token",
      "Google sign-in is not configured on this deployment",
    );
  }

  const ticket = await new OAuth2Client(clientId)
    .verifyIdToken({ idToken, audience: clientId })
    .catch(() => null);

  const payload = ticket?.getPayload();

  // email_verified matters: an unverified Google address could belong to
  // someone else, and this path creates or takes over an account keyed on it.
  if (!payload?.email || payload.email_verified !== true) {
    throw new MobileAuthError("invalid_token", "Google did not return a verified email address");
  }

  return {
    email: payload.email.toLowerCase(),
    name: payload.name ?? null,
    image: payload.picture ?? null,
  };
}

/**
 * Development convenience, mirroring the web dev credentials provider. Refuses
 * to run in production — this would otherwise be a sign-in-as-anyone endpoint.
 */
async function devIdentity(email: string): Promise<Identity> {
  if (env.NODE_ENV === "production") {
    throw new MobileAuthError("invalid_token", "The dev provider is not available in production");
  }
  return { email: email.trim().toLowerCase(), name: null, image: null };
}
