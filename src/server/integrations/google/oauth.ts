import "server-only";

import { env } from "@/env";
import { withRetry } from "@aso/shared";
import { db } from "@/server/db";
import { encryptJson } from "@/server/crypto";
import {
  IntegrationNotConfiguredError,
  ReauthRequiredError,
  type GoogleCredentials,
} from "@/server/integrations/types";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";

/** Scopes per data integration. Requested incrementally so users only grant what they connect. */
export const GOOGLE_SCOPES = {
  base: ["openid", "email", "profile"],
  FIREBASE: [
    "https://www.googleapis.com/auth/firebase.readonly",
    "https://www.googleapis.com/auth/analytics.readonly",
  ],
  ADMOB: ["https://www.googleapis.com/auth/admob.readonly"],
  GOOGLE_ADS: ["https://www.googleapis.com/auth/adwords"],
  PLAY_CONSOLE: [
    "https://www.googleapis.com/auth/androidpublisher",
    // Play Console install/rating statistics are only published as CSV files
    // in a private Cloud Storage bucket; there is no stats REST endpoint.
    "https://www.googleapis.com/auth/devstorage.read_only",
    "https://www.googleapis.com/auth/playdeveloperreporting",
  ],
} as const;

export function googleOauthConfigured(): boolean {
  return Boolean(env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET);
}

function requireClient() {
  if (!googleOauthConfigured()) {
    throw new IntegrationNotConfiguredError("Google OAuth client");
  }
  return {
    clientId: env.GOOGLE_OAUTH_CLIENT_ID!,
    clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET!,
  };
}

export function googleRedirectUri(origin?: string): string {
  if (origin) {
    return `${origin.replace(/\/$/, "")}/api/oauth/google/callback`;
  }
  return `${env.APP_URL.replace(/\/$/, "")}/api/oauth/google/callback`;
}

/**
 * `state` is an opaque signed value produced by the route handler; this only
 * builds the URL. `prompt=consent` + `access_type=offline` is required to get
 * a refresh token back on re-authorization.
 */
export function buildGoogleAuthUrl(opts: {
  scopes: string[];
  state: string;
  loginHint?: string;
  redirectUri?: string;
}): string {
  const { clientId } = requireClient();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: opts.redirectUri ?? googleRedirectUri(),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: Array.from(new Set([...GOOGLE_SCOPES.base, ...opts.scopes])).join(" "),
    state: opts.state,
  });
  if (opts.loginHint) params.set("login_hint", opts.loginHint);
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  id_token?: string;
};

export async function exchangeGoogleCode(code: string, redirectUri?: string): Promise<GoogleCredentials> {
  const { clientId, clientSecret } = requireClient();

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri ?? googleRedirectUri(),
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    throw new Error(`Google token exchange failed (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as TokenResponse;

  return {
    kind: "google-oauth",
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + json.expires_in * 1000,
    scope: json.scope,
    tokenType: json.token_type,
    idToken: json.id_token,
  };
}

export async function refreshGoogleToken(credentials: GoogleCredentials): Promise<GoogleCredentials> {
  if (!credentials.refreshToken) {
    throw new ReauthRequiredError("No refresh token stored for this connection");
  }
  const { clientId, clientSecret } = requireClient();

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: credentials.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (res.status === 400 || res.status === 401) {
    // invalid_grant: the user revoked access or the refresh token expired.
    throw new ReauthRequiredError(`Google refused the refresh token: ${await res.text()}`);
  }
  if (!res.ok) {
    throw new Error(`Google token refresh failed (${res.status}): ${await res.text()}`);
  }

  const json = (await res.json()) as TokenResponse;
  return {
    ...credentials,
    accessToken: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
    scope: json.scope ?? credentials.scope,
    // Google only returns a new refresh token on re-consent.
    refreshToken: json.refresh_token ?? credentials.refreshToken,
  };
}

/**
 * Returns a valid access token, refreshing and persisting when it is within
 * 2 minutes of expiry. Every Google connector calls this instead of reading
 * the stored token directly.
 */
export async function getFreshGoogleToken(
  connectionId: string,
  credentials: GoogleCredentials,
): Promise<{ accessToken: string; credentials: GoogleCredentials }> {
  const expiresSoon = !credentials.expiresAt || credentials.expiresAt - Date.now() < 120_000;
  if (!expiresSoon) {
    return { accessToken: credentials.accessToken, credentials };
  }

  const refreshed = await refreshGoogleToken(credentials);
  await db.connection.update({
    where: { id: connectionId },
    data: {
      credentials: encryptJson(refreshed),
      expiresAt: refreshed.expiresAt ? new Date(refreshed.expiresAt) : null,
      status: "ACTIVE",
      lastError: null,
      errorCount: 0,
    },
  });
  return { accessToken: refreshed.accessToken, credentials: refreshed };
}

export async function revokeGoogleToken(credentials: GoogleCredentials): Promise<void> {
  const token = credentials.refreshToken ?? credentials.accessToken;
  if (!token) return;
  await fetch(REVOKE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  }).catch(() => undefined);
}

export async function fetchGoogleUserInfo(accessToken: string): Promise<{ email?: string; name?: string; sub?: string }> {
  const res = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return {};
  return (await res.json()) as { email?: string; name?: string; sub?: string };
}

/**
 * Authorized JSON call against any Google API. Handles refresh-on-401 once,
 * retries transient failures, and translates permanent auth failures into
 * ReauthRequiredError so the scheduler can park the connection.
 */
export async function googleApiFetch<T>(
  opts: {
    connectionId: string;
    credentials: GoogleCredentials;
    url: string;
    method?: "GET" | "POST";
    body?: unknown;
    headers?: Record<string, string>;
  },
): Promise<T> {
  const { connectionId, url, method = "GET", body, headers = {} } = opts;
  let creds = opts.credentials;

  const call = async (accessToken: string) =>
    fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  return withRetry(async () => {
    const fresh = await getFreshGoogleToken(connectionId, creds);
    creds = fresh.credentials;

    let res = await call(fresh.accessToken);

    if (res.status === 401) {
      // Token was rejected despite looking fresh — force one refresh cycle.
      const retried = await getFreshGoogleToken(connectionId, { ...creds, expiresAt: 0 });
      creds = retried.credentials;
      res = await call(retried.accessToken);
    }

    if (res.status === 403) {
      const text = await res.text();
      if (/insufficient|scope|PERMISSION_DENIED/i.test(text)) {
        throw new ReauthRequiredError(`Google denied the request: ${text.slice(0, 400)}`);
      }
      throw Object.assign(new Error(`Google API 403: ${text.slice(0, 400)}`), { status: 403 });
    }

    if (!res.ok) {
      const text = await res.text();
      throw Object.assign(new Error(`Google API ${res.status}: ${text.slice(0, 400)}`), {
        status: res.status,
      });
    }

    return (await res.json()) as T;
  });
}
