import "server-only";

import type { CrawlKind, Platform } from "@prisma/client";

import { db } from "@/server/db";

/**
 * The crawl frontier.
 *
 * A corpus of hundreds of thousands of terms is days of wall-clock, and the
 * work cannot live in a `for` loop: the process gets restarted, the network
 * drops, the laptop sleeps. Every unit of work is a row, claimed atomically and
 * marked done, so a run resumes exactly where it stopped rather than walking
 * the alphabet again from "aa".
 *
 * The frontier is also what turns a fixed alphabet sweep into an open-ended
 * one. A prefix that produced new terms earns children — itself plus each
 * letter — so the crawl spends its requests where the corpus is still growing
 * and abandons the branches that have gone dry. That is the difference between
 * 676 two-letter prefixes yielding a few thousand terms and a frontier walk
 * yielding hundreds of thousands.
 */

const ALPHABET = "abcdefghijklmnopqrstuvwxyz".split("");

export type SeedResult = { created: number; existing: number };

/** Seed the root prefixes. Idempotent — re-seeding an existing run is a no-op. */
export async function seedAlphabet(options: {
  platform: Platform;
  country: string;
  depth?: 1 | 2;
}): Promise<SeedResult> {
  const depth = options.depth ?? 2;
  const roots =
    depth === 1 ? ALPHABET : ALPHABET.flatMap((a) => ALPHABET.map((b) => `${a}${b}`));

  const result = await db.crawlTask.createMany({
    data: roots.map((input) => ({
      kind: "PREFIX" as const,
      platform: options.platform,
      country: options.country,
      input,
      depth: input.length,
    })),
    skipDuplicates: true,
  });

  return { created: result.count, existing: roots.length - result.count };
}

export type ClaimedTask = {
  id: string;
  input: string;
  depth: number;
  platform: Platform;
  country: string;
};

/**
 * Take the next unit of work.
 *
 * The claim is a conditional update rather than a read-then-write: two lanes
 * (or two machines) selecting the same row would otherwise both crawl it. The
 * `state: "PENDING"` in the where clause is what makes losing that race
 * harmless — the loser updates zero rows and asks again.
 *
 * Shallow tasks go first. Breadth-first keeps the corpus broad early, so a run
 * stopped after six hours still covers the whole alphabet instead of having
 * exhaustively explored everything beginning with "aa".
 */
export async function claimTask(options: {
  kind: CrawlKind;
  platform: Platform;
  country: string;
}): Promise<ClaimedTask | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const next = await db.crawlTask.findFirst({
      where: {
        kind: options.kind,
        platform: options.platform,
        country: options.country,
        state: "PENDING",
      },
      orderBy: [{ depth: "asc" }, { createdAt: "asc" }],
      select: { id: true, input: true, depth: true },
    });

    if (!next) return null;

    const claimed = await db.crawlTask.updateMany({
      where: { id: next.id, state: "PENDING" },
      data: { state: "RUNNING", startedAt: new Date(), attempts: { increment: 1 } },
    });

    if (claimed.count === 1) {
      return {
        id: next.id,
        input: next.input,
        depth: next.depth,
        platform: options.platform,
        country: options.country,
      };
    }
  }

  return null;
}

export async function completeTask(id: string, discovered: number): Promise<void> {
  await db.crawlTask.update({
    where: { id },
    data: { state: "DONE", discovered, finishedAt: new Date(), error: null },
  });
}

/**
 * Hand a failed task back, or bury it.
 *
 * Three attempts, then FAILED. The row is kept rather than deleted so that a
 * systematic breakage — an endpoint that started answering 404, say — shows up
 * as a count in the run summary instead of as an unexplained gap in the corpus.
 */
export async function failTask(id: string, error: unknown, maxAttempts = 3): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const task = await db.crawlTask.findUnique({ where: { id }, select: { attempts: true } });

  await db.crawlTask.update({
    where: { id },
    data: {
      state: (task?.attempts ?? maxAttempts) >= maxAttempts ? "FAILED" : "PENDING",
      error: message.slice(0, 500),
      finishedAt: new Date(),
    },
  });
}

