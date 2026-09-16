/**
 * Grow everything the product reads from: keywords, trends and gaps.
 *
 * Three collections, three different shapes of work:
 *
 *   - **keywords** — the corpus crawl, which is `build-corpus.ts`. Run as a
 *     child process rather than reimplemented here: it owns the frontier, the
 *     lanes and the shutdown handling, and a second copy of that logic would
 *     drift from the first.
 *   - **trends** — chart sweeps. Value comes from *repetition*, not depth: a
 *     climb is the difference between two readings, so the same twenty apps
 *     re-read tomorrow is worth more than two hundred read once.
 *   - **gaps** — review ingest per category, which is what themes are derived
 *     from.
 *
 * ## They share one throttle, and that is deliberate
 *
 * Every outbound store request passes through a Redis-held per-host gate —
 * 4s for play.google.com. Adding lanes does **not** add throughput; it splits
 * the same request budget three ways. Trends and gaps are cheap and infrequent
 * by design so the keyword crawl keeps most of it.
 *
 * Requires Postgres (`npm run localdb`) and Redis. The throttle is Redis-held,
 * so without it nothing here is rate limited and the stores will notice.
 */
import { spawn } from "node:child_process";
import Module from "node:module";
import path from "node:path";

// A crawl that logs every statement buries its own progress lines.
process.env.PRISMA_LOG_QUERIES ??= "0";

const load = (Module as unknown as { _load: (...a: unknown[]) => unknown })._load;
(Module as unknown as { _load: (...a: unknown[]) => unknown })._load = function (
  this: unknown,
  request: unknown,
  ...rest: unknown[]
) {
  if (typeof request === "string" && request.includes("server-only")) return {};
  return load.call(this, request, ...rest);
} as never;

const { scanAllCategories } = (await import("../src/server/market/scan")) as typeof import("../src/server/market/scan");
const { buildNiche } = (await import("../src/server/market/ingest")) as typeof import("../src/server/market/ingest");
const { MINE_CATEGORIES } = (await import("../src/server/aso/mining")) as typeof import("../src/server/aso/mining");
const { db } = (await import("../src/server/db")) as typeof import("../src/server/db");
const { blockingRedis } = (await import("../src/server/redis")) as typeof import("../src/server/redis");
const { PrismaClient } = (await import("@prisma/client")) as typeof import("@prisma/client");

const argv = process.argv.slice(2);
const arg = (name: string, fallback: string): string =>
  argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;
const flag = (name: string): boolean => argv.includes(`--${name}`);

const country = arg("country", "us");
const sweepHours = Number(arg("sweep-hours", "12"));
const nicheHours = Number(arg("niche-hours", "24"));
const chartDepth = Number(arg("chart-depth", "20"));
const nicheApps = Number(arg("niche-apps", "8"));

if (process.env.PORT) {
  const http = await import("node:http");
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("OK - IndexForge Corpus Crawler running 24/7\n");
  });
  const port = Number(process.env.PORT) || 3000;
  server.listen(port, () => {
    console.log(`[http] healthcheck listener active on port ${port}`);
  });
}

const want = {
  keywords: !flag("no-keywords"),
  trends: !flag("no-trends"),
  gaps: !flag("no-gaps"),
};

let stopping = false;
const stamp = (): string => new Date().toISOString().slice(11, 19);
const log = (lane: string, message: string): void => console.log(`${stamp()} [${lane}] ${message}`);
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms).unref?.() ?? setTimeout(resolve, ms));

/** Sleep that wakes early on shutdown, so Ctrl+C is not held for twelve hours. */
async function rest(ms: number): Promise<void> {
  const until = Date.now() + ms;
  while (!stopping && Date.now() < until) {
    await sleep(Math.min(5_000, until - Date.now()));
  }
}

/* ----------------------------------------------------------------- keywords */

