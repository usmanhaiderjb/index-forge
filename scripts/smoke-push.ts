/**
 * End-to-end test for push campaign delivery.
 *
 * Runs the real worker handler against a real database, with Google's token
 * endpoint and Firebase's send endpoint stubbed. Nothing else is mocked: the
 * service account key is a genuine RSA key, the assertion is genuinely signed,
 * and the credential is genuinely encrypted and decrypted through the same
 * helper the app uses.
 *
 * What it proves, in the order the plan asks for (docs/PUSH-PLAN.md §8.7):
 * token minting and caching, error mapping, and fan-out across apps.
 *
 *   npm run smoke:push
 */
import { PrismaClient } from "@prisma/client";
import Module from "node:module";

const load = (Module as unknown as { _load: (...args: unknown[]) => unknown })._load;
(Module as unknown as { _load: (...args: unknown[]) => unknown })._load = function (
  this: unknown,
  request: unknown,
  ...rest: unknown[]
) {
  if (typeof request === "string" && request.includes("server-only")) return {};
  return load.call(this, request, ...rest);
} as never;

const { generateKeyPair, exportPKCS8 } = (await import("jose")) as typeof import("jose");
const { encryptJson } = (await import("../src/server/crypto")) as typeof import("../src/server/crypto");
const { clearFcmTokenCache } = (await import(
  "../src/server/push/fcm"
)) as typeof import("../src/server/push/fcm");
const { handlePushSend } = (await import(
  "../src/server/jobs/handlers/push"
)) as typeof import("../src/server/jobs/handlers/push");

const db = new PrismaClient();