/**
 * Grow the frontier from a prefix that paid off.
 *
 * `prefix + letter` and `prefix + space + letter`: the first walks deeper into
 * single words, the second is the "alphabet soup" trick that pulls out
 * multi-word searches — "habit t" gives "habit tracker", which no amount of
 * three-letter prefixing would reach.
 *
 * Expansion is earned, not automatic. A prefix that discovered nothing new has
 * exhausted its branch, and expanding it anyway is how a crawl spends a day of
 * requests on 26 variants of a dead end.
 */
export async function expandPrefix(options: {
  prefix: string;
  platform: Platform;
  country: string;
  depth: number;
  discovered: number;
  /** New terms a prefix must produce to earn children. */
  threshold?: number;
  /** Hard stop on how deep the walk goes. */
  maxDepth?: number;
}): Promise<number> {
  /*
   * Three, not one.
   *
   * A threshold of one meant any prefix that found a single new term earned 52
   * children, and those children inherited its exhaustion. Measured over a
   * 446,000-term corpus: depth-2 prefixes averaged 9.4 new terms, depth-3 only
   * 4.3, and the 15,762 depth-3 prefixes that found just one or two generated
   * 819,624 queued tasks between them — a quarter of the frontier, and roughly
   * eleven days of crawling, from branches already 90% re-treading known
   * ground. Those were pruned; this stops them coming back.
   *
   * The cost is a slightly narrower walk. The frontier was never the limiting
   * factor — it stood at three million pending against 101,315 crawled — so
   * the trade is heavily in favour of not queueing work that will not pay.
   */
  const threshold = options.threshold ?? 3;
  const maxDepth = options.maxDepth ?? 6;

  if (options.discovered < threshold) return 0;
  if (options.depth >= maxDepth) return 0;

  const children = ALPHABET.flatMap((letter) => [
    `${options.prefix}${letter}`,
    `${options.prefix} ${letter}`,
  ]);

  const result = await db.crawlTask.createMany({
    data: children.map((input) => ({
      kind: "PREFIX" as const,
      platform: options.platform,
      country: options.country,
      input,
      depth: options.depth + 1,
    })),
    skipDuplicates: true,
  });

  return result.count;
}

/** Queue category mining for every category in a list. */
export async function seedCategories(options: {
  platform: Platform;
  country: string;
  categories: string[];
}): Promise<number> {
  const result = await db.crawlTask.createMany({
    data: options.categories.map((input) => ({
      kind: "CATEGORY" as const,
      platform: options.platform,
      country: options.country,
      input,
      depth: 1,
    })),
    skipDuplicates: true,
  });

  return result.count;
}

/**
 * Release tasks a dead process left claimed.
 *
 * A run killed mid-task leaves RUNNING rows nothing will ever finish. Without
 * this, every restart permanently loses whatever was in flight, and after
 * enough restarts the frontier is mostly tombstones.
 */
export async function releaseStale(olderThanMinutes = 30): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);

  const result = await db.crawlTask.updateMany({
    where: { state: "RUNNING", startedAt: { lt: cutoff } },
    data: { state: "PENDING" },
  });

  return result.count;
}

export type FrontierStats = {
  pending: number;
  running: number;
  done: number;
  failed: number;
};

export async function frontierStats(options?: {
  kind?: CrawlKind;
  platform?: Platform;
}): Promise<FrontierStats> {
  const where = {
    ...(options?.kind ? { kind: options.kind } : {}),
    ...(options?.platform ? { platform: options.platform } : {}),
  };

  const grouped = await db.crawlTask.groupBy({
    by: ["state"],
    where,
    _count: { _all: true },
  });

  const stats: FrontierStats = { pending: 0, running: 0, done: 0, failed: 0 };

  for (const row of grouped) {
    if (row.state === "PENDING") stats.pending = row._count._all;
    if (row.state === "RUNNING") stats.running = row._count._all;
    if (row.state === "DONE") stats.done = row._count._all;
    if (row.state === "FAILED") stats.failed = row._count._all;
  }

  return stats;
}
