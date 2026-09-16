import { MetricKey, MetricSource } from "@prisma/client";

/**
 * Ad networks report separate campaigns on separate inventory. Their figures
 * are additive, never duplicates of each other.
 */
const AD_NETWORKS: MetricSource[] = [MetricSource.GOOGLE_ADS, MetricSource.APPLE_SEARCH_ADS];

/**
 * Which provider owns each metric, as ranked tiers.
 *
 * Two different problems live here, and conflating them produces wrong numbers
 * in opposite directions:
 *
 * 1. Several providers report the *same* measure. Google Analytics for Firebase
 *    reports ad revenue that AdMob also reports. Those are one pot of money
 *    described twice, so summing them roughly doubles it. Ranked tiers solve
 *    this: the first tier with any data wins, the rest are dropped.
 *
 * 2. Several providers report *different instances* of the same measure. Google
 *    Ads and Apple Search Ads both report spend, but it is different money on
 *    different networks. Dropping one would understate the total — the mirror
 *    image of the double count. Sources inside a single tier are additive.
 *
 * Ordering within the exclusive case is "closest to the money wins": the system
 * that processes the transaction beats an analytics SDK observing it.
 */
export const SOURCE_PRECEDENCE: Partial<Record<MetricKey, MetricSource[][]>> = {
  // AdMob bills the ads; Firebase only observes the events.
  AD_REVENUE: [[MetricSource.ADMOB], [MetricSource.FIREBASE]],
  AD_IMPRESSIONS: [[MetricSource.ADMOB], [MetricSource.FIREBASE]],
  AD_CLICKS: [[MetricSource.ADMOB]],
  AD_ECPM: [[MetricSource.ADMOB]],
  AD_FILL_RATE: [[MetricSource.ADMOB]],

  // The store processes the purchase; Firebase infers it from client events.
  IAP_REVENUE: [
    [MetricSource.APP_STORE_CONNECT],
    [MetricSource.PLAY_CONSOLE],
    [MetricSource.FIREBASE],
  ],
  TOTAL_REVENUE: [[MetricSource.FIREBASE], [MetricSource.DERIVED]],

  // The store console counts installs; Firebase counts first opens, which is
  // a different thing that happens to look similar.
  INSTALLS: [
    [MetricSource.PLAY_CONSOLE],
    [MetricSource.APP_STORE_CONNECT],
    [MetricSource.FIREBASE],
  ],
  UNINSTALLS: [[MetricSource.PLAY_CONSOLE]],
  STORE_PAGE_VIEWS: [[MetricSource.PLAY_CONSOLE], [MetricSource.APP_STORE_CONNECT]],
  CONVERSION_RATE: [[MetricSource.PLAY_CONSOLE], [MetricSource.APP_STORE_CONNECT]],

  // Only Firebase reports engagement, but listing it keeps the rule uniform.
  ACTIVE_USERS_DAILY: [[MetricSource.FIREBASE]],
  ACTIVE_USERS_MONTHLY: [[MetricSource.FIREBASE]],
  SESSIONS: [[MetricSource.FIREBASE]],
  SESSION_DURATION_AVG: [[MetricSource.FIREBASE]],
  CRASH_FREE_USERS: [[MetricSource.PLAY_CONSOLE], [MetricSource.FIREBASE]],

  // Ratings come from the console when connected, otherwise from scraping.
  RATING_AVERAGE: [
    [MetricSource.PLAY_CONSOLE],
    [MetricSource.APP_STORE_CONNECT],
    [MetricSource.ASO_SCRAPER],
  ],
  RATING_COUNT: [
    [MetricSource.PLAY_CONSOLE],
    [MetricSource.APP_STORE_CONNECT],
    [MetricSource.ASO_SCRAPER],
  ],

  // Ad networks are additive: an app running both Google Ads and Apple Search
  // Ads spends on both, and reporting only the larger would understate it.
  SPEND: [AD_NETWORKS],
  PAID_INSTALLS: [AD_NETWORKS],
  PAID_CLICKS: [AD_NETWORKS],
  // No store reports organic installs; it only ever exists as a derivation.
  ORGANIC_INSTALLS: [[MetricSource.DERIVED]],
  // Averages, not totals. Summing a per-network CPI across networks would give
  // a number that is not a cost per anything, so aggregation of these is
  // handled as a weighted average at the query layer.
  CPI: [AD_NETWORKS],
  CPC: [AD_NETWORKS],
  ROAS: [AD_NETWORKS],
  // Campaign impressions add across networks; store-listing impressions are a
  // different measure entirely and only used when no ad network is connected.
  IMPRESSIONS: [AD_NETWORKS, [MetricSource.PLAY_CONSOLE]],

  RETENTION_D1: [[MetricSource.FIREBASE]],
  RETENTION_D7: [[MetricSource.FIREBASE]],
  RETENTION_D30: [[MetricSource.FIREBASE]],
  ARPDAU: [[MetricSource.FIREBASE], [MetricSource.DERIVED]],
  REVIEW_COUNT: [
    [MetricSource.PLAY_CONSOLE],
    [MetricSource.APP_STORE_CONNECT],
    [MetricSource.ASO_SCRAPER],
  ],
};

