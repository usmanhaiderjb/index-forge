import "server-only";

import { SignJWT, importPKCS8 } from "jose";

/**
 * Firebase Cloud Messaging, HTTP v1.
 *
 * ## What this can and cannot target
 *
 * `messages:send` accepts exactly one of `token`, `topic` or `condition`. There
 * is **no send-to-all-users endpoint**. The Firebase Console's "Send to all
 * users" is backed by Firebase's own device registry, which Google does not
 * expose — no third-party tool can reproduce it. See docs/PUSH-PLAN.md §1.
 *
 * A topic is therefore the broadcast primitive, and it only reaches devices the
 * customer's app subscribed. The UI has to say that rather than implying reach
 * the API cannot deliver.
 *
 * ## Auth
 *
 * A Google service account JSON, exchanged for a short-lived OAuth2 access
 * token via a self-signed RS256 assertion. Tokens last an hour, so they are
 * cached per project — a twelve-app campaign should mint twelve tokens, not one
 * per message.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

export type ServiceAccount = {
  type?: string;
  project_id: string;
  private_key: string;
  client_email: string;
  token_uri?: string;
};

/** Everything a send needs, already decrypted. */
export type FcmTarget =
  | { kind: "topic"; topic: string }
  | { kind: "condition"; condition: string }
  | { kind: "token"; token: string };

export type FcmMessage = {
  title: string;
  body: string;
  imageUrl?: string | null;
  /** Delivered as data, because FCM has no link concept of its own. */
  linkUrl?: string | null;
};

export type FcmSendResult =
  | { ok: true; messageId: string }
  | { ok: false; code: FcmErrorCode; detail: string; retryable: boolean };

/**
 * The FCM errors worth distinguishing. Everything else collapses to `UNKNOWN`
 * — a long tail of codes that all mean "look at the detail string".
 */
export type FcmErrorCode =
  | "UNREGISTERED"
  | "SENDER_ID_MISMATCH"
  | "THIRD_PARTY_AUTH_ERROR"
  | "QUOTA_EXCEEDED"
  | "UNAVAILABLE"
  | "INVALID_ARGUMENT"
  | "PERMISSION_DENIED"
  | "UNAUTHENTICATED"
  | "UNKNOWN";

/**
 * Whether a failure is worth retrying.
 *
 * Retrying `INVALID_ARGUMENT` three times does not fix a malformed payload; it
 * just delays telling the user what is wrong by several minutes.
 */
const RETRYABLE: ReadonlySet<FcmErrorCode> = new Set<FcmErrorCode>([
  "QUOTA_EXCEEDED",
  "UNAVAILABLE",
]);

export function classifyFcmError(status: number, body: string): {
  code: FcmErrorCode;
  detail: string;
  retryable: boolean;
} {
  type ErrorBody = { error?: { status?: string; message?: string; details?: unknown[] } };

  let parsed: ErrorBody | null;
  try {
    parsed = JSON.parse(body) as ErrorBody;
  } catch {
    parsed = null;
  }

  // The precise reason lives in details[].errorCode, not the top-level status.
  const details: unknown[] = Array.isArray(parsed?.error?.details) ? parsed.error.details : [];
  const fcmDetail = details.find(
    (d: unknown): d is { errorCode?: string } =>
      typeof d === "object" && d !== null && "errorCode" in d,
  );

  const raw = String(fcmDetail?.errorCode ?? parsed?.error?.status ?? "").toUpperCase();
  const message = parsed?.error?.message ?? body.slice(0, 300);

  const code: FcmErrorCode = ((): FcmErrorCode => {
    if (raw.includes("UNREGISTERED")) return "UNREGISTERED";
    if (raw.includes("SENDER_ID_MISMATCH")) return "SENDER_ID_MISMATCH";
    if (raw.includes("THIRD_PARTY_AUTH")) return "THIRD_PARTY_AUTH_ERROR";
    if (raw.includes("QUOTA") || raw.includes("RESOURCE_EXHAUSTED")) return "QUOTA_EXCEEDED";
    if (raw.includes("UNAVAILABLE")) return "UNAVAILABLE";
    if (raw.includes("INVALID_ARGUMENT")) return "INVALID_ARGUMENT";
    if (raw.includes("PERMISSION_DENIED")) return "PERMISSION_DENIED";
    if (raw.includes("UNAUTHENTICATED")) return "UNAUTHENTICATED";
    // 5xx with no recognisable code is still worth another attempt.
    if (status >= 500) return "UNAVAILABLE";
    return "UNKNOWN";
  })();

  return { code, detail: describe(code, message), retryable: RETRYABLE.has(code) };
}

