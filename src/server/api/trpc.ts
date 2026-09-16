import { initTRPC, TRPCError } from "@trpc/server";
import { type Role } from "@prisma/client";
import superjson from "superjson";
import { ZodError, z } from "zod";

import type { Session } from "next-auth";

import { auth } from "@/server/auth";
import { sha256 } from "@/server/crypto";
import { db } from "@/server/db";
import { sessionFromAccessToken } from "@/server/mobile-auth";
import { rateLimit } from "@/server/redis";

/**
 * Request context. `headers` is carried through so routers can read the
 * active-organization cookie and log client IPs on audit entries.
 *
 * Two authentication paths produce the same `session` shape:
 *
 *   browser  httpOnly cookie, resolved by Auth.js
 *   native   Authorization: Bearer <access token>
 *
 * Bearer is checked first and a bad one falls through to the cookie path, so an
 * invalid token looks exactly like no token. Everything downstream — the whole
 * RBAC ladder, organization scoping, every router — is unchanged by design:
 * this is the only place that needs to know two client kinds exist.
 */
export const createTRPCContext = async (opts: { headers: Headers }) => {
  const bearer = opts.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();

  if (bearer) {
    const mobile = await sessionFromAccessToken(bearer);
    if (mobile) {
      return {
        db,
        session: {
          user: { id: mobile.user.id, email: mobile.user.email, name: mobile.user.name },
          expires: "",
        } as Session,
        deviceSessionId: mobile.deviceSessionId,
        headers: opts.headers,
      };
    }
  }

  return {
    db,
    session: await auth(),
    deviceSessionId: null as string | null,
    headers: opts.headers,
  };
};

/**
 * `deviceSessionId` is optional rather than required, because server-side
 * callers — RSC pages, route handlers, the smoke scripts — construct a context
 * by hand and have no device. Only the HTTP path can populate it.
 */
export type Context = Omit<Awaited<ReturnType<typeof createTRPCContext>>, "deviceSessionId"> & {
  deviceSessionId?: string | null;
};

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const createCallerFactory = t.createCallerFactory;
export const createTRPCRouter = t.router;

/** Logs slow procedures. Cheap, and the sync-heavy routers need it. */
const timingMiddleware = t.middleware(async ({ next, path }) => {
  const start = Date.now();
  const result = await next();
  const ms = Date.now() - start;
  if (ms > 1000) console.warn(`[trpc] slow ${path} ${ms}ms`);
  return result;
});

/**
 * Per-caller rate limit on every procedure.
 *
 * Keyed on the user when there is one, and on a hashed IP when there is not —
 * an authenticated user behind a shared office address should not be throttled
 * by a colleague. Mutations get their own, tighter bucket: a burst of reads is
 * a chatty client, a burst of writes is usually not.
 *
 * Server-side callers are exempt. `src/trpc/server.ts` stamps `x-trpc-source:
 * rsc`, and a page rendering several server components would otherwise consume
 * a browser visitor's own budget against them.
 *
 * Fails open. Redis being unreachable already blocks background jobs; it must
 * not also make the app unreadable.
 */
const rateLimitMiddleware = t.middleware(async ({ ctx, next, type, path }) => {
  if (ctx.headers.get("x-trpc-source") === "rsc") return next();

  const userId = ctx.session?.user?.id;
  const subject = userId ? `u:${userId}` : `ip:${sha256(clientIpFrom(ctx.headers))}`;
  const isWrite = type === "mutation";

  const result = await rateLimit(
    `trpc:${isWrite ? "w" : "r"}:${subject}`,
    isWrite ? 60 : 300,
    60,
  ).catch(() => null);

  if (result && !result.allowed) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Too many requests. Retry in ${result.resetIn}s.`,
    });
  }

  return next();
});

function clientIpFrom(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "unknown";
  return headers.get("x-real-ip") ?? "unknown";
}

export const publicProcedure = t.procedure.use(timingMiddleware).use(rateLimitMiddleware);

export const protectedProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.session?.user?.id) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    ctx: { ...ctx, session: { ...ctx.session, user: ctx.session.user } },
  });
});

const ROLE_RANK: Record<Role, number> = {
  VIEWER: 0,
  MEMBER: 1,
  ADMIN: 2,
  OWNER: 3,
};

export function hasRole(role: Role, minimum: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export const ACTIVE_ORG_COOKIE = "aso_org";

/**
 * Resolves the caller's organization. Input `organizationId` wins, then the
 * active-org cookie, then the caller's first membership. Membership is always
 * verified — the cookie is a hint, never an authorization.
 */
async function resolveMembership(ctx: Context, organizationId?: string) {
  const userId = ctx.session!.user.id;

  if (organizationId) {
    const membership = await ctx.db.membership.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
    });
    if (!membership) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this organization" });
    }
    return membership;
  }

  const cookieHeader = ctx.headers.get("cookie") ?? "";
  const cookieOrg = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${ACTIVE_ORG_COOKIE}=`))
    ?.split("=")[1];

  if (cookieOrg) {
    const membership = await ctx.db.membership.findUnique({
      where: { userId_organizationId: { userId, organizationId: decodeURIComponent(cookieOrg) } },
    });
    if (membership) return membership;
  }

  const fallback = await ctx.db.membership.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  if (!fallback) {
    throw new TRPCError({ code: "FORBIDDEN", message: "No organization for this user" });
  }
  return fallback;
}

export const orgInput = z.object({ organizationId: z.string().cuid().optional() });

/** Authenticated + resolved tenant. Everything business-facing uses this. */
export const orgProcedure = protectedProcedure
  .input(orgInput.optional())
  .use(async ({ ctx, input, next }) => {
    const membership = await resolveMembership(ctx, input?.organizationId);
    return next({
      ctx: { ...ctx, organizationId: membership.organizationId, role: membership.role },
    });
  });

function requireRole(minimum: Role) {
  return orgProcedure.use(({ ctx, next }) => {
    if (!hasRole(ctx.role, minimum)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Requires ${minimum} or higher`,
      });
    }
    return next({ ctx });
  });
}

/** Can change data (apps, keywords, recommendations). */
export const memberProcedure = requireRole("MEMBER");
/** Can change the tenant itself (connections, members, API keys). */
export const adminProcedure = requireRole("ADMIN");
export const ownerProcedure = requireRole("OWNER");

/** Confirms an app belongs to the caller's org before any app-scoped query. */
export async function assertAppInOrg(
  database: typeof db,
  appId: string,
  organizationId: string,
) {
  const app = await database.app.findFirst({
    where: { id: appId, organizationId },
  });
  if (!app) throw new TRPCError({ code: "NOT_FOUND", message: "App not found" });
  return app;
}
