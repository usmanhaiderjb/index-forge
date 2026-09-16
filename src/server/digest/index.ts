import "server-only";

import { MetricKey } from "@prisma/client";

import { dateRange, formatDelta, formatMetric, mean, METRIC_META, pctChange, previousPeriod, ymd } from "@aso/shared";
import { env } from "@/env";
import { db } from "@/server/db";
import { parseChannels } from "@/server/notify";

const HEADLINE: MetricKey[] = [
  MetricKey.INSTALLS,
  MetricKey.TOTAL_REVENUE,
  MetricKey.CONVERSION_RATE,
  MetricKey.ACTIVE_USERS_DAILY,
];

export type DigestApp = {
  id: string;
  name: string;
  platform: string;
  metrics: { metric: MetricKey; value: number; changePct: number | null; hasData: boolean }[];
  rank: { improved: number; declined: number; best: { term: string; rank: number } | null };
  chart: { chart: string; country: string; category: string; rank: number } | null;
  reviews: { count: number; average: number | null; negative: number; unreplied: number };
  listingChanged: boolean;
};

export type DigestData = {
  organizationName: string;
  cadence: string;
  range: { start: string; end: string; days: number };
  apps: DigestApp[];
  insights: { title: string; summary: string; severity: string; appName: string | null }[];
  alerts: { name: string; message: string; severity: string }[];
  /** True when nothing moved at all — worth saying rather than sending a blank. */
  isQuiet: boolean;
};

/**
 * Assembles a period summary.
 *
 * Everything is period-over-period against an equal-length prior window, so a
 * digest reports movement rather than absolute numbers nobody can calibrate.
 */
export async function buildDigest(
  organizationId: string,
  opts: { days: number; appIds?: string[] },
): Promise<DigestData> {
  const organization = await db.organization.findUniqueOrThrow({
    where: { id: organizationId },
  });

  const apps = await db.app.findMany({
    where: {
      organizationId,
      isActive: true,
      ...(opts.appIds?.length ? { id: { in: opts.appIds } } : {}),
    },
    orderBy: { createdAt: "asc" },
  });

  const { start, end } = dateRange(opts.days);
  const prior = previousPeriod(start, end);

  const digestApps: DigestApp[] = [];

  for (const app of apps) {
    const [current, previous, ranks, chart, reviews, listings] = await Promise.all([
      db.metricPoint.findMany({
        where: {
          appId: app.id,
          dimension: "",
          metric: { in: HEADLINE },
          date: { gte: start, lte: end },
        },
        select: { metric: true, value: true },
      }),
      db.metricPoint.findMany({
        where: {
          appId: app.id,
          dimension: "",
          metric: { in: HEADLINE },
          date: { gte: prior.start, lte: prior.end },
        },
        select: { metric: true, value: true },
      }),
      db.keywordRank.findMany({
        where: { keyword: { appId: app.id, isTracked: true }, date: { gte: start, lte: end } },
        include: { keyword: { select: { term: true } } },
        orderBy: { date: "asc" },
      }),
      db.chartRank.findFirst({
        where: { appId: app.id, rank: { not: null }, date: { gte: start, lte: end } },
        orderBy: [{ date: "desc" }, { rank: "asc" }],
      }),
      db.review.findMany({
        where: { appId: app.id, submittedAt: { gte: start, lte: end } },
        select: { rating: true, sentiment: true, developerReply: true },
      }),
      db.storeListing.count({ where: { appId: app.id, capturedAt: { gte: start } } }),
    ]);

    const aggregate = (rows: { metric: MetricKey; value: number }[], metric: MetricKey) => {
      const values = rows.filter((r) => r.metric === metric).map((r) => r.value);
      if (values.length === 0) return null;
      return METRIC_META[metric].unit === "percent"
        ? mean(values)
        : values.reduce((a, b) => a + b, 0);
    };

    // Rank movement: first vs last observation per keyword within the window.
    const byKeyword = new Map<string, { term: string; first: number | null; last: number | null }>();
    for (const row of ranks) {
      const entry = byKeyword.get(row.keywordId) ?? {
        term: row.keyword.term,
        first: null,
        last: null,
      };
      if (entry.first === null) entry.first = row.rank;
      entry.last = row.rank;
      byKeyword.set(row.keywordId, entry);
    }

    let improved = 0;
    let declined = 0;
    let best: { term: string; rank: number } | null = null;

    for (const entry of byKeyword.values()) {
      if (entry.first !== null && entry.last !== null) {
        if (entry.last < entry.first) improved++;
        else if (entry.last > entry.first) declined++;
      }
      if (entry.last !== null && (best === null || entry.last < best.rank)) {
        best = { term: entry.term, rank: entry.last };
      }
    }

    digestApps.push({
      id: app.id,
      name: app.name,
      platform: app.platform,
      metrics: HEADLINE.map((metric) => {
        const value = aggregate(current, metric);
        const priorValue = aggregate(previous, metric);
        return {
          metric,
          value: value ?? 0,
          changePct: value !== null && priorValue !== null ? pctChange(priorValue, value) : null,
          hasData: value !== null,
        };
      }),
      rank: { improved, declined, best },
      chart: chart
        ? {
            chart: chart.chart,
            country: chart.country,
            category: chart.category,
            rank: chart.rank!,
          }
        : null,
      reviews: {
        count: reviews.length,
        average: reviews.length
          ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
          : null,
        negative: reviews.filter((r) => r.sentiment === "NEGATIVE" || r.rating <= 2).length,
        unreplied: reviews.filter((r) => !r.developerReply).length,
      },
      // More than one snapshot in the window means the text changed.
      listingChanged: listings > 1,
    });
  }

  const [insights, alerts] = await Promise.all([
    db.aiInsight.findMany({
      where: { organizationId, createdAt: { gte: start } },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
      take: 5,
      include: { app: { select: { name: true } } },
    }),
    db.alertEvent.findMany({
      where: {
        rule: { organizationId },
        isTest: false,
        triggeredAt: { gte: start },
      },
      orderBy: { triggeredAt: "desc" },
      take: 5,
      include: { rule: { select: { name: true, severity: true } } },
    }),
  ]);

  const anyMovement = digestApps.some(
    (app) =>
      app.metrics.some((m) => m.changePct !== null && Math.abs(m.changePct) >= 1) ||
      app.rank.improved > 0 ||
      app.rank.declined > 0 ||
      app.reviews.count > 0 ||
      app.listingChanged,
  );

  return {
    organizationName: organization.name,
    cadence: opts.days === 1 ? "Daily" : "Weekly",
    range: { start: ymd(start), end: ymd(end), days: opts.days },
    apps: digestApps,
    insights: insights.map((i) => ({
      title: i.title,
      summary: i.summary,
      severity: i.severity,
      appName: i.app?.name ?? null,
    })),
    alerts: alerts.map((a) => ({
      name: a.rule.name,
      message: a.message,
      severity: a.rule.severity,
    })),
    isQuiet: !anyMovement && insights.length === 0 && alerts.length === 0,
  };
}

