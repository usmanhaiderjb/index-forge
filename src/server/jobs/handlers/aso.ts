import "server-only";

import type { ChartType } from "@prisma/client";

import { todayUtc, toUtcDate } from "@aso/shared";
import { contentHash } from "@/server/crypto";
import { db } from "@/server/db";
import { getAsoProvider, opportunityScore } from "@/server/aso/provider";
import type { AsoSearchResult } from "@/server/aso/types";
import { enqueue } from "@/server/jobs/queues";
import { withSyncRun } from "@/server/jobs/run";

/**
 * Every storefront an app is tracked in.
 *
 * Apps created before multi-locale tracking have no AppLocale rows, so the
 * app's own country/locale is materialised as the primary storefront on first
 * use rather than being special-cased at every call site.
 */
export async function appStorefronts(appId: string) {
  const existing = await db.appLocale.findMany({
    where: { appId, isActive: true },
    orderBy: [{ isPrimary: "desc" }, { country: "asc" }],
  });
  if (existing.length > 0) return existing;

  const app = await db.app.findUniqueOrThrow({ where: { id: appId } });
  const primary = await db.appLocale.upsert({
    where: {
      appId_country_locale: { appId, country: app.country, locale: app.locale },
    },
    create: { appId, country: app.country, locale: app.locale, isPrimary: true },
    update: { isPrimary: true, isActive: true },
  });

  return [primary];
}

/**
 * Captures a store listing snapshot per tracked storefront. Writes a new row
 * only when that storefront's text actually changed, so the listing history is
 * a change log rather than a daily duplicate — that is what makes it joinable
 * against rank movement.
 */
export async function syncListing(appId: string) {
  const app = await db.app.findUniqueOrThrow({ where: { id: appId } });
  const provider = await getAsoProvider();
  const storefronts = await appStorefronts(appId);

  return withSyncRun({ job: "aso.listing", appId, meta: { storefronts: storefronts.length } }, async (record) => {
    const failures: string[] = [];
    let primaryDetail: Awaited<ReturnType<typeof provider.getApp>> = null;

    for (const storefront of storefronts) {
      let detail: Awaited<ReturnType<typeof provider.getApp>>;

      try {
        detail = await provider.getApp(app.platform, app.storeId, {
          country: storefront.country,
          locale: storefront.locale,
        });
      } catch (error) {
        // One unavailable storefront must not abort the rest — an app is
        // routinely absent from some countries.
        failures.push(
          `${storefront.country}: ${error instanceof Error ? error.message : "failed"}`,
        );
        continue;
      }

      if (!detail) {
        failures.push(`${storefront.country}: not available in this storefront`);
        continue;
      }

      record.read(1);
      if (storefront.isPrimary) primaryDetail = detail;

      const hash = contentHash([
        detail.title,
        detail.subtitle,
        detail.shortDescription,
        detail.description,
        detail.whatsNew,
        detail.version,
        String(detail.screenshotCount ?? 0),
      ]);

      const latest = await db.storeListing.findFirst({
        where: { appId, locale: storefront.locale, country: storefront.country },
        orderBy: { capturedAt: "desc" },
      });

      if (latest?.contentHash !== hash) {
        await db.storeListing.create({
          data: {
            appId,
            locale: storefront.locale,
            country: storefront.country,
            title: detail.title,
            subtitle: detail.subtitle,
            shortDescription: detail.shortDescription,
            fullDescription: detail.description,
            whatsNew: detail.whatsNew,
            promotionalText: detail.promotionalText,
            version: detail.version,
            screenshotCount: detail.screenshotCount,
            screenshotUrls: detail.screenshotUrls ?? [],
            hasVideo: detail.hasVideo ?? false,
            iconUrl: detail.iconUrl,
            ratingAverage: detail.ratingAverage,
            ratingCount: detail.ratingCount,
            price: detail.price,
            contentRating: detail.contentRating,
            contentHash: hash,
          },
        });
        record.wrote(1);
      }
    }

    // Identity and headline numbers follow the primary storefront — the app's
    // name should not flip to whatever the last synced country happened to say.
    if (primaryDetail) {
      await db.app.update({
        where: { id: appId },
        data: {
          name: primaryDetail.name || app.name,
          developer: primaryDetail.developer ?? app.developer,
          iconUrl: primaryDetail.iconUrl ?? app.iconUrl,
          currentVersion: primaryDetail.version ?? app.currentVersion,
          category: primaryDetail.category ?? app.category,
        },
      });

      const today = todayUtc();
      if (primaryDetail.ratingAverage) {
        await upsertScrapedMetric(appId, today, "RATING_AVERAGE", primaryDetail.ratingAverage);
      }
      if (primaryDetail.ratingCount) {
        await upsertScrapedMetric(appId, today, "RATING_COUNT", primaryDetail.ratingCount);
      }
    }

    // Only a total failure is an error; a partial sync is recorded as PARTIAL
    // by the run wrapper.
    if (failures.length === storefronts.length) {
      throw new Error(failures.join(" | "));
    }
  });
}