function keywordLane(): Promise<void> {
  return new Promise((resolve) => {
    // Everything after `--` on our own command line is forwarded, so the corpus
    // crawl keeps its full flag surface without this script mirroring it.
    const passthrough = argv.includes("--") ? argv.slice(argv.indexOf("--") + 1) : [];
    const args = [
      "--env-file-if-exists=.env",
      "scripts/build-corpus.ts",
      `--country=${country}`,
      ...passthrough,
    ];

    log("keywords", `starting corpus crawl: build-corpus.ts ${args.slice(2).join(" ")}`);

    // The tsx CLI is run through this same Node binary rather than through
    // `npx` in a shell: a shell spawn on Windows concatenates arguments
    // unescaped, and it adds a process between here and the crawl that Ctrl+C
    // then has to travel through.
    const child = spawn(process.execPath, [TSX_CLI, ...args], { stdio: "inherit" });

    const stop = (): void => {
      if (!child.killed) child.kill("SIGINT");
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);

    child.on("exit", (code) => {
      log("keywords", `corpus crawl exited with code ${code ?? 0}`);
      resolve();
    });
  });
}

/* ------------------------------------------------------------------- trends */

async function trendLane(): Promise<void> {
  while (!stopping) {
    try {
      const results = await scanAllCategories({ country, depth: chartDepth });
      const created = results.reduce((sum, r) => sum + r.created, 0);
      const snapshots = results.reduce((sum, r) => sum + r.snapshots, 0);

      // Snapshots, not new apps, is the number that matters: the second reading
      // of an app already known is what turns a standing into a climb.
      log("trends", `swept ${results.length} categories — ${snapshots} snapshots, ${created} new apps`);
    } catch (error) {
      log("trends", `sweep failed: ${(error as Error).message.slice(0, 140)}`);
    }

    await rest(sweepHours * 3_600_000);
  }
}

/* --------------------------------------------------------------------- gaps */

async function gapLane(): Promise<void> {
  const organization = await db.organization.findFirst({ select: { id: true, name: true } });

  if (!organization) {
    log("gaps", "no organization in the database — skipping. Sign in on the web app once, then restart.");
    return;
  }

  log("gaps", `building niches for "${organization.name}"`);

  const categories = MINE_CATEGORIES.ANDROID;
  let index = 0;

  while (!stopping) {
    const category = categories[index % categories.length];
    index++;

    if (category) {
      try {
        const result = await buildNiche({
          category: category.id,
          label: category.label,
          organizationId: organization.id,
          country,
          apps: nicheApps,
          reviewsPerApp: 80,
        });

        log(
          "gaps",
          `${category.label}: ${result.appsRead}/${result.apps} apps read, ` +
            `${result.reviewsFetched} reviews, ${result.themes} themes` +
            // Reviews land whether or not the AI key works; themes are what
            // goes missing. Saying so beats a silent "0 themes".
            (result.reviewsFetched > 0 && result.reviewsClassified === 0
              ? " (nothing classified — check the AI key)"
              : ""),
        );
      } catch (error) {
        log("gaps", `${category.label} failed: ${(error as Error).message.slice(0, 140)}`);
      }
    }

    // One category per cycle, spread across the interval. Eight categories at
    // this spacing means each is rebuilt roughly once a week.
    await rest((nicheHours * 3_600_000) / categories.length);
  }
}

/* ------------------------------------------------------------ dependencies */

const TSX_CLI = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");

/**
 * Probe client, logging nothing.
 *
 * The shared `db` always logs errors, so polling it during startup printed a
 * six-line Prisma error block every two seconds — pages of alarming output for
 * a database that was merely still opening.
 */
const probe = new PrismaClient({ log: [] });

type DatabaseState = "up" | "recovering" | "down";

/**
 * Is Postgres answering, and if not, why.
 *
 * `FATAL: the database system is starting up` is not a failure. It is Postgres
 * replaying its write-ahead log after an unclean shutdown, and it clears on its
 * own — a kill -9 of the cluster (or a lost power rail) guarantees it. Telling
 * it apart from a refused connection is the difference between "wait" and
 * "something is actually wrong".
 */
async function databaseState(): Promise<DatabaseState> {
  try {
    await probe.$queryRaw`SELECT 1`;
    return "up";
  } catch (error) {
    const message = (error as Error).message;
    return /starting up|recovery mode|not yet accepting/i.test(message) ? "recovering" : "down";
  }
}

/**
 * Bring Postgres up if it is not already.
 *
 * The embedded cluster is started as a child so this stays one command. If
 * something else is already serving the port — a Docker Postgres, a system
 * install — that is detected first and left alone.
 */
