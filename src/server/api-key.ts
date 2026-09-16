import "server-only";

import type { Organization } from "@prisma/client";
import { NextResponse } from "next/server";

import { sha256 } from "@/server/crypto";
import { db } from "@/server/db";
import { rateLimit } from "@/server/redis";

export type ApiContext = {
  organization: Organization;
  keyId: string;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Authenticates a request against a stored API key.
 *
 * Only the SHA-256 of the key is stored, so the lookup hashes the presented
 * value and matches on that — a database dump never yields a usable key.
 */
export async function authenticate(request: Request): Promise<ApiContext> {
  const header = request.headers.get("authorization") ?? "";
  const presented = header.replace(/^Bearer\s+/i, "").trim();

  if (!presented) {
    throw new ApiError(401, "Missing Authorization header. Use: Authorization: Bearer <key>", "unauthorized");
  }
  if (!presented.startsWith("aso_")) {
    throw new ApiError(401, "Malformed API key", "unauthorized");
  }

  const key = await db.apiKey.findUnique({
    where: { hashedKey: sha256(presented) },
    include: { organization: true },
  });

  if (!key || key.revokedAt) {
    throw new ApiError(401, "Invalid or revoked API key", "unauthorized");
  }
  if (key.expiresAt && key.expiresAt < new Date()) {
    throw new ApiError(401, "API key has expired", "unauthorized");
  }

  // Per-key limit so one noisy integration cannot exhaust the store-scraper
  // budget for the whole organization.
  const limit = await rateLimit(`api:${key.id}`, 120, 60).catch(() => null);
  if (limit && !limit.allowed) {
    throw new ApiError(429, `Rate limit exceeded. Retry in ${limit.resetIn}s.`, "rate_limited");
  }

  // Fire-and-forget: last-used tracking must not add latency or fail a request.
  void db.apiKey
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
    .catch(() => undefined);

  return { organization: key.organization, keyId: key.id };
}

/**
 * Wraps a route handler with authentication and uniform error shaping, so
 * every endpoint returns the same envelope instead of leaking stack traces.
 */
export function withApiKey(
  handler: (request: Request, ctx: ApiContext) => Promise<unknown>,
) {
  return async (request: Request): Promise<NextResponse> => {
    try {
      const ctx = await authenticate(request);
      const data = await handler(request, ctx);

      // A handler that builds its own Response — a file download, say — is
      // returned untouched; wrapping it would serialize the file into JSON.
      if (data instanceof Response) return data as NextResponse;

      return NextResponse.json(data, {
        headers: { "Cache-Control": "no-store" },
      });
    } catch (error) {
      if (error instanceof ApiError) {
        return NextResponse.json(
          { error: { code: error.code, message: error.message } },
          { status: error.status },
        );
      }

      console.error("[api/v1]", error);
      return NextResponse.json(
        { error: { code: "internal_error", message: "Something went wrong" } },
        { status: 500 },
      );
    }
  };
}

/** Parses and validates common list parameters. */
export function paging(request: Request, defaultLimit = 50, maxLimit = 500) {
  const url = new URL(request.url);
  const raw = Number(url.searchParams.get("limit") ?? defaultLimit);
  const limit = Number.isFinite(raw) ? Math.min(Math.max(1, raw), maxLimit) : defaultLimit;
  return { limit, cursor: url.searchParams.get("cursor") ?? undefined };
}

export function requireParam(request: Request, name: string): string {
  const value = new URL(request.url).searchParams.get(name);
  if (!value) throw new ApiError(400, `Missing required parameter "${name}"`, "bad_request");
  return value;
}

export function optionalInt(request: Request, name: string, fallback: number, max: number): number {
  const raw = new URL(request.url).searchParams.get(name);
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new ApiError(400, `Parameter "${name}" must be a number`, "bad_request");
  }
  return Math.min(Math.max(1, Math.trunc(value)), max);
}

/** Confirms an app belongs to the authenticated organization. */
export async function resolveApp(appId: string, organizationId: string) {
  const app = await db.app.findFirst({ where: { id: appId, organizationId } });
  if (!app) throw new ApiError(404, `No app with id "${appId}"`, "not_found");
  return app;
}
