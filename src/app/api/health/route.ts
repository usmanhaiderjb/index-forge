import { NextResponse } from "next/server";

import { db } from "@/server/db";
import { queueHealth } from "@/server/jobs/queues";
import { redis } from "@/server/redis";

export const dynamic = "force-dynamic";

/** Liveness + dependency check. Returns 503 when a dependency is down. */
export async function GET() {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  try {
    await db.$queryRaw`SELECT 1`;
    checks.database = { ok: true };
  } catch (error) {
    checks.database = { ok: false, detail: error instanceof Error ? error.message : "unreachable" };
  }

  try {
    await redis.ping();
    checks.redis = { ok: true };
  } catch (error) {
    checks.redis = { ok: false, detail: error instanceof Error ? error.message : "unreachable" };
  }

  let queue: Record<string, number> | null = null;
  try {
    queue = await queueHealth();
  } catch {
    queue = null;
  }

  const ok = Object.values(checks).every((c) => c.ok);
  return NextResponse.json({ ok, checks, queue }, { status: ok ? 200 : 503 });
}