async function ensureDatabase(): Promise<void> {
  const initial = await databaseState();

  if (initial === "up") {
    log("deps", "Postgres already up");
    return;
  }

  if (initial === "recovering") {
    // Already running, just not open for business yet. Starting a second
    // cluster on the same data directory would be far worse than waiting.
    log("deps", "Postgres is replaying its write-ahead log — waiting, not restarting");
    await waitForDatabase(null);
    return;
  }

  log("deps", "Postgres not answering — starting the embedded cluster");

  const child = spawn(process.execPath, [TSX_CLI, "--env-file-if-exists=.env", "scripts/local-db.ts"], {
    stdio: "inherit",
  });

  const stop = (): void => {
    if (!child.killed) child.kill("SIGINT");
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  child.on("exit", (code) => {
    if (!stopping) log("deps", `Postgres exited with code ${code ?? 0}`);
  });

  await waitForDatabase(child);
}

/**
 * Wait for Postgres to open.
 *
 * Generous, because WAL replay after an unclean shutdown is unbounded in
 * principle and the old two-minute ceiling turned a database that was working
 * perfectly well into a hard failure. Recovery is reported as progress rather
 * than as repeated errors, so a long replay reads as a long replay.
 */
async function waitForDatabase(child: ReturnType<typeof spawn> | null): Promise<void> {
  const deadline = Date.now() + 10 * 60_000;
  let announced = false;

  while (!stopping && Date.now() < deadline) {
    await sleep(2_000);

    const state = await databaseState();

    if (state === "up") {
      log("deps", "Postgres ready");
      return;
    }

    if (state === "recovering" && !announced) {
      announced = true;
      log("deps", "Postgres is recovering after an unclean shutdown — this resolves on its own");
    }

    if (child?.exitCode != null) {
      throw new Error(`the Postgres process exited with code ${child.exitCode} before opening`);
    }
  }

  if (stopping) return;
  throw new Error("Postgres did not open within ten minutes");
}

/**
 * Redis is not optional and this refuses to run without it.
 *
 * The per-host request gate lives in Redis. Without it nothing is throttled —
 * the crawl would hit the stores as fast as the network allows, which is how
 * an IP gets blocked. Failing here is much cheaper than finding out later.
 */
async function ensureRedis(): Promise<void> {
  try {
    // ioredis retries a refused connection indefinitely, so an unguarded ping
    // against a dead Redis never rejects — it just hangs, and the process sits
    // there printing nothing. A check that cannot fail is not a check.
    await Promise.race([
      blockingRedis().ping(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("no response within 5s")), 5_000).unref(),
      ),
    ]);
    log("deps", "Redis up");
  } catch (error) {
    throw new Error(
      `Redis is not answering (${(error as Error).message.slice(0, 80)}). ` +
        "The per-host throttle lives in Redis, so crawling without it would hammer the stores " +
        "unthrottled. Start Memurai (or redis-server) and run this again.",
    );
  }
}

/* --------------------------------------------------------------------- main */

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    if (stopping) return;
    stopping = true;
    console.log(`\n${stamp()} [grow] stopping — finishing the request in flight`);
  });
}

try {
  await ensureRedis();
  await ensureDatabase();
} catch (error) {
  console.error(`
${(error as Error).message}`);
  process.exit(1);
}

const lanes: Promise<void>[] = [];
if (want.keywords) lanes.push(keywordLane());
if (want.trends) lanes.push(trendLane());
if (want.gaps) lanes.push(gapLane());

if (lanes.length === 0) {
  console.error("Nothing to do — all three lanes were disabled.");
  process.exit(1);
}

log("grow", `lanes: ${Object.entries(want).filter(([, on]) => on).map(([name]) => name).join(", ")}`);
log("grow", `country=${country} sweep=${sweepHours}h niche=${nicheHours}h chartDepth=${chartDepth}`);
log("grow", "Ctrl+C to stop. All three lanes share one 4s-per-request gate on play.google.com.");

await Promise.all(lanes);
await Promise.all([db.$disconnect(), probe.$disconnect()]);
log("grow", "stopped");
