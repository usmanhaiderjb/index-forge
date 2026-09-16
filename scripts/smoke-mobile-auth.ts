/**
 * Mobile token authentication, end to end against a running dev server.
 *
 * The rotation and replay paths are the reason this file exists: a bug there is
 * a security bug rather than a broken screen, and none of it is reachable from
 * the web UI to notice by accident.
 *
 *   npm run dev            # in another terminal
 *   npm run smoke:mobile
 */
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import Redis from "ioredis";

const BASE = process.env.APP_URL ?? "http://localhost:3000";
const db = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: 2,
  lazyConnect: true,
});

let failures = 0;
function report(name: string, ok: boolean, detail = "", onFail = "") {
  if (!ok) failures++;
  const suffix = ok ? detail : [detail, onFail].filter(Boolean).join(" · ");
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${suffix ? ` — ${suffix}` : ""}`);
}

const EMAIL = "mobile-smoke@example.invalid";

type TokenBody = {
  accessToken?: string;
  refreshToken?: string;
  accessExpiresAt?: number;
  refreshExpiresAt?: number;
  tokenType?: string;
  error?: string;
  code?: string;
};

async function post(path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as TokenBody };
}

/** Calls a tRPC mutation, optionally authenticated. */
async function trpcMutation(path: string, accessToken: string | undefined, input: unknown) {
  const res = await fetch(`${BASE}/api/trpc/${path}?batch=1`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ 0: { json: input } }),
  });
  return { status: res.status, text: await res.text() };
}

/** Calls an authenticated tRPC procedure with a bearer token. */
async function callOrgMe(accessToken?: string) {
  const res = await fetch(`${BASE}/api/trpc/org.me?batch=1&input=${encodeURIComponent('{"0":{"json":null,"meta":{"values":["undefined"]}}}')}`, {
    headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {},
  });
  return { status: res.status, text: await res.text() };
}

async function main() {
  console.log(`Checking ${BASE}\n`);

  // This run deliberately exhausts the sign-in limiter at the end, and the
  // window outlives the run. Clearing the buckets first is what makes the
  // script repeatable rather than only working once every five minutes.
  const stale = await redis.keys("ratelimit:mobile:*");
  const staleTrpc = await redis.keys("ratelimit:trpc:*");
  if (stale.length || staleTrpc.length) await redis.del(...stale, ...staleTrpc);

  const existingUser = await db.user.findUnique({ where: { email: EMAIL } });
  if (existingUser) {
    await db.deviceSession.deleteMany({ where: { userId: existingUser.id } });
  }

  // --- sign in ------------------------------------------------------------
  const signIn = await post("/api/mobile/auth/token", {
    provider: "dev",
    email: EMAIL,
    platform: "IOS",
    deviceName: "Smoke iPhone",
    appVersion: "1.0.0",
  });

  report(
    "issues a token pair for a device",
    signIn.status === 200 && Boolean(signIn.body.accessToken && signIn.body.refreshToken),
    `status ${signIn.status}`,
    signIn.body.error ?? "",
  );

  if (!signIn.body.refreshToken || !signIn.body.accessToken) {
    console.log("\nCannot continue without a token pair.");
    process.exit(1);
  }

  report(
    "returns a refresh token with the expected prefix",
    signIn.body.refreshToken.startsWith("asor_"),
    signIn.body.refreshToken.slice(0, 5),
  );
  report(
    "tells the client when the access token expires",
    typeof signIn.body.accessExpiresAt === "number" &&
      signIn.body.accessExpiresAt > Math.floor(Date.now() / 1000),
    `expires in ${(signIn.body.accessExpiresAt ?? 0) - Math.floor(Date.now() / 1000)}s`,
  );

  // --- the refresh token is never stored in the clear ---------------------
  const hashed = createHash("sha256").update(signIn.body.refreshToken).digest("hex");
  const stored = await db.refreshToken.findUnique({ where: { hashedToken: hashed } });
  report("stores only the hash of the refresh token", stored !== null, "", "hash lookup missed");

  const rawHit = await db.refreshToken.findFirst({
    where: { hashedToken: signIn.body.refreshToken },
  });
  report(
    "never stores the raw refresh token",
    rawHit === null,
    "",
    "the plaintext token is in the database",
  );

  // --- the access token actually authenticates ----------------------------
  const authed = await callOrgMe(signIn.body.accessToken);
  report(
    "a bearer access token authenticates a tRPC call",
    authed.status === 200 && !authed.text.includes("UNAUTHORIZED"),
    `status ${authed.status}`,
    authed.text.slice(0, 120),
  );

  const anonymous = await callOrgMe();
  report(
    "the same call without a token is rejected",
    anonymous.text.includes("UNAUTHORIZED"),
    "",
    "an unauthenticated call succeeded",
  );

  const garbage = await callOrgMe("not-a-real-token");
  report(
    "a malformed bearer is rejected rather than crashing",
    garbage.text.includes("UNAUTHORIZED"),
    `status ${garbage.status}`,
    "a bad token was accepted",
  );

  // --- rotation -----------------------------------------------------------
  const rotated = await post("/api/mobile/auth/refresh", {
    refreshToken: signIn.body.refreshToken,
  });

  report(
    "exchanges a refresh token for a new pair",
    rotated.status === 200 && Boolean(rotated.body.refreshToken),
    `status ${rotated.status}`,
    rotated.body.error ?? "",
  );
  report(
    "issues a different refresh token on rotation",
    rotated.body.refreshToken !== signIn.body.refreshToken,
    "",
    "the same refresh token was returned twice",
  );

  const rotatedAccess = await callOrgMe(rotated.body.accessToken);
  report(
    "the rotated access token works",
    rotatedAccess.status === 200 && !rotatedAccess.text.includes("UNAUTHORIZED"),
    `status ${rotatedAccess.status}`,
  );

  // --- replay -------------------------------------------------------------
  // The heart of it. Presenting the already-exchanged token means the value was
  // captured, so the whole device session must go, not just this request.
  const replay = await post("/api/mobile/auth/refresh", {
    refreshToken: signIn.body.refreshToken,
  });

  report(
    "refuses a replayed refresh token",
    replay.status === 401 && replay.body.code === "reused",
    `status ${replay.status}, code ${replay.body.code}`,
    "a used refresh token was accepted a second time",
  );

  const afterReplay = await post("/api/mobile/auth/refresh", {
    refreshToken: rotated.body.refreshToken,
  });
  report(
    "revokes the whole device session on replay, not just the one token",
    afterReplay.status === 401,
    `status ${afterReplay.status}`,
    "the thief's chain still works after replay was detected",
  );

  const revokedAccess = await callOrgMe(rotated.body.accessToken);
  report(
    "stops accepting access tokens for a revoked session immediately",
    revokedAccess.text.includes("UNAUTHORIZED"),
    "",
    "an access token outlived its revoked session",
  );

  const sessionRow = await db.deviceSession.findFirst({
    where: { user: { email: EMAIL } },
    orderBy: { createdAt: "desc" },
  });
  report(
    "records why the session was revoked",
    sessionRow?.revokedAt !== null && Boolean(sessionRow?.revokedFor),
    sessionRow?.revokedFor ?? "no reason recorded",
  );

  // --- sign out -----------------------------------------------------------
  const second = await post("/api/mobile/auth/token", {
    provider: "dev",
    email: EMAIL,
    platform: "ANDROID",
    deviceName: "Smoke Pixel",
  });

  report("a revoked device can sign in again", second.status === 200, `status ${second.status}`);

  const signOut = await post("/api/mobile/auth/revoke", {
    refreshToken: second.body.refreshToken,
  });
  report("signs a device out", signOut.status === 200, `status ${signOut.status}`);

  const afterSignOut = await callOrgMe(second.body.accessToken);
  report(
    "the access token stops working after sign-out",
    afterSignOut.text.includes("UNAUTHORIZED"),
    "",
    "a signed-out device kept access",
  );

  const unknownRevoke = await post("/api/mobile/auth/revoke", {
    refreshToken: "asor_definitely-not-a-real-token-value-here",
  });
  report(
    "sign-out does not reveal whether a token existed",
    unknownRevoke.status === 200,
    `status ${unknownRevoke.status}`,
    "an unknown token returned a different status than a real one",
  );

  // --- push registration --------------------------------------------------
  const third = await post("/api/mobile/auth/token", {
    provider: "dev",
    email: EMAIL,
    platform: "ANDROID",
    deviceName: "Smoke Push Device",
  });

  const pushToken = "ExponentPushToken[smoke-test-token-value]";
  const register = await trpcMutation("devices.registerPush", third.body.accessToken, {
    token: pushToken,
    platform: "ANDROID",
  });
  report(
    "registers a push token for the calling device",
    register.status === 200 && !register.text.includes("error"),
    `status ${register.status}`,
    register.text.slice(0, 160),
  );

  const stored3 = await db.deviceToken.findUnique({ where: { token: pushToken } });
  report(
    "ties the push token to the device session",
    stored3 !== null && stored3.deviceSessionId.length > 0,
    "",
    "no device token row was written",
  );

  // Re-registering the same token must replace, not duplicate — otherwise one
  // phone receives every alert twice.
  await trpcMutation("devices.registerPush", third.body.accessToken, {
    token: pushToken,
    platform: "ANDROID",
  });
  const tokenCount = await db.deviceToken.count({ where: { token: pushToken } });
  report("re-registering replaces rather than duplicating", tokenCount === 1, `${tokenCount} row(s)`);

  const badToken = await trpcMutation("devices.registerPush", third.body.accessToken, {
    token: "not-an-expo-token",
    platform: "ANDROID",
  });
  report(
    "rejects a token that is not an Expo push token",
    badToken.text.includes("BAD_REQUEST") || badToken.status === 400,
    `status ${badToken.status}`,
  );

  // A browser session has no device, so this has to fail with a message that
  // says why rather than writing a row with a null device.
  const noDevice = await trpcMutation("devices.registerPush", undefined, {
    token: pushToken,
    platform: "ANDROID",
  });
  report(
    "refuses push registration without a device session",
    noDevice.text.includes("UNAUTHORIZED") || noDevice.text.includes("BAD_REQUEST"),
    "",
    "a session-less caller registered a push token",
  );

  // --- input validation ---------------------------------------------------
  const badPlatform = await post("/api/mobile/auth/token", {
    provider: "dev",
    email: EMAIL,
    platform: "WINDOWS_PHONE",
  });
  report(
    "rejects an unknown platform",
    badPlatform.status === 400,
    `status ${badPlatform.status}`,
  );

  const notJson = await fetch(`${BASE}/api/mobile/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "not json",
  });
  report("rejects a non-JSON body", notJson.status === 400, `status ${notJson.status}`);

  // --- rate limiting ------------------------------------------------------
  // Last on purpose: this deliberately exhausts the sign-in budget for this IP,
  // so anything after it would be refused for a reason unrelated to itself.
  let sawLimit = false;
  for (let i = 0; i < 14; i++) {
    const attempt = await post("/api/mobile/auth/token", {
      provider: "dev",
      email: `burst-${i}@example.invalid`,
      platform: "IOS",
    });
    if (attempt.status === 429) {
      sawLimit = true;
      break;
    }
  }
  report(
    "rate-limits repeated sign-in attempts",
    sawLimit,
    "",
    "14 sign-ins in a row were all accepted",
  );

  // --- cleanup ------------------------------------------------------------
  await db.user.deleteMany({ where: { email: { startsWith: "burst-" } } });

  const user = await db.user.findUnique({ where: { email: EMAIL } });
  if (user) {
    await db.deviceSession.deleteMany({ where: { userId: user.id } });
    const memberships = await db.membership.findMany({ where: { userId: user.id } });
    await db.membership.deleteMany({ where: { userId: user.id } });
    for (const membership of memberships) {
      const remaining = await db.membership.count({
        where: { organizationId: membership.organizationId },
      });
      if (remaining === 0) {
        await db.organization.delete({ where: { id: membership.organizationId } }).catch(() => {});
      }
    }
    await db.user.delete({ where: { id: user.id } }).catch(() => {});
  }
  report("cleans up the test user", (await db.user.findUnique({ where: { email: EMAIL } })) === null);

  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) failed.`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    void db.$disconnect();
    redis.disconnect();
  });
