import "server-only";

import { type MetricKey, type Severity } from "@prisma/client";

import { dateRange, formatMetric, METRIC_META, pctChangeLabel, previousPeriod, ymd } from "@aso/shared";
import { classifyReview, explainAnomaly, generateRecommendations, summarizeReviewThemes } from "@/server/ai/engine";
import { AiBudgetExceededError, AiNotConfiguredError, aiConfigured } from "@/server/ai/client";
import { db } from "@/server/db";
import { enqueue } from "@/server/jobs/queues";
import { withSyncRun } from "@/server/jobs/run";

/** Classifies a single freshly-ingested review. */
export async function classifyReviewJob(reviewId: string) {
  if (!aiConfigured()) return;

  const review = await db.review.findUnique({
    where: { id: reviewId },
    include: { app: { select: { organizationId: true } } },
  });
  if (!review || review.analyzedAt) return;

  try {
    const { data } = await classifyReview(review.app.organizationId, {
      rating: review.rating,
      title: review.title,
      body: review.body,
    });

    await db.review.update({
      where: { id: reviewId },
      data: {
        sentiment: data.sentiment,
        topics: data.topics.slice(0, 6),
        analyzedAt: new Date(),
      },
    });
  } catch (error) {
    if (error instanceof AiBudgetExceededError || error instanceof AiNotConfiguredError) {
      // Fall back to the star rating so the dashboard is never empty.
      await db.review.update({
        where: { id: reviewId },
        data: {
          sentiment: review.rating >= 4 ? "POSITIVE" : review.rating <= 2 ? "NEGATIVE" : "NEUTRAL",
          analyzedAt: new Date(),
        },
      });
      return;
    }
    throw error;
  }
}

/**
 * The nightly insight pass for one app: detects metric anomalies numerically,
 * asks the model to explain only the ones that cleared the threshold, then
 * refreshes review themes and the recommendation list.
 */
