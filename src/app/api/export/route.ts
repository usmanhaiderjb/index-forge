import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { buildExport, EXPORT_TYPES, type ExportType } from "@/server/export";

export const dynamic = "force-dynamic";

/**
 * In-app download, authenticated by session rather than API key.
 *
 * Separate from /api/v1/export so a signed-in user can click a link without
 * minting a key, while the membership check still scopes the data.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const appId = params.get("appId");
  if (!appId) {
    return NextResponse.json({ error: "Missing appId" }, { status: 400 });
  }

  const type = params.get("type") ?? "metrics";
  if (!EXPORT_TYPES.includes(type as ExportType)) {
    return NextResponse.json(
      { error: `Unknown type "${type}". Valid: ${EXPORT_TYPES.join(", ")}` },
      { status: 400 },
    );
  }

  // Resolve the tenant from the app itself, then confirm membership — the
  // caller never names the organization, so it cannot be spoofed.
  const app = await db.app.findUnique({ where: { id: appId }, select: { organizationId: true } });
  if (!app) {
    return NextResponse.json({ error: "App not found" }, { status: 404 });
  }

  const membership = await db.membership.findUnique({
    where: {
      userId_organizationId: { userId: session.user.id, organizationId: app.organizationId },
    },
  });
  if (!membership) {
    return NextResponse.json({ error: "App not found" }, { status: 404 });
  }

  const days = Math.min(Math.max(1, Number(params.get("days") ?? 90) || 90), 730);
  const format = params.get("format") === "json" ? "json" : "csv";

  const result = await buildExport({
    type: type as ExportType,
    appId,
    organizationId: app.organizationId,
    days,
    format,
  });

  return new NextResponse(result.body, {
    headers: {
      "Content-Type": result.contentType,
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