async function upsertScrapedMetric(
  appId: string,
  date: Date,
  metric: "RATING_AVERAGE" | "RATING_COUNT",
  value: number,
) {
  await db.metricPoint.upsert({
    where: {
      appId_date_source_metric_dimension: {
        appId,
        date,
        source: "ASO_SCRAPER",
        metric,
        dimension: "",
      },
    },
    create: { appId, date, source: "ASO_SCRAPER", metric, dimension: "", value },
    update: { value },
  });
}

/**
 * How far down the result page rank scans look. Stored on every rank row, so
 * changing this number does not retroactively change what an old null meant.
 */
export const SCAN_DEPTH = 100;

/**
 * Daily rank check for every tracked keyword. Records a null rank when the app
 * is outside the scanned window — an absent row and "not ranking" are different
 * facts, and the chart needs to tell them apart.
 */
export async function syncRanks(appId: string) {
  const app = await db.app.findUniqueOrThrow({ where: { id: appId } });
  const provider = await getAsoProvider();
  const today = todayUtc();

  return withSyncRun({ job: "aso.ranks", appId }, async (record) => {
    const keywords = await db.keyword.findMany({ where: { appId, isTracked: true } });
    record.read(keywords.length);

    // Tracked competitors, indexed by the id the search results are keyed on.
    // Loaded once rather than per keyword — the same handful of competitors
    // applies to every term.
    const competitors = await db.competitor.findMany({
      where: { appId, platform: app.platform, isTracked: true },
    });
    const competitorsByCountry = new Map<string, Map<string, (typeof competitors)[number]>>();
    for (const competitor of competitors) {
      const byStoreId =
        competitorsByCountry.get(competitor.country) ??
        competitorsByCountry
          .set(competitor.country, new Map())
          .get(competitor.country)!;
      byStoreId.set(competitor.storeId, competitor);
    }

    let written = 0;

    for (const keyword of keywords) {
      const results = await provider.search(app.platform, keyword.term, {
        country: keyword.country,
        locale: keyword.locale,
        limit: SCAN_DEPTH,
      });

      const position = results.find((r) => r.storeId === app.storeId)?.position ?? null;

      const previous = await db.keywordRank.findFirst({
        where: { keywordId: keyword.id, date: { lt: today } },
        orderBy: { date: "desc" },
      });

      await db.keywordRank.upsert({
        where: { keywordId_date: { keywordId: keyword.id, date: today } },
        create: {
          keywordId: keyword.id,
          date: today,
          rank: position,
          prevRank: previous?.rank ?? null,
          scanDepth: SCAN_DEPTH,
        },
        update: { rank: position, prevRank: previous?.rank ?? null, scanDepth: SCAN_DEPTH },
      });

      // The same result page tells us where every tracked competitor landed.
      // Reading it here costs nothing; re-scanning later would cost a request
      // per competitor per keyword and would not even be the same SERP.
      await recordCompetitorRanks({
        keyword,
        results,
        today,
        // Competitors are stored per country, so only the ones for this
        // keyword's storefront are comparable to this result page.
        rivals: competitorsByCountry.get(keyword.country) ?? new Map(),
      });

      // Market-side stats refresh weekly; they move far slower than rank.
      const lastMetric = await db.keywordMetric.findFirst({
        where: { keywordId: keyword.id },
        orderBy: { date: "desc" },
      });
      const stale =
        !lastMetric || Date.now() - lastMetric.date.getTime() > 7 * 86_400_000;

      if (stale && provider.keywordStats) {
        const [stats] = await provider.keywordStats(app.platform, [keyword.term], {
          country: keyword.country,
          locale: keyword.locale,
        });
        if (stats) {
          await db.keywordMetric.upsert({
            where: { keywordId_date: { keywordId: keyword.id, date: today } },
            create: {
              keywordId: keyword.id,
              date: today,
              popularity: stats.popularity,
              difficulty: stats.difficulty,
              resultCount: stats.resultCount,
              opportunity: opportunityScore(stats.popularity, stats.difficulty),
            },
            update: {
              popularity: stats.popularity,
              difficulty: stats.difficulty,
              resultCount: stats.resultCount,
              opportunity: opportunityScore(stats.popularity, stats.difficulty),
            },
          });
        }
      }

      written++;
    }

    record.wrote(written);
  });
}