export async function generateInsights(appId: string) {
  const app = await db.app.findUniqueOrThrow({ where: { id: appId } });

  return withSyncRun({ job: "ai.insights", appId }, async (record) => {
    if (!aiConfigured()) {
      throw new AiNotConfiguredError();
    }

    let written = 0;
    const anomalies = await detectAnomalies(appId);
    record.read(anomalies.length);

    for (const anomaly of anomalies.slice(0, 3)) {
      const { data, model } = await explainAnomaly(app.organizationId, appId, {
        metric: anomaly.metric,
        current: anomaly.current,
        baseline: anomaly.baseline,
        windowDays: 14,
        series: anomaly.series,
      });

      await db.aiInsight.create({
        data: {
          organizationId: app.organizationId,
          appId,
          type: anomaly.metric === "CONVERSION_RATE" ? "CONVERSION_DROP" : "REVENUE_ANOMALY",
          severity: data.severity,
          title: data.headline,
          summary: data.explanation,
          detail: [
            "## Likely causes",
            ...data.likelyCauses.map((c) => `- **${c.confidence}** — ${c.cause}`),
            "",
            "## What to check",
            ...data.checks.map((c, i) => `${i + 1}. ${c}`),
          ].join("\n"),
          evidence: {
            metric: anomaly.metric,
            current: anomaly.current,
            baseline: anomaly.baseline,
            changePct: anomaly.changePct,
          } as never,
          model,
        },
      });
      written++;
    }

    // Review themes, only when there is enough new material to be worth it.
    const recentReviews = await db.review.count({
      where: { appId, submittedAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
    });

    if (recentReviews >= 10) {
      const { data, model } = await summarizeReviewThemes(app.organizationId, appId, 30);

      const worst = data.themes
        .filter((t) => t.sentiment === "NEGATIVE")
        .sort((a, b) => b.mentionCount - a.mentionCount)[0];

      await db.aiInsight.create({
        data: {
          organizationId: app.organizationId,
          appId,
          type: "REVIEW_THEME",
          severity: (worst?.severity ?? "INFO") as Severity,
          title: worst
            ? `${worst.theme} raised in ${worst.mentionCount} recent reviews`
            : "Review themes for the last 30 days",
          summary: data.summary,
          detail: data.themes
            .map(
              (t) =>
                `### ${t.theme} (${t.sentiment}, ${t.mentionCount} mentions)\n> ${t.exampleQuote}\n\n${t.recommendation}`,
            )
            .join("\n\n"),
          evidence: { themes: data.themes } as never,
          model,
        },
      });
      written++;
    }

    // Refresh the recommendation list.
    const { data: recs, model: recModel } = await generateRecommendations(app.organizationId, appId);

    for (const rec of recs.recommendations) {
      const existing = await db.aiRecommendation.findFirst({
        where: { appId, title: rec.title, status: { in: ["OPEN", "IN_PROGRESS"] } },
      });
      if (existing) continue;

      await db.aiRecommendation.create({
        data: {
          appId,
          category: rec.category,
          title: rec.title,
          rationale: rec.rationale,
          impact: Math.min(5, Math.max(1, rec.impact)),
          effort: Math.min(5, Math.max(1, rec.effort)),
          priority: rec.impact * 10 - rec.effort * 3,
          actions: rec.actions as never,
        },
      });
      written++;
    }

    void recModel;
    record.wrote(written);
  });
}

type Anomaly = {
  metric: MetricKey;
  current: number;
  baseline: number;
  changePct: number;
  series: { date: Date; value: number }[];
};

/**
 * Numeric anomaly detection — deliberately not AI. A 14-day window is compared
 * against the preceding 14 days, and only changes past a per-metric threshold
 * are surfaced. This keeps the AI spend on explanation, not detection.
 */
export async function detectAnomalies(appId: string): Promise<Anomaly[]> {
  const WATCHED: { metric: MetricKey; thresholdPct: number }[] = [
    { metric: "INSTALLS", thresholdPct: 20 },
    { metric: "CONVERSION_RATE", thresholdPct: 15 },
    { metric: "TOTAL_REVENUE", thresholdPct: 20 },
    { metric: "AD_REVENUE", thresholdPct: 25 },
    { metric: "ACTIVE_USERS_DAILY", thresholdPct: 20 },
    { metric: "RATING_AVERAGE", thresholdPct: 5 },
    { metric: "CRASH_FREE_USERS", thresholdPct: 2 },
  ];

  const { start, end } = dateRange(14);
  const prior = previousPeriod(start, end);
  const anomalies: Anomaly[] = [];

  for (const { metric, thresholdPct } of WATCHED) {
    const [currentRows, priorRows] = await Promise.all([
      db.metricPoint.findMany({
        where: { appId, metric, dimension: "", date: { gte: start, lte: end } },
        orderBy: { date: "asc" },
        select: { date: true, value: true },
      }),
      db.metricPoint.findMany({
        where: { appId, metric, dimension: "", date: { gte: prior.start, lte: prior.end } },
        select: { value: true },
      }),
    ]);

    // Fewer than a week of data on either side is not a trend.
    if (currentRows.length < 7 || priorRows.length < 7) continue;

    const isRate = METRIC_META[metric].unit === "percent" || metric === "RATING_AVERAGE";
    const aggregate = (values: number[]) =>
      isRate ? values.reduce((a, b) => a + b, 0) / values.length : values.reduce((a, b) => a + b, 0);

    const current = aggregate(currentRows.map((r) => r.value));
    const baseline = aggregate(priorRows.map((r) => r.value));
    if (baseline === 0) continue;

    const changePct = ((current - baseline) / Math.abs(baseline)) * 100;
    if (Math.abs(changePct) < thresholdPct) continue;

    anomalies.push({ metric, current, baseline, changePct, series: currentRows });
  }

  return anomalies.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
}

/** Evaluates alert rules and opens events for the ones that fire. */
export async function evaluateAlerts(organizationId?: string) {
  const rules = await db.alertRule.findMany({
    where: { isEnabled: true, ...(organizationId ? { organizationId } : {}) },
    include: { app: true },
  });

  let fired = 0;

  for (const rule of rules) {
    const appIds = rule.appId
      ? [rule.appId]
      : (await db.app.findMany({ where: { organizationId: rule.organizationId, isActive: true } })).map(
          (a) => a.id,
        );

    for (const appId of appIds) {
      const { start, end } = dateRange(rule.windowDays);
      const prior = previousPeriod(start, end);

      const [currentRows, priorRows] = await Promise.all([
        db.metricPoint.findMany({
          where: { appId, metric: rule.metric, dimension: "", date: { gte: start, lte: end } },
          select: { value: true },
        }),
        db.metricPoint.findMany({
          where: {
            appId,
            metric: rule.metric,
            dimension: "",
            date: { gte: prior.start, lte: prior.end },
          },
          select: { value: true },
        }),
      ]);

      if (currentRows.length === 0) continue;

      const isRate = METRIC_META[rule.metric].unit === "percent";
      const aggregate = (values: number[]) =>
        isRate && values.length
          ? values.reduce((a, b) => a + b, 0) / values.length
          : values.reduce((a, b) => a + b, 0);

      const current = aggregate(currentRows.map((r) => r.value));
      const baseline = priorRows.length ? aggregate(priorRows.map((r) => r.value)) : null;

      let triggered = false;
      let message = "";

      switch (rule.comparator) {
        case "GT":
          triggered = current > rule.threshold;
          message = `${METRIC_META[rule.metric].label} is ${formatMetric(rule.metric, current)}, above the ${formatMetric(rule.metric, rule.threshold)} threshold.`;
          break;
        case "LT":
          triggered = current < rule.threshold;
          message = `${METRIC_META[rule.metric].label} is ${formatMetric(rule.metric, current)}, below the ${formatMetric(rule.metric, rule.threshold)} threshold.`;
          break;
        case "PCT_CHANGE_UP":
        case "PCT_CHANGE_DOWN": {
          if (baseline === null || baseline === 0) break;
          const change = ((current - baseline) / Math.abs(baseline)) * 100;
          triggered =
            rule.comparator === "PCT_CHANGE_UP"
              ? change >= rule.threshold
              : change <= -rule.threshold;
          message = `${METRIC_META[rule.metric].label} moved ${pctChangeLabel(change)} over ${rule.windowDays} day(s), from ${formatMetric(rule.metric, baseline)} to ${formatMetric(rule.metric, current)}.`;
          break;
        }
      }

      await db.alertRule.update({
        where: { id: rule.id },
        data: { lastEvaluatedAt: new Date() },
      });

      if (!triggered) continue;

      // One open event per rule at a time — re-firing daily is noise.
      const open = await db.alertEvent.findFirst({
        where: { ruleId: rule.id, status: { in: ["TRIGGERED", "ACKNOWLEDGED"] } },
      });
      if (open) continue;

      const event = await db.alertEvent.create({
        data: {
          ruleId: rule.id,
          value: current,
          baseline,
          message: `${rule.app?.name ?? "App"} — ${message} (as of ${ymd(end)})`,
        },
      });

      // Delivery is its own job so a slow or failing webhook cannot stall the
      // evaluation of the remaining rules, and so it retries independently.
      await enqueue({ type: "alert.deliver", eventId: event.id });
      fired++;
    }
  }

  return { rules: rules.length, fired };
}
