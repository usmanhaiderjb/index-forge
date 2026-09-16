import "server-only";

import { Queue, type JobsOptions } from "bullmq";

import { redis } from "@/server/redis";

export const QUEUE_NAME = "aso";

/**
 * All job payloads in one union so the worker's switch is exhaustive and a new
 * job type cannot be added without handling it.
 */
export type JobData =
  | { type: "connection.sync"; connectionId: string; days?: number }
  | { type: "connection.discover"; connectionId: string }
  | { type: "app.listing"; appId: string }
  | { type: "app.ranks"; appId: string }
  | { type: "app.charts"; appId: string }
  | { type: "app.derive"; appId: string; days?: number }
  | { type: "app.reviews"; appId: string }
  | { type: "app.competitors"; appId: string }
  | { type: "review.classify"; reviewId: string }
  | { type: "ai.insights"; appId: string }
  | { type: "alerts.evaluate"; organizationId?: string }
  | { type: "alert.deliver"; eventId: string }
  | { type: "digest.send"; digestId: string }
  | { type: "push.send"; campaignId: string }
  | { type: "corpus.crawl"; prefix: string; platform: "IOS" | "ANDROID"; country: string }
  | { type: "corpus.estimate" }
  | {
      type: "market.niche";
      category: string;
      label: string;
      organizationId: string;
    }
  | { type: "market.scan"; depth?: number }
  | { type: "schedule.tick" };

export type JobName = JobData["type"];

const DEFAULT_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 30_000 },
  removeOnComplete: { age: 86_400, count: 1000 },
  removeOnFail: { age: 7 * 86_400 },
};

const globalForQueue = globalThis as unknown as { asoQueue: Queue<JobData> | undefined };

/**
 * The queue is constructed on first use, not at import time.
 *
 * Routers import this module for `enqueue`, and a module-scope `new Queue()`
 * would open a Redis connection on every page render — including the many
 * renders that never enqueue anything. Redis is then only required by the
 * requests that actually queue work.
 */
export function getQueue(): Queue<JobData> {
  globalForQueue.asoQueue ??= new Queue<JobData>(QUEUE_NAME, {
    connection: redis,
    defaultJobOptions: DEFAULT_OPTIONS,
  });
  return globalForQueue.asoQueue;
}

/**
 * Enqueues a job with a deterministic id so a user mashing "sync now" does not
 * queue the same work five times.
 */
export async function enqueue(data: JobData, options: JobsOptions = {}) {
  const rawJobId = options.jobId ?? jobKey(data);
  const jobId = rawJobId ? String(rawJobId).replace(/:/g, "-") : undefined;
  try {
    return await getQueue().add(data.type, data, {
      ...options,
      jobId,
    });
  } catch (error) {
    // ioredis reports an unreachable server as "Connection is closed", which
    // tells the user nothing. Everything read-only keeps working without
    // Redis, so name the one thing that does not.
    const message = error instanceof Error ? error.message : String(error);
    if (
      /connection is closed|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|stream isn't writeable|command timed out|max retries|reached the max retries/i.test(
        message,
      )
    ) {
      throw new QueueUnavailableError();
    }
    throw error;
  }
}

/** Redis is down. Reads are unaffected; only queued background work is blocked. */
export class QueueUnavailableError extends Error {
  constructor() {
    super(
      "Background jobs are unavailable because Redis is not reachable. Start Redis, then try again — everything else on this page keeps working.",
    );
    this.name = "QueueUnavailableError";
  }
}

function jobKey(data: JobData): string {
  switch (data.type) {
    case "connection.sync":
    case "connection.discover":
      return `${data.type}-${data.connectionId}`;
    case "app.listing":
    case "app.ranks":
    case "app.charts":
    case "app.derive":
    case "app.reviews":
    case "app.competitors":
    case "ai.insights":
      return `${data.type}-${data.appId}`;
    case "review.classify":
      return `${data.type}-${data.reviewId}`;
    case "alerts.evaluate":
      return `${data.type}-${data.organizationId ?? "all"}`;
    case "alert.deliver":
      return `${data.type}-${data.eventId}`;
    case "digest.send":
      return `${data.type}-${data.digestId}`;
    case "push.send":
      return `${data.type}-${data.campaignId}`;
    case "corpus.crawl":
      return `${data.type}-${data.platform}-${data.country}-${data.prefix}`;
    case "corpus.estimate":
      return data.type;
    case "market.niche":
      return `${data.type}-${data.label}`;
    case "market.scan":
      return data.type;
    case "schedule.tick":
      return data.type;
  }
}

/**
 * Repeatable jobs. `schedule.tick` fans out per-connection and per-app work so
 * the repeat definitions stay static while the tenant list changes.
 */
export async function installSchedules() {
  const queue = getQueue();

  await queue.add(
    "schedule.tick",
    { type: "schedule.tick" },
    {
      repeat: { pattern: "0 * * * *" }, // hourly
      jobId: "schedule.tick",
      removeOnComplete: { count: 24 },
    },
  );

  await queue.add(
    "alerts.evaluate",
    { type: "alerts.evaluate" },
    {
      repeat: { pattern: "15,45 * * * *" },
      jobId: "alerts.evaluate-all",
      removeOnComplete: { count: 48 },
    },
  );
}

export async function queueHealth() {
  return getQueue().getJobCounts("waiting", "active", "delayed", "failed", "completed");
}

