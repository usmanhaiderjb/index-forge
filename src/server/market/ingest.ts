import "server-only";

import { playChart } from "@/server/aso/builtin/charts";
import { playDetails } from "@/server/aso/builtin/play";
import { db } from "@/server/db";
import { classifyReviews, parseStoredTheme } from "@/server/market/classify";
import { collectPlayReviews } from "@/server/market/play-reviews";
import { aggregateThemes, type ClassifiedReview } from "@/server/market/themes";

/**
 * Building a niche: chart apps in, review themes out.
 *
 * Android only. Apple serves no third-party review text through any route that
 * does not need a browser to obtain a token — see docs/GAP-FINDER.md §3. The
 * niche is stored with its platform so an iOS implementation can slot in later
 * without a migration, rather than pretending coverage exists.
 */

export type NicheBuildResult = {
  nicheId: string;
  apps: number;
  /** Apps whose reviews were actually read. Lower than `apps` under throttling. */
  appsRead: number;
  reviewsFetched: number;
  reviewsClassified: number;
  themes: number;
};

/**
 * Record the apps currently charting in a category.
 *
 * Chart entries carry a name and a store id but not a release date or rating,
 * so each one is looked up. That is the expensive half — one request per app —
 * and the reason `apps` is capped well below a full chart.
 */
export async function collectNicheApps(options: {
  category: string;
  country?: string;
  apps?: number;
}): Promise<string[]> {
  const country = options.country ?? "us";
  const depth = options.apps ?? 10;

  const chart = await playChart({
    chart: "TOP_FREE",
    country,
    category: options.category,
    limit: depth,
  });

  const ids: string[] = [];

  for (const entry of chart.entries.slice(0, depth)) {
    let detail;
    try {
      detail = await playDetails(entry.storeId, { country, locale: "en-US" });
    } catch {
      // One unreadable listing must not abort the niche. Play serves
      // interstitials for age-gated apps.
      continue;
    }
    if (!detail) continue;

    const app = await db.marketApp.upsert({
      where: {
        platform_storeId_country: { platform: "ANDROID", storeId: entry.storeId, country },
      },
      create: {
        platform: "ANDROID",
        storeId: entry.storeId,
        country,
        name: detail.name,
        developer: detail.developer,
        category: options.category,
        releasedAt: detail.releasedAt,
      },
      update: { lastSeenAt: new Date(), name: detail.name, category: options.category },
      select: { id: true },
    });

    // A snapshot every time, append-only: two readings are what a velocity
    // figure is derived from, and Trends depends on this series existing.
    await db.marketAppSnapshot.create({
      data: {
        marketAppId: app.id,
        ratingCount: detail.ratingCount ?? null,
        ratingAverage: detail.ratingAverage ?? null,
        installsText: detail.installsText ?? null,
      },
    });

    ids.push(app.id);
  }

  return ids;
}

/**
 * Fetch and store reviews for one app.
 *
 * **Author names are dropped here**, deliberately and permanently. The endpoint
 * returns them; `MarketReview` has no column for them. For an app we do not
 * represent, the reviewer has no relationship with us.
 */
export async function ingestReviews(options: {
  marketAppId: string;
  packageName: string;
  country?: string;
  limit?: number;
}): Promise<number> {
  const reviews = await collectPlayReviews({
    packageName: options.packageName,
    country: options.country,
    limit: options.limit ?? 80,
  });

  if (reviews.length === 0) return 0;

  const result = await db.marketReview.createMany({
    data: reviews.map((review) => ({
      marketAppId: options.marketAppId,
      externalId: review.externalId,
      rating: review.rating,
      body: review.body,
      appVersion: review.appVersion,
      submittedAt: review.submittedAt,
    })),
    // Re-running a niche is cheap and idempotent: reviews already stored are
    // skipped on their unique (app, externalId) key rather than duplicated.
    skipDuplicates: true,
  });

  return result.count;
}

/**
 * Aggregate every classified review in a niche into themes.
 *
 * Replaces the niche's themes rather than merging: a theme that has stopped
 * being raised is no longer a gap, and merging would leave fixed complaints on
 * the page for ever.
 */
