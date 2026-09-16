import "server-only";

import { MetricKey, type StoreListing } from "@prisma/client";

import { mean, pctChange, todayUtc, toUtcDate } from "@aso/shared";
import { db } from "@/server/db";

/**
 * Metadata change impact.
 *
 * StoreListing rows are only written when the listing text actually changed,
 * so consecutive rows are a change log. This turns that log into "you changed
 * the subtitle on the 3rd, and here is what moved afterwards" — which is the
 * question ASO work exists to answer, and the one a spreadsheet cannot.
 */

export type ListingField =
  | "title"
  | "subtitle"
  | "keywordField"
  | "shortDescription"
  | "fullDescription"
  | "whatsNew"
  | "version"
  | "screenshotCount"
  | "hasVideo"
  | "iconUrl";

export type FieldDiff = {
  field: ListingField;
  label: string;
  before: string | null;
  after: string | null;
  /** Character delta for text fields; count delta for screenshots. */
  delta: number | null;
  /** A version bump alone is a release, not an ASO edit. */
  isCosmetic: boolean;
};

const FIELD_LABELS: Record<ListingField, string> = {
  title: "Title",
  subtitle: "Subtitle",
  keywordField: "Keyword field",
  shortDescription: "Short description",
  fullDescription: "Long description",
  whatsNew: "What's new",
  version: "Version",
  screenshotCount: "Screenshots",
  hasVideo: "Preview video",
  iconUrl: "Icon",
};

/** Fields whose movement does not by itself indicate an ASO experiment. */
const COSMETIC: ListingField[] = ["version", "whatsNew"];

function asString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value ? "yes" : "no";
  return String(value);
}

/** Field-level diff between two consecutive snapshots. */
export function diffListings(before: StoreListing, after: StoreListing): FieldDiff[] {
  const fields: ListingField[] = [
    "title",
    "subtitle",
    "keywordField",
    "shortDescription",
    "fullDescription",
    "whatsNew",
    "version",
    "screenshotCount",
    "hasVideo",
    "iconUrl",
  ];

  const diffs: FieldDiff[] = [];

  for (const field of fields) {
    const beforeValue = asString(before[field as keyof StoreListing]);
    const afterValue = asString(after[field as keyof StoreListing]);
    if (beforeValue === afterValue) continue;

    // Character delta only means something for text; for screenshots it is a
    // count, and for the icon it means nothing at all.
    let delta: number | null = null;
    if (field === "screenshotCount") {
      delta = Number(afterValue ?? 0) - Number(beforeValue ?? 0);
    } else if (field !== "hasVideo" && field !== "iconUrl") {
      delta = (afterValue?.length ?? 0) - (beforeValue?.length ?? 0);
    }

    diffs.push({
      field,
      label: FIELD_LABELS[field],
      before: beforeValue,
      after: afterValue,
      delta,
      isCosmetic: COSMETIC.includes(field),
    });
  }

  return diffs;
}

export type MetricImpact = {
  metric: MetricKey;
  before: number | null;
  after: number | null;
  changePct: number | null;
};

export type RankImpact = {
  /** Mean rank across tracked keywords. Lower is better, so a negative delta is an improvement. */
  before: number | null;
  after: number | null;
  /** Positive means the app moved up the results. */
  improvement: number | null;
  keywordsCompared: number;
};

export type ListingChange = {
  id: string;
  changedAt: Date;
  diffs: FieldDiff[];
  /** True when every changed field was cosmetic (a release, not an experiment). */
  isReleaseOnly: boolean;
  window: { days: number; daysObserved: number; isConclusive: boolean };
  metrics: MetricImpact[];
  rank: RankImpact;
};

const IMPACT_METRICS: MetricKey[] = [
  MetricKey.CONVERSION_RATE,
  MetricKey.INSTALLS,
  MetricKey.STORE_PAGE_VIEWS,
];

/**
 * A change needs this many days of data on each side before its numbers mean
 * anything. Below it the change is still listed, flagged as inconclusive —
 * hiding it would make the timeline look empty right after an edit, which is
 * exactly when someone goes looking.
 */
const MIN_DAYS_FOR_CONFIDENCE = 5;

/**
 * Builds the change timeline for an app, each entry annotated with what moved
 * afterwards.
 *
 * The comparison is symmetric: the same number of days before and after, so a
 * long-running upward trend does not read as an effect of every edit.
 */
