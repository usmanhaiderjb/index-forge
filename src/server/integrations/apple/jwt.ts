import "server-only";

import { SignJWT, importPKCS8 } from "jose";

import type { AppleCredentials } from "@/server/integrations/types";

const AUDIENCE = "appstoreconnect-v1";
/** Apple rejects tokens with a lifetime over 20 minutes. */
const LIFETIME_SECONDS = 19 * 60;

type CachedToken = { token: string; expiresAt: number };
const cache = new Map<string, CachedToken>();

/**
 * Normalizes a .p8 key pasted into a form or an env var, where newlines are
 * frequently collapsed to literal "\n".
 */
function normalizePem(key: string): string {
  const cleaned = key.replace(/\\n/g, "\n").trim();
  if (cleaned.includes("BEGIN PRIVATE KEY")) return cleaned;
  const body = cleaned.replace(/\s+/g, "");
  const lines = body.match(/.{1,64}/g) ?? [];
  return `-----BEGIN PRIVATE KEY-----\n${lines.join("\n")}\n-----END PRIVATE KEY-----`;
}

/**
 * App Store Connect uses short-lived ES256 JWTs signed with the team's .p8
 * key rather than OAuth. Tokens are cached per key id until shortly before
 * expiry so a batch sync does not re-sign on every request.
 */
export async function createAppleToken(credentials: AppleCredentials): Promise<string> {
  const cacheKey = `${credentials.issuerId}:${credentials.keyId}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt - Date.now() > 60_000) return cached.token;

  const privateKey = await importPKCS8(normalizePem(credentials.privateKey), "ES256");
  const now = Math.floor(Date.now() / 1000);

  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: credentials.keyId, typ: "JWT" })
    .setIssuer(credentials.issuerId)
    .setIssuedAt(now)
    .setExpirationTime(now + LIFETIME_SECONDS)
    .setAudience(AUDIENCE)
    .sign(privateKey);

  cache.set(cacheKey, { token, expiresAt: (now + LIFETIME_SECONDS) * 1000 });
  return token;
}

export function clearAppleTokenCache(credentials: AppleCredentials) {
  cache.delete(`${credentials.issuerId}:${credentials.keyId}`);
}
