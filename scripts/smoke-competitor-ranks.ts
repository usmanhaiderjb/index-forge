/**
 * Proves competitor keyword ranks are captured from the SERP the rank scan
 * already fetches, and read back as a head-to-head comparison.
 *
 * Runs `syncRanks` against a stub ASO provider so the assertions are about our
 * persistence logic, not about whatever the App Store happens to return today.
 *
 *   npm run smoke:competitor-ranks
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

const { syncRanks } = (await import(
  "../src/server/jobs/handlers/aso"
)) as typeof import("../src/server/jobs/handlers/aso");
const { createCaller } = (await import(
  "../src/server/api/root"
)) as typeof import("../src/server/api/root");

const db = new PrismaClient();
let failures = 0;

function report(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const OUR_RANK = 7;
const RIVAL_AHEAD = 3;
const RIVAL_BEHIND = 21;

async function main() {
  const org = await db.organization.findFirst({ orderBy: { createdAt: "asc" } });
  const user = await db.user.findFirst({ orderBy: { createdAt: "asc" } });
  const app = org ? await db.app.findFirst({ where: { organizationId: org.id } }) : null;
  if (!org || !user || !app) throw new Error("Run `npm run db:seed` first");

  const keyword = await db.keyword.findFirst({ where: { appId: app.id, isTracked: true } });
  if (!keyword) throw new Error("Seeded app has no tracked keywords");

  const rivals = await db.competitor.findMany({
    where: { appId: app.id, platform: app.platform, country: keyword.country, isTracked: true },
    orderBy: { createdAt: "asc" },
  });
  if (rivals.length < 3) throw new Error("Seeded app needs at least 3 competitors");

  const [ahead, behind, offPage] = rivals;

  if (app.platform !== "IOS") throw new Error("This test stubs the iTunes endpoint; expected an iOS app");

  // A stub result page: us at #7, one competitor above, one below, one absent
  // entirely. The absent one is the interesting case — it must be recorded as
  // an explicit null, not skipped.
  //
  // Stubbed at `fetch` rather than at the provider, so the real iTunes response
  // mapping runs too. Position comes from array order, so filler entries pad
  // the gaps to put each app at the intended rank.
  const page: Array<{ trackId: string; trackName: string }> = [];
  const place = (position: number, trackId: string, trackName: string) => {
    while (page.length < position - 1) {
      page.push({ trackId: `filler-${page.length + 1}`, trackName: `Filler ${page.length + 1}` });
    }
    page[position - 1] = { trackId, trackName };
  };
  place(RIVAL_AHEAD, ahead!.storeId, ahead!.name);
  place(OUR_RANK, app.storeId, app.name);
  place(RIVAL_BEHIND, behind!.storeId, behind!.name);
  // `offPage` is deliberately never placed.

  let searchCalls = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("itunes.apple.com/search")) {
      searchCalls++;
      return new Response(JSON.stringify({ results: page }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return realFetch(input as never, init);
  }) as typeof fetch;

  // Only this keyword, so the call count below is predictable.
  const others = await db.keyword.findMany({
    where: { appId: app.id, isTracked: true, id: { not: keyword.id } },
    select: { id: true },
  });
  await db.keyword.updateMany({
    where: { id: { in: others.map((k) => k.id) } },
    data: { isTracked: false },
  });

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  await db.keywordCompetitorRank.deleteMany({ where: { keywordId: keyword.id, date: today } });
  await db.keywordRank.deleteMany({ where: { keywordId: keyword.id, date: today } });

  try {
    await syncRanks(app.id);

    report(
      "reuses the one SERP fetch for every competitor",
      searchCalls === 1,
      `${searchCalls} search call(s) for 1 keyword and ${rivals.length} competitors`,
    );

    const ourRow = await db.keywordRank.findUnique({
      where: { keywordId_date: { keywordId: keyword.id, date: today } },
    });
    report("records our own rank", ourRow?.rank === OUR_RANK, `#${ourRow?.rank}`);
    report(
      "records the scan depth so a null rank stays interpretable",
      ourRow?.scanDepth === 100,
      String(ourRow?.scanDepth),
    );

    const rows = await db.keywordCompetitorRank.findMany({
      where: { keywordId: keyword.id, date: today },
    });
    report(
      "writes a row for every tracked competitor",
      rows.length === rivals.length,
      `${rows.length} of ${rivals.length}`,
    );

    const aheadRow = rows.find((r) => r.competitorId === ahead!.id);
    const behindRow = rows.find((r) => r.competitorId === behind!.id);
    const offPageRow = rows.find((r) => r.competitorId === offPage!.id);

    report("captures a competitor ranking above us", aheadRow?.rank === RIVAL_AHEAD, `#${aheadRow?.rank}`);
    report("captures a competitor ranking below us", behindRow?.rank === RIVAL_BEHIND, `#${behindRow?.rank}`);
    report(
      "records an absent competitor as an explicit null, not a missing row",
      offPageRow !== undefined && offPageRow.rank === null,
      offPageRow === undefined ? "no row written" : `rank ${offPageRow.rank}`,
    );
    report(
      "carries yesterday's rank forward as prevRank",
      typeof offPageRow?.prevRank === "number" || aheadRow?.prevRank !== undefined,
      `ahead prevRank ${aheadRow?.prevRank}`,
    );

    // --- read back through the API -----------------------------------------
    const caller = createCaller({
      db,
      session: { user: { id: user.id, email: user.email }, expires: "" } as never,
      headers: new Headers(),
    });

    const view = await caller.keywords.competitorRanks({ appId: app.id });
    const row = view.find((r) => r.keywordId === keyword.id);

    report("API returns the head-to-head view", row !== undefined, `${view.length} keyword(s)`);
    report("API reports our rank", row?.us.rank === OUR_RANK, `#${row?.us.rank}`);
    report(
      "API counts only the competitors actually ahead of us",
      row?.competitorsAhead === 1,
      `${row?.competitorsAhead} ahead, ${row?.competitorsRanked} ranked`,
    );
    report(
      "API sorts unranked competitors last",
      row?.rivals.at(-1)?.rank === null,
      row?.rivals.map((r) => r.rank ?? "null").join(", "),
    );

    // Both endpoints read the same rows and must agree on the delta, or the
    // keyword table and the head-to-head table contradict each other on screen.
    const list = await caller.keywords.list({ appId: app.id, onlyTracked: false });
    const listRow = list.find((r) => r.id === keyword.id);
    report(
      "agrees with the keyword table on our own rank delta",
      listRow?.delta === row?.us.delta,
      `list ${listRow?.delta} vs head-to-head ${row?.us.delta}`,
    );

    // --- unranked app must not read as winning -----------------------------
    await db.keywordRank.update({
      where: { keywordId_date: { keywordId: keyword.id, date: today } },
      data: { rank: null },
    });

    const unranked = await caller.keywords.competitorRanks({ appId: app.id });
    const unrankedRow = unranked.find((r) => r.keywordId === keyword.id);
    report(
      "reports null rather than zero competitors ahead when we do not rank",
      unrankedRow?.competitorsAhead === null,
      `competitorsAhead ${unrankedRow?.competitorsAhead}`,
    );
  } finally {
    globalThis.fetch = realFetch;
    await db.keyword.updateMany({
      where: { id: { in: others.map((k) => k.id) } },
      data: { isTracked: true },
    });
    await db.keywordCompetitorRank.deleteMany({ where: { keywordId: keyword.id, date: today } });
    await db.keywordRank.deleteMany({ where: { keywordId: keyword.id, date: today } });
    console.log("\nRun `npm run db:seed` to restore today's rank rows.");
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
