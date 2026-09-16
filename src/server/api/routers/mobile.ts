import { MetricKey } from "@prisma/client";
import { z } from "zod";

import { dateRange, METRIC_META } from "@aso/shared";
import { assertAppInOrg, createTRPCRouter, orgProcedure } from "@/server/api/trpc";
import { describeSource, preferAuthoritativeSource } from "@/server/metrics/precedence";

/**
 * Screen-shaped endpoints for the mobile app.
 *
 * The web dashboard fires six parallel tRPC calls on load. That is fine over a
 * LAN and poor on a mobile network, where each round trip costs a visible
 * fraction of a second — a screen that needs four of them feels broken before
 * anything has gone wrong.
 *
 * These are compositions over the existing routers and the same metric helpers.
 * They deliberately do not reimplement source precedence or derivation: a
 * second implementation of those is how the two surfaces start disagreeing
 * about what a number is.
 */

const HOME_METRICS: MetricKey[] = [
  MetricKey.INSTALLS,
  MetricKey.ORGANIC_INSTALLS,
  MetricKey.TOTAL_REVENUE,
];

const OVERVIEW_METRICS: MetricKey[] = [
  MetricKey.INSTALLS,
  MetricKey.ORGANIC_INSTALLS,
  MetricKey.PAID_INSTALLS,
  MetricKey.TOTAL_REVENUE,
  MetricKey.AD_REVENUE,
  MetricKey.CONVERSION_RATE,
];

/** Aggregates rows the same way the web `summary` does, including precedence. */
function aggregate(metric: MetricKey, rows: { value: number }[]): number {
  if (rows.length === 0) return 0;
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  return METRIC_META[metric].aggregation === "average" ? total / rows.length : total;
}

export const mobileRouter = createTRPCRouter({
  /**
   * Everything the home screen needs, in one round trip: the app list with a
   * headline figure each, plus the open alert count for the badge.
   */
  home: orgProcedure
    .input(z.object({ days: z.number().int().min(1).max(90).default(30) }).optional())
    .query(async ({ ctx, input }) => {
      const days = input?.days ?? 30;
      const { start, end } = dateRange(days);

      const [apps, openAlerts] = await Promise.all([
        ctx.db.app.findMany({
          where: { organizationId: ctx.organizationId, isActive: true },
          orderBy: { createdAt: "asc" },
          select: { id: true, name: true, platform: true, iconUrl: true, storeId: true },
        }),
        ctx.db.alertEvent.count({
          where: { rule: { organizationId: ctx.organizationId }, status: "TRIGGERED" },
        }),
      ]);

      if (apps.length === 0) {
        return { apps: [], openAlerts, days, totals: emptyTotals() };
      }

      const appIds = apps.map((app) => app.id);

      const rows = await ctx.db.metricPoint.findMany({
        where: {
          appId: { in: appIds },
          dimension: "",
          metric: { in: HOME_METRICS },
          date: { gte: start, lte: end },
        },
        select: { appId: true, metric: true, source: true, value: true, currency: true },
      });

      // Precedence is applied once across the whole set, exactly as the web
      // does it — per app and per metric, not per row.
      const kept = preferAuthoritativeSource(rows);

      const perApp = apps.map((app) => {
        const appRows = kept.filter((row) => row.appId === app.id);
        const metrics = Object.fromEntries(
          HOME_METRICS.map((metric) => {
            const forMetric = appRows.filter((row) => row.metric === metric);
            return [
              metric,
              {
                value: aggregate(metric, forMetric),
                // The app must be able to tell "no data" from "zero" — that
                // distinction is the whole point of the metric layer.
                hasData: forMetric.length > 0,
              },
            ];
          }),
        );

        return {
          id: app.id,
          name: app.name,
          platform: app.platform,
          iconUrl: app.iconUrl,
          metrics,
          currency: appRows.find((row) => row.currency)?.currency ?? "USD",
        };
      });

      return {
        days,
        openAlerts,
        apps: perApp,
        totals: Object.fromEntries(
          HOME_METRICS.map((metric) => {
            const forMetric = kept.filter((row) => row.metric === metric);
            return [
              metric,
              { value: aggregate(metric, forMetric), hasData: forMetric.length > 0 },
            ];
          }),
        ),
      };
    }),

  /** One app's overview screen: tiles, a sparkline series, and rank movement. */
  appOverview: orgProcedure
    .input(
      z.object({
        appId: z.string().cuid(),
        days: z.number().int().min(1).max(90).default(30),
      }),
    )
    .query(async ({ ctx, input }) => {
      const app = await assertAppInOrg(ctx.db, input.appId, ctx.organizationId);
      const { start, end } = dateRange(input.days);

      const [metricRows, seriesRows, ranks] = await Promise.all([
        ctx.db.metricPoint.findMany({
          where: {
            appId: app.id,
            dimension: "",
            metric: { in: OVERVIEW_METRICS },
            date: { gte: start, lte: end },
          },
          select: { appId: true, metric: true, source: true, value: true, currency: true },
        }),
        ctx.db.metricPoint.findMany({
          where: {
            appId: app.id,
            dimension: "",
            metric: MetricKey.INSTALLS,
            date: { gte: start, lte: end },
          },
          select: { appId: true, date: true, metric: true, source: true, value: true },
          orderBy: { date: "asc" },
        }),
        ctx.db.keyword.findMany({
          where: { appId: app.id, isTracked: true },
          take: 5,
          include: { ranks: { orderBy: { date: "desc" }, take: 2 } },
        }),
      ]);

      const kept = preferAuthoritativeSource(metricRows);
      const keptSeries = preferAuthoritativeSource(seriesRows);

      return {
        app: {
          id: app.id,
          name: app.name,
          platform: app.platform,
          iconUrl: app.iconUrl,
          country: app.country,
        },
        days: input.days,
        metrics: OVERVIEW_METRICS.map((metric) => {
          const forMetric = kept.filter((row) => row.metric === metric);
          return {
            metric,
            label: METRIC_META[metric].label,
            unit: METRIC_META[metric].unit,
            value: aggregate(metric, forMetric),
            hasData: forMetric.length > 0,
            currency: forMetric.find((row) => row.currency)?.currency ?? "USD",
            // Named so a figure on a phone is as traceable as one on the web.
            sources: [...new Set(forMetric.map((row) => row.source))].map(describeSource),
          };
        }),
        // Pre-shaped for a sparkline: the client should not have to group by
        // date on a phone.
        series: keptSeries.map((row) => ({
          date: row.date.toISOString().slice(0, 10),
          value: row.value,
        })),
        keywords: ranks.map((keyword) => {
          const current = keyword.ranks[0];
          const previous = keyword.ranks[1];
          const prior = current?.prevRank ?? previous?.rank ?? null;

          return {
            id: keyword.id,
            term: keyword.term,
            rank: current?.rank ?? null,
            // Positive means it moved up the results, matching the web.
            delta: current?.rank && prior ? prior - current.rank : null,
            scanDepth: current?.scanDepth ?? null,
          };
        }),
      };
    }),
});

function emptyTotals() {
  return Object.fromEntries(
    HOME_METRICS.map((metric) => [metric, { value: 0, hasData: false }]),
  );
}
