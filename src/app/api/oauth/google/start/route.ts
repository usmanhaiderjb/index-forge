import { Provider } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/env";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { buildGoogleAuthUrl, googleOauthConfigured } from "@/server/integrations/google/oauth";
import { getConnector } from "@/server/integrations/registry";
import { redis } from "@/server/redis";

export const dynamic = "force-dynamic";

/**
 * Starts the Google data-scope OAuth flow for one provider.
 *
 *   GET /api/oauth/google/start?provider=ADMOB&organizationId=...
 *
 * The state is a random token stored in Redis against the caller's identity —
 * it is never derived from user input, so a forged callback cannot bind a
 * connection to another organization.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/signin", env.APP_URL));
  }

  if (!googleOauthConfigured()) {
    return errorRedirect("Google OAuth is not configured on this deployment");
  }

  const providerParam = request.nextUrl.searchParams.get("provider");
  if (!providerParam || !(providerParam in Provider)) {
    return errorRedirect("Unknown provider");
  }
  const provider = providerParam as Provider;

  if (provider === Provider.APP_STORE_CONNECT) {
    return errorRedirect("App Store Connect uses an API key, not OAuth");
  }

  // Resolve the organization from membership, never from the query string alone.
  const requestedOrg = request.nextUrl.searchParams.get("organizationId");
  const membership = requestedOrg
    ? await db.membership.findUnique({
        where: { userId_organizationId: { userId: session.user.id, organizationId: requestedOrg } },
      })
    : await db.membership.findFirst({
        where: { userId: session.user.id },
        orderBy: { createdAt: "asc" },
      });

  if (!membership || (membership.role !== "OWNER" && membership.role !== "ADMIN")) {
    return errorRedirect("You need admin access to connect an integration");
  }

  const state = randomBytes(24).toString("base64url");
  await redis.set(
    `oauth:google:${state}`,
    JSON.stringify({
      userId: session.user.id,
      organizationId: membership.organizationId,
      provider,
    }),
    "EX",
    600,
  );

  const connector = getConnector(provider);
  const url = buildGoogleAuthUrl({ scopes: connector.scopes, state });

  return NextResponse.redirect(url);
}

function errorRedirect(message: string) {
  const url = new URL("/integrations", env.APP_URL);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url);
}
