import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Self-documenting index. Unauthenticated on purpose — it describes the API
 * without exposing any data, so a developer holding a key can discover the
 * shape without reading the source.
 */
export function GET() {
  return NextResponse.json({
    name: "ASO API",
    version: "v1",
    authentication: {
      scheme: "Bearer",
      header: "Authorization: Bearer aso_…",
      note: "Create a key in Settings. It is shown once; only its SHA-256 is stored.",
      rateLimit: "120 requests per minute per key",
    },
    endpoints: [
      { method: "GET", path: "/api/v1/apps", description: "Every app in the organization." },
      {
        method: "GET",
        path: "/api/v1/metrics",
        description: "Daily metric series.",
        params: {
          appId: "required",
          metric: "required — repeatable, e.g. metric=INSTALLS&metric=AD_REVENUE",
          days: "optional, default 30, max 730",
          dimension: "optional dimension key, e.g. country",
        },
      },
      {
        method: "GET",
        path: "/api/v1/keywords",
        description: "Tracked keywords with the latest rank, difficulty and opportunity.",
        params: { appId: "required" },
      },
      {
        method: "GET",
        path: "/api/v1/keywords/history",
        description: "Daily rank history for one keyword.",
        params: { keywordId: "required", days: "optional, default 90, max 730" },
      },
      {
        method: "GET",
        path: "/api/v1/charts",
        description:
          "Daily store chart position. A null rank means outside the scanned depth, not unranked.",
        params: { appId: "required", days: "optional, default 30, max 365" },
      },
      {
        method: "GET",
        path: "/api/v1/reviews",
        description: "Reviews, newest first.",
        params: {
          appId: "required",
          sentiment: "optional POSITIVE | NEUTRAL | NEGATIVE",
          limit: "optional, default 50, max 500",
          cursor: "optional review id for pagination",
        },
      },
      {
        method: "GET",
        path: "/api/v1/insights",
        description: "AI insights and open recommendations.",
        params: { appId: "optional", limit: "optional, default 50" },
      },
    ],
    errors: {
      shape: { error: { code: "string", message: "string" } },
      codes: ["unauthorized", "bad_request", "not_found", "rate_limited", "internal_error"],
    },
  });
}
