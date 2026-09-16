import "server-only";

import type { Platform } from "@prisma/client";

import { clamp } from "@aso/shared";
import { itunesSearch } from "@/server/aso/builtin/itunes";
import { playSearch } from "@/server/aso/builtin/play";
import type { AsoSearchResult } from "@/server/aso/types";
import { db } from "@/server/db";

/**
 * Keyword difficulty: how hard it would be to break into the top of a term.
 *
 * No store publishes this, so it is an explicit model rather than a
 * measurement, and it is stored as such. The inputs are the apps currently
 * ranking for the term:
 *
 *   - strong incumbents (many ratings, high average) push difficulty up
 *   - a shallow result set pushes it down
 *
 * This lives here rather than inside the built-in provider because the corpus
 * builder scores hundreds of thousands of terms with it, and two copies of a
 * scoring model drifting apart would put two different numbers on the same
 * keyword in two different screens.
 */
export function estimateDifficulty(results: AsoSearchResult[]): number {
  const top = results.slice(0, 10);
  if (top.length === 0) return 0;

  // Play's search results carry a star rating and no rating count; the App
  // Store's carry both. Weighting a missing input as zero is what produced
  // 23,679 Android scores that were a function of result count alone — every
  // one of them in the 0-10 band, carrying no information about the term. When
  // volume is absent the remaining signal takes the full weight, so the number
  // means "as much as this store lets us see" rather than "nearly zero".
  const hasVolume = top.some((r) => (r.ratingCount ?? 0) > 0);

  const strength = top.map((r) => {
    const ratings = r.ratingCount ?? 0;
    // Ratings span many orders of magnitude; log scale keeps this readable.
    const volume = ratings > 0 ? Math.log10(ratings) / 6 : 0; // 1M ratings -> 1.0
    const quality = ((r.ratingAverage ?? 3.5) - 3) / 2; // 3.0 -> 0, 5.0 -> 1
    return hasVolume
      ? clamp(volume * 0.75 + quality * 0.25, 0, 1)
      : clamp(quality, 0, 1);
  });

  const average = strength.reduce((a, b) => a + b, 0) / strength.length;
  const depth = clamp(results.length / 50, 0.4, 1);

  return Math.round(clamp(average * depth * 100, 1, 100));
}

/** Combined ratings of the top ten — the raw input behind the score. */
export function topRatingCount(results: AsoSearchResult[]): number {
  return results.slice(0, 10).reduce((sum, r) => sum + (r.ratingCount ?? 0), 0);
}

export type CompetitionResult = {
  term: string;
  difficulty: number;
  resultCount: number;
};

/**
 * Score one term on one store and record it.
 *
 * One search request per term per platform. That is the expensive half of the
 * corpus — a term costs one request to discover and another to score — which
 * is why scoring is a separate pass that runs against the terms with the
 * highest demand index first. A corpus with 200,000 unscored tail terms and
 * 5,000 scored head terms is far more useful than one uniformly half-scored.
 */
export async function scoreCompetition(options: {
  termId: string;
  term: string;
  platform: Platform;
  country: string;
  locale?: string;
}): Promise<CompetitionResult> {
  const locale = options.locale ?? "en-US";

  const results =
    options.platform === "IOS"
      ? await itunesSearch(options.term, { country: options.country, locale, limit: 50 })
      : await playSearch(options.term, { country: options.country, locale, limit: 50 });

  const difficulty = estimateDifficulty(results);
  const ratings = topRatingCount(results);

  // Traceability: a difficulty scored without rating volume must say so, not
  // report "0 ratings" as though the incumbents had none.
  const scored = Math.min(10, results.length);
  const method =
    ratings > 0
      ? `top ${scored} of ${results.length} results, ${ratings.toLocaleString("en-US")} ratings`
      : `top ${scored} of ${results.length} results, star ratings only (this store publishes no rating counts in search)`;

  // The apps ranking for this term, in order. Free — these results were fetched
  // to compute difficulty and were previously discarded. Two terms the same
  // apps rank for are the same search whatever the words are, which is the
  // strongest relatedness signal the corpus has. See aso/clustering.ts.
  const topApps = results.slice(0, 10).map((result) => result.storeId);

  await db.keywordCompetition.upsert({
    where: { termId_platform: { termId: options.termId, platform: options.platform } },
    create: {
      termId: options.termId,
      platform: options.platform,
      difficulty,
      resultCount: results.length,
      topRatingCount: ratings,
      topApps,
      method,
    },
    update: {
      difficulty,
      resultCount: results.length,
      topRatingCount: ratings,
      topApps,
      method,
      computedAt: new Date(),
    },
  });

  // A term nobody has bothered to compete for is also worth recording, so the
  // corpus can answer "which high-demand terms have thin result sets".
  await db.keywordSignal.create({
    data: {
      termId: options.termId,
      source: "RESULT_COUNT",
      platform: options.platform,
      value: results.length,
      context: options.country,
    },
  });

  return { term: options.term, difficulty, resultCount: results.length };
}

