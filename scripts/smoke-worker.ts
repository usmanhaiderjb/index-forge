/**
 * Proves the job pipeline actually runs.
 *
 * Enqueues real jobs against Redis and waits for the worker to finish them,
 * asserting on the SyncRun rows the handlers write. Requires both Redis and a
 * running worker (`npm run worker`).
 *
 *   npm run smoke:worker
 */
import { PrismaClient } from "@prisma/client";

const { enqueue, getQueue } = (await import("../src/server/jobs/queues")) as typeof import("../src/server/jobs/queues");
const { redis } = (await import("../src/server/redis")) as typeof import("../src/server/redis");

const db = new PrismaClient();
let failures = 0;

function report(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function waitFor<T>(
  label: string,
  poll: () => Promise<T | null>,
  timeoutMs = 45_000,
): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await poll();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.log(`      (timed out waiting for ${label})`);
  return null;
}

async function main() {
  const queue = getQueue();

  // --- The queue is reachable and a worker is attached ---------------------
  const workers = await queue.getWorkers();
  report("a worker is connected", workers.length > 0, `${workers.length} worker(s)`);

  const repeatable = await queue.getRepeatableJobs();
  report(
    "repeatable schedules are installed",
    repeatable.length >= 2,
    repeatable.map((r) => r.name).join(", ") || "none",
  );

  const app = await db.app.findFirst({ orderBy: { createdAt: "asc" } });
  if (!app) throw new Error("Run `npm run db:seed` first");

  // --- A real job runs end to end -----------------------------------------
  const before = new Date();

  await enqueue(
    { type: "alerts.evaluate" },
    { jobId: `smoke:alerts.evaluate:${Date.now()}` },
  );

  const evaluated = await waitFor("alert evaluation", async () => {
    const rule = await db.alertRule.findFirst({
      where: { lastEvaluatedAt: { gte: before } },
    });
    return rule ?? null;
  });

  report(
    "the worker executed a queued job",
    evaluated !== null,
    evaluated ? `rule evaluated at ${evaluated.lastEvaluatedAt?.toISOString()}` : "no rule touched",
  );

  // --- A handler that writes a SyncRun ------------------------------------
  await enqueue(
    { type: "app.charts", appId: app.id },
    { jobId: `smoke:app.charts:${Date.now()}` },
  );

  const run = await waitFor("chart sync", async () => {
    const found = await db.syncRun.findFirst({
      where: { appId: app.id, job: "aso.charts", startedAt: { gte: before } },
      orderBy: { startedAt: "desc" },
    });
    // Wait until it reaches a terminal state rather than catching it running.
    return found && found.status !== "RUNNING" ? found : null;
  });

  report(
    "a sync handler ran and recorded its outcome",
    run !== null,
    run ? `${run.status}, read ${run.recordsRead}, wrote ${run.recordsWrote}, ${run.durationMs}ms` : "no run",
  );

  // A network-dependent job may legitimately fail here; what matters is that
  // the failure was captured rather than lost.
  if (run && run.status === "FAILED") {
    report(
      "a failure is recorded with its reason",
      Boolean(run.error),
      run.error?.slice(0, 120) ?? "no error text",
    );
  }

  const counts = await queue.getJobCounts("completed", "failed", "waiting", "active");
  console.log(
    `\nQueue: ${counts.completed} completed, ${counts.failed} failed, ${counts.waiting} waiting, ${counts.active} active`,
  );

  console.log(failures === 0 ? "All checks passed." : `${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
    await redis.quit().catch(() => undefined);
  });
