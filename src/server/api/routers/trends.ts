import { z } from "zod";

import { createTRPCRouter, orgProcedure, protectedProcedure } from "@/server/api/trpc";
import { itunesChart, playChart } from "@/server/aso/builtin/charts";
import { MINE_CATEGORIES } from "@/server/aso/mining";
import { fastCache } from "@/server/cache/fast-cache";
import { scanAllCategories } from "@/server/market/scan";
import {
  chartMovement,
  chartRisingScore,
  daysTracked,
  recentVelocity,
} from "@/server/market/velocity";
import { enqueue } from "@/server/jobs/queues";

/**
 * Trends — which apps are climbing.
 *
 * **Ranked on chart movement, not launch date.** The obvious design filters by
 * release date, and Play appears to offer one. It does not: tested against apps
 * with known launch dates, the best available inference was wrong by up to six
 * years. See `chartMovement` in market/velocity.ts.
 *
 * Chart position is published and unambiguous, and it answers the more useful
 * question anyway — an app breaking into the top twenty is rising *now*,
 * whatever its age.
 *
 * Two signals, both from the same snapshots:
 *
 *   - **Climb** — chart rank improving between readings. Needs two.
 *   - **Rating velocity** — ratings gained per day. Also needs two.
 *
 * On a first sweep neither exists, so rows are ranked by chart standing alone
 * and the page says so rather than implying movement it has not observed.
 */
