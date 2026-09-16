import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * iOS Universal Links verification.
 *
 * Three things about this file break it silently, all of them here:
 *
 *   it must be served as application/json
 *   it must NOT have a .json extension in the path
 *   it must not redirect — iOS follows none
 *
 * `APPLE_APP_ID` is the team id and bundle id joined: ABCDE12345.com.example.aso
 */
export function GET() {
  const appId = process.env.APPLE_APP_ID;

  if (!appId) {
    return new NextResponse("Not configured", { status: 404 });
  }

  const body = {
    applinks: {
      details: [
        {
          appIDs: [appId],
          components: [
            // Only the routes the app can actually render. Claiming "/" would
            // hijack every marketing page and blog post into the app.
            { "/": "/apps/*", comment: "App overview and its tabs" },
            { "/": "/alerts*", comment: "Alert events" },
          ],
        },
      ],
    },
  };

  return new NextResponse(JSON.stringify(body), {
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=3600",
    },
  });
}
