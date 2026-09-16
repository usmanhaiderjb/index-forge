import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/env";
import { safeEqual } from "@/server/crypto";
import { evaluateAlerts } from "@/server/jobs/handlers/insights";
import { scheduleTick } from "@/server/jobs/handlers/schedule";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * External scheduler entry point, for deployments that run no long-lived
 * worker (Vercel Cron, GitHub Actions, a k8s CronJob). It only enqueues work —
 * a worker still has to drain the queue.
 *
 *   POST /api/cron?job=tick   Authorization: Bearer $CRON_SECRET
 */
export async function POST(request: NextRequest) {
  if (!env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }

  const header = request.headers.get("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "");
  if (!token || !safeEqual(token, env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const job = request.nextUrl.searchParams.get("job") ?? "tick";

  try {
    switch (job) {
      case "tick":
        return NextResponse.json({ job, result: await scheduleTick() });
      case "alerts":
        return NextResponse.json({ job, result: await evaluateAlerts() });
      default:
        return NextResponse.json({ error: `Unknown job "${job}"` }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Job failed" },
      { status: 500 },
    );
  }
}
