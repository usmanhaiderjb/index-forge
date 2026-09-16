/**
 * How fast an app is accumulating ratings — the closest observable proxy for
 * how fast it is being installed.
 *
 * ## Why ratings and not installs
 *
 * **Nobody publishes third-party install counts.** Apple publishes none at all;
 * Google publishes a bucket like "1,000,000+" that moves once per order of
 * magnitude. Any tool showing you "this app got 40,000 installs last month" has
 * modelled that number.
 *
 * Rating count is a monotonically increasing counter both stores publish for
 * every app. Its rate of change is the best available stand-in, and it lies in
 * three known ways:
 *
 *   - **Ratings-per-install varies enormously** by category and by how
 *     aggressively an app prompts. A game that asks after every level and a
 *     banking app that never asks look nothing alike at identical install
 *     volumes.
 *   - **An iOS rating reset** zeroes the counter, which reads as collapse.
 *   - **It lags**, because people rate after using.
 *
 * So it compares an app to itself over time, and ranks apps within a category.
 * It is never an install count and this module never returns one.
 *
 * ## Two ways to measure it
 *
 * `lifetimeVelocity` needs **one** observation: ratings divided by days since
 * release. Available the first time an app is seen, which is what makes a
 * "new and growing" view shippable on day one.
 *
 * `recentVelocity` needs **two** and measures actual current momentum.
 *
 * They answer different questions and the difference matters: an app that
 * exploded at launch and died produces an excellent lifetime figure and a flat
 * recent one. Anything displaying these must say which it is showing.
 */

export type VelocityBasis = "LIFETIME" | "RECENT";

export type Velocity = {
  ratingsPerDay: number;
  basis: VelocityBasis;
  /** Days the figure is averaged over. Short windows are noisy. */
  days: number;
};

const DAY_MS = 86_400_000;

/** Whole days between two instants, floored at 1 so nothing divides by zero. */
export function daysBetween(from: Date, to: Date): number {
  return Math.max(1, Math.floor((to.getTime() - from.getTime()) / DAY_MS));
}

/**
 * Ratings per day averaged over the app's whole life.
 *
 * Requires only a release date and a rating count, so it works on first sight.
 * It is an average, not a trend: a spike two years ago and steady growth today
 * can produce the same number.
 */
export function lifetimeVelocity(options: {
  ratingCount: number | null;
  releasedAt: Date | null;
  now?: Date;
}): Velocity | null {
  if (options.ratingCount === null || options.releasedAt === null) return null;
  if (options.ratingCount < 0) return null;

  const now = options.now ?? new Date();
  // A release date in the future is bad store data, not a zero-day-old app.
  if (options.releasedAt.getTime() > now.getTime()) return null;

  const days = daysBetween(options.releasedAt, now);

  return {
    ratingsPerDay: Number((options.ratingCount / days).toFixed(2)),
    basis: "LIFETIME",
    days,
  };
}

/**
 * Ratings per day between two observations — real current momentum.
 *
 * A negative delta is returned as null rather than as negative velocity. Rating
 * counts only go up, so a fall means the counter was reset (iOS allows this on
 * a new version) or the store corrected itself. Reporting "-4,000 ratings per
 * day" would be arithmetic applied to something that did not happen.
 */
export const MIN_VELOCITY_WINDOW_MS = DAY_MS;

export function recentVelocity(
  earlier: { ratingCount: number | null; capturedAt: Date },
  later: { ratingCount: number | null; capturedAt: Date },
): Velocity | null {
  if (earlier.ratingCount === null || later.ratingCount === null) return null;

  // Two readings taken minutes apart cannot produce a daily rate. Play rounds
  // rating counts to three significant figures, so an app gaining thousands a
  // day still shows an unchanged count twenty minutes later. Dividing that
  // zero by a day-floored window printed "0 ratings/day" for apps that were
  // growing fast — a measurement failure dressed as a measurement.
  if (later.capturedAt.getTime() - earlier.capturedAt.getTime() < MIN_VELOCITY_WINDOW_MS) {
    return null;
  }

  const delta = later.ratingCount - earlier.ratingCount;
  if (delta < 0) return null;

  const days = daysBetween(earlier.capturedAt, later.capturedAt);

  return {
    ratingsPerDay: Number((delta / days).toFixed(2)),
    basis: "RECENT",
    days,
  };
}

