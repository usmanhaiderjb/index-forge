/**
 * Build the keyword corpus by expanding prefixes through store autocomplete.
 *
 *   npm run corpus:crawl                    # 26 single letters, iOS + Android, US
 *   npm run corpus:crawl -- --depth 2       # 676 two-letter prefixes (slow)
 *   npm run corpus:crawl -- --country gb --platform IOS
 *   npm run corpus:crawl -- --limit 20      # stop after 20 prefixes
 *
 * A one-shot sweep, kept for watching a single crawl end to end. For anything
 * larger use `npm run corpus:build`, which is resumable, runs six lanes at once
 * and expands the frontier instead of walking a fixed alphabet.
 *
 * Runs the crawl inline rather than through the queue, so it can be watched.
 * In production this belongs on the worker — one job per prefix — so that the
 * worker's concurrency bounds the request rate. See docs/KEYWORD-DATABASE.md §7.
 *
 * Every request still goes through `storeFetch`, which applies the shared
 * per-host throttle from ASO_SCRAPE_DELAY_MS. **Redis must be running**: the
 * throttle lives there, and without it every call blocks.
 */
import Module from "node:module";

const load = (Module as unknown as { _load: (...a: unknown[]) => unknown })._load;
(Module as unknown as { _load: (...a: unknown[]) => unknown })._load = function (
  this: unknown,
  request: unknown,
  ...rest: unknown[]
) {
  if (typeof request === "string" && request.includes("server-only")) return {};
  return load.call(this, request, ...rest);
} as never;

const { crawlPrefix, prefixes, recomputeEstimates } = (await import(
  "../src/server/aso/corpus"
)) as typeof import("../src/server/aso/corpus");
const { PrismaClient } = (await import("@prisma/client")) as typeof import("@prisma/client");

const db = new PrismaClient();

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

async function main() {
  const depth = arg("depth", "1") === "2" ? 2 : 1;
  const country = arg("country", "us");
  const only = arg("platform", "");
  const limit = Number(arg("limit", "0")) || Infinity;

  const platforms = (only ? [only] : ["IOS", "ANDROID"]) as ("IOS" | "ANDROID")[];
  const list = prefixes(depth).slice(0, limit);

  console.log(
    `Crawling ${list.length} prefix(es) × ${platforms.length} platform(s) in ${country}.\n`,
  );

  let totalNew = 0;
  let empty = 0;

  for (const prefix of list) {
    for (const platform of platforms) {
      const result = await crawlPrefix(prefix, { platform, country });
      totalNew += result.created;

      // A prefix returning nothing on every platform usually means the endpoint
      // changed, not that nobody searches those letters. Counted so a silent
      // breakage shows up as a number rather than as an empty corpus.
      if (result.suggested === 0) empty++;

      console.log(
        `  ${platform.padEnd(8)} "${prefix}"  ` +
          `suggested=${String(result.suggested).padStart(2)}  ` +
          `new=${String(result.created).padStart(2)}  seen=${result.updated}`,
      );
    }
  }

  const written = await recomputeEstimates(5000);

  console.log(`\n${totalNew} new terms, ${written} estimates recomputed.`);
  if (empty > 0) {
    console.log(
      `${empty} crawl(s) returned nothing — if that is most of them, an endpoint has changed.`,
    );
  }

  const [terms, signals] = await Promise.all([db.keywordTerm.count(), db.keywordSignal.count()]);
  console.log(`Corpus: ${terms} terms, ${signals} signals.`);

  await db.$disconnect();
}

void main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
