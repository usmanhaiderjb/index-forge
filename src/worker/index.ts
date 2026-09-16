/**
 * Dedicated worker process.
 *
 *   npm run worker      production
 *   npm run dev:worker  watch mode
 *
 * Runs separately from the web server so a long store-scrape never blocks a
 * request, and so workers scale independently of web dynos.
 */
import { Worker, type Job } from "bullmq";

import { env } from "@/env";
import { processJob } from "@/server/jobs/processor";
import { installSchedules, QUEUE_NAME, type JobData } from "@/server/jobs/queues";
import { blockingRedis, redis } from "@/server/redis";

const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 4);

async function main() {
  await installSchedules();

  const worker = new Worker<JobData>(
    QUEUE_NAME,
    async (job: Job<JobData>) => processJob(job),
    {
      // The worker blocks on Redis reads, so it needs the unbounded-retry
      // connection rather than the fail-fast request-path one.
      connection: blockingRedis(),
      concurrency: CONCURRENCY,
      // Outbound APIs are the bottleneck and most of them rate limit.
      limiter: { max: 20, duration: 1000 },
    },
  );

  worker.on("completed", (job) => {
    console.log(`[worker] ok   ${job.name} ${job.id}`);
  });

  worker.on("failed", (job, error) => {
    console.error(`[worker] fail ${job?.name} ${job?.id}: ${error.message}`);
  });

  worker.on("error", (error) => {
    console.error("[worker] error", error);
  });

  console.log(
    `[worker] listening on "${QUEUE_NAME}" concurrency=${CONCURRENCY} env=${env.NODE_ENV}`,
  );

  const shutdown = async (signal: string) => {
    console.log(`[worker] ${signal} received, draining`);
    await worker.close();
    await Promise.allSettled([redis.quit(), blockingRedis().quit()]);
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((error) => {
  console.error("[worker] fatal", error);
  process.exit(1);
});
