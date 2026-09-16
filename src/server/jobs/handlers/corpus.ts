import "server-only";

import type { Platform } from "@prisma/client";

import { crawlPrefix, recomputeEstimates } from "@/server/aso/corpus";

/**
 * One prefix per job.
 *
 * Deliberately not a loop over the whole alphabet inside a single job: 676
 * two-letter prefixes in one job means one failure loses the lot, and nothing
 * bounds how fast the store gets hit. One job per prefix lets the worker's own
 * concurrency limit do the rate limiting, and lets a single prefix fail and
 * retry on its own.
 */
export async function handleCorpusCrawl(
  prefix: string,
  platform: Platform,
  country: string,
): Promise<void> {
  const result = await crawlPrefix(prefix, { platform, country });
  console.log(
    `[corpus] ${platform} ${country} "${prefix}" — ${result.suggested} suggested, ` +
      `${result.created} new, ${result.updated} seen again`,
  );
}

export async function handleCorpusEstimate(): Promise<void> {
  const written = await recomputeEstimates();
  console.log(`[corpus] recomputed ${written} estimates`);
}
