import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/env";
import { safeEqual } from "@/server/crypto";
import { db } from "@/server/db";
import { syncListing } from "@/server/jobs/handlers/aso";
import { syncConnection } from "@/server/jobs/handlers/connection";
import { scheduleTick } from "@/server/jobs/handlers/schedule";
import { deriveMetrics } from "@/server/metrics/derive";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorized(request: NextRequest): boolean {
  // Vercel Cron sends x-vercel-cron: 1 header
  if (request.headers.get("x-vercel-cron") === "1") {
    return true;
  }

  if (!env.CRON_SECRET) {
    return process.env.NODE_ENV !== "production";
  }

  const header = request.headers.get("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "");
  return Boolean(token && safeEqual(token, env.CRON_SECRET));
}

async function handleSync(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const connections = await db.connection.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, provider: true },
    });

    const connectionResults: Array<{ id: string; provider: string; status: string; error?: string }> = [];
    for (const conn of connections) {
      try {
        await syncConnection(conn.id, 7);
        connectionResults.push({ id: conn.id, provider: conn.provider, status: "ok" });
      } catch (err) {
        connectionResults.push({
          id: conn.id,
          provider: conn.provider,
          status: "error",
          error: (err as Error).message,
        });
      }
    }

    const apps = await db.app.findMany({ where: { isActive: true }, select: { id: true, name: true } });
    const appResults: Array<{ id: string; name: string; status: string; error?: string }> = [];
    for (const app of apps) {
      try {
        await syncListing(app.id);
        await deriveMetrics(app.id, { days: 30 });
        appResults.push({ id: app.id, name: app.name, status: "ok" });
      } catch (err) {
        appResults.push({ id: app.id, name: app.name, status: "error", error: (err as Error).message });
      }
    }

    let tickResult: unknown = null;
    try {
      tickResult = await scheduleTick();
    } catch (err) {
      tickResult = { error: (err as Error).message };
    }

    return NextResponse.json({
      success: true,
      syncedConnections: connectionResults.length,
      syncedApps: appResults.length,
      connections: connectionResults,
      apps: appResults,
      tick: tickResult,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return handleSync(request);
}

export async function POST(request: NextRequest) {
  return handleSync(request);
}
