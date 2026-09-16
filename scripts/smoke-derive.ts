/**
 * Proves organic installs are derived correctly against a real database.
 *
 * Covers the three behaviours that are easy to get wrong: the subtraction
 * starts from a de-duplicated install total, over-attribution is floored at
 * zero rather than reported negative, and an app with no paid data is skipped
 * instead of having every install declared organic.
 *
 *   npm run smoke:derive
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

const { deriveOrganicInstalls } = (await import(
  "../src/server/metrics/derive"
)) as typeof import("../src/server/metrics/derive");
const { createCaller } = (await import(
  "../src/server/api/root"
)) as typeof import("../src/server/api/root");

const db = new PrismaClient();
let failures = 0;

function report(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const DAYS = 5;
const PLAY_INSTALLS = 1000;
const FIREBASE_INSTALLS = 940; // same installs, second source — must not be added
const PAID_A = 300;
const PAID_B = 100;

async function main() {
  const org = await db.organization.findFirst({ orderBy: { createdAt: "asc" } });
  const user = await db.user.findFirst({ orderBy: { createdAt: "asc" } });
  const app = org
    ? await db.app.findFirst({ where: { organizationId: org.id, platform: "ANDROID" } })
    : null;
  if (!org || !user || !app) throw new Error("Run `npm run db:seed` first");

  const caller = createCaller({
    db,
    session: { user: { id: user.id, email: user.email }, expires: "" } as never,
    headers: new Headers(),
  });

  const dates = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - i);
    return d;
  });
  const earliest = dates[dates.length - 1]!;

  const wipe = () =>
    db.metricPoint.deleteMany({
      where: {
        appId: app.id,
        metric: { in: ["INSTALLS", "PAID_INSTALLS", "ORGANIC_INSTALLS"] },
        date: { gte: earliest },
      },
    });

  await wipe();

  try {
    // --- 1. No paid data: derivation must decline, not assume ----------------
    await db.metricPoint.createMany({
      data: dates.map((date) => ({
        appId: app.id,
        date,
        source: "PLAY_CONSOLE" as const,
        metric: "INSTALLS" as const,
        dimension: "",
        value: PLAY_INSTALLS,
      })),
    });

    const noPaid = await deriveOrganicInstalls(app.id, { days: DAYS });
    report(
      "skips derivation when no paid install data exists",
      noPaid.written === 0 && noPaid.skipped !== null,
      noPaid.skipped ?? `wrote ${noPaid.written}`,
    );

    const leaked = await db.metricPoint.count({
      where: { appId: app.id, metric: "ORGANIC_INSTALLS", date: { gte: earliest } },
    });
    report("no organic rows written when skipped", leaked === 0, `${leaked} rows`);

    // --- 2. Two install sources + two campaigns -----------------------------
    await db.metricPoint.createMany({
      data: dates.flatMap((date) => [
        // Same installs reported a second time by Firebase. If the subtraction
        // used the sum, organic would come out ~1540 instead of 600.
        {
          appId: app.id,
          date,
          source: "FIREBASE" as const,
          metric: "INSTALLS" as const,
          dimension: "",
          value: FIREBASE_INSTALLS,
        },
        {
          appId: app.id,
          date,
          source: "GOOGLE_ADS" as const,
          metric: "PAID_INSTALLS" as const,
          dimension: "campaign:brand",
          value: PAID_A,
        },
        {
          appId: app.id,
          date,
          source: "GOOGLE_ADS" as const,
          metric: "PAID_INSTALLS" as const,
          dimension: "campaign:generic",
          value: PAID_B,
        },
      ]),
    });

    const derived = await deriveOrganicInstalls(app.id, { days: DAYS });
    report("writes one organic row per day", derived.written === DAYS, `wrote ${derived.written}`);

    const rows = await db.metricPoint.findMany({
      where: { appId: app.id, metric: "ORGANIC_INSTALLS", date: { gte: earliest } },
      orderBy: { date: "desc" },
    });

    const expected = PLAY_INSTALLS - (PAID_A + PAID_B); // 600
    const naive = PLAY_INSTALLS + FIREBASE_INSTALLS - (PAID_A + PAID_B); // 1540
    report(
      "subtracts from the de-duplicated install total",
      rows.every((r) => r.value === expected),
      `got ${rows[0]?.value}, correct ${expected}, double-counted would be ${naive}`,
    );
    report(
      "sums paid installs across campaigns",
      (rows[0]?.meta as { paid?: number } | null)?.paid === PAID_A + PAID_B,
      `paid recorded as ${(rows[0]?.meta as { paid?: number } | null)?.paid}`,
    );
    report(
      "records the source as DERIVED",
      rows.every((r) => r.source === "DERIVED"),
      rows[0]?.source,
    );

    // --- 3. Reads back through the dashboard aggregation --------------------
    const summary = await caller.metrics.summary({
      appId: app.id,
      days: DAYS,
      metrics: ["INSTALLS", "ORGANIC_INSTALLS", "PAID_INSTALLS"],
    });
    const organicRow = summary.find((r) => r.metric === "ORGANIC_INSTALLS");
    const installRow = summary.find((r) => r.metric === "INSTALLS");
    report(
      "dashboard reports organic installs",
      organicRow?.value === expected * DAYS,
      `got ${organicRow?.value}, expected ${expected * DAYS}`,
    );
    report(
      "organic never exceeds total installs",
      (organicRow?.value ?? 0) <= (installRow?.value ?? 0),
      `organic ${organicRow?.value} vs total ${installRow?.value}`,
    );

    // --- 4. Days outside the paid-data span are not claimed as organic ------
    const newest = dates[0]!;
    await db.metricPoint.deleteMany({
      where: { appId: app.id, metric: "PAID_INSTALLS", date: newest },
    });

    const shrunk = await deriveOrganicInstalls(app.id, { days: DAYS });
    report(
      "does not derive for days beyond the paid-data span",
      shrunk.written === DAYS - 1,
      `wrote ${shrunk.written}, expected ${DAYS - 1}`,
    );

    const stale = await db.metricPoint.count({
      where: { appId: app.id, metric: "ORGANIC_INSTALLS", date: newest },
    });
    report(
      "removes the stale organic row left by the earlier run",
      stale === 0 && shrunk.removed === 1,
      `${stale} stale row(s), removed ${shrunk.removed}`,
    );

    // Restore so the flooring check below still covers the full window.
    await db.metricPoint.createMany({
      data: [
        {
          appId: app.id,
          date: newest,
          source: "GOOGLE_ADS" as const,
          metric: "PAID_INSTALLS" as const,
          dimension: "campaign:brand",
          value: PAID_A,
        },
        {
          appId: app.id,
          date: newest,
          source: "GOOGLE_ADS" as const,
          metric: "PAID_INSTALLS" as const,
          dimension: "campaign:generic",
          value: PAID_B,
        },
      ],
    });

    // --- 5. Over-attribution floors at zero --------------------------------
    await db.metricPoint.updateMany({
      where: {
        appId: app.id,
        metric: "PAID_INSTALLS",
        dimension: "campaign:brand",
        date: { gte: earliest },
      },
      data: { value: PLAY_INSTALLS * 2 },
    });

    const floored = await deriveOrganicInstalls(app.id, { days: DAYS });
    const flooredRows = await db.metricPoint.findMany({
      where: { appId: app.id, metric: "ORGANIC_INSTALLS", date: { gte: earliest } },
    });
    report(
      "floors at zero when the ad network claims more than the console counted",
      floored.written === DAYS && flooredRows.every((r) => r.value === 0),
      `values ${[...new Set(flooredRows.map((r) => r.value))].join(",")}`,
    );
    report(
      "flags the floored days in meta so the discrepancy is not hidden",
      flooredRows.every((r) => (r.meta as { floored?: boolean } | null)?.floored === true),
      JSON.stringify(flooredRows[0]?.meta),
    );
  } finally {
    await wipe();
    console.log("\nRun `npm run db:seed` to restore the install rows this test removed.");
  }

  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) failed.`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => void db.$disconnect());
