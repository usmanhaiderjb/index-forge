import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { MobileAuthError, type TokenPair } from "@/server/mobile-auth";
import { rateLimit } from "@/server/redis";

/** Shared request/response shapes for the mobile auth routes. */

export const deviceInfo = z.object({
  platform: z.enum(["IOS", "ANDROID"]),
  deviceName: z.string().max(120).optional(),
  appVersion: z.string().max(40).optional(),
});

export const refreshInput = z.object({
  refreshToken: z.string().min(20).max(200),
});

export function tokenResponse(pair: TokenPair) {
  return NextResponse.json({
    accessToken: pair.accessToken,
    refreshToken: pair.refreshToken,
    accessExpiresAt: pair.accessExpiresAt,
    refreshExpiresAt: pair.refreshExpiresAt,
    tokenType: "Bearer",
  });
}

/**
 * Maps an auth failure onto a status.
 *
 * A replayed token is 401 rather than 403: the client's correct response is
 * identical either way — discard the credentials and sign in again — and 403
 * would suggest the account itself is blocked.
 */
export function authErrorResponse(error: unknown) {
  if (error instanceof MobileAuthError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 401 });
  }

  console.error("[mobile-auth]", error);
  return NextResponse.json({ error: "Internal error", code: "internal" }, { status: 500 });
}

/** Client IP for rate-limit keys. Hashed by the caller, never stored raw. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "unknown";
  return headers.get("x-real-ip") ?? "unknown";
}

/**
 * Unauthenticated endpoints that mint or exchange credentials are the ones
 * worth brute-forcing, so they are limited harder than the general API.
 * A failure to reach Redis must not take auth down with it — the limiter is
 * best-effort and open on error.
 */
export async function limitOrThrow(key: string, limit: number, windowSeconds: number) {
  const result = await rateLimit(key, limit, windowSeconds).catch(() => null);
  if (result && !result.allowed) {
    return NextResponse.json(
      { error: `Too many attempts. Retry in ${result.resetIn}s.`, code: "rate_limited" },
      { status: 429, headers: { "retry-after": String(result.resetIn) } },
    );
  }
  return null;
}