/** Turns an FCM code into something a person can act on. */
function describe(code: FcmErrorCode, message: string): string {
  switch (code) {
    case "UNREGISTERED":
      return "That device token is no longer valid — the app was uninstalled or the token rotated.";
    case "SENDER_ID_MISMATCH":
      return "This token belongs to a different Firebase project. Check the service account matches the app.";
    case "THIRD_PARTY_AUTH_ERROR":
      return "Firebase has no APNs key for this project, so iOS devices cannot be reached. Upload one in Firebase → Project settings → Cloud Messaging.";
    case "QUOTA_EXCEEDED":
      return "Firebase is rate limiting this project. The send will be retried.";
    case "UNAVAILABLE":
      return "Firebase is temporarily unavailable. The send will be retried.";
    case "INVALID_ARGUMENT":
      return `Firebase rejected the message as malformed: ${message}`;
    case "PERMISSION_DENIED":
      return "The service account lacks permission to send. It needs the Firebase Cloud Messaging API Admin role.";
    case "UNAUTHENTICATED":
      return "The service account key was rejected. It may have been deleted or disabled in Google Cloud.";
    default:
      return message;
  }
}

/* ------------------------------------------------------------------ tokens */

type CachedToken = { token: string; expiresAt: number };
const tokenCache = new Map<string, CachedToken>();

/** Exposed for tests; a stale cache across tests is its own bug. */
export function clearFcmTokenCache(): void {
  tokenCache.clear();
}

/**
 * An OAuth2 access token for one service account.
 *
 * Cached until a minute before expiry — refreshing on every message would add a
 * round trip per app and Google rate limits the token endpoint too.
 */
export async function getAccessToken(account: ServiceAccount): Promise<string> {
  const cached = tokenCache.get(account.client_email);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  // Service account keys carry literal \n in JSON. A key pasted through a form
  // that has already unescaped them must also work, hence the conditional.
  const pem = account.private_key.includes("\\n")
    ? account.private_key.replace(/\\n/g, "\n")
    : account.private_key;

  const key = await importPKCS8(pem, "RS256");
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = account.token_uri || TOKEN_URL;

  const assertion = await new SignJWT({ scope: SCOPE })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(account.client_email)
    .setSubject(account.client_email)
    .setAudience(tokenUri)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw Object.assign(new Error(`Google token exchange failed: ${text.slice(0, 300)}`), {
      status: res.status,
    });
  }

  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error("Google returned no access token");

  tokenCache.set(account.client_email, {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 - 60_000,
  });

  return json.access_token;
}

/* -------------------------------------------------------------------- send */

/**
 * The v1 message body.
 *
 * `notification` is what the OS displays. `data` carries the link, because FCM
 * has no link field — the client app reads `data.link` and routes on it. Both
 * platform blocks exist so a link is available whichever way the app handles
 * the message.
 */
export function buildMessage(target: FcmTarget, message: FcmMessage): Record<string, unknown> {
  const data: Record<string, string> = {};
  if (message.linkUrl) data.link = message.linkUrl;

  const notification: Record<string, string> = {
    title: message.title,
    body: message.body,
  };
  if (message.imageUrl) notification.image = message.imageUrl;

  return {
    message: {
      ...(target.kind === "topic" ? { topic: target.topic } : {}),
      ...(target.kind === "condition" ? { condition: target.condition } : {}),
      ...(target.kind === "token" ? { token: target.token } : {}),
      notification,
      ...(Object.keys(data).length > 0 ? { data } : {}),
      android: {
        notification: {
          ...(message.linkUrl ? { click_action: "FLUTTER_NOTIFICATION_CLICK" } : {}),
        },
      },
      apns: {
        payload: {
          aps: {
            // Required for iOS to show a rich notification and to let the app
            // run its own handler before display.
            "mutable-content": 1,
            sound: "default",
          },
        },
      },
    },
  };
}

export async function sendMessage(
  account: ServiceAccount,
  target: FcmTarget,
  message: FcmMessage,
): Promise<FcmSendResult> {
  let accessToken: string;
  try {
    accessToken = await getAccessToken(account);
  } catch (error) {
    return {
      ok: false,
      code: "UNAUTHENTICATED",
      detail:
        error instanceof Error
          ? `Could not authenticate with Google: ${error.message}`
          : "Could not authenticate with Google.",
      retryable: false,
    };
  }

  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.project_id)}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildMessage(target, message)),
    },
  );

  const text = await res.text();

  if (!res.ok) {
    const { code, detail, retryable } = classifyFcmError(res.status, text);
    return { ok: false, code, detail, retryable };
  }

  const json = JSON.parse(text) as { name?: string };
  return { ok: true, messageId: json.name ?? "" };
}

/**
 * Parse and sanity-check an uploaded service account.
 *
 * Rejects rather than storing something that will fail later at send time, when
 * the failure is attached to a campaign instead of to the upload that caused it.
 */
export function parseServiceAccount(raw: string): ServiceAccount | { error: string } {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { error: "That is not valid JSON. Paste the whole service account key file." };
  }

  const account = json as Partial<ServiceAccount>;

  if (account.type && account.type !== "service_account") {
    return {
      error: `This is a "${account.type}" key, not a service account. Download a service account key from Google Cloud → IAM → Service Accounts → Keys.`,
    };
  }
  if (!account.project_id) return { error: "The key has no project_id." };
  if (!account.client_email) return { error: "The key has no client_email." };
  if (!account.private_key || !account.private_key.includes("PRIVATE KEY")) {
    return { error: "The key has no private_key. Download the JSON key, not the key metadata." };
  }

  return {
    project_id: account.project_id,
    client_email: account.client_email,
    private_key: account.private_key,
    token_uri: account.token_uri,
    type: account.type,
  };
}
