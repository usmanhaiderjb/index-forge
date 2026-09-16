/**
 * Build the keyword corpus at scale.
 *
 *   npm run corpus:build                          # runs until stopped
 *   npm run corpus:build -- --hours 168           # a week, then stop
 *   npm run corpus:build -- --target 200000       # stop at 200k terms
 *   npm run corpus:build -- --country gb --platform IOS
 *   npm run corpus:build -- --delay 2500          # slower, safer
 *   npm run corpus:build -- --stats               # report and exit
 *   npm run corpus:build -- --backfill-top-apps   # re-scan terms missing topApps
 *   npm run corpus:build -- --lanes difficulty    # scoring only, no discovery
 *
 * This is a long-running crawler, not a script that finishes. It is designed to
 * be killed and restarted: every unit of work is a row in `crawl_tasks`, so
 * Ctrl-C loses at most the tasks currently in flight, and starting it again
 * picks up where it left off.
 *
 * Requires **Postgres and Redis**. Redis holds the per-host throttle; without
 * it every request blocks.
 *
 * ## What it actually costs
 *
 * At the default 1200 ms per host and four hosts in play, this is roughly
 * 250,000 requests a day aimed at Apple and Google from one IP address. That is
 * a lot of traffic. Read `docs/KEYWORD-DATABASE.md` §7 before pointing it at
 * the stores for days on end, raise `--delay` if you are not sure, and expect
 * to be rate limited — the lanes back off on their own, but a blocked IP is a
 * blocked IP.
 */
import Module from "node:module";

// Before anything imports the Prisma client. A week-long crawl logging every
// statement writes gigabytes and hides the progress lines.
process.env.PRISMA_LOG_QUERIES = "0";

const load = (Module as unknown as { _load: (...a: unknown[]) => unknown })._load;
(Module as unknown as { _load: (...a: unknown[]) => unknown })._load = function (
  this: unknown,
  request: unknown,
  ...rest: unknown[]
) {
  if (typeof request === "string" && request.includes("server-only")) return {};
  return load.call(this, request, ...rest);
} as never;

const { crawlPrefix, recomputeEstimates } = (await import("../src/server/aso/corpus")) as typeof import("../src/server/aso/corpus");
const { mineCategory, validateMinedTerms, MINE_CATEGORIES } = (await import("../src/server/aso/mining")) as typeof import("../src/server/aso/mining");
const { pendingCompetition, scoreCompetition } = (await import("../src/server/aso/difficulty")) as typeof import("../src/server/aso/difficulty");
const frontier = (await import("../src/server/aso/frontier")) as typeof import("../src/server/aso/frontier");
const { PrismaClient } = (await import("@prisma/client")) as typeof import("@prisma/client");

type Platform = "IOS" | "ANDROID";

const db = new PrismaClient();

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Set by SIGINT. Lanes finish the task in hand, then unwind. */
let stopping = false;

const started = Date.now();
const counters = {
  prefixes: 0,
  categories: 0,
  scored: 0,
  discovered: 0,
  errors: 0,
  rateLimited: 0,
};

/**
 * Is this the store telling us to slow down?
 *
 * **403 counts.** Apple's search endpoint answers 403, not 429, when it has had
 * enough — and because only 429 was matched here at first, every one of those
 * fell through to the generic branch and retried five seconds later. The iOS
 * difficulty lane spent hours doing that: 350 refusals in one run, each one
 * answered by knocking again almost immediately. That is both useless and the
 * fastest way to earn a longer ban.
 */
function isRateLimit(error: unknown): boolean {
  // The status code, not the wording.
  //
  // `storeFetch` attaches `status` to every error it throws, and reading it is
  // both cheaper and steadier than matching prose the stores are free to
  // reword. It is also not something a stray escape character can silently
  // break, which is how this function spent an entire run failing to match
  // the string it was written to match.
  const status = (error as { status?: number } | null)?.status;
  if (status === 429 || status === 403) return true;

  const message = error instanceof Error ? error.message : String(error);
  return /(429|403)|rate limit|too many requests/i.test(message);
}

