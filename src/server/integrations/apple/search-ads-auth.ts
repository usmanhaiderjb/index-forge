import "server-only";

import { SignJWT, importPKCS8 } from "jose";

import { ReauthRequiredError, type AppleSearchAdsCredentials } from "@/server/integrations/types";

const TOKEN_URL = "https://appleid.apple.com/auth/oauth2/token";
/** Apple rejects client-secret assertions with a lifetime over 180 days. */
const ASSERTION_LIFETIME_SECONDS = 86_400 * 30;
const SCOPE = "searchadsorg";

/**
 * Same normalization as the App Store Connect key: .p8 contents pasted into a
 * form usually arrive with newlines collapsed to a literal backslash-n.
 */
function normalizePem(key: string): string {
  const cleaned = key.replace(/\\n/g, "\n").trim();
  if (cleaned.includes("BEGIN PRIVATE KEY")) return cleaned;
  const body = cleaned.replace(/\s+/g, "");
  const lines = body.match(/.{1,64}/g) ?? [];
  return `-----BEGIN PRIVATE KEY-----\n${lines.join("\n")}\n-----END PRIVATE KEY-----`;
}

/**
 * The client secret is itself a signed assertion, not a stored string.
 *
 * Note the audience is Apple's ID service, not the Search Ads API — signing
 * with the App Store Connect audience produces a well-formed token that Apple
 * rejects with a generic invalid_client, which is a miserable thing to debug.
 */
async function createClientSecret(credentials: AppleSearchAdsCredentials): Promise<string> {
  const privateKey = await importPKCS8(normalizePem(credentials.privateKey), "ES256");
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: credentials.keyId })
    .setIssuer(credentials.teamId)
    .setSubject(credentials.clientId)
    .setAudience("https://appleid.apple.com")
    .setIssuedAt(now)
    .setExpirationTime(now + ASSERTION_LIFETIME_SECONDS)
    .sign(privateKey);
}

type CachedToken = { token: string; expiresAt: number };
const cache = new Map<string, CachedToken>();

/**
 * Exchanges the assertion for a bearer token, cached until shortly before
 * expiry. Access tokens last an hour and a 30-day sync issues hundreds of
 * requests, so re-minting per request would be pure waste.
 */
export async function getSearchAdsToken(
  credentials: AppleSearchAdsCredentials,
): Promise<string> {
  const cacheKey = `${credentials.clientId}:${credentials.orgId}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt - Date.now() > 60_000) return cached.token;

  const clientSecret = await createClientSecret(credentials);

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Host: "appleid.apple.com",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: credentials.clientId,
      client_secret: clientSecret,
      scope: SCOPE,
    }),
  });

  const text = await res.text();

  if (!res.ok) {
    // invalid_client covers a revoked key, a wrong team id and a key from the
    // App Store Connect console rather than the Search Ads one. Apple does not
    // distinguish them, so say what to check instead of echoing the code.
    if (/invalid_client|invalid_grant/i.test(text)) {
      throw new ReauthRequiredError(
        "Apple rejected the Search Ads credentials. Check that the client id, team id and key id come from Search Ads (Account Settings > API) and that the key has not been revoked.",
      );
    }
    throw new Error(`Apple Search Ads token ${res.status}: ${text.slice(0, 400)}`);
  }

  const json = JSON.parse(text) as { access_token?: string; expires_in?: number };
  if (!json.access_token) {
    throw new Error("Apple Search Ads returned no access token");
  }

  cache.set(cacheKey, {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  });

  return json.access_token;
}

export function clearSearchAdsTokenCache(credentials: AppleSearchAdsCredentials) {
  cache.delete(`${credentials.clientId}:${credentials.orgId}`);
}
