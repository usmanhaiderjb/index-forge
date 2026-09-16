import "server-only";

import { type SyncStatus } from "@prisma/client";

import { db } from "@/server/db";

/**
 * Wraps a unit of sync work in a SyncRun row so every job has an auditable
 * start, end, record count, and error — including the ones that crash.
 */
export async function withSyncRun<T>(
  meta: { job: string; connectionId?: string | null; appId?: string | null; meta?: Record<string, unknown> },
  fn: (record: { read: (n: number) => void; wrote: (n: number) => void }) => Promise<T>,
): Promise<T> {
  const run = await db.syncRun.create({
    data: {
      job: meta.job,
      connectionId: meta.connectionId ?? null,
      appId: meta.appId ?? null,
      status: "RUNNING",
      meta: (meta.meta ?? {}) as never,
    },
  });

  const started = Date.now();
  let recordsRead = 0;
  let recordsWrote = 0;

  const finish = (status: SyncStatus, error?: string) =>
    db.syncRun.update({
      where: { id: run.id },
      data: {
        status,
        finishedAt: new Date(),
        durationMs: Date.now() - started,
        recordsRead,
        recordsWrote,
        error: error?.slice(0, 4000) ?? null,
      },
    });

  try {
    const result = await fn({
      read: (n) => {
        recordsRead += n;
      },
      wrote: (n) => {
        recordsWrote += n;
      },
    });
    await finish(recordsRead > 0 && recordsWrote === 0 ? "PARTIAL" : "SUCCESS");
    return result;
  } catch (error) {
    await finish("FAILED", error instanceof Error ? error.message : String(error));
    throw error;
  }
}
