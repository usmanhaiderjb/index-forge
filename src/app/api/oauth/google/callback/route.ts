import { Provider } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/env";
import { encryptJson } from "@/server/crypto";
import { db } from "@/server/db";
import { exchangeGoogleCode, fetchGoogleUserInfo } from "@/server/integrations/google/oauth";
import { getConnector } from "@/server/integrations/registry";
import { testConnection } from "@/server/integrations/service";
import { enqueue } from "@/server/jobs/queues";
import { redis } from "@/server/redis";

export const dynamic = "force-dynamic";

type StoredState = {
  userId: string;
  organizationId: string;
  provider: Provider;
  redirectUri?: string;
};

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const error = params.get("error");
  if (error) {
    return redirectWith({ error: `Google returned "${error}"` }, request);
  }

  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) {
    return redirectWith({ error: "Missing authorization code" }, request);
  }

  // Single-use: consume the state before doing anything else.
  const key = `oauth:google:${state}`;
  const raw = await redis.get(key);
  await redis.del(key);

  if (!raw) {
    return redirectWith({ error: "This authorization link expired. Start again." }, request);
  }

  const stored = JSON.parse(raw) as StoredState;

  // Re-verify membership: the grant is minutes old, but access may not be.
  const membership = await db.membership.findUnique({
    where: {
      userId_organizationId: {
        userId: stored.userId,
        organizationId: stored.organizationId,
      },
    },
  });
  if (!membership || (membership.role !== "OWNER" && membership.role !== "ADMIN")) {
    return redirectWith({ error: "You no longer have permission to add integrations" }, request);
  }

  try {
    const credentials = await exchangeGoogleCode(code, stored.redirectUri);
    const userInfo = await fetchGoogleUserInfo(credentials.accessToken);
    const connector = getConnector(stored.provider);

    // Google only returns a refresh token on first consent. Without one the
    // connection dies in an hour, so fail loudly rather than store it.
    if (!credentials.refreshToken) {
      const existing = await db.connection.findFirst({
        where: {
          organizationId: stored.organizationId,
          provider: stored.provider,
          externalId: userInfo.email ?? userInfo.sub,
        },
      });
      if (!existing?.credentials) {
        return redirectWith({
          error:
            "Google did not return a refresh token. Remove this app's access at myaccount.google.com/permissions and connect again.",
        });
      }
    }

    const externalId = userInfo.email ?? userInfo.sub ?? "unknown";

    const connection = await db.connection.upsert({
      where: {
        organizationId_provider_externalId: {
          organizationId: stored.organizationId,
          provider: stored.provider,
          externalId,
        },
      },
      create: {
        organizationId: stored.organizationId,
        provider: stored.provider,
        externalId,
        externalName: userInfo.name ?? userInfo.email,
        label: userInfo.email,
        status: "PENDING",
        scopes: credentials.scope?.split(" ") ?? connector.scopes,
        expiresAt: credentials.expiresAt ? new Date(credentials.expiresAt) : null,
        credentials: encryptJson(credentials),
        createdById: stored.userId,
      },
      update: {
        externalName: userInfo.name ?? userInfo.email,
        status: "PENDING",
        lastError: null,
        errorCount: 0,
        scopes: credentials.scope?.split(" ") ?? connector.scopes,
        expiresAt: credentials.expiresAt ? new Date(credentials.expiresAt) : null,
        credentials: encryptJson(credentials),
      },
    });

    const result = await testConnection(connection.id);

    await db.auditLog.create({
      data: {
        organizationId: stored.organizationId,
        actorId: stored.userId,
        action: "connection.oauth",
        targetType: "Connection",
        targetId: connection.id,
        meta: { provider: stored.provider, ok: result.ok },
      },
    });

    if (result.ok) {
      await enqueue({ type: "connection.discover", connectionId: connection.id });
    }

    return redirectWith(
      result.ok
        ? { connected: stored.provider }
        : { error: `Connected, but the first check failed: ${result.detail}` },
      request,
    );
  } catch (err) {
    return redirectWith(
      {
        error: err instanceof Error ? err.message : "Authorization failed",
      },
      request,
    );
  }
}

function redirectWith(params: Record<string, string>, request?: NextRequest) {
  let origin = env.APP_URL;
  if (request) {
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
    if (host) origin = `${proto}://${host}`;
  }
  const url = new URL("/integrations", origin);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

