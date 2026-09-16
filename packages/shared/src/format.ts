// Type-only on purpose: this keeps the Prisma runtime out of any bundle that
// imports this package, which matters for a React Native app.
import type { MetricKey } from "@prisma/client";

type Unit = "number" | "currency" | "percent" | "duration";

/**
 * How a metric collapses across days, campaigns and sources.
 *
 * Declared per metric rather than inferred from the unit, because the two do
 * not line up: ROAS is a percent that averages, CPI is a currency that also
 * averages, and installs is a plain number that sums. Inferring it meant every
 * new ratio metric was silently summed until someone noticed.
 */
type Aggregation = "sum" | "average";

export const METRIC_META: Record<
  MetricKey,
  {
    label: string;
    unit: Unit;
    group: string;
    higherIsBetter: boolean;
    aggregation: Aggregation;
  }
> = {
  IMPRESSIONS: { label: "Impressions", unit: "number", group: "Acquisition", higherIsBetter: true, aggregation: "sum" },
  STORE_PAGE_VIEWS: { label: "Store page views", unit: "number", group: "Acquisition", higherIsBetter: true, aggregation: "sum" },
  INSTALLS: { label: "Installs", unit: "number", group: "Acquisition", higherIsBetter: true, aggregation: "sum" },
  UNINSTALLS: { label: "Uninstalls", unit: "number", group: "Acquisition", higherIsBetter: false, aggregation: "sum" },
  CONVERSION_RATE: { label: "Conversion rate", unit: "percent", group: "Acquisition", higherIsBetter: true, aggregation: "average" },
  ACTIVE_USERS_DAILY: { label: "DAU", unit: "number", group: "Engagement", higherIsBetter: true, aggregation: "average" },
  ACTIVE_USERS_MONTHLY: { label: "MAU", unit: "number", group: "Engagement", higherIsBetter: true, aggregation: "average" },
  SESSIONS: { label: "Sessions", unit: "number", group: "Engagement", higherIsBetter: true, aggregation: "sum" },
  SESSION_DURATION_AVG: { label: "Avg session", unit: "duration", group: "Engagement", higherIsBetter: true, aggregation: "average" },
  RETENTION_D1: { label: "D1 retention", unit: "percent", group: "Engagement", higherIsBetter: true, aggregation: "average" },
  RETENTION_D7: { label: "D7 retention", unit: "percent", group: "Engagement", higherIsBetter: true, aggregation: "average" },
  RETENTION_D30: { label: "D30 retention", unit: "percent", group: "Engagement", higherIsBetter: true, aggregation: "average" },
  CRASH_FREE_USERS: { label: "Crash-free users", unit: "percent", group: "Quality", higherIsBetter: true, aggregation: "average" },
  AD_REVENUE: { label: "Ad revenue", unit: "currency", group: "Monetization", higherIsBetter: true, aggregation: "sum" },
  AD_IMPRESSIONS: { label: "Ad impressions", unit: "number", group: "Monetization", higherIsBetter: true, aggregation: "sum" },
  AD_CLICKS: { label: "Ad clicks", unit: "number", group: "Monetization", higherIsBetter: true, aggregation: "sum" },
  AD_ECPM: { label: "eCPM", unit: "currency", group: "Monetization", higherIsBetter: true, aggregation: "average" },
  AD_FILL_RATE: { label: "Fill rate", unit: "percent", group: "Monetization", higherIsBetter: true, aggregation: "average" },
  IAP_REVENUE: { label: "IAP revenue", unit: "currency", group: "Monetization", higherIsBetter: true, aggregation: "sum" },
  TOTAL_REVENUE: { label: "Total revenue", unit: "currency", group: "Monetization", higherIsBetter: true, aggregation: "sum" },
  ARPDAU: { label: "ARPDAU", unit: "currency", group: "Monetization", higherIsBetter: true, aggregation: "average" },
  SPEND: { label: "Ad spend", unit: "currency", group: "Paid acquisition", higherIsBetter: false, aggregation: "sum" },
  PAID_INSTALLS: { label: "Paid installs", unit: "number", group: "Paid acquisition", higherIsBetter: true, aggregation: "sum" },
  ORGANIC_INSTALLS: { label: "Organic installs", unit: "number", group: "Acquisition", higherIsBetter: true, aggregation: "sum" },
  PAID_CLICKS: { label: "Paid clicks", unit: "number", group: "Paid acquisition", higherIsBetter: true, aggregation: "sum" },
  CPI: { label: "CPI", unit: "currency", group: "Paid acquisition", higherIsBetter: false, aggregation: "average" },
  CPC: { label: "CPC", unit: "currency", group: "Paid acquisition", higherIsBetter: false, aggregation: "average" },
  ROAS: { label: "ROAS", unit: "percent", group: "Paid acquisition", higherIsBetter: true, aggregation: "average" },
  RATING_AVERAGE: { label: "Average rating", unit: "number", group: "Reputation", higherIsBetter: true, aggregation: "average" },
  RATING_COUNT: { label: "Ratings", unit: "number", group: "Reputation", higherIsBetter: true, aggregation: "sum" },
  REVIEW_COUNT: { label: "Reviews", unit: "number", group: "Reputation", higherIsBetter: true, aggregation: "sum" },
};

export function formatNumber(value: number, maximumFractionDigits = 0): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(value);
}

export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function formatCurrency(value: number, currency = "USD"): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: Math.abs(value) < 10 ? 2 : 0,
  }).format(value);
}

export function formatPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/**
 * The metric keys, derived from METRIC_META rather than from Prisma.
 *
 * Lets a consumer with no Prisma dependency — the mobile app — still be typed
 * against the real key set. The `Record<MetricKey, …>` on METRIC_META keeps the
 * two in step: a key missing from the metadata is a compile error here.
 */
export type MetricKeyName = keyof typeof METRIC_META;

export function formatMetric(metric: MetricKey, value: number, currency = "USD"): string {
  switch (METRIC_META[metric].unit) {
    case "currency":
      return formatCurrency(value, currency);
    case "percent":
      return formatPercent(value);
    case "duration":
      return formatDuration(value);
    default:
      return formatCompact(value);
  }
}

/** Human phrasing for a percentage move, used in alert and insight copy. */
export function pctChangeLabel(pct: number): string {
  const direction = pct >= 0 ? "up" : "down";
  return `${direction} ${Math.abs(pct).toFixed(1)}%`;
}

export function formatDelta(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return "—";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

/**
 * A drop in uninstalls or CPI is good news. This decides the colour, so it has
 * to consult the metric's direction rather than the sign alone.
 */
export function deltaTone(metric: MetricKey, pct: number | null): "up" | "down" | "flat" {
  if (pct === null || Math.abs(pct) < 0.5) return "flat";
  const good = METRIC_META[metric].higherIsBetter ? pct > 0 : pct < 0;
  return good ? "up" : "down";
}