/**
 * Persists where each tracked competitor placed on one keyword's result page.
 *
 * A competitor that does not appear gets an explicit null rather than no row:
 * "they dropped out of the top 100 today" is a finding, and skipping the write
 * would make it indistinguishable from a scan that never ran.
 */
async function recordCompetitorRanks({
  keyword,
  results,
  today,
  rivals,
}: {
  keyword: { id: string };
  results: AsoSearchResult[];
  today: Date;
  rivals: Map<string, { id: string }>;
}): Promise<number> {
  if (rivals.size === 0) return 0;

  const positionByStoreId = new Map(results.map((r) => [r.storeId, r.position]));

  const previous = await db.keywordCompetitorRank.findMany({
    where: {
      keywordId: keyword.id,
      competitorId: { in: [...rivals.values()].map((c) => c.id) },
      date: { lt: today },
    },
    orderBy: { date: "desc" },
    distinct: ["competitorId"],
  });
  const prevByCompetitor = new Map(previous.map((row) => [row.competitorId, row.rank]));

  let written = 0;

  for (const [storeId, competitor] of rivals) {
    const rank = positionByStoreId.get(storeId) ?? null;
    const prevRank = prevByCompetitor.get(competitor.id) ?? null;

    await db.keywordCompetitorRank.upsert({
      where: {
        keywordId_competitorId_date: {
          keywordId: keyword.id,
          competitorId: competitor.id,
          date: today,
        },
      },
      create: {
        keywordId: keyword.id,
        competitorId: competitor.id,
        date: today,
        rank,
        prevRank,
        scanDepth: SCAN_DEPTH,
      },
      update: { rank, prevRank, scanDepth: SCAN_DEPTH },
    });
    written++;
  }

  return written;
}

/** Sentinel for the all-categories chart. See the schema note on ChartRank. */
export const OVERALL_CATEGORY = "overall";

/**
 * Daily chart position across every tracked storefront.
 *
 * Both the category chart and the overall chart are scanned: an app is
 * routinely inside the top 100 of its category while nowhere near the overall
 * list, and only the former is a number anyone can act on.
 */
export async function syncChartRanks(appId: string) {
  const app = await db.app.findUniqueOrThrow({ where: { id: appId } });
  const provider = await getAsoProvider();
  const storefronts = await appStorefronts(appId);
  const today = todayUtc();

  const charts: ChartType[] = ["TOP_FREE", "TOP_PAID", "TOP_GROSSING"];

  return withSyncRun({ job: "aso.charts", appId }, async (record) => {
    if (!provider.chart) {
      throw new Error(`The ${provider.name} provider does not expose store charts`);
    }

    let written = 0;
    const failures: string[] = [];

    // Only distinct countries matter — a chart is per storefront country, not
    // per listing language, so tracking en-US and es-US would scan twice.
    const countries = [...new Set(storefronts.map((s) => s.country))];

    // The app's own category chart plus the overall one. "overall" is a
    // sentinel rather than null so the unique index actually holds.
    const categories: string[] = app.category ? [app.category, OVERALL_CATEGORY] : [OVERALL_CATEGORY];

    for (const country of countries) {
      for (const chart of charts) {
        for (const category of categories) {
          try {
            const result = await provider.chart(app.platform, {
              chart,
              country,
              category: category === OVERALL_CATEGORY ? null : category,
              limit: 200,
            });

            // An empty scan means the chart was unreachable, not that the app
            // is absent — recording a null rank would be a false negative.
            if (result.scanDepth === 0) continue;

            record.read(result.entries.length);

            const position =
              result.entries.find((entry) => entry.storeId === app.storeId)?.position ?? null;

            const previous = await db.chartRank.findFirst({
              where: { appId, country, chart, category, date: { lt: today } },
              orderBy: { date: "desc" },
            });

            await db.chartRank.upsert({
              where: {
                appId_date_country_chart_category: {
                  appId,
                  date: today,
                  country,
                  chart,
                  category,
                },
              },
              create: {
                appId,
                date: today,
                country,
                chart,
                category,
                rank: position,
                prevRank: previous?.rank ?? null,
                scanDepth: result.scanDepth,
              },
              update: {
                rank: position,
                prevRank: previous?.rank ?? null,
                scanDepth: result.scanDepth,
              },
            });
            written++;
          } catch (error) {
            failures.push(
              `${country}/${chart}/${category}: ${
                error instanceof Error ? error.message : "failed"
              }`,
            );
          }
        }
      }
    }

    record.wrote(written);

    if (written === 0 && failures.length > 0) {
      throw new Error(failures.slice(0, 3).join(" | "));
    }
  });
}

