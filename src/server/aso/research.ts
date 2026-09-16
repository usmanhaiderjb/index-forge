/**
 * Keyword research over the global corpus.
 *
 * The pure half — everything here is safe to import anywhere, including tests
 * and the client, and none of it touches the database.
 *
 * The corpus holds two very different numbers and the product's whole position
 * rests on not blurring them: a **demand index**, which is inferred from how
 * the stores order their own autocomplete, and a **difficulty**, which is
 * modelled from the apps currently ranking. Neither is measured. Anything in
 * this module that combines them has to stay explainable, because a reader who
 * cannot tell where a number came from has no reason to trust it.
 */

/**
 * How hard the field has to be before it cancels out demand.
 *
 * 130 rather than 100 deliberately: at 100 a maximally contested term scores
 * zero opportunity regardless of how many people search it, which is wrong —
 * a term everyone wants is still worth knowing about. The same divisor is used
 * by `opportunityScore` in `provider.ts` for per-app keywords, so the two
 * screens rank terms the same way.
 */
export const OPPORTUNITY_DIVISOR = 130;

export type ConfidenceLevel = "LOW" | "MEDIUM" | "HIGH";

/**
 * How much a demand index is trusted, by how much evidence stands behind it.
 *
 * This exists because the first version of the research page was useless. The
 * top of every result was a term scoring a perfect 100 — "gk gs masti",
 * "dchb 2027" — obscure names that happened to be the single suggestion the
 * store returned for a rare two-letter prefix. `rankScore` cannot tell that
 * apart from being the first suggestion for "ha", so both score 100.
 *
 * A term seen once is a guess. Discounting it is the difference between a page
 * that opens on the corpus's best finds and one that opens on its noise.
 */
export const CONFIDENCE_WEIGHT: Record<ConfidenceLevel, number> = {
  LOW: 0.5,
  MEDIUM: 0.8,
  HIGH: 1,
};

/**
 * Demand weighed against the field and against the evidence, 0-100.
 *
 * Two discounts, for two different reasons. Difficulty because a term you
 * cannot win is worth less than one you can; confidence because a number
 * derived from a single observation should not outrank one derived from six.
 *
 * An unscored term is treated as averagely contested rather than as free.
 * Ranking unscored terms above scored ones would put the corpus's least
 * examined rows at the top of the page, which is exactly backwards.
 */
/**
 * How many apps have to rank for a term before its score is taken at face
 * value.
 *
 * A term nothing ranks for is not an open goal, it is a dead term — and the
 * difficulty model actively made this worse, because a shallow result set
 * *lowers* difficulty. "dfq th" returned zero apps, scored difficulty 0,
 * read as "easy", and landed near the top of the research page. Ten is where
 * a result set stops looking like a typo and starts looking like a market.
 */
export const MARKET_FLOOR = 10;

/**
 * How much a thin result set discounts a term, 0-1.
 *
 * `null` means the term has never been scored, which is not evidence of an
 * empty market — it returns 1 and lets difficulty stay unknown, the same way
 * the rest of this module treats unmeasured things.
 */
export function marketFactor(resultCount: number | null): number {
  if (resultCount === null) return 1;
  if (resultCount <= 0) return 0;
  return Math.min(1, resultCount / MARKET_FLOOR);
}

export function opportunity(
  index: number | null,
  difficulty: number | null,
  confidence: ConfidenceLevel = "HIGH",
  resultCount: number | null = null,
): number {
  if (index === null) return 0;
  const d = difficulty ?? 50;
  const weighted = index * CONFIDENCE_WEIGHT[confidence] * marketFactor(resultCount);
  return Math.round(Math.max(0, Math.min(100, weighted * (1 - d / OPPORTUNITY_DIVISOR))));
}

export type Verdict = "easy" | "contested" | "hard" | "unknown";

/** Plain-language reading of a difficulty score. */
export function verdict(difficulty: number | null): Verdict {
  if (difficulty === null) return "unknown";
  if (difficulty < 30) return "easy";
  if (difficulty < 60) return "contested";
  return "hard";
}

/**
 * Normalises what someone typed into the search box.
 *
 * Matched against `KeywordTerm.term`, which is stored normalised, so the query
 * has to be normalised the same way or a search for "Habit Tracker" finds
 * nothing at all.
 */
export function normalizeQuery(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Escapes a search string for use inside a SQL `LIKE` pattern.
 *
 * Without this, a user typing `100%` matches every term in the corpus and an
 * underscore silently matches any single character. The query is parameterised
 * either way, so this is about the search doing what the person asked, not
 * about injection.
 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export type SortKey = "opportunity" | "demand" | "difficulty" | "term";

/**
 * What a number is allowed to claim.
 *
 * `ESTIMATED` and `MEASURED` are stored separately in `KeywordVolumeEstimate`
 * precisely so this distinction survives all the way to the screen. Competitors
 * are vague here; a figure that came from a customer's own Search Ads data is
 * a different kind of thing from one inferred out of autocomplete ordering, and
 * the interface should say which it is looking at.
 */
export function describeEstimate(kind: "ESTIMATED" | "MEASURED", method: string): string {
  return kind === "MEASURED"
    ? `Measured — ${method}`
    : `Estimated — ${method}. No store publishes search volume; this is a relative index, not a monthly figure.`;
}