export async function listingChanges(
  appId: string,
  opts: { windowDays?: number; limit?: number } = {},
): Promise<ListingChange[]> {
  const windowDays = opts.windowDays ?? 14;
  const limit = opts.limit ?? 20;

  const snapshots = await db.storeListing.findMany({
    where: { appId },
    orderBy: { capturedAt: "asc" },
  });

  if (snapshots.length < 2) return [];

  const pairs: { before: StoreListing; after: StoreListing }[] = [];
  for (let i = 1; i < snapshots.length; i++) {
    pairs.push({ before: snapshots[i - 1]!, after: snapshots[i]! });
  }

  const recent = pairs.slice(-limit).reverse();
  const today = todayUtc();

  const changes: ListingChange[] = [];

  for (const pair of recent) {
    const diffs = diffListings(pair.before, pair.after);
    if (diffs.length === 0) continue;

    const changedAt = toUtcDate(pair.after.capturedAt);
    const daysSince = Math.floor((today.getTime() - changedAt.getTime()) / 86_400_000);
    const daysObserved = Math.min(windowDays, Math.max(0, daysSince));

    const [metrics, rank] = await Promise.all([
      measureMetricImpact(appId, changedAt, windowDays),
      measureRankImpact(appId, changedAt, windowDays),
    ]);

    changes.push({
      id: pair.after.id,
      changedAt: pair.after.capturedAt,
      diffs,
      isReleaseOnly: diffs.every((d) => d.isCosmetic),
      window: {
        days: windowDays,
        daysObserved,
        isConclusive: daysObserved >= MIN_DAYS_FOR_CONFIDENCE,
      },
      metrics,
      rank,
    });
  }

  return changes;
}

async function measureMetricImpact(
  appId: string,
  changedAt: Date,
  windowDays: number,
): Promise<MetricImpact[]> {
  const beforeStart = new Date(changedAt.getTime() - windowDays * 86_400_000);
  const afterEnd = new Date(changedAt.getTime() + windowDays * 86_400_000);

  const rows = await db.metricPoint.findMany({
    where: {
      appId,
      dimension: "",
      metric: { in: IMPACT_METRICS },
      date: { gte: beforeStart, lte: afterEnd },
    },
    select: { date: true, metric: true, value: true },
  });

  return IMPACT_METRICS.map((metric) => {
    const forMetric = rows.filter((r) => r.metric === metric);

    // The change day itself belongs to neither window — a listing edited
    // mid-day produces a partial day on both sides of the boundary.
    const before = forMetric.filter((r) => r.date < changedAt).map((r) => r.value);
    const after = forMetric.filter((r) => r.date > changedAt).map((r) => r.value);

    const beforeValue = before.length ? mean(before) : null;
    const afterValue = after.length ? mean(after) : null;

    return {
      metric,
      before: beforeValue,
      after: afterValue,
      changePct:
        beforeValue !== null && afterValue !== null ? pctChange(beforeValue, afterValue) : null,
    };
  });
}

async function measureRankImpact(
  appId: string,
  changedAt: Date,
  windowDays: number,
): Promise<RankImpact> {
  const beforeStart = new Date(changedAt.getTime() - windowDays * 86_400_000);
  const afterEnd = new Date(changedAt.getTime() + windowDays * 86_400_000);

  const ranks = await db.keywordRank.findMany({
    where: {
      keyword: { appId, isTracked: true },
      date: { gte: beforeStart, lte: afterEnd },
      // A null rank means "outside the scanned results", which cannot be
      // averaged — including it as 100 would invent a number.
      rank: { not: null },
    },
    select: { date: true, rank: true, keywordId: true },
  });

  const before = ranks.filter((r) => r.date < changedAt);
  const after = ranks.filter((r) => r.date > changedAt);

  // Only keywords present on both sides are comparable; a keyword added after
  // the change would otherwise skew the mean.
  const beforeKeywords = new Set(before.map((r) => r.keywordId));
  const afterKeywords = new Set(after.map((r) => r.keywordId));
  const shared = [...beforeKeywords].filter((id) => afterKeywords.has(id));

  if (shared.length === 0) {
    return { before: null, after: null, improvement: null, keywordsCompared: 0 };
  }

  const beforeMean = mean(before.filter((r) => shared.includes(r.keywordId)).map((r) => r.rank!));
  const afterMean = mean(after.filter((r) => shared.includes(r.keywordId)).map((r) => r.rank!));

  return {
    before: beforeMean,
    after: afterMean,
    // Rank 1 is best, so a drop in the number is an improvement.
    improvement: beforeMean - afterMean,
    keywordsCompared: shared.length,
  };
}