let failures = 0;
function report(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";

/** Per-project behaviour the stub should exhibit. */
type Behaviour = "ok" | "invalid-argument" | "quota" | "unauthenticated";

async function main() {
  const { privateKey } = await generateKeyPair("RS256", { extractable: true });
  const pem = await exportPKCS8(privateKey);

  const org = await db.organization.create({
    data: { name: "Push smoke", slug: `push-smoke-${Date.now()}` },
  });

  const behaviour = new Map<string, Behaviour>();

  /** Creates an app, optionally with a working credential. */
  async function makeApp(name: string, project: string | null, mode: Behaviour = "ok") {
    const app = await db.app.create({
      data: {
        organizationId: org.id,
        name,
        platform: "ANDROID",
        storeId: `com.smoke.${name.toLowerCase()}`,
        country: "us",
      },
    });

    if (project) {
      behaviour.set(project, mode);
      await db.pushCredential.create({
        data: {
          organizationId: org.id,
          appId: app.id,
          projectId: project,
          clientEmail: `push@${project}.iam.gserviceaccount.com`,
          credentials: encryptJson({
            type: "service_account",
            project_id: project,
            client_email: `push@${project}.iam.gserviceaccount.com`,
            private_key: pem,
          }),
          status: "ACTIVE",
        },
      });
    }
    return app;
  }

  const good = await makeApp("Good", "proj-good", "ok");
  const alsoGood = await makeApp("AlsoGood", "proj-also", "ok");
  const bad = await makeApp("Bad", "proj-bad", "invalid-argument");
  const throttled = await makeApp("Throttled", "proj-throttle", "quota");
  const revoked = await makeApp("Revoked", "proj-revoked", "unauthenticated");
  const unconfigured = await makeApp("Unconfigured", null);

  let tokenCalls = 0;
  const sendCalls: string[] = [];

  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);

    if (url === TOKEN_URL) {
      tokenCalls++;
      return new Response(
        JSON.stringify({ access_token: `tok-${tokenCalls}`, expires_in: 3600 }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    const match = /\/v1\/projects\/([^/]+)\/messages:send$/.exec(url);
    if (match) {
      const project = decodeURIComponent(match[1]!);
      sendCalls.push(project);

      const fcmError = (errorCode: string, status: number, topStatus: string) =>
        new Response(
          JSON.stringify({
            error: {
              status: topStatus,
              message: "stubbed",
              details: [
                { "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", errorCode },
              ],
            },
          }),
          { status, headers: { "content-type": "application/json" } },
        );

      switch (behaviour.get(project)) {
        case "invalid-argument":
          return fcmError("INVALID_ARGUMENT", 400, "INVALID_ARGUMENT");
        case "quota":
          return fcmError("QUOTA_EXCEEDED", 429, "RESOURCE_EXHAUSTED");
        case "unauthenticated":
          return fcmError("UNAUTHENTICATED", 401, "UNAUTHENTICATED");
        default:
          return new Response(
            JSON.stringify({ name: `projects/${project}/messages/msg-1` }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
      }
    }

    return new Response("unexpected", { status: 404 });
  }) as typeof fetch;

  try {
    /* ---------------------------------------------- all-good campaign */
    clearFcmTokenCache();
    tokenCalls = 0;
    sendCalls.length = 0;

    const happy = await createCampaign(org.id, [good.id, alsoGood.id, unconfigured.id]);
    await handlePushSend(happy);

    const happyDeliveries = await deliveries(happy);
    report(
      "each configured app gets its own delivery",
      happyDeliveries.filter((d) => d.status === "SENT").length === 2,
      JSON.stringify(happyDeliveries.map((d) => d.status)),
    );
    report(
      "an app with no credential is SKIPPED, not silently dropped",
      happyDeliveries.some((d) => d.appId === unconfigured.id && d.status === "SKIPPED"),
    );
    report(
      "a successful send records the Firebase message id",
      happyDeliveries.every((d) => d.status !== "SENT" || Boolean(d.messageId)),
    );
    // Two apps, two sends, two tokens proves nothing on its own — that is also
    // what minting per message looks like. Sending again without clearing the
    // cache is what separates the two.
    const tokensAfterFirst = tokenCalls;
    const repeat = await createCampaign(org.id, [good.id, alsoGood.id]);
    await handlePushSend(repeat);

    report(
      "an access token is reused across campaigns, not minted per message",
      tokenCalls === tokensAfterFirst,
      `${tokenCalls} token calls across ${sendCalls.length} sends`,
    );
    report(
      "the second campaign still delivered",
      (await deliveries(repeat)).every((d) => d.status === "SENT"),
    );

    const happyCampaign = await db.pushCampaign.findUnique({ where: { id: happy } });
    // Two sent, one skipped: not every app received it, so calling this SENT
    // would overstate what happened.
    report(
      "a campaign with a skipped app is PARTIAL, not SENT",
      happyCampaign?.status === "PARTIAL",
      String(happyCampaign?.status),
    );

    /* ------------------------------------------- fully successful send */
    clearFcmTokenCache();
    const clean = await createCampaign(org.id, [good.id, alsoGood.id]);
    await handlePushSend(clean);
    const cleanCampaign = await db.pushCampaign.findUnique({ where: { id: clean } });
    report("a campaign where every app succeeded is SENT", cleanCampaign?.status === "SENT",
      String(cleanCampaign?.status));

    /* ------------------------------------------------ permanent failure */
    clearFcmTokenCache();
    const broken = await createCampaign(org.id, [good.id, bad.id]);
    await handlePushSend(broken);

    const brokenDeliveries = await deliveries(broken);
    const badDelivery = brokenDeliveries.find((d) => d.appId === bad.id);
    report(
      "a non-retryable failure is FAILED, not left pending",
      badDelivery?.status === "FAILED",
      String(badDelivery?.status),
    );
    report(
      "the failure explains itself rather than echoing a status code",
      Boolean(badDelivery?.error?.includes("malformed")),
      badDelivery?.error?.slice(0, 60) ?? "",
    );
    report(
      "one app failing does not stop the others",
      brokenDeliveries.some((d) => d.appId === good.id && d.status === "SENT"),
    );

    /* ----------------------------------------------- retryable failure */
    clearFcmTokenCache();
    const throttledCampaign = await createCampaign(org.id, [throttled.id]);
    let threw = false;
    try {
      await handlePushSend(throttledCampaign);
    } catch {
      // Expected: the handler rethrows so BullMQ retries the job.
      threw = true;
    }

    const throttledDelivery = (await deliveries(throttledCampaign))[0];
    report("a rate-limited send rethrows so the queue retries it", threw);
    report(
      "a retryable failure stays PENDING rather than becoming permanent",
      throttledDelivery?.status === "PENDING",
      String(throttledDelivery?.status),
    );
    report(
      "the attempt is still counted",
      (throttledDelivery?.attempts ?? 0) > 0,
      String(throttledDelivery?.attempts),
    );

    /* -------------------------------------------- credential invalidation */
    clearFcmTokenCache();
    const revokedCampaign = await createCampaign(org.id, [revoked.id]);
    await handlePushSend(revokedCampaign);

    const credential = await db.pushCredential.findUnique({ where: { appId: revoked.id } });
    // A key Firebase has rejected outright will reject every later campaign, so
    // the app should show as not-ready in the next composer rather than failing
    // again silently.
    report(
      "a rejected key marks the credential INVALID for next time",
      credential?.status === "INVALID",
      String(credential?.status),
    );

    /* ------------------------------------------------------ idempotency */
    clearFcmTokenCache();
    sendCalls.length = 0;
    await handlePushSend(clean);
    report(
      "re-running a finished campaign sends nothing twice",
      sendCalls.length === 0,
      `${sendCalls.length} extra sends`,
    );
  } finally {
    globalThis.fetch = realFetch;
    // Cascades clear campaigns, deliveries, credentials and apps.
    await db.organization.delete({ where: { id: org.id } }).catch(() => undefined);
  }

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

async function createCampaign(organizationId: string, appIds: string[]): Promise<string> {
  const apps = await db.app.findMany({
    where: { id: { in: appIds } },
    select: { id: true, pushCredential: { select: { status: true } } },
  });

  const campaign = await db.pushCampaign.create({
    data: {
      organizationId,
      title: "Version 3.2 is live",
      body: "Streaks now sync across devices.",
      target: "TOPIC",
      targetValue: "all",
      status: "QUEUED",
      deliveries: {
        create: apps.map((app) => ({
          appId: app.id,
          status: app.pushCredential?.status === "ACTIVE" ? "PENDING" : "SKIPPED",
          error:
            app.pushCredential?.status === "ACTIVE" ? null : "No working Firebase key for this app.",
        })),
      },
    },
    select: { id: true },
  });

  return campaign.id;
}

function deliveries(campaignId: string) {
  return db.pushDelivery.findMany({ where: { campaignId }, orderBy: { createdAt: "asc" } });
}

void main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => void db.$disconnect());