/**
 * Refreshes competitor snapshots and, when enabled, discovers new competitors
 * from the apps that consistently outrank us on tracked keywords.
 */
export async function syncCompetitors(appId: string, opts: { discover?: boolean } = {}) {
  const app = await db.app.findUniqueOrThrow({ where: { id: appId } });
  const provider = await getAsoProvider();

  return withSyncRun({ job: "aso.competitors", appId }, async (record) => {
    if (opts.discover) {
      const keywords = await db.keyword.findMany({
        where: { appId, isTracked: true },
        take: 10,
      });

      const appearances = new Map<string, { count: number; name: string }>();

      for (const keyword of keywords) {
        const results = await provider.search(app.platform, keyword.term, {
          country: keyword.country,
          locale: keyword.locale,
          limit: 10,
        });
        for (const result of results) {
          if (result.storeId === app.storeId) continue;
          const entry = appearances.get(result.storeId) ?? { count: 0, name: result.name };
          entry.count++;
          appearances.set(result.storeId, entry);
        }
      }

      // Appearing in the top 10 for at least three tracked terms is a
      // meaningful overlap; one shared term is noise.
      let discovered = 0;

      for (const [storeId, entry] of appearances) {
        if (entry.count < 3) continue;
        const before = await db.competitor.count({
          where: { appId, platform: app.platform, storeId, country: app.country },
        });
        if (before === 0) discovered++;
        await db.competitor.upsert({
          where: {
            appId_platform_storeId_country: {
              appId,
              platform: app.platform,
              storeId,
              country: app.country,
            },
          },
          create: {
            appId,
            platform: app.platform,
            storeId,
            name: entry.name,
            country: app.country,
            autoDetected: true,
          },
          update: {},
        });
      }

      // A competitor found today has no rank history, and the daily rank scan
      // already ran an hour ago. Re-running it now backfills them immediately
      // rather than leaving the comparison blank until tomorrow.
      if (discovered > 0) {
        await enqueue({ type: "app.ranks", appId }, { jobId: `app.ranks-${appId}-${Date.now()}` });
      }
    }

    const competitors = await db.competitor.findMany({ where: { appId, isTracked: true } });
    record.read(competitors.length);
    let written = 0;

    for (const competitor of competitors) {
      const detail = await provider
        .getApp(competitor.platform, competitor.storeId, {
          country: competitor.country,
          locale: app.locale,
        })
        .catch(() => null);

      if (!detail) continue;

      const hash = contentHash([
        detail.title,
        detail.subtitle,
        detail.description,
        detail.version,
      ]);

      const latest = await db.competitorSnapshot.findFirst({
        where: { competitorId: competitor.id },
        orderBy: { capturedAt: "desc" },
      });

      if (latest?.contentHash !== hash) {
        await db.competitorSnapshot.create({
          data: {
            competitorId: competitor.id,
            title: detail.title,
            subtitle: detail.subtitle,
            description: detail.description,
            version: detail.version,
            ratingAverage: detail.ratingAverage,
            ratingCount: detail.ratingCount,
            contentHash: hash,
          },
        });
        written++;
      }

      await db.competitor.update({
        where: { id: competitor.id },
        data: {
          name: detail.name || competitor.name,
          developer: detail.developer ?? competitor.developer,
          iconUrl: detail.iconUrl ?? competitor.iconUrl,
        },
      });
    }

    record.wrote(written);
  });
}

/** Suggests keywords for a new app from its own listing plus store autocomplete. */
export async function suggestKeywords(appId: string, limit = 25): Promise<string[]> {
  const app = await db.app.findUniqueOrThrow({ where: { id: appId } });
  const provider = await getAsoProvider();

  const listing = await db.storeListing.findFirst({
    where: { appId },
    orderBy: { capturedAt: "desc" },
  });

  const { extractCandidateKeywords } = await import("@/server/aso/analysis");
  const seeds = extractCandidateKeywords(
    {
      platform: app.platform,
      title: listing?.title,
      subtitle: listing?.subtitle,
      keywordField: listing?.keywordField,
      shortDescription: listing?.shortDescription,
      fullDescription: listing?.fullDescription,
    },
    12,
  );

  const suggestions = new Set<string>(seeds);

  for (const seed of seeds.slice(0, 6)) {
    const terms = await provider
      .suggest(app.platform, seed, { country: app.country })
      .catch(() => [] as string[]);
    for (const term of terms) suggestions.add(term.toLowerCase());
  }

  return Array.from(suggestions).slice(0, limit);
}

/** Backfills a date so charts do not show a gap where a sync simply failed. */
export function normalizeDate(input: Date | string) {
  return toUtcDate(input);
}
