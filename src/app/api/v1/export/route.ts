import { NextResponse } from "next/server";

import { ApiError, optionalInt, requireParam, withApiKey } from "@/server/api-key";
import { buildExport, EXPORT_TYPES, type ExportType } from "@/server/export";

export const dynamic = "force-dynamic";

/**
 * Returns a file rather than JSON, so this one bypasses the usual envelope.
 * Errors still use it, which is why the success path returns the Response
 * directly and the wrapper only shapes failures.
 */
export const GET = withApiKey(async (request, ctx) => {
  const appId = requireParam(request, "appId");
  const url = new URL(request.url);

  const type = url.searchParams.get("type") ?? "metrics";
  if (!EXPORT_TYPES.includes(type as ExportType)) {
    throw new ApiError(
      400,
      `Unknown export type "${type}". Valid: ${EXPORT_TYPES.join(", ")}`,
      "bad_request",
    );
  }

  const format = url.searchParams.get("format") === "json" ? "json" : "csv";
  const days = optionalInt(request, "days", 90, 730);

  try {
    const result = await buildExport({
      type: type as ExportType,
      appId,
      organizationId: ctx.organization.id,
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
  } catch (error) {
    throw new ApiError(
      404,
      error instanceof Error ? error.message : "Export failed",
      "not_found",
    );
  }
});
