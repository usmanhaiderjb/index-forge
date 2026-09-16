import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { Platform } from "react-native";

/**
 * Token storage and refresh.
 *
 * Tokens live in the Keychain / Keystore via expo-secure-store, never in
 * AsyncStorage — AsyncStorage is plaintext on disk, and a refresh token there
 * is a 60-day credential anyone with the device can read.
 */

const ACCESS_KEY = "aso.accessToken";
const REFRESH_KEY = "aso.refreshToken";
const EXPIRY_KEY = "aso.accessExpiresAt";

export const API_URL: string =
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? "http://localhost:3000";

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: number;
  refreshExpiresAt: number;
};

export type DeviceInfo = {
  platform: "IOS" | "ANDROID";
  deviceName?: string;
  appVersion?: string;
};

export function deviceInfo(): DeviceInfo {
  return {
    platform: Platform.OS === "ios" ? "IOS" : "ANDROID",
    deviceName: Device.modelName ?? undefined,
    appVersion: Constants.expoConfig?.version ?? undefined,
  };
}

export async function saveTokens(pair: TokenPair): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_KEY, pair.accessToken),
    SecureStore.setItemAsync(REFRESH_KEY, pair.refreshToken),
    SecureStore.setItemAsync(EXPIRY_KEY, String(pair.accessExpiresAt)),
  ]);
}

export async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_KEY),
    SecureStore.deleteItemAsync(REFRESH_KEY),
    SecureStore.deleteItemAsync(EXPIRY_KEY),
  ]);
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_KEY);
}

/** Thrown when the session is gone for good and the user must sign in again. */
export class SessionExpiredError extends Error {
  constructor(message = "Your session has expired. Sign in again.") {
    super(message);
    this.name = "SessionExpiredError";
  }
}

/**
 * In-flight refresh, shared by every caller.
 *
 * This is the detail that decides whether the app works on a cold start. Six
 * queries fire at once, all see an expired token, and all call refresh. The
 * server rotates on first use and treats the second presentation as a replay —
 * which revokes the whole device session and signs the user out for doing
 * nothing wrong. One promise, shared, prevents that entirely.
 */
let inFlight: Promise<string> | null = null;

/** Refreshed this far before expiry, so a request is never sent with a token that dies mid-flight. */
const SKEW_SECONDS = 60;

async function readAccess(): Promise<{ token: string | null; expiresAt: number }> {
  const [token, expiry] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_KEY),
    SecureStore.getItemAsync(EXPIRY_KEY),
  ]);
  return { token, expiresAt: Number(expiry ?? 0) };
}

async function performRefresh(): Promise<string> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) throw new SessionExpiredError();

  const res = await fetch(`${API_URL}/api/mobile/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) {
    // 401 means the token is dead — expired, revoked, or replayed. There is no
    // recovering from any of those on the client, so drop everything rather
    // than retrying against a credential that will never work again.
    if (res.status === 401) {
      await clearTokens();
      throw new SessionExpiredError();
    }
    // A 500 or a dropped connection is transient; keep the tokens so the next
    // attempt can succeed.
    throw new Error(`Could not refresh session (${res.status})`);
  }

  const pair = (await res.json()) as TokenPair;
  await saveTokens(pair);
  return pair.accessToken;
}

/**
 * A usable access token, refreshing if needed.
 *
 * `force` is for the 401 path: the token looked valid locally but the server
 * rejected it, which happens after a remote revocation.
 */
export async function getAccessToken(force = false): Promise<string> {
  if (!force) {
    const { token, expiresAt } = await readAccess();
    const now = Math.floor(Date.now() / 1000);
    if (token && expiresAt - SKEW_SECONDS > now) return token;
  }

  // Whoever gets here first does the work; everyone else awaits the same promise.
  inFlight ??= performRefresh().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

/** Whether there is a session to restore, without touching the network. */
export async function hasStoredSession(): Promise<boolean> {
  return (await getRefreshToken()) !== null;
}

export async function signInWithGoogle(idToken: string): Promise<TokenPair> {
  return exchange({ provider: "google", idToken, ...deviceInfo() });
}

/** Development only. The server refuses this provider when NODE_ENV is production. */
export async function signInWithDevEmail(email: string): Promise<TokenPair> {
  return exchange({ provider: "dev", email, ...deviceInfo() });
}

async function exchange(body: Record<string, unknown>): Promise<TokenPair> {
  const res = await fetch(`${API_URL}/api/mobile/auth/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = (await res.json().catch(() => ({}))) as Partial<TokenPair> & { error?: string };

  if (!res.ok || !json.accessToken || !json.refreshToken) {
    throw new Error(json.error ?? `Sign-in failed (${res.status})`);
  }

  const pair = json as TokenPair;
  await saveTokens(pair);
  return pair;
}

export async function signOut(): Promise<void> {
  const refreshToken = await getRefreshToken();

  // Local state is cleared regardless of what the server says. A failed
  // network call must not leave someone apparently still signed in.
  if (refreshToken) {
    await fetch(`${API_URL}/api/mobile/auth/revoke`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    }).catch(() => undefined);
  }

  await clearTokens();
}