/**
 * One lane: claim, work, complete, repeat.
 *
 * Each lane owns a store and a kind of work, and lanes run concurrently.
 * Because the throttle is per host and the four endpoints in play live on four
 * different hosts, concurrent lanes genuinely overlap instead of queueing
 * behind each other — which is where most of the throughput comes from.
 *
 * Backoff is per lane and multiplicative. A rate-limited lane steps aside
 * without stalling the other three, and returns to full speed only after a
 * clean task.
 */
async function runLane(
  name: string,
  work: () => Promise<"worked" | "idle">,
): Promise<void> {
  let backoff = 0;

  while (!stopping) {
    try {
      const outcome = await work();

      if (outcome === "idle") {
        // Nothing queued for this lane. Sleep rather than spin — another lane
        // may still be creating work for it.
        await sleep(5_000);
        continue;
      }

      backoff = 0;
    } catch (error) {
      counters.errors++;

      if (isRateLimit(error)) {
        counters.rateLimited++;
        // Never less than a minute, whatever the lane was doing before.
        //
        // The ladder is shared with ordinary errors, which start at five
        // seconds — so a rate limit arriving straight after a generic failure
        // used to double 5s into 10s and report "rate limited, backing off
        // 10s". Backing off least exactly when the store is refusing us is
        // precisely backwards.
        backoff = Math.min(Math.max(60_000, backoff * 2), 30 * 60_000);
        console.log(`  [${name}] rate limited, backing off ${Math.round(backoff / 1000)}s`);
      } else {
        backoff = backoff === 0 ? 5_000 : Math.min(backoff * 2, 5 * 60_000);
        const message = error instanceof Error ? error.message : String(error);
        console.log(`  [${name}] ${message.slice(0, 120)}`);
      }

      await sleep(backoff);
    }
  }
}

/** Expand prefixes through autocomplete, growing the frontier as it goes. */
function prefixLane(platform: Platform, country: string) {
  return async (): Promise<"worked" | "idle"> => {
    const task = await frontier.claimTask({ kind: "PREFIX", platform, country });
    if (!task) return "idle";

    try {
      const result = await crawlPrefix(task.input, { platform, country });
      counters.prefixes++;
      counters.discovered += result.created;

      await frontier.completeTask(task.id, result.created);

      await frontier.expandPrefix({
        prefix: task.input,
        platform,
        country,
        depth: task.depth,
        discovered: result.created,
      });

      return "worked";
    } catch (error) {
      await frontier.failTask(task.id, error);
      throw error;
    }
  };
}

/** Mine category charts for the vocabulary developers actually target. */
function categoryLane(platform: Platform, country: string) {
  return async (): Promise<"worked" | "idle"> => {
    const task = await frontier.claimTask({ kind: "CATEGORY", platform, country });
    if (!task) return "idle";

    try {
      const result = await mineCategory({ platform, category: task.input, country });
      counters.categories++;
      counters.discovered += result.created;

      await frontier.completeTask(task.id, result.created);
      return "worked";
    } catch (error) {
      await frontier.failTask(task.id, error);
      throw error;
    }
  };
}

/**
 * Score competition, highest-demand terms first.
 *
 * Not frontier-backed: the work list is derived from the corpus itself, so
 * there is nothing to resume — restarting simply re-derives which terms are
 * still unscored.
 */
function difficultyLane(
  platform: Platform,
  country: string,
  minIndex: number,
  backfillTopApps: boolean,
  rescoreWithoutBasis: boolean,
) {
  let queue: { id: string; term: string }[] = [];

  return async (): Promise<"worked" | "idle"> => {
    if (queue.length === 0) {
      queue = await pendingCompetition({
        platform,
        country,
        limit: 200,
        minIndex,
        backfillTopApps,
        rescoreWithoutBasis,
      });
      if (queue.length === 0) return "idle";
    }

    const next = queue.shift();
    if (!next) return "idle";

    await scoreCompetition({ termId: next.id, term: next.term, platform, country });
    counters.scored++;
    return "worked";
  };
}

/**
 * Housekeeping, on its own clock.
 *
 * Estimates are recomputed in the background rather than after every crawl:
 * rewriting a term's estimate on each new signal would triple the write load
 * for a number that only matters when someone looks at it.
 */