/**
 * The authoritative sources for a metric, given what is actually available.
 *
 * Returns the first tier that has any data — possibly several sources, when
 * they are additive rather than duplicates. Returns null when nothing is
 * available, or when the metric has no declared precedence; in the latter case
 * the caller keeps every source, since silently dropping data is worse than a
 * possible double count that at least stays visible.
 */
export function chooseSources(
  metric: MetricKey,
  available: Iterable<MetricSource>,
): MetricSource[] | null {
  const present = new Set(available);
  if (present.size === 0) return null;

  const tiers = SOURCE_PRECEDENCE[metric];
  if (!tiers) return null;

  for (const tier of tiers) {
    const hits = tier.filter((source) => present.has(source));
    if (hits.length > 0) return hits;
  }

  return null;
}

/**
 * Single winning source, for callers that only need to name one — the source
 * label in the UI, for instance. Null when a tier is additive and more than one
 * source contributed, because naming just one of them would be a lie.
 */
export function chooseSource(
  metric: MetricKey,
  available: Iterable<MetricSource>,
): MetricSource | null {
  const chosen = chooseSources(metric, available);
  return chosen?.length === 1 ? chosen[0]! : null;
}

type SourcedRow = { appId?: string; metric: MetricKey; source: MetricSource };

/**
 * Drops rows from every source except the winning tier, per app and metric.
 *
 * The choice is made once across the whole window rather than per day. Picking
 * per day would fill gaps, but it would also switch sources mid-series — and
 * because two providers measure subtly different things, that draws a step
 * change into the chart that never happened.
 */
export function preferAuthoritativeSource<T extends SourcedRow>(rows: T[]): T[] {
  // Which sources actually carry data, per app and metric.
  const available = new Map<string, Set<MetricSource>>();

  for (const row of rows) {
    const key = `${row.appId ?? ""}:${row.metric}`;
    const set = available.get(key) ?? new Set<MetricSource>();
    set.add(row.source);
    available.set(key, set);
  }

  const winner = new Map<string, Set<MetricSource> | null>();
  for (const [key, sources] of available) {
    const metric = key.slice(key.indexOf(":") + 1) as MetricKey;
    // A single source cannot double count, so no rule is needed.
    if (sources.size === 1) {
      winner.set(key, sources);
      continue;
    }
    const chosen = chooseSources(metric, sources);
    winner.set(key, chosen ? new Set(chosen) : null);
  }

  return rows.filter((row) => {
    const key = `${row.appId ?? ""}:${row.metric}`;
    const chosen = winner.get(key);
    // No declared precedence for a contested metric: keep everything rather
    // than guess which provider to believe.
    return chosen == null ? true : chosen.has(row.source);
  });
}

/** Human explanation for the UI, so a number's provenance is inspectable. */
export function describeSource(source: MetricSource): string {
  switch (source) {
    case MetricSource.FIREBASE:
      return "Firebase / GA4";
    case MetricSource.ADMOB:
      return "AdMob";
    case MetricSource.GOOGLE_ADS:
      return "Google Ads";
    case MetricSource.PLAY_CONSOLE:
      return "Play Console";
    case MetricSource.APP_STORE_CONNECT:
      return "App Store Connect";
    case MetricSource.APPLE_SEARCH_ADS:
      return "Apple Search Ads";
    case MetricSource.ASO_SCRAPER:
      return "Store listing";
    case MetricSource.DERIVED:
      return "Derived";
  }
}