/** Plain-text rendering, which is what an email body and a Slack post both need. */
export function renderDigestText(data: DigestData): string {
  const lines: string[] = [
    `${data.cadence} summary — ${data.organizationName}`,
    `${data.range.start} to ${data.range.end}`,
    "",
  ];

  if (data.isQuiet) {
    lines.push(
      "Nothing moved this period: no meaningful metric change, no rank movement, no new reviews, no alerts.",
      "",
      "That is a real result, not a missing report.",
      "",
    );
  }

  for (const app of data.apps) {
    lines.push(`## ${app.name} (${app.platform === "IOS" ? "App Store" : "Google Play"})`);

    const withData = app.metrics.filter((m) => m.hasData);
    if (withData.length === 0) {
      lines.push("  No metrics synced for this period.");
    } else {
      for (const metric of withData) {
        lines.push(
          `  ${METRIC_META[metric.metric].label}: ${formatMetric(metric.metric, metric.value)} (${formatDelta(metric.changePct)})`,
        );
      }
    }

    if (app.rank.improved || app.rank.declined) {
      lines.push(`  Keywords: ${app.rank.improved} up, ${app.rank.declined} down`);
    }
    if (app.rank.best) {
      lines.push(`  Best rank: #${app.rank.best.rank} for "${app.rank.best.term}"`);
    }
    if (app.chart) {
      lines.push(
        `  Chart: #${app.chart.rank} in ${app.chart.category} (${app.chart.country.toUpperCase()})`,
      );
    }
    if (app.reviews.count) {
      lines.push(
        `  Reviews: ${app.reviews.count}${
          app.reviews.average ? `, avg ${app.reviews.average.toFixed(2)}` : ""
        }, ${app.reviews.negative} negative, ${app.reviews.unreplied} unanswered`,
      );
    }
    if (app.listingChanged) {
      lines.push("  Listing text changed during this period.");
    }
    lines.push("");
  }

  if (data.alerts.length) {
    lines.push("## Alerts that fired");
    for (const alert of data.alerts) {
      lines.push(`  [${alert.severity}] ${alert.name}: ${alert.message}`);
    }
    lines.push("");
  }

  if (data.insights.length) {
    lines.push("## New insights");
    for (const insight of data.insights) {
      lines.push(
        `  [${insight.severity}] ${insight.appName ? `${insight.appName} — ` : ""}${insight.title}`,
      );
      lines.push(`    ${insight.summary}`);
    }
    lines.push("");
  }

  lines.push(`${env.APP_URL}/dashboard`);
  return lines.join("\n");
}

/** Channels are stored in the same shape as an alert rule's. */
export function digestChannels(raw: unknown) {
  return parseChannels(raw);
}