async function maintenanceLane(country: string, platforms: Platform[]): Promise<void> {
  while (!stopping) {
    // Every 90 seconds, not every five minutes. The crawl adds terms far
    // faster than it did at phase-one scale, and a five-minute cycle left tens
    // of thousands of them unindexed at any moment.
    await sleep(90_000);
    if (stopping) return;

    try {
      const written = await recomputeEstimates(20_000);
      const released = await frontier.releaseStale(30);

      // Mined terms need the store asked directly whether anyone searches them.
      let confirmed = 0;
      for (const platform of platforms) {
        const result = await validateMinedTerms({ platform, country, limit: 50 });
        confirmed += result.confirmed;
      }

      console.log(
        `  [maintain] ${written} estimates, ${confirmed} mined terms confirmed` +
          (released > 0 ? `, ${released} stale tasks released` : ""),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`  [maintain] ${message.slice(0, 120)}`);
    }
  }
}

async function corpusSize(): Promise<{ terms: number; scored: number; estimated: number }> {
  const [terms, scored, estimated] = await Promise.all([
    db.keywordTerm.count(),
    db.keywordCompetition.count(),
    db.keywordVolumeEstimate.count(),
  ]);
  return { terms, scored, estimated };
}

/** Status line. The only output during a long run, so it carries the rate. */
async function reportLane(target: number, deadline: number): Promise<void> {
  const startSize = (await corpusSize()).terms;

  while (!stopping) {
    await sleep(60_000);
    if (stopping) return;

    const size = await corpusSize();
    const stats = await frontier.frontierStats({ kind: "PREFIX" });
    const minutes = (Date.now() - started) / 60_000;
    const perHour = Math.round(((size.terms - startSize) / Math.max(minutes, 1)) * 60);

    const eta =
      target > 0 && perHour > 0 && size.terms < target
        ? `, ${((target - size.terms) / perHour).toFixed(1)}h to ${target.toLocaleString("en-US")}`
        : "";

    console.log(
      `[${new Date().toISOString().slice(11, 16)}] ` +
        `${size.terms.toLocaleString("en-US")} terms  ` +
        `${size.estimated.toLocaleString("en-US")} indexed  ` +
        `${size.scored.toLocaleString("en-US")} scored  ` +
        `+${perHour.toLocaleString("en-US")}/h${eta}  ` +
        `frontier ${stats.pending.toLocaleString("en-US")} pending` +
        (stats.failed > 0 ? ` ${stats.failed} failed` : ""),
    );

    if (target > 0 && size.terms >= target) {
      console.log(`\nTarget of ${target.toLocaleString("en-US")} terms reached.`);
      stopping = true;
    }

    if (Date.now() >= deadline) {
      console.log(`\nTime limit reached.`);
      stopping = true;
    }
  }
}

async function printStats(): Promise<void> {
  const size = await corpusSize();
  const [prefix, category] = await Promise.all([
    frontier.frontierStats({ kind: "PREFIX" }),
    frontier.frontierStats({ kind: "CATEGORY" }),
  ]);

  const byDiscovery = await db.keywordTerm.groupBy({
    by: ["discovery"],
    _count: { _all: true },
  });
  const byConfidence = await db.keywordVolumeEstimate.groupBy({
    by: ["confidence"],
    _count: { _all: true },
  });

  console.log(`Corpus`);
  console.log(`  ${size.terms.toLocaleString("en-US")} terms`);
  for (const row of byDiscovery) {
    console.log(`    ${row.discovery.padEnd(16)} ${row._count._all.toLocaleString("en-US")}`);
  }
  console.log(`  ${size.estimated.toLocaleString("en-US")} with a demand index`);
  for (const row of byConfidence) {
    console.log(`    ${row.confidence.padEnd(16)} ${row._count._all.toLocaleString("en-US")}`);
  }
  console.log(`  ${size.scored.toLocaleString("en-US")} with a difficulty score`);
  console.log(
    `\nFrontier` +
      `\n  prefixes    ${prefix.pending.toLocaleString("en-US")} pending, ${prefix.done.toLocaleString("en-US")} done, ${prefix.failed} failed` +
      `\n  categories  ${category.pending} pending, ${category.done} done, ${category.failed} failed`,
  );
}

