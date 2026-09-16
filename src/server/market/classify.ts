import "server-only";

import { z } from "zod";

import { aiConfigured, generateStructured } from "@/server/ai/client";
import { db } from "@/server/db";
import type { ThemeKind } from "@/server/market/themes";

/**
 * Turning review text into themes.
 *
 * The one part of the Gap Finder that costs money per unit, so the controls are
 * structural rather than advisory:
 *
 *   - **Once per review, ever.** Keyed by store review id and stamped with
 *     `analyzedAt`. Re-running the job re-reads nothing.
 *   - **Batched.** Twenty-five reviews per call rather than one call each.
 *   - **The bulk model**, which exists for exactly this shape of work.
 *
 * The output is inference and is labelled as such everywhere it surfaces. It
 * has real failure modes: the review sample skews recent and "most helpful",
 * classification drifts between runs, and a theme's absence is not evidence
 * that nobody feels it.
 */

const THEME_KINDS = ["MISSING_FEATURE", "DEFECT", "MONETISATION", "CHURN_REASON"] as const;

const ReviewThemes = z.object({
  results: z.array(
    z.object({
      /** Index into the batch, so a result maps back to its review. */
      index: z.number().int().min(0),
      themes: z.array(
        z.object({
          kind: z.enum(THEME_KINDS),
          /**
           * Deliberately constrained. A label of "the sync sometimes fails on
           * my Pixel when roaming" is unique to one review and can never
           * aggregate with anything, which defeats the entire feature.
           */
          label: z.string().min(3).max(40),
        }),
      ),
    }),
  ),
});

const SYSTEM = `You extract product gaps from app store reviews.

For each review, return the themes it raises. A theme is a specific, reusable
label that could plausibly be raised about a different app in the same category.

Rules:
- Use SHORT canonical labels, 2-5 words, lowercase. "no offline mode", "too many
  ads", "sync fails", "no dark mode". Never quote the review.
- Prefer a label another reviewer would phrase the same way. The whole point is
  that themes from different apps collapse together.
- MISSING_FEATURE: something the user wants that is not there.
- DEFECT: something that exists and does not work.
- MONETISATION: pricing, ads, paywalls.
- CHURN_REASON: an explicit statement of leaving or switching.
- Return an empty themes array for reviews that raise nothing specific —
  "great app", "love it", "bad" carry no signal.
- Never invent a theme the review does not state.`;

const BATCH_SIZE = 25;

export type ClassifyResult = {
  analyzed: number;
  themed: number;
  skipped: number;
};

/**
 * Classify unanalysed reviews for one app.
 *
 * `organizationId` is threaded through for budget accounting only. Market
 * research is background work and must not silently spend a customer's
 * allowance — see docs/GAP-FINDER.md §5.
 */
export async function classifyReviews(options: {
  marketAppId: string;
  organizationId: string;
  limit?: number;
}): Promise<ClassifyResult> {
  if (!aiConfigured()) {
    // Not an error. The rest of the feature — ingest, storage, the page —
    // works without it; themes simply stay empty and the page says so.
    return { analyzed: 0, themed: 0, skipped: 0 };
  }

  const pending = await db.marketReview.findMany({
    where: { marketAppId: options.marketAppId, analyzedAt: null },
    take: options.limit ?? 100,
    orderBy: { submittedAt: "desc" },
    select: { id: true, rating: true, body: true },
  });

  // A review with no text has nothing to classify, but must still be stamped or
  // it is re-selected on every run for ever.
  const empty = pending.filter((r) => !r.body || r.body.trim().length < 12);
  if (empty.length > 0) {
    await db.marketReview.updateMany({
      where: { id: { in: empty.map((r) => r.id) } },
      data: { analyzedAt: new Date() },
    });
  }

  const usable = pending.filter((r) => r.body && r.body.trim().length >= 12);
  let themed = 0;

  for (let start = 0; start < usable.length; start += BATCH_SIZE) {
    const batch = usable.slice(start, start + BATCH_SIZE);

    const prompt = batch
      .map((r, i) => `[${i}] (${r.rating} stars) ${r.body?.slice(0, 600) ?? ""}`)
      .join("\n\n");

    const { data } = await generateStructured({
      organizationId: options.organizationId,
      // Its own feature label, so market-research spend is separable from a
      // customer's own AI usage in `AiUsage` rather than blended into it.
      feature: "market-themes",
      system: SYSTEM,
      prompt,
      schema: ReviewThemes,
      bulk: true,
    });

    const byIndex = new Map(data.results.map((r) => [r.index, r.themes]));

    await db.$transaction(
      batch.map((review, i) => {
        const themes = byIndex.get(i) ?? [];
        if (themes.length > 0) themed++;

        return db.marketReview.update({
          where: { id: review.id },
          data: {
            // Stored as "KIND::label" so aggregation can split them back out
            // without a join table for what is a short, cheap string.
            themes: themes.map((t) => `${t.kind}::${t.label.trim().toLowerCase()}`),
            analyzedAt: new Date(),
          },
        });
      }),
    );
  }

  return { analyzed: usable.length, themed, skipped: empty.length };
}

/** Split a stored `KIND::label` string back into its parts. */
export function parseStoredTheme(value: string): { kind: ThemeKind; label: string } | null {
  const separator = value.indexOf("::");
  if (separator === -1) return null;

  const kind = value.slice(0, separator);
  const label = value.slice(separator + 2).trim();

  if (!THEME_KINDS.includes(kind as (typeof THEME_KINDS)[number]) || label.length === 0) {
    return null;
  }

  return { kind: kind as ThemeKind, label };
}
