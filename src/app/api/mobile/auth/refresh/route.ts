import { NextResponse, type NextRequest } from "next/server";

import { sha256 } from "@/server/crypto";
import { rotateRefreshToken } from "@/server/mobile-auth";
import {
  authErrorResponse,
  clientIp,
  limitOrThrow,
  refreshInput,
  tokenResponse,
} from "@/server/mobile-http";

export const dynamic = "force-dynamic";

/**
 * Rotates a refresh token.
 *
 *   POST /api/mobile/auth/refresh
 *   { refreshToken }
 *
 * Always returns a new pair — the presented token is single-use. A client that
 * loses the response has to sign in again, which is the correct trade: the
 * alternative is a token that stays valid after being transmitted twice.
 *
 * Replaying a used token revokes the whole device session. See mobile-auth.ts.
 */
export async function POST(request: NextRequest) {
  const limited = await limitOrThrow(`mobile:refresh:${sha256(clientIp(request.headers))}`, 60, 300);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON", code: "bad_request" }, { status: 400 });
  }

  const parsed = refreshInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", code: "bad_request" },
      { status: 400 },
    );
  }

  try {
    return tokenResponse(await rotateRefreshToken(parsed.data.refreshToken));
  } catch (error) {
    return authErrorResponse(error);
  }
}
