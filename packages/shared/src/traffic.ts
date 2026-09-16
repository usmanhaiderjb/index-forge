/**
 * Store traffic sources.
 *
 * Where an install came from *inside the store* — did someone search for a term
 * and find the app, or stumble on it while browsing a category? This is the most
 * actionable split in ASO, because the two failure modes have different fixes:
 *
 *   low search impressions   not ranking      title, subtitle, keyword field
 *   low search conversion    ranking, not convincing   screenshots, first impression
 *   low browse conversion    wrong shelf      icon, category, positioning
 *
 * A single blended conversion rate cannot distinguish those, so it cannot tell
 * anyone what to change.
 *
 * ## This is not the same as paid vs organic
 *
 * `PAID_INSTALLS` comes from the ad networks' own reporting, and is attributed
 * on their terms and their windows. What is here is what the *store* says about
 * its own traffic. The two overlap, disagree, and must never be added together.
 * Nothing in this module derives paid or organic installs; see
 * `src/server/metrics/derive.ts` for that, which reads only app-wide rows.
 */

export const TRAFFIC_SOURCES = ["search", "browse", "referral", "other"] as const;

export type TrafficSource = (typeof TRAFFIC_SOURCES)[number];

export const TRAFFIC_SOURCE_META: Record<
  TrafficSource,
  { label: string; description: string }
> = {
  search: {
    label: "Search",
    description: "Someone searched the store and found this app.",
  },
  browse: {
    label: "Browse",
    description: "Category listings, charts, and editorial placement.",
  },
  referral: {
    label: "Referral",
    description: "Links from websites, other apps and campaigns.",
  },
  other: {
    label: "Other",
    description: "Traffic the store did not attribute to a source.",
  },
};

/** The dimension key these rows are filed under. */
export const TRAFFIC_DIMENSION_KEY = "source";

/** `source=search`, matching the `key=value|key=value` dimension format. */
export function trafficDimension(source: TrafficSource): string {
  return `${TRAFFIC_DIMENSION_KEY}=${source}`;
}

export function isTrafficSource(value: string): value is TrafficSource {
  return (TRAFFIC_SOURCES as readonly string[]).includes(value);
}

/**
 * Map a provider's own wording onto the four buckets.
 *
 * Both stores describe the same two ideas in their own vocabulary and change the
 * exact strings from time to time, so this matches on substrings rather than on
 * an exact table. Anything unrecognised becomes `other` rather than being
 * dropped — a bucket that does not add up is worse than one labelled "Other",
 * because a reader can see the second and cannot see the first.
 *
 * Apple  — App Store Search, App Store Browse, App Referrer, Web Referrer,
 *          Institutional Purchase, Unavailable
 * Google — Play Store search, Play Store browse / explore, Third-party
 *          referrers, Google Ads, Other
 */
export function normalizeTrafficSource(raw: string): TrafficSource {
  const value = raw.trim().toLowerCase();
  if (!value) return "other";

  if (value.includes("search")) return "search";

  // "explore" is Google's word for the same surface Apple calls "browse".
  if (value.includes("browse") || value.includes("explore") || value.includes("chart")) {
    return "browse";
  }

  // Ad networks arrive here as referrers. They are counted as store-reported
  // traffic only — PAID_INSTALLS is a separate metric from a separate source.
  if (
    value.includes("referr") ||
    value.includes("referral") ||
    value.includes("campaign") ||
    value.includes("ads")
  ) {
    return "referral";
  }

  return "other";
}

/**
 * A conversion rate, or null when it cannot be computed.
 *
 * Returns null rather than 0 for a zero denominator. Zero page views means the
 * rate is unknown, not that it is zero percent, and a chart that draws 0% for an
 * unknown reads as a catastrophe rather than as missing data.
 */
export function conversionRate(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 10000) / 100;
}
