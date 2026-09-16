import "server-only";

import { MetricKey } from "@prisma/client";

import { toCsv } from "@/lib/csv";
import { dateRange, METRIC_META, ymd } from "@aso/shared";
import { db } from "@/server/db";
import { parseDimension } from "@/server/integrations/types";

export const EXPORT_TYPES = ["metrics", "keywords", "reviews", "charts", "changes"] as const;
export type ExportType = (typeof EXPORT_TYPES)[number];

export type ExportResult = {
  filename: string;
  contentType: string;
  body: string;
};

/**
 * Builds one export.
 *
 * Rows are flattened deliberately: an export is opened in a spreadsheet, so a
 * nested object in a cell is useless. Dimensions become their own columns.
 */
export async function buildExport(opts: {
  type: ExportType;
  appId: string;
  organizationId: string;
  days: number;
  format: "csv" | "json";
}): Promise<ExportResult> {
  const app = await db.app.findFirst({
    where: { id: opts.appId, organizationId: opts.organizationId },
  });
  if (!app) throw new Error(`No app with id "${opts.appId}"`);

  const { start, end } = dateRange(opts.days);
  const rows = await collect(opts.type, opts.appId, start, end);

  const slug = app.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  const filename = `${slug}-${opts.type}-${ymd(start)}-to-${ymd(end)}.${opts.format}`;

  return opts.format === "json"
    ? {
        filename,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify(
          {
            app: { id: app.id, name: app.name, platform: app.platform },
            range: { start: ymd(start), end: ymd(end) },
            type: opts.type,
            rows,
          },
          null,
          2,
        ),
      }
    : {
        filename,
        contentType: "text/csv; charset=utf-8",
        // A BOM so Excel opens UTF-8 correctly — without it, accented app
        // names and non-Latin review text render as mojibake.
        body: `﻿${toCsv(rows)}`,
      };
}

async function collect(
  type: ExportType,
  appId: string,
  start: Date,
  end: Date,
): Promise<Record<string, unknown>[]> {
  switch (type) {
    case "metrics": {
      const points = await db.metricPoint.findMany({
        where: { appId, date: { gte: start, lte: end } },
        orderBy: [{ date: "asc" }, { metric: "asc" }],
      });

      return points.map((point) => {
        const dimensions = parseDimension(point.dimension);
        return {
          date: ymd(point.date),
          metric: point.metric,
          label: METRIC_META[point.metric as MetricKey]?.label ?? point.metric,
          value: point.value,
          unit: METRIC_META[point.metric as MetricKey]?.unit ?? "",
          source: point.source,
          currency: point.currency ?? "",
          // Flattened so a spreadsheet can filter on them.
          country: dimensions.country ?? "",
          campaign: dimensions.campaign ?? "",
        };
      });
    }

    case "keywords": {
      const keywords = await db.keyword.findMany({
        where: { appId },
        include: {
          ranks: { where: { date: { gte: start, lte: end } }, orderBy: { date: "asc" } },
          metrics: { orderBy: { date: "desc" }, take: 1 },
        },
        orderBy: { term: "asc" },
      });

      // One row per keyword per day, so the export is chartable rather than a
      // snapshot that loses the history.
      return keywords.flatMap((keyword) =>
        keyword.ranks.map((rank) => ({
          date: ymd(rank.date),
          term: keyword.term,
          country: keyword.country,
          locale: keyword.locale,
          source: keyword.source,
          rank: rank.rank ?? "",
          previousRank: rank.prevRank ?? "",
          popularity: keyword.metrics[0]?.popularity ?? "",
          difficulty: keyword.metrics[0]?.difficulty ?? "",
          opportunity: keyword.metrics[0]?.opportunity ?? "",
        })),
      );
    }

    case "reviews": {
      const reviews = await db.review.findMany({
        where: { appId, submittedAt: { gte: start, lte: end } },
        orderBy: { submittedAt: "desc" },
      });

      return reviews.map((review) => ({
        submittedAt: review.submittedAt.toISOString(),
        rating: review.rating,
        title: review.title ?? "",
        body: review.body ?? "",
        author: review.authorName ?? "",
        country: review.country ?? "",
        appVersion: review.appVersion ?? "",
        sentiment: review.sentiment ?? "",
        topics: review.topics.join("; "),
        developerReply: review.developerReply ?? "",
        repliedAt: review.repliedAt?.toISOString() ?? "",
        source: review.source,
      }));
    }

    case "charts": {
      const ranks = await db.chartRank.findMany({
        where: { appId, date: { gte: start, lte: end } },
        orderBy: [{ date: "asc" }, { chart: "asc" }],
      });

      return ranks.map((rank) => ({
        date: ymd(rank.date),
        country: rank.country,
        chart: rank.chart,
        category: rank.category,
        rank: rank.rank ?? "",
        previousRank: rank.prevRank ?? "",
        scanDepth: rank.scanDepth,
      }));
    }

    case "changes": {
      const listings = await db.storeListing.findMany({
        where: { appId, capturedAt: { gte: start } },
        orderBy: { capturedAt: "asc" },
      });

      return listings.map((listing) => ({
        capturedAt: listing.capturedAt.toISOString(),
        country: listing.country,
        locale: listing.locale,
        title: listing.title ?? "",
        subtitle: listing.subtitle ?? "",
        keywordField: listing.keywordField ?? "",
        shortDescription: listing.shortDescription ?? "",
        version: listing.version ?? "",
        screenshotCount: listing.screenshotCount ?? 0,
        hasVideo: listing.hasVideo,
        ratingAverage: listing.ratingAverage ?? "",
        ratingCount: listing.ratingCount ?? "",
      }));
    }
  }
}
