import { NextResponse, type NextRequest } from "next/server";

import { sha256 } from "@/server/crypto";
import { revokeByRefreshToken } from "@/server/mobile-auth";
import { authErrorResponse, clientIp, limitOrThrow, refreshInput } from "@/server/mobile-http";

export const dynamic = "force-dynamic";

/**
 * Signs a device out.
 *
 *   POST /api/mobile/auth/revoke
 *   { refreshToken }
 *
 * Returns 200 whether or not the token was found. Sign-out must always look
 * like it worked — the client is discarding its credentials either way, and a
 * 404 here would let an attacker probe which tokens exist.
 */
export async function POST(request: NextRequest) {
  const limited = await limitOrThrow(`mobile:revoke:${sha256(clientIp(request.headers))}`, 30, 300);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON", code: "bad_request" }, { status: 400 });
  }

  const parsed = refreshInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", code: "bad_request" }, { status: 400 });
  }

  try {
    await revokeByRefreshToken(parsed.data.refreshToken);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error);
  }
}
