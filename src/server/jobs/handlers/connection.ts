import "server-only";

import { chunk, dateRange, toUtcDate } from "@aso/shared";
import { db } from "@/server/db";
import { getConnector } from "@/server/integrations/registry";
import { loadCredentials, recordConnectionError } from "@/server/integrations/service";
import { withSyncRun } from "@/server/jobs/run";
import { enqueue } from "@/server/jobs/queues";
import type { MetricRow, ReviewRow } from "@/server/integrations/types";

/**
 * Pulls metrics (and reviews, where the provider has them) for every app
 * linked to a connection. One SyncRun per connection, not per app, so a
 * partial failure is visible as PARTIAL rather than disappearing.
 */
export async function syncConnection(connectionId: string, days = 30) {
  const connection = await db.connection.findUnique({
    where: { id: connectionId },
    include: { resourceLinks: { include: { app: true } } },
  });

  if (!connection) throw new Error(`Connection ${connectionId} not found`);
  if (connection.status === "DISABLED") return;

  const connector = getConnector(connection.provider);
  const { start, end } = dateRange(days);

  return withSyncRun(
    { job: `${connection.provider.toLowerCase()}.sync`, connectionId, meta: { days } },
    async (record) => {
      const credentials = loadCredentials(connection);
      const failures: string[] = [];

      for (const link of connection.resourceLinks) {
        const ctx = {
          connection,
          credentials,
          externalId: link.externalId,
          externalRef: link.externalRef,
          start,
          end,
          linkMetadata: (link.metadata ?? null) as Record<string, unknown> | null,
        };

        try {
          const rows = await connector.fetchMetrics(ctx);
          record.read(rows.length);
          record.wrote(await writeMetrics(link.appId, connector.source, rows));
        } catch (error) {
          failures.push(
            `${link.app.name}: ${error instanceof Error ? error.message : String(error)}`,
          );
          await recordConnectionError(connectionId, error);
        }

        if (connector.fetchReviews) {
          try {
            const reviews = await connector.fetchReviews(ctx);
            record.read(reviews.length);
            record.wrote(await writeReviews(link.appId, connector.source, reviews));
          } catch (error) {
            failures.push(
              `${link.app.name} reviews: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
      }

      await db.connection.update({
        where: { id: connectionId },
        data: {
          lastSyncedAt: new Date(),
          ...(failures.length === 0 ? { status: "ACTIVE", lastError: null, errorCount: 0 } : {}),
        },
      });

      // Derived metrics depend on what this sync just wrote — organic installs
      // cannot be computed until both the console and the ad totals are in.
      for (const appId of new Set(connection.resourceLinks.map((link) => link.appId))) {
        await enqueue(
          { type: "app.derive", appId, days },
          { jobId: `app.derive-${appId}-${Date.now()}` },
        );
      }

      if (failures.length > 0 && failures.length === connection.resourceLinks.length) {
        throw new Error(failures.join(" | "));
      }
    },
  );
}

/** Upserts in batches — a 30-day pull across countries is thousands of rows. */
async function writeMetrics(
  appId: string,
  source: Awaited<ReturnType<typeof getConnector>>["source"],
  rows: MetricRow[],
): Promise<number> {
  let written = 0;

  for (const batch of chunk(rows, 200)) {
    await db.$transaction(
      batch.map((row) =>
        db.metricPoint.upsert({
          where: {
            appId_date_source_metric_dimension: {
              appId,
              date: toUtcDate(row.date),
              source,
              metric: row.metric,
              dimension: row.dimension ?? "",
            },
          },
          create: {
            appId,
            date: toUtcDate(row.date),
            source,
            metric: row.metric,
            dimension: row.dimension ?? "",
            value: row.value,
            currency: row.currency,
            meta: (row.meta ?? undefined) as never,
          },
          update: {
            value: row.value,
            currency: row.currency,
            meta: (row.meta ?? undefined) as never,
          },
        }),
      ),
    );
    written += batch.length;
  }

  return written;
}

async function writeReviews(
  appId: string,
  source: Awaited<ReturnType<typeof getConnector>>["source"],
  reviews: ReviewRow[],
): Promise<number> {
  let written = 0;

  for (const batch of chunk(reviews, 100)) {
    const results = await db.$transaction(
      batch.map((review) =>
        db.review.upsert({
          where: {
            appId_source_externalId: { appId, source, externalId: review.externalId },
          },
          create: {
            appId,
            source,
            externalId: review.externalId,
            rating: review.rating,
            title: review.title,
            body: review.body,
            authorName: review.authorName,
            locale: review.locale,
            country: review.country,
            appVersion: review.appVersion,
            device: review.device,
            submittedAt: review.submittedAt,
            developerReply: review.developerReply,
            repliedAt: review.repliedAt,
          },
          update: {
            developerReply: review.developerReply,
            repliedAt: review.repliedAt,
          },
        }),
      ),
    );
    written += results.length;

    // Newly ingested reviews get classified asynchronously.
    for (const review of results) {
      if (!review.analyzedAt) {
        await enqueue({ type: "review.classify", reviewId: review.id }, { delay: 2000 });
      }
    }
  }

  return written;
}

/**
 * Refreshes the list of linkable resources and auto-links anything that
 * matches an existing app by store id or bundle id.
 */
export async function discoverConnectionResources(connectionId: string) {
  const connection = await db.connection.findUniqueOrThrow({ where: { id: connectionId } });
  const connector = getConnector(connection.provider);

  return withSyncRun({ job: `${connection.provider.toLowerCase()}.discover`, connectionId }, async (record) => {
    const credentials = loadCredentials(connection);
    const resources = await connector.listResources(credentials, connection);
    record.read(resources.length);

    const apps = await db.app.findMany({ where: { organizationId: connection.organizationId } });
    let linked = 0;

    for (const resource of resources) {
      const app =
        apps.find((a) => resource.storeId && a.storeId === resource.storeId) ??
        apps.find((a) => resource.bundleId && a.bundleId === resource.bundleId);

      if (!app) continue;

      await db.resourceLink.upsert({
        where: {
          connectionId_appId_externalId: {
            connectionId,
            appId: app.id,
            externalId: resource.externalId,
          },
        },
        create: {
          connectionId,
          appId: app.id,
          externalId: resource.externalId,
          externalRef: resource.externalRef,
          displayName: resource.name,
          metadata: (resource.metadata ?? undefined) as never,
        },
        update: {
          externalRef: resource.externalRef,
          displayName: resource.name,
          metadata: (resource.metadata ?? undefined) as never,
        },
      });
      linked++;
    }

    record.wrote(linked);
    return resources;
  });
}
