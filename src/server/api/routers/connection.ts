import { Provider } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { encryptJson } from "@/server/crypto";
import { adminProcedure, createTRPCRouter, orgProcedure } from "@/server/api/trpc";
import { googleOauthConfigured } from "@/server/integrations/google/oauth";
import { ALL_PROVIDERS, PROVIDER_META } from "@/server/integrations/registry";
import {
  listRemoteResources,
  suggestResourceLinks,
  testConnection,
} from "@/server/integrations/service";
import { getAsoProvider } from "@/server/aso/provider";
import { enqueue } from "@/server/jobs/queues";

export const connectionRouter = createTRPCRouter({
  /** Catalog for the integrations page: what exists, what is configured, what is connected. */
  catalog: orgProcedure.query(async ({ ctx }) => {
    const connections = await ctx.db.connection.findMany({
      where: { organizationId: ctx.organizationId },
      include: { _count: { select: { resourceLinks: true } } },
    });

    return ALL_PROVIDERS.map((provider) => {
      const meta = PROVIDER_META[provider];
      const connected = connections.filter((c) => c.provider === provider);

      return {
        provider,
        ...meta,
        // A connector the deployment has no credentials for is shown as
        // unavailable rather than failing at the OAuth redirect.
        deploymentReady:
          meta.authKind === "google-oauth" ? googleOauthConfigured() : true,
        connections: connected.map((c) => ({
          id: c.id,
          label: c.label,
          externalName: c.externalName,
          externalId: c.externalId,
          status: c.status,
          lastSyncedAt: c.lastSyncedAt,
          lastError: c.lastError,
          linkedApps: c._count.resourceLinks,
        })),
      };
    });
  }),

  byId: orgProcedure
    .input(z.object({ connectionId: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const connection = await ctx.db.connection.findFirst({
        where: { id: input.connectionId, organizationId: ctx.organizationId },
        include: {
          resourceLinks: { include: { app: true } },
          syncRuns: { orderBy: { startedAt: "desc" }, take: 10 },
        },
      });
      if (!connection) throw new TRPCError({ code: "NOT_FOUND" });

      // The credential blob never leaves the server.
      const { credentials: _credentials, ...safe } = connection;
      return safe;
    }),

  /**
   * Stores an App Store Connect API key. This is the one provider where the
   * user supplies raw credentials, so it is encrypted before it touches the DB.
   */
  connectAppleKey: adminProcedure
    .input(
      z.object({
        label: z.string().min(1).max(80),
        issuerId: z.string().uuid(),
        keyId: z.string().min(4),
        privateKey: z.string().min(100),
        vendorNumber: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const connection = await ctx.db.connection.upsert({
        where: {
          organizationId_provider_externalId: {
            organizationId: ctx.organizationId,
            provider: Provider.APP_STORE_CONNECT,
            externalId: input.issuerId,
          },
        },
        create: {
          organizationId: ctx.organizationId,
          provider: Provider.APP_STORE_CONNECT,
          label: input.label,
          externalId: input.issuerId,
          status: "PENDING",
          createdById: ctx.session.user.id,
          credentials: encryptJson({
            kind: "apple-asc",
            issuerId: input.issuerId,
            keyId: input.keyId,
            privateKey: input.privateKey,
            vendorNumber: input.vendorNumber,
          }),
        },
        update: {
          label: input.label,
          status: "PENDING",
          lastError: null,
          errorCount: 0,
          credentials: encryptJson({
            kind: "apple-asc",
            issuerId: input.issuerId,
            keyId: input.keyId,
            privateKey: input.privateKey,
            vendorNumber: input.vendorNumber,
          }),
        },
      });

      const result = await testConnection(connection.id);
      if (!result.ok) {
        throw new TRPCError({ code: "BAD_REQUEST", message: result.detail });
      }

      await enqueue({ type: "connection.discover", connectionId: connection.id });

      await ctx.db.auditLog.create({
        data: {
          organizationId: ctx.organizationId,
          actorId: ctx.session.user.id,
          action: "connection.create",
          targetType: "Connection",
          targetId: connection.id,
          meta: { provider: Provider.APP_STORE_CONNECT },
        },
      });

      return { connectionId: connection.id, detail: result.detail };
    }),

  /**
   * Stores an Apple Search Ads API credential.
   *
   * Deliberately a separate mutation from `connectAppleKey`: the two share a
   * vendor and a file extension and nothing else. Accepting either shape in one
   * endpoint would let an App Store Connect key be saved as a Search Ads one,
   * which fails later with an opaque `invalid_client` from Apple.
   */
  connectAppleSearchAds: adminProcedure
    .input(
      z.object({
        label: z.string().min(1).max(80),
        clientId: z.string().min(8),
        teamId: z.string().min(8),
        keyId: z.string().min(4),
        privateKey: z.string().min(100),
        orgId: z.string().regex(/^\d+$/, "Org id is the numeric id from Search Ads"),
        currency: z.string().length(3).optional(),
        timeZone: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const credentials = {
        kind: "apple-search-ads" as const,
        clientId: input.clientId,
        teamId: input.teamId,
        keyId: input.keyId,
        privateKey: input.privateKey,
        orgId: input.orgId,
        currency: input.currency,
        timeZone: input.timeZone,
      };

      const connection = await ctx.db.connection.upsert({
        where: {
          organizationId_provider_externalId: {
            organizationId: ctx.organizationId,
            provider: Provider.APPLE_SEARCH_ADS,
            externalId: input.orgId,
          },
        },
        create: {
          organizationId: ctx.organizationId,
          provider: Provider.APPLE_SEARCH_ADS,
          label: input.label,
          externalId: input.orgId,
          status: "PENDING",
          createdById: ctx.session.user.id,
          credentials: encryptJson(credentials),
        },
        update: {
          label: input.label,
          status: "PENDING",
          lastError: null,
          errorCount: 0,
          credentials: encryptJson(credentials),
        },
      });

      const result = await testConnection(connection.id);
      if (!result.ok) {
        throw new TRPCError({ code: "BAD_REQUEST", message: result.detail });
      }

      await enqueue({ type: "connection.discover", connectionId: connection.id });

      await ctx.db.auditLog.create({
        data: {
          organizationId: ctx.organizationId,
          actorId: ctx.session.user.id,
          action: "connection.create",
          targetType: "Connection",
          targetId: connection.id,
          meta: { provider: Provider.APPLE_SEARCH_ADS },
        },
      });

      return { connectionId: connection.id, detail: result.detail };
    }),

  test: adminProcedure
    .input(z.object({ connectionId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertConnection(ctx.db, input.connectionId, ctx.organizationId);
      return testConnection(input.connectionId);
    }),

  /** Remote resources plus a suggested app match for each. */
  resources: adminProcedure
    .input(z.object({ connectionId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertConnection(ctx.db, input.connectionId, ctx.organizationId);
      return suggestResourceLinks(input.connectionId);
    }),

  listResources: adminProcedure
    .input(z.object({ connectionId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertConnection(ctx.db, input.connectionId, ctx.organizationId);
      return listRemoteResources(input.connectionId);
    }),

  link: adminProcedure
    .input(
      z.object({
        connectionId: z.string().cuid(),
        appId: z.string().cuid(),
        externalId: z.string().min(1),
        externalRef: z.string().optional(),
        displayName: z.string().optional(),
        /** Play Console needs the private reports bucket id supplied by hand. */
        metadata: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertConnection(ctx.db, input.connectionId, ctx.organizationId);
      const app = await ctx.db.app.findFirst({
        where: { id: input.appId, organizationId: ctx.organizationId },
      });
      if (!app) throw new TRPCError({ code: "NOT_FOUND", message: "App not found" });

      const link = await ctx.db.resourceLink.upsert({
        where: {
          connectionId_appId_externalId: {
            connectionId: input.connectionId,
            appId: input.appId,
            externalId: input.externalId,
          },
        },
        create: {
          connectionId: input.connectionId,
          appId: input.appId,
          externalId: input.externalId,
          externalRef: input.externalRef,
          displayName: input.displayName,
          metadata: (input.metadata ?? undefined) as never,
        },
        update: {
          externalRef: input.externalRef,
          displayName: input.displayName,
          metadata: (input.metadata ?? undefined) as never,
        },
      });

      await enqueue(
        { type: "connection.sync", connectionId: input.connectionId, days: 90 },
        { jobId: `connection.sync-${input.connectionId}-${Date.now()}` },
      );
      return link;
    }),

  /**
   * 1-Click Import & Link: Creates the App record in the organization if it doesn't
   * already exist (enriching from App Store / Google Play when possible), and links
   * it to the connection immediately.
   */
  importAndLink: adminProcedure
    .input(
      z.object({
        connectionId: z.string().cuid(),
        platform: z.enum(["IOS", "ANDROID"]).default("ANDROID"),
        storeId: z.string().optional(),
        bundleId: z.string().optional(),
        displayName: z.string().min(1),
        externalId: z.string().min(1),
        externalRef: z.string().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
        country: z.string().length(2).default("us"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertConnection(ctx.db, input.connectionId, ctx.organizationId);

      const targetStoreId = input.storeId || input.bundleId || input.displayName;

      // 1. Look for an existing app in this organization
      let app = await ctx.db.app.findFirst({
        where: {
          organizationId: ctx.organizationId,
          OR: [
            ...(input.storeId ? [{ storeId: input.storeId, platform: input.platform }] : []),
            ...(input.bundleId ? [{ bundleId: input.bundleId, platform: input.platform }] : []),
            { name: input.displayName, platform: input.platform },
          ],
        },
      });

      // 2. If app doesn't exist, create it!
      if (!app) {
        let storeDetail: {
          name?: string;
          developer?: string;
          iconUrl?: string;
          bundleId?: string;
          currentVersion?: string;
          category?: string;
        } | null = null;

        if (input.storeId) {
          try {
            const provider = await getAsoProvider();
            storeDetail = await provider.getApp(input.platform, input.storeId, {
              country: input.country,
              locale: "en-US",
            });
          } catch {
            // Fallback gracefully if app is unlisted or not in US store
          }
        }

        app = await ctx.db.app.create({
          data: {
            organizationId: ctx.organizationId,
            platform: input.platform,
            storeId: input.storeId || storeDetail?.bundleId || targetStoreId,
            bundleId: input.bundleId || storeDetail?.bundleId || input.storeId,
            name: storeDetail?.name || input.displayName,
            developer: storeDetail?.developer || "Developer",
            iconUrl: storeDetail?.iconUrl,
            category: storeDetail?.category,
            currentVersion: storeDetail?.currentVersion,
            country: input.country,
            locale: "en-US",
          },
        });
      }

      // 3. Create or upsert the ResourceLink
      const link = await ctx.db.resourceLink.upsert({
        where: {
          connectionId_appId_externalId: {
            connectionId: input.connectionId,
            appId: app.id,
            externalId: input.externalId,
          },
        },
        create: {
          connectionId: input.connectionId,
          appId: app.id,
          externalId: input.externalId,
          externalRef: input.externalRef,
          displayName: input.displayName,
          metadata: (input.metadata ?? undefined) as never,
        },
        update: {
          externalRef: input.externalRef,
          displayName: input.displayName,
          metadata: (input.metadata ?? undefined) as never,
        },
      });

      // 4. Enqueue sync
      await enqueue(
        { type: "connection.sync", connectionId: input.connectionId, days: 90 },
        { jobId: `connection.sync-${input.connectionId}-${Date.now()}` },
      );

      return { app, link };
    }),

  unlink: adminProcedure
    .input(z.object({ linkId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const link = await ctx.db.resourceLink.findFirst({
        where: { id: input.linkId, connection: { organizationId: ctx.organizationId } },
      });
      if (!link) throw new TRPCError({ code: "NOT_FOUND" });
      await ctx.db.resourceLink.delete({ where: { id: input.linkId } });
      return { ok: true };
    }),

  sync: adminProcedure
    .input(z.object({ connectionId: z.string().cuid(), days: z.number().int().max(365).default(30) }))
    .mutation(async ({ ctx, input }) => {
      await assertConnection(ctx.db, input.connectionId, ctx.organizationId);
      await enqueue(
        { type: "connection.sync", connectionId: input.connectionId, days: input.days },
        { jobId: `connection.sync-${input.connectionId}-${Date.now()}` },
      );
      return { queued: true };
    }),

  setStatus: adminProcedure
    .input(z.object({ connectionId: z.string().cuid(), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await assertConnection(ctx.db, input.connectionId, ctx.organizationId);
      return ctx.db.connection.update({
        where: { id: input.connectionId },
        data: { status: input.enabled ? "PENDING" : "DISABLED" },
      });
    }),

  remove: adminProcedure
    .input(z.object({ connectionId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertConnection(ctx.db, input.connectionId, ctx.organizationId);
      await ctx.db.connection.delete({ where: { id: input.connectionId } });

      await ctx.db.auditLog.create({
        data: {
          organizationId: ctx.organizationId,
          actorId: ctx.session.user.id,
          action: "connection.delete",
          targetType: "Connection",
          targetId: input.connectionId,
        },
      });

      return { ok: true };
    }),

  syncRuns: orgProcedure
    .input(z.object({ limit: z.number().int().max(100).default(25) }))
    .query(async ({ ctx, input }) => {
      return ctx.db.syncRun.findMany({
        where: {
          OR: [
            { connection: { organizationId: ctx.organizationId } },
            { app: { organizationId: ctx.organizationId } },
          ],
        },
        orderBy: { startedAt: "desc" },
        take: input.limit,
        include: {
          connection: { select: { provider: true, label: true } },
          app: { select: { name: true } },
        },
      });
    }),
});

async function assertConnection(
  db: { connection: { findFirst: (args: { where: Record<string, unknown> }) => Promise<unknown> } },
  connectionId: string,
  organizationId: string,
) {
  const connection = await db.connection.findFirst({ where: { id: connectionId, organizationId } });
  if (!connection) throw new TRPCError({ code: "NOT_FOUND", message: "Connection not found" });
  return connection;
}
