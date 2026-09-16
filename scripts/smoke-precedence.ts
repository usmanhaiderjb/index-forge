/**
 * Proves the revenue double-count is fixed against a real database.
 *
 * Writes ad revenue from AdMob *and* Firebase for the same app and days —
 * exactly what happens when both are connected — then reads the dashboard
 * aggregation back and asserts it reports one figure, not the sum.
 *
 *   npm run smoke:precedence
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

const { createCaller } = (await import("../src/server/api/root")) as typeof import("../src/server/api/root");

const db = new PrismaClient();
let failures = 0;

function report(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const ADMOB_PER_DAY = 100;
const FIREBASE_PER_DAY = 98;
const DAYS = 7;

async function main() {
  const org = await db.organization.findFirst({ orderBy: { createdAt: "asc" } });
  const user = await db.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!org || !user) throw new Error("Run `npm run db:seed` first");

  const app = await db.app.findFirst({ where: { organizationId: org.id } });
  if (!app) throw new Error("Run `npm run db:seed` first");

  // A caller with the seeded owner's session, so this exercises the same
  // procedures the dashboard calls.
  const caller = createCaller({
    db,
    session: { user: { id: user.id, email: user.email }, expires: "" } as never,
    headers: new Headers(),
  });

  // Days 0..DAYS-1, matching exactly what a `days: DAYS` query covers — an
  // off-by-one here would let a seeded day leak into the totals.
  const dates = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - i);
    return d;
  });
  const earliest = dates[dates.length - 1]!;

  // Clear every ad-revenue row in the window, seeded ones included, so the
  // totals below come only from what this script wrote.
  await db.metricPoint.deleteMany({
    where: { appId: app.id, metric: "AD_REVENUE", date: { gte: earliest } },
  });

  await db.metricPoint.createMany({
    data: dates.flatMap((date) => [
      {
        appId: app.id,
        date,
        source: "ADMOB" as const,
        metric: "AD_REVENUE" as const,
        dimension: "",
        value: ADMOB_PER_DAY,
      },
      {
        appId: app.id,
        date,
        source: "FIREBASE" as const,
        metric: "AD_REVENUE" as const,
        dimension: "",
        value: FIREBASE_PER_DAY,
      },
    ]),
  });

  const stored = await db.metricPoint.count({
    where: { appId: app.id, metric: "AD_REVENUE", date: { in: dates } },
  });
  report("both providers' rows are stored", stored === DAYS * 2, `${stored} rows`);

  const naive = (ADMOB_PER_DAY + FIREBASE_PER_DAY) * DAYS;
  const correct = ADMOB_PER_DAY * DAYS;

  try {
    const summary = await caller.metrics.summary({
      appId: app.id,
      days: DAYS,
      metrics: ["AD_REVENUE"],
    });
    const row = summary[0];

    report(
      "summary counts ad revenue once",
      row?.value === correct,
      `got ${row?.value}, correct ${correct}, double-counted would be ${naive}`,
    );
    report(
      "summary names the winning provider",
      row?.sources.includes("AdMob") === true && !row?.sources.includes("Firebase / GA4"),
      (row?.sources ?? []).join(", "),
    );

    const series = await caller.metrics.series({
      appId: app.id,
      days: DAYS,
      metrics: ["AD_REVENUE"],
    });
    const seriesTotal = series.reduce(
      (sum, point) => sum + Number((point as Record<string, unknown>).AD_REVENUE ?? 0),
      0,
    );
    report(
      "series counts ad revenue once",
      Math.round(seriesTotal) === correct,
      `got ${Math.round(seriesTotal)}, correct ${correct}`,
    );

    const byApp = await caller.metrics.byApp({ days: DAYS, metric: "AD_REVENUE" });
    const thisApp = byApp.find((a) => a.id === app.id);
    report(
      "by-app counts ad revenue once",
      thisApp?.value === correct,
      `got ${thisApp?.value}, correct ${correct}`,
    );

    // Firebase alone must still be reported when AdMob is not connected.
    await db.metricPoint.deleteMany({
      where: { appId: app.id, metric: "AD_REVENUE", source: "ADMOB", date: { gte: earliest } },
    });

    const firebaseOnly = await caller.metrics.summary({
      appId: app.id,
      days: DAYS,
      metrics: ["AD_REVENUE"],
    });
    report(
      "falls back to Firebase when AdMob is absent",
      firebaseOnly[0]?.value === FIREBASE_PER_DAY * DAYS,
      `got ${firebaseOnly[0]?.value}, expected ${FIREBASE_PER_DAY * DAYS}`,
    );
  } finally {
    // The window's seeded rows were removed above, so re-seed to restore them.
    await db.metricPoint.deleteMany({
      where: { appId: app.id, metric: "AD_REVENUE", date: { gte: earliest } },
    });
    console.log("\nRun `npm run db:seed` to restore the ad-revenue rows this test removed.");
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