/**
 * The terms worth scoring next.
 *
 * Ordered by demand index, highest first, because scoring is rate limited and
 * the head of the distribution is what anyone actually researches. Terms
 * already scored on this platform are skipped rather than refreshed — a
 * refresh pass is a different job with a different cadence.
 */
export async function pendingCompetition(options: {
  platform: Platform;
  country: string;
  limit?: number;
  /** Skip terms below this demand index. Zero scores everything. */
  minIndex?: number;
  /**
   * Re-scan terms already scored but missing `topApps`.
   *
   * `topApps` was added after ~13,000 terms had already been scored, so those
   * rows carry a difficulty but no result set — which leaves the strongest
   * clustering signal blank for exactly the head terms people research. This
   * re-reads them.
   *
   * Off by default and deliberately so: a backfill competes for the same rate
   * limit as scoring terms that have no difficulty at all, and a term with a
   * stale number beats a term with none.
   */
  backfillTopApps?: boolean;
  /**
   * Re-score rows whose difficulty was computed without any rating basis.
   *
   * Play publishes no rating counts in search results. Weighting that absence
   * as zero scored every Android term from result count alone — 23,679 rows,
   * all in the 0-10 band, describing nothing about the terms they belonged to.
   *
   * The marker is `method`, not `topRatingCount`. Play still returns no counts
   * after the fix, so a re-scored Android row keeps `topRatingCount: 0` and a
   * selector keyed on that would pick the same rows forever — the same
   * non-terminating loop `backfillTopApps` had to be rescued from. Every
   * re-score writes the "star ratings only" method, so each row is chosen at
   * most once.
   */
  rescoreWithoutBasis?: boolean;
}): Promise<{ id: string; term: string }[]> {
  if (options.rescoreWithoutBasis) {
    const unscored = await db.keywordTerm.findMany({
      where: {
        country: options.country,
        competition: {
          some: {
            platform: options.platform,
            method: { not: { contains: "star ratings only" } },
            topRatingCount: 0,
          },
        },
      },
      take: options.limit ?? 200,
      orderBy: { estimate: { value: "desc" } },
      select: { id: true, term: true },
    });

    if (unscored.length > 0) return unscored;
  }

  if (options.backfillTopApps) {
    const stale = await db.keywordTerm.findMany({
      where: {
        country: options.country,
        competition: {
          some: {
            platform: options.platform,
            topApps: { isEmpty: true },
            // `resultCount > 0` is what makes this terminate.
            //
            // A term the store returns nothing for scores an empty `topApps`
            // legitimately — there are no ranking apps to record. Without this
            // clause such a row still matches "empty", gets re-scored, comes
            // back empty, and is picked again: the backfill loops on those
            // terms forever and never reaches zero. Sixty of them held the
            // first real run open indefinitely.
            resultCount: { gt: 0 },
          },
        },
      },
      take: options.limit ?? 200,
      orderBy: { estimate: { value: "desc" } },
      select: { id: true, term: true },
    });

    if (stale.length > 0) return stale;
  }

  const indexed = await db.keywordTerm.findMany({
    where: {
      country: options.country,
      competition: { none: { platform: options.platform } },
      estimate: { value: { gte: options.minIndex ?? 0 } },
    },
    take: options.limit ?? 200,
    orderBy: { estimate: { value: "desc" } },
    select: { id: true, term: true },
  });

  if (indexed.length > 0 || (options.minIndex ?? 0) > 0) return indexed;

  // Nothing indexed yet, and no floor was asked for.
  //
  // Early in a build the crawl outruns the estimate pass by hours, and
  // requiring an index would leave this lane idle for that entire time while
  // its store sat untouched. Falling back to newly discovered terms keeps the
  // lane working; once estimates exist the branch above takes over and scoring
  // returns to highest-demand-first.
  return db.keywordTerm.findMany({
    where: {
      country: options.country,
      competition: { none: { platform: options.platform } },
    },
    take: options.limit ?? 200,
    orderBy: { firstSeenAt: "asc" },
    select: { id: true, term: true },
  });
}
