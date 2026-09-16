/**
 * Turning reviews into market gaps.
 *
 * The rule that makes this a research tool rather than a complaint feed:
 *
 * > **Count apps, not mentions.**
 *
 * A theme raised fifty times about one app is that app's problem, and it will
 * dominate any ranking by mention count — the loudest app wins, which is the
 * opposite of the finding. The same theme raised ten times across five apps is
 * the category's problem, and that is what someone deciding what to build needs
 * to see.
 *
 * Pure and network-free. The LLM classification that produces the per-review
 * themes lives in `classify.ts`; everything here is arithmetic over its output,
 * which keeps the part that decides what gets shown fully testable.
 */

export type ThemeKind = "MISSING_FEATURE" | "DEFECT" | "MONETISATION" | "CHURN_REASON";

/** One classified review, reduced to what aggregation needs. */
export type ClassifiedReview = {
  reviewId: string;
  /** Which app it was written about. The unit that matters. */
  marketAppId: string;
  rating: number;
  themes: { kind: ThemeKind; label: string }[];
};

export type AggregatedTheme = {
  kind: ThemeKind;
  label: string;
  /** Distinct apps in the niche whose reviewers raise this. */
  appCount: number;
  mentionCount: number;
  /** Mean rating of the reviews it came from. Low means people left over it. */
  meanRating: number;
  /** Review ids backing it, capped for storage. */
  evidenceIds: string[];
  /** How much weight to give it. See `themeWeight`. */
  weight: number;
};

/**
 * Themes normalise to a comparable key.
 *
 * "No offline mode", "no offline mode" and "No Offline Mode" are one finding.
 * Without this the same gap splits into three rows, each below the threshold,
 * and the strongest signal in the niche disappears entirely.
 */
export function themeKey(kind: ThemeKind, label: string): string {
  return `${kind}::${label.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

/**
 * How much a theme counts, given who raised it and how unhappy they were.
 *
 * Two multipliers, both deliberate:
 *
 * **Breadth.** Squared, so five apps counts for far more than twice what two
 * apps does. This is the whole thesis of the module — a gap is defined by being
 * shared, and a linear weight lets one app's mention pile beat a genuine
 * category pattern.
 *
 * **Dissatisfaction.** The same words inside a five-star review are a wish;
 * inside a one-star review they are why someone left. A theme drawn from
 * one-star reviews should outrank one drawn from four-star reviews even at
 * equal breadth.
 */
export function themeWeight(appCount: number, meanRating: number): number {
  const breadth = appCount ** 2;
  // 1.0 at one star, 0.2 at five. Never zero: a wish is still a signal.
  const dissatisfaction = Math.max(0.2, (6 - meanRating) / 5);
  return Number((breadth * dissatisfaction).toFixed(3));
}

/**
 * Aggregate classified reviews into niche-level themes.
 *
 * `minApps` is the line between an anecdote and a finding. Two is the lowest
 * defensible value — one app is by definition not a market pattern — and it is
 * a parameter because a niche with three apps in it and a niche with fifty need
 * different bars.
 */
export function aggregateThemes(
  reviews: ClassifiedReview[],
  options: { minApps?: number; maxEvidence?: number } = {},
): AggregatedTheme[] {
  const minApps = options.minApps ?? 2;
  const maxEvidence = options.maxEvidence ?? 8;

  type Bucket = {
    kind: ThemeKind;
    label: string;
    apps: Set<string>;
    mentions: number;
    ratingTotal: number;
    evidence: { reviewId: string; rating: number }[];
  };

  const buckets = new Map<string, Bucket>();

  for (const review of reviews) {
    // One review mentioning the same theme twice is still one mention, or a
    // rambling reviewer outweighs a whole app's users.
    const seen = new Set<string>();

    for (const theme of review.themes) {
      const key = themeKey(theme.kind, theme.label);
      if (seen.has(key)) continue;
      seen.add(key);

      const bucket = buckets.get(key) ?? {
        kind: theme.kind,
        label: theme.label.trim(),
        apps: new Set<string>(),
        mentions: 0,
        ratingTotal: 0,
        evidence: [],
      };

      bucket.apps.add(review.marketAppId);
      bucket.mentions += 1;
      bucket.ratingTotal += review.rating;
      bucket.evidence.push({ reviewId: review.reviewId, rating: review.rating });

      buckets.set(key, bucket);
    }
  }

  const out: AggregatedTheme[] = [];

  for (const bucket of buckets.values()) {
    if (bucket.apps.size < minApps) continue;

    const meanRating = bucket.ratingTotal / bucket.mentions;

    out.push({
      kind: bucket.kind,
      label: bucket.label,
      appCount: bucket.apps.size,
      mentionCount: bucket.mentions,
      meanRating: Number(meanRating.toFixed(2)),
      // Angriest first: the most useful excerpt to read is the one from
      // someone who left over it.
      evidenceIds: bucket.evidence
        .sort((a, b) => a.rating - b.rating)
        .slice(0, maxEvidence)
        .map((e) => e.reviewId),
      weight: themeWeight(bucket.apps.size, meanRating),
    });
  }

  return out.sort((a, b) => b.weight - a.weight || b.appCount - a.appCount);
}

/**
 * What a niche's themes say, in one line.
 *
 * Every number in this product carries its provenance, and a theme is inferred
 * from review text by a language model — so the sentence says how many reviews
 * and how many apps, and the interface says it is inference.
 */
export function describeTheme(theme: AggregatedTheme, appsInNiche: number): string {
  return (
    `${theme.mentionCount} review${theme.mentionCount === 1 ? "" : "s"} ` +
    `across ${theme.appCount} of ${appsInNiche} apps, ` +
    `averaging ${theme.meanRating.toFixed(1)} stars`
  );
}
