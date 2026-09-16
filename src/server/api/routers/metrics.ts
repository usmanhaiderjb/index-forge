import { MetricKey } from "@prisma/client";
import { z } from "zod";

import {
  conversionRate,
  dateRange,
  eachDay,
  isTrafficSource,
  METRIC_META,
  pctChange,
  previousPeriod,
  TRAFFIC_DIMENSION_KEY,
  TRAFFIC_SOURCE_META,
  TRAFFIC_SOURCES,
  type TrafficSource,
  ymd,
} from "@aso/shared";
import { assertAppInOrg, createTRPCRouter, orgProcedure } from "@/server/api/trpc";
import type { db } from "@/server/db";
import { parseDimension } from "@/server/integrations/types";
import { describeSource, preferAuthoritativeSource } from "@/server/metrics/precedence";

const metricEnum = z.nativeEnum(MetricKey);

const rangeInput = z.object({
  appId: z.string().cuid().optional(),
  days: z.number().int().min(1).max(730).default(30),
});

/** Percent-style metrics average over a window; counters sum. */
function aggregate(metric: MetricKey, values: number[]): number {
  if (values.length === 0) return 0;
  const total = values.reduce((a, b) => a + b, 0);
  return METRIC_META[metric].aggregation === "average" ? total / values.length : total;
}