/** Released within the window. The "new" half of "new and growing". */
export function isNew(releasedAt: Date | null, withinDays = 180, now = new Date()): boolean {
  if (!releasedAt) return false;
  if (releasedAt.getTime() > now.getTime()) return false;
  return daysBetween(releasedAt, now) <= withinDays;
}

/**
 * How much to trust a velocity figure.
 *
 * Short windows and tiny counts both produce large, meaningless numbers — an
 * app three days old with 30 ratings computes to 10/day, which says nothing.
 * A figure that cannot be trusted must not outrank one that can, so this is
 * applied to the ranking rather than printed as a footnote.
 */
export function velocityConfidence(velocity: Velocity, ratingCount: number): "LOW" | "MEDIUM" | "HIGH" {
  if (velocity.days < 7 || ratingCount < 50) return "LOW";
  if (velocity.days < 30 || ratingCount < 500) return "MEDIUM";
  return "HIGH";
}

const CONFIDENCE_WEIGHT = { LOW: 0.3, MEDIUM: 0.7, HIGH: 1 } as const;

/**
 * The ranking score for a "rising apps" list.
 *
 * Velocity discounted by confidence, then by age — a young app growing fast is
 * a more interesting finding than an old app growing fast, which is just a big
 * app. The age term decays rather than cuts off, so nothing vanishes the day it
 * turns six months old.
 */
export function risingScore(options: {
  velocity: Velocity;
  ratingCount: number;
  ageDays: number;
}): number {
  const confidence = CONFIDENCE_WEIGHT[velocityConfidence(options.velocity, options.ratingCount)];
  // 1.0 at launch, 0.5 at a year, approaching 0 thereafter.
  const youth = 365 / (365 + Math.max(0, options.ageDays));

  return Number((options.velocity.ratingsPerDay * confidence * youth).toFixed(2));
}

/** The sentence shown beside the number, so a reader knows what it is. */
export function describeVelocity(velocity: Velocity): string {
  return velocity.basis === "RECENT"
    ? `${velocity.ratingsPerDay.toLocaleString("en-US")} ratings/day over the last ${velocity.days} days`
    : `${velocity.ratingsPerDay.toLocaleString("en-US")} ratings/day averaged since release ${velocity.days} days ago`;
}

/**
 * Chart movement between two readings.
 *
 * **This exists because Play does not publish a usable release date.**
 *
 * The obvious way to find new apps is to filter by launch date, and the store
 * appears to offer one. It does not: there is no "Released on" field, and the
 * earliest plausible timestamp on a listing page was tested against apps with
 * known launch dates and was wrong by up to six years — ChatGPT, which reached
 * Play in 2023, resolves to 2017. A release date guessed that way would both
 * hide genuinely new apps and age others incorrectly, which is worse than not
 * having the field.
 *
 * Chart position is published, unambiguous, and arguably the better signal
 * anyway: an app that has just broken into the top twenty of its category is
 * rising *now*, whether it shipped last month or three years ago. Launch date
 * describes when something was made; chart entry describes when it started
 * working.
 *
 * Positive means climbing — rank 18 to rank 6 is +12.
 */
export function chartMovement(
  earlier: { chartRank: number | null },
  later: { chartRank: number | null },
): number | null {
  if (earlier.chartRank === null || later.chartRank === null) return null;
  return earlier.chartRank - later.chartRank;
}

/**
 * How long we have been watching an app, in days.
 *
 * Stands in for age. It measures our observation, not the app, and the two
 * differ — an app first seen today may be years old. It is honest precisely
 * because it claims only what it is: the first time this app appeared in a
 * chart we swept.
 */
export function daysTracked(firstSeenAt: Date, now = new Date()): number {
  return daysBetween(firstSeenAt, now);
}

/**
 * Ranking score for a chart-based rising list.
 *
 * Climb is the primary term because it is the directly observed event. Rating
 * velocity contributes when it exists, and a high chart position is worth a
 * little on its own — reaching the top ten of a category is a fact about the
 * app even on a first sighting.
 */
export function chartRisingScore(options: {
  climb: number | null;
  ratingsPerDay: number | null;
  chartRank: number | null;
}): number {
  const climb = Math.max(0, options.climb ?? 0);
  const velocity = Math.max(0, options.ratingsPerDay ?? 0);
  // Rank 1 is worth 1.0, rank 20 about 0.05, absent nothing.
  const standing = options.chartRank ? 1 / options.chartRank : 0;

  return Number((climb * 10 + Math.log10(1 + velocity) * 5 + standing * 20).toFixed(2));
}