export async function deriveThemes(options: {
  nicheId: string;
  marketAppIds: string[];
  minApps?: number;
}): Promise<number> {
  const rows = await db.marketReview.findMany({
    where: { marketAppId: { in: options.marketAppIds }, analyzedAt: { not: null } },
    select: { id: true, marketAppId: true, rating: true, themes: true },
  });

  const classified: ClassifiedReview[] = rows.map((row) => ({
    reviewId: row.id,
    marketAppId: row.marketAppId,
    rating: row.rating,
    themes: row.themes
      .map(parseStoredTheme)
      .filter((t): t is NonNullable<typeof t> => t !== null),
  }));

  const themes = aggregateThemes(classified, { minApps: options.minApps ?? 2 });

  await db.$transaction([
    db.nicheTheme.deleteMany({ where: { nicheId: options.nicheId } }),
    ...themes.map((theme) =>
      db.nicheTheme.create({
        data: {
          nicheId: options.nicheId,
          kind: theme.kind,
          label: theme.label,
          appCount: theme.appCount,
          mentionCount: theme.mentionCount,
          meanRating: theme.meanRating,
          evidenceIds: theme.evidenceIds,
        },
      }),
    ),
  ]);

  return themes.length;
}

/**
 * Build a whole niche end to end.
 *
 * Sequential by design. Every step is a store request behind the shared
 * per-host throttle, so parallelism would buy nothing and cost politeness.
 */
export async function buildNiche(options: {
  category: string;
  label: string;
  organizationId: string;
  country?: string;
  apps?: number;
  reviewsPerApp?: number;
}): Promise<NicheBuildResult> {
  const country = options.country ?? "us";

  const niche = await db.marketNiche.upsert({
    where: {
      kind_label_country_platform: {
        kind: "CATEGORY",
        label: options.label,
        country,
        platform: "ANDROID",
      },
    },
    create: {
      kind: "CATEGORY",
      label: options.label,
      country,
      platform: "ANDROID",
      method: "themes from Play reviews of the top charting apps",
    },
    update: { computedAt: new Date() },
    select: { id: true },
  });

  const appIds = await collectNicheApps({ category: options.category, country, apps: options.apps });

  const apps = await db.marketApp.findMany({
    where: { id: { in: appIds } },
    select: { id: true, storeId: true },
  });

  let fetched = 0;
  let classified = 0;
  let read = 0;
  let failed = 0;
  let unclassified = 0;

  for (const app of apps) {
    /*
     * Per app, not per niche.
     *
     * Without this, one throttled app aborts the whole build — including the
     * apps already ingested, whose reviews are then never classified and never
     * aggregated. Play answers a throttle with an empty payload rather than a
     * 429, so this is not a rare path: it fires whenever the store decides we
     * have asked for enough, which on a category of ten apps is likely.
     *
     * A niche built from four of six apps is a weaker finding, and it is
     * reported as such. A niche built from none is a wasted run.
     */
    /*
     * Fetching and classifying fail separately and must be counted separately.
     *
     * A single try block around both reported `appsRead: 0` on a run that had
     * stored 160 reviews — the fetch had succeeded and classification then
     * threw, marking the app unread. The page would have said "0 of 4 apps
     * read" with the reviews sitting in the database.
     *
     * They also fail for unrelated reasons: fetching fails when the store
     * throttles, classification when the AI account is out of credits or the
     * model name is wrong. Reviews stay stored either way, so a later run
     * classifies them without re-fetching anything.
     */
    try {
      fetched += await ingestReviews({
        marketAppId: app.id,
        packageName: app.storeId,
        country,
        limit: options.reviewsPerApp ?? 80,
      });
      read++;
    } catch (error) {
      failed++;
      console.warn(`[market] fetch ${app.storeId}: ${(error as Error).message.slice(0, 120)}`);
      continue;
    }

    try {
      const result = await classifyReviews({
        marketAppId: app.id,
        organizationId: options.organizationId,
      });
      classified += result.analyzed;
    } catch (error) {
      unclassified++;
      console.warn(`[market] classify ${app.storeId}: ${(error as Error).message.slice(0, 120)}`);
    }
  }

  const themes = await deriveThemes({ nicheId: niche.id, marketAppIds: appIds });

  // The method string is what the interface shows beneath the numbers, so it
  // has to carry the shortfall rather than quietly averaging it away. The two
  // shortfalls are different and read differently: reviews we could not fetch
  // are missing data, reviews we could not classify are pending work.
  const notes = [
    failed > 0 ? `${failed} could not be read` : null,
    unclassified > 0 ? `${unclassified} awaiting classification` : null,
  ].filter(Boolean);

  await db.marketNiche.update({
    where: { id: niche.id },
    data: {
      method:
        `themes from Play reviews of ${read} of ${apps.length} top charting apps` +
        (notes.length > 0 ? ` — ${notes.join(", ")}` : ""),
    },
  });

  return {
    nicheId: niche.id,
    apps: apps.length,
    appsRead: read,
    reviewsFetched: fetched,
    reviewsClassified: classified,
    themes,
  };
}