export const metricsRouter = createTRPCRouter({
  /** Headline tiles: current window, prior window, and the delta between them. */
  summary: orgProcedure
    .input(rangeInput.extend({ metrics: z.array(metricEnum).optional() }))
    .query(async ({ ctx, input }) => {
      const appIds = await resolveAppIds(ctx.db, ctx.organizationId, input.appId);
      if (appIds.length === 0) return [];

      const { start, end } = dateRange(input.days);
      const prior = previousPeriod(start, end);

      const metrics =
        input.metrics ??
        ([
          "INSTALLS",
          "ACTIVE_USERS_DAILY",
          "TOTAL_REVENUE",
          "AD_REVENUE",
          "CONVERSION_RATE",
          "RATING_AVERAGE",
        ] satisfies MetricKey[]);

      const [currentRaw, previousRaw] = await Promise.all([
        ctx.db.metricPoint.findMany({
          where: {
            appId: { in: appIds },
            dimension: "",
            metric: { in: metrics },
            date: { gte: start, lte: end },
          },
          select: { appId: true, metric: true, source: true, value: true, currency: true },
        }),
        ctx.db.metricPoint.findMany({
          where: {
            appId: { in: appIds },
            dimension: "",
            metric: { in: metrics },
            date: { gte: prior.start, lte: prior.end },
          },
          select: { appId: true, metric: true, source: true, value: true },
        }),
      ]);

      // Firebase reports ad and purchase revenue that AdMob and the store
      // consoles also report. Summing every source would roughly double it.
      const current = preferAuthoritativeSource(currentRaw);
      const previous = preferAuthoritativeSource(previousRaw);

      return metrics.map((metric) => {
        const currentRows = current.filter((r) => r.metric === metric);
        const priorValues = previous.filter((r) => r.metric === metric).map((r) => r.value);
        const currentValues = currentRows.map((r) => r.value);
        const currentValue = aggregate(metric, currentValues);
        const priorValue = aggregate(metric, priorValues);

        return {
          metric,
          value: currentValue,
          previous: priorValue,
          changePct: priorValues.length ? pctChange(priorValue, currentValue) : null,
          currency: currentRows[0]?.currency ?? "USD",
          hasData: currentValues.length > 0,
          // Which provider this figure came from, so a number is traceable.
          sources: Array.from(new Set(currentRows.map((r) => r.source))).map(describeSource),
        };
      });
    }),

  /** Zero-filled daily series so charts show gaps as zero, not as a shortened axis. */
  series: orgProcedure
    .input(rangeInput.extend({ metrics: z.array(metricEnum).min(1) }))
    .query(async ({ ctx, input }) => {
      const appIds = await resolveAppIds(ctx.db, ctx.organizationId, input.appId);
      const { start, end } = dateRange(input.days);

      if (appIds.length === 0) {
        return eachDay(start, end).map((date) => ({ date: ymd(date) }));
      }

      const rawRows = await ctx.db.metricPoint.findMany({
        where: {
          appId: { in: appIds },
          dimension: "",
          metric: { in: input.metrics },
          date: { gte: start, lte: end },
        },
        select: { appId: true, date: true, metric: true, source: true, value: true },
        orderBy: { date: "asc" },
      });

      // One source per metric, chosen across the whole window rather than per
      // day — switching mid-series would draw a step change that never
      // happened, because two providers measure subtly different things.
      const rows = preferAuthoritativeSource(rawRows);

      const buckets = new Map<string, Map<MetricKey, number[]>>();
      for (const row of rows) {
        const key = ymd(row.date);
        const forDay = buckets.get(key) ?? new Map<MetricKey, number[]>();
        const values = forDay.get(row.metric) ?? [];
        values.push(row.value);
        forDay.set(row.metric, values);
        buckets.set(key, forDay);
      }

      const points = eachDay(start, end).map((date) => {
        const key = ymd(date);
        const forDay = buckets.get(key);
        const point: Record<string, string | number> = { date: key };
        for (const metric of input.metrics) {
          point[metric] = forDay ? aggregate(metric, forDay.get(metric) ?? []) : 0;
        }
        return point;
      });

      /**
       * Gaps inside the window stay zero-filled — a day with no installs is a
       * real zero. Trailing days that have not been synced yet are dropped
       * instead: sources report a day late, so keeping them would draw a cliff
       * down to zero at the right edge of every chart, every morning.
       */
      let lastWithData = points.length - 1;
      while (lastWithData >= 0 && !buckets.has(String(points[lastWithData]!.date))) {
        lastWithData--;
      }

      return lastWithData < 0 ? [] : points.slice(0, lastWithData + 1);
    }),

  /**
   * Impressions to page views to installs, split by store traffic source.
   *
   * The reason this exists rather than being a `breakdown` call per metric: a
   * conversion rate is not a metric you can aggregate. Averaging the stored
   * daily `CONVERSION_RATE` across a window, or across sources, gives the mean
   * of a set of ratios, which is not the ratio of the totals. A day with 1
   * install from 100 views and a day with 9 from 10 is 10/110 — 9.1%, not the
   * 45.5% you get by averaging 1% and 90%.
   *
   * So the counters are summed here and the rates computed once, at the end,
   * from those sums.
   */
  funnel: orgProcedure
    .input(rangeInput)
    .query(async ({ ctx, input }) => {
      const appIds = await resolveAppIds(ctx.db, ctx.organizationId, input.appId);
      if (appIds.length === 0) return { sources: [], totals: null, hasData: false };

      const { start, end } = dateRange(input.days);

      const rawRows = await ctx.db.metricPoint.findMany({
        where: {
          appId: { in: appIds },
          metric: { in: ["IMPRESSIONS", "STORE_PAGE_VIEWS", "INSTALLS"] },
          // Only source-dimensioned rows. App-wide rows carry the same numbers
          // undivided; mixing the two would double every total.
          dimension: { contains: `${TRAFFIC_DIMENSION_KEY}=` },
          date: { gte: start, lte: end },
        },
        select: { appId: true, metric: true, source: true, dimension: true, value: true, meta: true },
      });

      // Two providers reporting the same slice would otherwise both be counted.
      const rows = preferAuthoritativeSource(rawRows);

      type Bucket = { impressions: number | null; pageViews: number | null; installs: number | null };
      const buckets = new Map<TrafficSource, Bucket>();

      const add = (bucket: Bucket, key: keyof Bucket, value: number) => {
        bucket[key] = (bucket[key] ?? 0) + value;
      };

      for (const row of rows) {
        const raw = parseDimension(row.dimension)[TRAFFIC_DIMENSION_KEY];
        // The vocabulary is closed. A row filed under something else is a
        // connector bug, and counting it into a bucket it does not belong to
        // would hide that.
        if (!raw || !isTrafficSource(raw)) continue;

        const bucket = buckets.get(raw) ?? { impressions: null, pageViews: null, installs: null };
        if (row.metric === "IMPRESSIONS") add(bucket, "impressions", row.value);
        else if (row.metric === "STORE_PAGE_VIEWS") add(bucket, "pageViews", row.value);
        else if (row.metric === "INSTALLS") add(bucket, "installs", row.value);
        buckets.set(raw, bucket);
      }

      const sources = TRAFFIC_SOURCES.filter((s) => buckets.has(s)).map((source) => {
        const b = buckets.get(source)!;
        return {
          source,
          label: TRAFFIC_SOURCE_META[source].label,
          description: TRAFFIC_SOURCE_META[source].description,
          impressions: b.impressions,
          pageViews: b.pageViews,
          installs: b.installs,
          /** Impression to page view. Null when impressions are unknown. */
          tapThrough: conversionRate(b.pageViews ?? 0, b.impressions ?? 0),
          /** Page view to install — the number ASO work actually moves. */
          conversion: conversionRate(b.installs ?? 0, b.pageViews ?? 0),
        };
      });

      if (sources.length === 0) return { sources: [], totals: null, hasData: false };

      const sum = (pick: (s: (typeof sources)[number]) => number | null) => {
        const present = sources.map(pick).filter((v): v is number => v !== null);
        return present.length === 0 ? null : present.reduce((a, b) => a + b, 0);
      };

      const impressions = sum((s) => s.impressions);
      const pageViews = sum((s) => s.pageViews);
      const installs = sum((s) => s.installs);

      return {
        sources,
        totals: {
          impressions,
          pageViews,
          installs,
          tapThrough: conversionRate(pageViews ?? 0, impressions ?? 0),
          conversion: conversionRate(installs ?? 0, pageViews ?? 0),
        },
        hasData: true,
      };
    }),

  /** Country / campaign / ad-unit breakdown for one metric. */
  breakdown: orgProcedure
    .input(
      rangeInput.extend({
        metric: metricEnum,
        dimensionKey: z.string().default("country"),
        limit: z.number().int().max(50).default(10),
      }),
    )
    .query(async ({ ctx, input }) => {
      const appIds = await resolveAppIds(ctx.db, ctx.organizationId, input.appId);
      if (appIds.length === 0) return [];

      const { start, end } = dateRange(input.days);

      const rawRows = await ctx.db.metricPoint.findMany({
        where: {
          appId: { in: appIds },
          metric: input.metric,
          dimension: { contains: `${input.dimensionKey}=` },
          date: { gte: start, lte: end },
        },
        select: { appId: true, metric: true, source: true, dimension: true, value: true, meta: true },
      });

      const rows = preferAuthoritativeSource(rawRows);

      const totals = new Map<string, { value: number[]; label?: string }>();
      for (const row of rows) {
        const parsed = parseDimension(row.dimension);
        const key = parsed[input.dimensionKey];
        if (!key) continue;
        const entry = totals.get(key) ?? { value: [] };
        entry.value.push(row.value);
        const meta = row.meta as { campaignName?: string } | null;
        if (meta?.campaignName) entry.label = meta.campaignName;
        totals.set(key, entry);
      }

      return Array.from(totals.entries())
        .map(([key, entry]) => ({
          key,
          label: entry.label ?? key,
          value: aggregate(input.metric, entry.value),
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, input.limit);
    }),

  /** Which metrics actually have data, so the UI can hide empty selectors. */
  available: orgProcedure.input(rangeInput).query(async ({ ctx, input }) => {
    const appIds = await resolveAppIds(ctx.db, ctx.organizationId, input.appId);
    if (appIds.length === 0) return [];

    const rows = await ctx.db.metricPoint.groupBy({
      by: ["metric", "source"],
      where: { appId: { in: appIds } },
      _max: { date: true },
      _count: true,
    });

    return rows.map((row) => ({
      metric: row.metric,
      source: row.source,
      points: row._count,
      lastDate: row._max.date ? ymd(row._max.date) : null,
    }));
  }),

  /** Per-app comparison table on the portfolio dashboard. */
  byApp: orgProcedure
    .input(z.object({ days: z.number().int().max(365).default(30), metric: metricEnum }))
    .query(async ({ ctx, input }) => {
      const apps = await ctx.db.app.findMany({
        where: { organizationId: ctx.organizationId, isActive: true },
        select: { id: true, name: true, platform: true, iconUrl: true },
      });

      const { start, end } = dateRange(input.days);
      const prior = previousPeriod(start, end);

      const [currentRaw, previousRaw] = await Promise.all([
        ctx.db.metricPoint.findMany({
          where: {
            appId: { in: apps.map((a) => a.id) },
            metric: input.metric,
            dimension: "",
            date: { gte: start, lte: end },
          },
          select: { appId: true, metric: true, source: true, value: true },
        }),
        ctx.db.metricPoint.findMany({
          where: {
            appId: { in: apps.map((a) => a.id) },
            metric: input.metric,
            dimension: "",
            date: { gte: prior.start, lte: prior.end },
          },
          select: { appId: true, metric: true, source: true, value: true },
        }),
      ]);

      // Per app, since one app may be linked to AdMob and another not.
      const current = preferAuthoritativeSource(currentRaw);
      const previous = preferAuthoritativeSource(previousRaw);

      return apps
        .map((app) => {
          const value = aggregate(
            input.metric,
            current.filter((r) => r.appId === app.id).map((r) => r.value),
          );
          const priorValue = aggregate(
            input.metric,
            previous.filter((r) => r.appId === app.id).map((r) => r.value),
          );
          return {
            ...app,
            value,
            changePct: priorValue ? pctChange(priorValue, value) : null,
          };
        })
        .sort((a, b) => b.value - a.value);
    }),
});

/**
 * Resolves the app scope for a query. A supplied appId is verified against the
 * organization here so no metric query can read another tenant's data.
 */
async function resolveAppIds(
  database: typeof db,
  organizationId: string,
  appId?: string,
): Promise<string[]> {
  if (appId) {
    await assertAppInOrg(database, appId, organizationId);
    return [appId];
  }
  const apps = await database.app.findMany({
    where: { organizationId, isActive: true },
    select: { id: true },
  });
  return apps.map((a) => a.id);
}