async function main() {
  if (flag("stats")) {
    await printStats();
    await db.$disconnect();
    return;
  }

  const country = arg("country", "us");
  const only = arg("platform", "");
  const platforms: Platform[] = only ? [only as Platform] : ["IOS", "ANDROID"];
  const target = Number(arg("target", "0"));
  const hours = Number(arg("hours", "0"));
  const minIndex = Number(arg("min-index", "0"));
  const seedDepth = arg("seed-depth", "2") === "1" ? 1 : 2;
  // Re-scan terms scored before `topApps` existed, ahead of unscored ones.
  const backfill = flag("backfill-top-apps");
  // Re-score rows whose difficulty was computed with no rating basis at all.
  const rescore = flag("rescore-without-basis");
  /**
   * Which lanes to run.
   *
   * `difficulty` exists for backfills and catch-up passes: discovery would
   * otherwise keep crawling autocomplete for terms nobody asked for, and — more
   * to the point — keep pushing the corpus past whatever `--target` was set,
   * ending the run before the scoring work it was started for has drained.
   */
  const onlyDifficulty = arg("lanes", "all") === "difficulty";
  const deadline = hours > 0 ? started + hours * 3_600_000 : Number.MAX_SAFE_INTEGER;

  if (arg("delay", "")) process.env.ASO_SCRAPE_DELAY_MS = arg("delay", "");

  console.log(
    `Building corpus: ${platforms.join(" + ")} in ${country}, ` +
      `${target > 0 ? `target ${target.toLocaleString("en-US")} terms` : "no target"}, ` +
      `${hours > 0 ? `${hours}h limit` : "no time limit"}.`,
  );
  console.log(`Delay ${process.env.ASO_SCRAPE_DELAY_MS ?? "1200"}ms per host. Ctrl-C to stop.\n`);

  // Anything a previous run left claimed comes back now, not in 30 minutes.
  const released = await frontier.releaseStale(0);
  if (released > 0) console.log(`Released ${released} task(s) from a previous run.\n`);

  // Seeding is discovery work; a scoring-only run has nothing to seed.
  for (const platform of onlyDifficulty ? [] : platforms) {
    const seeded = await frontier.seedAlphabet({ platform, country, depth: seedDepth });
    const categories = await frontier.seedCategories({
      platform,
      country,
      categories: MINE_CATEGORIES[platform].map((c) => c.id),
    });
    console.log(
      `${platform}: ${seeded.created} new prefixes seeded (${seeded.existing} already queued), ${categories} categories.`,
    );
  }
  console.log();

  process.on("SIGINT", () => {
    if (stopping) process.exit(1);
    console.log(`\nStopping after the tasks in flight. Ctrl-C again to force.`);
    stopping = true;
  });

  const lanes: Promise<void>[] = [];

  for (const platform of platforms) {
    if (!onlyDifficulty) {
      lanes.push(runLane(`${platform} prefix`, prefixLane(platform, country)));
      lanes.push(runLane(`${platform} category`, categoryLane(platform, country)));
    }
    lanes.push(
      runLane(
        `${platform} difficulty`,
        difficultyLane(platform, country, minIndex, backfill, rescore),
      ),
    );
  }

  lanes.push(reportLane(target, deadline));
  lanes.push(maintenanceLane(country, platforms));

  await Promise.all(lanes);

  // One last pass so a run that stopped mid-crawl still leaves every term it
  // discovered carrying an index.
  console.log(`\nFinishing up.`);
  const written = await recomputeEstimates(20_000);
  await frontier.releaseStale(0);

  const size = await corpusSize();
  const elapsed = ((Date.now() - started) / 3_600_000).toFixed(1);

  console.log(
    `\nRan ${elapsed}h.` +
      `\n  ${counters.prefixes.toLocaleString("en-US")} prefixes crawled, ${counters.categories} categories mined` +
      `\n  ${counters.discovered.toLocaleString("en-US")} new terms, ${counters.scored.toLocaleString("en-US")} scored` +
      `\n  ${written.toLocaleString("en-US")} estimates written on exit` +
      `\n  ${counters.errors} errors, ${counters.rateLimited} rate limited` +
      `\n\nCorpus: ${size.terms.toLocaleString("en-US")} terms, ` +
      `${size.estimated.toLocaleString("en-US")} indexed, ${size.scored.toLocaleString("en-US")} scored.`,
  );

  await db.$disconnect();
  process.exit(0);
}

void main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