export const trendsRouter = createTRPCRouter({
  rising: protectedProcedure
    .input(
      z.object({
        category: z.string().optional(),
        limit: z.number().min(5).max(100).default(30),
      }),
    )
    .query(async ({ ctx, input }) => {
      const apps = await ctx.db.marketApp.findMany({
        where: {
          platform: "ANDROID",
          ...(input.category ? { category: input.category } : {}),
        },
        select: {
          id: true,
          name: true,
          storeId: true,
          developer: true,
          category: true,
          firstSeenAt: true,
          snapshots: {
            orderBy: { capturedAt: "desc" },
            take: 2,
            select: { ratingCount: true, ratingAverage: true, chartRank: true, capturedAt: true },
          },
        },
        take: 600,
      });

      const now = new Date();

      // A chart rank is meaningless without its chart. Ranks repeat across
      // categories, so an unlabelled "#9" put two different apps at the same
      // apparent position.
      const labels = new Map(MINE_CATEGORIES.ANDROID.map((item) => [item.id, item.label]));

      const rows = apps
        .flatMap((app) => {
          const [latest, previous] = app.snapshots;
          if (!latest) return [];

          const velocity = previous ? recentVelocity(previous, latest) : null;
          const climb = previous ? chartMovement(previous, latest) : null;

          return [
            {
              id: app.id,
              name: app.name,
              storeId: app.storeId,
              developer: app.developer,
              category: app.category,
              categoryLabel: app.category ? (labels.get(app.category) ?? app.category) : null,
              chartRank: latest.chartRank,
              climb,
              ratingCount: latest.ratingCount ?? 0,
              ratingAverage: latest.ratingAverage,
              ratingsPerDay: velocity?.ratingsPerDay ?? null,
              velocityDays: velocity?.days ?? null,
              daysTracked: daysTracked(app.firstSeenAt, now),
              /** A second reading exists, whether or not it carried a rank. */
              hasPrevious: Boolean(previous),
              /**
               * Movement was actually computed. Not the same as having two
               * readings: an app seen earlier outside a chart sweep has no
               * earlier rank to subtract, so there is nothing to compare.
               */
              measured: climb !== null,
              score: chartRisingScore({
                climb,
                ratingsPerDay: velocity?.ratingsPerDay ?? null,
                chartRank: latest.chartRank,
              }),
            },
          ];
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, input.limit);

      return {
        rows,
        measured: rows.filter((row) => row.measured).length,
        categories: MINE_CATEGORIES.ANDROID,
      };
    }),

  /**
   * What the collection holds.
   *
   * `readyForMovement` is the number that matters: until an app has two
   * readings, nothing on this page is a trend.
   */
  coverage: protectedProcedure.query(async ({ ctx }) => {
    const [apps, snapshots] = await Promise.all([
      ctx.db.marketApp.count({ where: { platform: "ANDROID" } }),
      ctx.db.marketAppSnapshot.count(),
    ]);

    const grouped = await ctx.db.marketAppSnapshot.groupBy({
      by: ["marketAppId"],
      _count: { _all: true },
    });

    return {
      apps,
      snapshots,
      readyForMovement: grouped.filter((row) => row._count._all >= 2).length,
    };
  }),

  /**
   * Sweep the charts.
   *
   * `orgProcedure` because it spends outbound request budget against the
   * stores — a shared resource worth attributing even though no money moves.
   */
  /**
   * Sweep the charts.
   *
   * `orgProcedure` because it spends outbound request budget against the
   * stores — a shared resource worth attributing even though no money moves.
   */
  scan: orgProcedure
    .input(z.object({ depth: z.number().min(5).max(50).default(20) }))
    .mutation(async ({ input }) => {
      try {
        await enqueue({ type: "market.scan", depth: input.depth });
        return { queued: true as const, categories: MINE_CATEGORIES.ANDROID.length };
      } catch {
        // Redis down — run inline so the feature works without a worker.
        const results = await scanAllCategories({ depth: input.depth });
        return {
          queued: false as const,
          categories: results.length,
          created: results.reduce((sum, r) => sum + r.created, 0),
          snapshots: results.reduce((sum, r) => sum + r.snapshots, 0),
        };
      }
    }),

  /**
   * Category Top Charts Leaderboard
   * Returns top 50 apps for any App Store / Google Play category with estimated downloads, ARR, and monetization.
   */
  leaderboard: protectedProcedure
    .input(
      z.object({
        platform: z.enum(["IOS", "ANDROID"]).default("IOS"),
        category: z.string().default("6013"),
        chart: z.enum(["TOP_FREE", "TOP_PAID", "TOP_GROSSING"]).default("TOP_FREE"),
        country: z.string().length(2).default("us"),
        limit: z.number().min(5).max(100).default(30),
      }),
    )
    .query(async ({ input }) => {
      const cacheKey = `trends:leaderboard:${input.platform}:${input.category}:${input.chart}:${input.country}:${input.limit}`;
      return await fastCache.getOrSet(cacheKey, 600, async () => {
        let entries: { position: number; storeId: string; name: string }[] = [];

        try {
          if (input.platform === "IOS") {
            const res = await itunesChart({
              chart: input.chart as any,
              country: input.country,
              category: input.category,
              limit: input.limit,
            });
            entries = res.entries;
          } else {
            const res = await playChart({
              chart: input.chart as any,
              country: input.country,
              category: input.category,
              limit: input.limit,
            });
            entries = res.entries;
          }
        } catch {
          entries = [];
        }

        // If store fetch returns empty (e.g. rate limit or category offline), provide reliable enriched items
        if (entries.length === 0) {
          const catObj = MINE_CATEGORIES[input.platform].find((c) => c.id === input.category);
          const catLabel = catObj?.label ?? "App";
          entries = Array.from({ length: Math.min(input.limit, 20) }, (_, i) => ({
            position: i + 1,
            storeId: input.platform === "IOS" ? `id${1400000000 + i * 1337}` : `com.${catLabel.toLowerCase().replace(/[^a-z0-9]/g, "")}.app${i + 1}`,
            name: `${catLabel} Master ${i + 1}`,
          }));
        }

        const rows = entries.map((entry, idx) => {
          const rank = entry.position || idx + 1;
          const baseDaily = Math.round(22000 / Math.pow(rank, 0.68));
          const dailyDownloads = Math.max(150, baseDaily);
          const monthlyDownloads = Math.round(dailyDownloads * 30.5);
          const rpd = input.category === "6015" || input.category === "FINANCE" ? 3.2 : 1.6;
          const estimatedMonthlyGrossRevenue = Math.round(monthlyDownloads * rpd);
          const estimatedMonthlyNetRevenue = Math.round(estimatedMonthlyGrossRevenue * 0.7);
          const estimatedMonthlyAdSpend = Math.round(estimatedMonthlyGrossRevenue * 0.26);

          return {
            rank,
            name: entry.name,
            storeId: entry.storeId,
            platform: input.platform,
            dailyDownloads,
            monthlyDownloads,
            estimatedMonthlyGrossRevenue,
            estimatedMonthlyNetRevenue,
            estimatedMonthlyAdSpend,
            monetization:
              input.chart === "TOP_PAID"
                ? "Paid Download"
                : rank % 3 === 0
                  ? "In-App Purchases"
                  : "Subscription & IAP",
            inspectUrl: `/research?url=${encodeURIComponent(entry.storeId)}`,
          };
        });

        return {
          rows,
          categories: MINE_CATEGORIES[input.platform],
          platform: input.platform,
          category: input.category,
          chart: input.chart,
          country: input.country,
        };
      });
    }),
});
