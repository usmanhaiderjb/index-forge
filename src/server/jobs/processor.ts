import "server-only";

import type { Job } from "bullmq";

import { discoverConnectionResources, syncConnection } from "@/server/jobs/handlers/connection";
import {
  syncChartRanks,
  syncCompetitors,
  syncListing,
  syncRanks,
} from "@/server/jobs/handlers/aso";
import {
  classifyReviewJob,
  evaluateAlerts,
  generateInsights,
} from "@/server/jobs/handlers/insights";
import { sendDigest } from "@/server/jobs/handlers/digest";
import { handlePushSend } from "@/server/jobs/handlers/push";
import { handleCorpusCrawl, handleCorpusEstimate } from "@/server/jobs/handlers/corpus";
import { handleMarketNiche, handleMarketScan } from "@/server/jobs/handlers/market";
import { deriveMetrics } from "@/server/metrics/derive";
import { scheduleTick } from "@/server/jobs/handlers/schedule";
import { deliverAlert } from "@/server/notify";
import { db } from "@/server/db";
import { PROVIDERS_WITH_REVIEWS } from "@/server/integrations/service";
import type { JobData } from "@/server/jobs/queues";

/**
 * Reviews arrive through whichever connection owns the app's store listing,
 * so this resolves the app back to its review-capable connections.
 */
async function syncAppReviews(appId: string) {
  const links = await db.resourceLink.findMany({
    where: {
      appId,
      connection: { provider: { in: PROVIDERS_WITH_REVIEWS }, status: "ACTIVE" },
    },
    select: { connectionId: true },
  });

  const seen = new Set<string>();
  for (const link of links) {
    if (seen.has(link.connectionId)) continue;
    seen.add(link.connectionId);
    await syncConnection(link.connectionId, 7);
  }

  return { connections: seen.size };
}

/** Single entry point for every job type. The switch is exhaustive by design. */
export async function processJob(job: Job<JobData>): Promise<unknown> {
  const data = job.data;

  switch (data.type) {
    case "connection.sync":
      return syncConnection(data.connectionId, data.days ?? 30);
    case "connection.discover":
      return discoverConnectionResources(data.connectionId);
    case "app.listing":
      return syncListing(data.appId);
    case "app.ranks":
      return syncRanks(data.appId);
    case "app.charts":
      return syncChartRanks(data.appId);
    case "app.derive":
      return deriveMetrics(data.appId, { days: data.days });
    case "app.reviews":
      return syncAppReviews(data.appId);
    case "app.competitors":
      return syncCompetitors(data.appId, { discover: true });
    case "review.classify":
      return classifyReviewJob(data.reviewId);
    case "ai.insights":
      return generateInsights(data.appId);
    case "alerts.evaluate":
      return evaluateAlerts(data.organizationId);
    case "alert.deliver":
      return deliverAlert(data.eventId);
    case "digest.send":
      return sendDigest(data.digestId);
    case "push.send":
      return handlePushSend(data.campaignId);
    case "corpus.crawl":
      return handleCorpusCrawl(data.prefix, data.platform, data.country);
    case "corpus.estimate":
      return handleCorpusEstimate();
    case "market.niche":
      return handleMarketNiche(data);
    case "market.scan":
      return handleMarketScan(data.depth);
    case "schedule.tick":
      return scheduleTick();
  }
}
