import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { dateRange, ymd } from "@aso/shared";

import { assertAppInOrg, createTRPCRouter, memberProcedure, orgProcedure } from "@/server/api/trpc";
import { auditListing } from "@/server/aso/analysis";
import { localeCoverage } from "@/server/aso/coverage";
import { listingChanges } from "@/server/aso/impact";
import { getAsoProvider } from "@/server/aso/provider";
import { appStorefronts } from "@/server/jobs/handlers/aso";
import { enqueue } from "@/server/jobs/queues";

const platformSchema = z.enum(["IOS", "ANDROID"]);

export const appRouter = createTRPCRouter({
  list: orgProcedure.query(async ({ ctx }) => {
    const apps = await ctx.db.app.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { createdAt: "asc" },
      include: {
        _count: { select: { keywords: true, competitors: true, reviews: true } },
      },
    });
    return apps;
  }),

  byId: orgProcedure
    .input(z.object({ appId: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      await assertAppInOrg(ctx.db, input.appId, ctx.organizationId);

      const app = await ctx.db.app.findUniqueOrThrow({
        where: { id: input.appId },
        include: {
          resourceLinks: { include: { connection: { select: { provider: true, status: true } } } },
          _count: { select: { keywords: true, competitors: true, reviews: true } },
        },
      });

      // The header must describe the primary storefront. Taking the newest
      // snapshot across every locale would show the German subtitle and the
      // Brazilian rating simply because those synced last.
      const primary =
        (await ctx.db.appLocale.findFirst({ where: { appId: app.id, isPrimary: true } })) ??
        { country: app.country, locale: app.locale };

      const listings = await ctx.db.storeListing.findMany({
        where: { appId: app.id, country: primary.country, locale: primary.locale },
        orderBy: { capturedAt: "desc" },
        take: 1,
      });

      return { ...app, listings };
    }),

  /** Store lookup used by the add-app flow, before anything is persisted. */
  search: orgProcedure
    .input(
      z.object({
        platform: platformSchema,
        term: z.string().min(2),
        country: z.string().length(2).default("us"),
      }),
    )
    .query(async ({ input }) => {
      const provider = await getAsoProvider();
      return provider.search(input.platform, input.term, {
        country: input.country,
        locale: "en-US",
        limit: 20,
      });
    }),

  preview: orgProcedure
    .input(
      z.object({
        platform: platformSchema,
        storeId: z.string().min(1),
        country: z.string().length(2).default("us"),
        locale: z.string().default("en-US"),
      }),
    )
    .query(async ({ input }) => {
      const provider = await getAsoProvider();
      const detail = await provider.getApp(input.platform, input.storeId, {
        country: input.country,
        locale: input.locale,
      });
      if (!detail) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `No app with id "${input.storeId}" in the ${input.country.toUpperCase()} store`,
        });
      }
      return detail;
    }),

  create: memberProcedure
    .input(
      z.object({
        platform: platformSchema,
        storeId: z.string().min(1),
        country: z.string().length(2).default("us"),
        locale: z.string().default("en-US"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const provider = await getAsoProvider();
      const detail = await provider.getApp(input.platform, input.storeId, {
        country: input.country,
        locale: input.locale,
      });

      if (!detail) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That app is not available in the selected storefront",
        });
      }

      const existing = await ctx.db.app.findUnique({
        where: {
          organizationId_platform_storeId: {
            organizationId: ctx.organizationId,
            platform: input.platform,
            storeId: input.storeId,
          },
        },
      });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "This app is already being tracked" });
      }

      const app = await ctx.db.app.create({
        data: {
          organizationId: ctx.organizationId,
          platform: input.platform,
          storeId: input.storeId,
          bundleId: detail.bundleId,
          name: detail.name,
          developer: detail.developer,
          iconUrl: detail.iconUrl,
          country: input.country,
          locale: input.locale,
          category: detail.category,
          currentVersion: detail.version,
        },
      });

      // First snapshot, competitor discovery, and an insight pass.
      await enqueue({ type: "app.listing", appId: app.id });
      await enqueue({ type: "app.competitors", appId: app.id }, { delay: 60_000 });

      await ctx.db.auditLog.create({
        data: {
          organizationId: ctx.organizationId,
          actorId: ctx.session.user.id,
          action: "app.create",
          targetType: "App",
          targetId: app.id,
          meta: { platform: app.platform, storeId: app.storeId },
        },
      });

      return app;
    }),

  update: memberProcedure
    .input(
      z.object({
        appId: z.string().cuid(),
        country: z.string().length(2).optional(),
        locale: z.string().optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertAppInOrg(ctx.db, input.appId, ctx.organizationId);
      const { appId, ...data } = input;
      return ctx.db.app.update({ where: { id: appId }, data });
    }),

  delete: memberProcedure
    .input(z.object({ appId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertAppInOrg(ctx.db, input.appId, ctx.organizationId);
      await ctx.db.app.delete({ where: { id: input.appId } });
      return { ok: true };
    }),

  /** Deterministic listing audit — no AI, instant, same score every time. */
  audit: orgProcedure
    .input(
      z.object({
        appId: z.string().cuid(),
        /** Defaults to the primary storefront. */
        country: z.string().length(2).optional(),
        locale: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const app = await assertAppInOrg(ctx.db, input.appId, ctx.organizationId);
      const listing = await ctx.db.storeListing.findFirst({
        where: {
          appId: input.appId,
          ...(input.country ? { country: input.country } : {}),
          ...(input.locale ? { locale: input.locale } : {}),
        },
        orderBy: { capturedAt: "desc" },
      });

      if (!listing) {
        return { score: 0, checks: [], capturedAt: null };
      }

      const result = auditListing({
        platform: app.platform,
        title: listing.title,
        subtitle: listing.subtitle,
        keywordField: listing.keywordField,
        shortDescription: listing.shortDescription,
        fullDescription: listing.fullDescription,
        screenshotCount: listing.screenshotCount,
        hasVideo: listing.hasVideo,
        ratingAverage: listing.ratingAverage,
        ratingCount: listing.ratingCount,
      });

      return { ...result, capturedAt: listing.capturedAt };
    }),

  listings: orgProcedure
    .input(z.object({ appId: z.string().cuid(), limit: z.number().int().max(50).default(10) }))
    .query(async ({ ctx, input }) => {
      await assertAppInOrg(ctx.db, input.appId, ctx.organizationId);
      return ctx.db.storeListing.findMany({
        where: { appId: input.appId },
        orderBy: { capturedAt: "desc" },
        take: input.limit,
      });
    }),

  // -------------------------------------------------------------------------
  // Storefronts
  // -------------------------------------------------------------------------

  locales: orgProcedure
    .input(z.object({ appId: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      await assertAppInOrg(ctx.db, input.appId, ctx.organizationId);
      return appStorefronts(input.appId);
    }),

  coverage: orgProcedure
    .input(z.object({ appId: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      await assertAppInOrg(ctx.db, input.appId, ctx.organizationId);
      return localeCoverage(input.appId);
    }),

  addLocale: memberProcedure
    .input(
      z.object({
        appId: z.string().cuid(),
        country: z.string().length(2),
        locale: z.string().min(2).max(10),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertAppInOrg(ctx.db, input.appId, ctx.organizationId);
      // Ensures a primary exists before adding a secondary, so an app can
      // never end up with storefronts but no primary.
      await appStorefronts(input.appId);

      const created = await ctx.db.appLocale.upsert({
        where: {
          appId_country_locale: {
            appId: input.appId,
            country: input.country.toLowerCase(),
            locale: input.locale,
          },
        },
        create: {
          appId: input.appId,
          country: input.country.toLowerCase(),
          locale: input.locale,
        },
        update: { isActive: true },
      });

      await enqueue(
        { type: "app.listing", appId: input.appId },
        { jobId: `app.listing:${input.appId}:${Date.now()}` },
      );

      return created;
    }),

  setPrimaryLocale: memberProcedure
    .input(z.object({ appId: z.string().cuid(), localeId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const app = await assertAppInOrg(ctx.db, input.appId, ctx.organizationId);

      const target = await ctx.db.appLocale.findFirst({
        where: { id: input.localeId, appId: input.appId },
      });
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });

      // Exactly one primary: demote the rest in the same transaction so a
      // failure cannot leave the app with two or none.
      await ctx.db.$transaction([
        ctx.db.appLocale.updateMany({
          where: { appId: input.appId },
          data: { isPrimary: false },
        }),
        ctx.db.appLocale.update({
          where: { id: input.localeId },
          data: { isPrimary: true, isActive: true },
        }),
        // The app's own country/locale mirrors the primary, since that is what
        // headline numbers and single-locale views read.
        ctx.db.app.update({
          where: { id: app.id },
          data: { country: target.country, locale: target.locale },
        }),
      ]);

      return { ok: true };
    }),

  removeLocale: memberProcedure
    .input(z.object({ appId: z.string().cuid(), localeId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertAppInOrg(ctx.db, input.appId, ctx.organizationId);

      const target = await ctx.db.appLocale.findFirst({
        where: { id: input.localeId, appId: input.appId },
      });
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });
      if (target.isPrimary) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Make another storefront primary before removing this one",
        });
      }

      // Snapshots are kept — deleting them would erase the history that the
      // change timeline is built from.
      await ctx.db.appLocale.delete({ where: { id: input.localeId } });
      return { ok: true };
    }),

  /**
   * The listing change log, each entry annotated with what moved afterwards.
   * Computed on demand rather than stored, so it is never stale.
   */
  changes: orgProcedure
    .input(
      z.object({
        appId: z.string().cuid(),
        windowDays: z.number().int().min(3).max(60).default(14),
        limit: z.number().int().max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertAppInOrg(ctx.db, input.appId, ctx.organizationId);
      return listingChanges(input.appId, {
        windowDays: input.windowDays,
        limit: input.limit,
      });
    }),

  /** Current chart position per chart and country, with the day-over-day move. */
  chartRanks: orgProcedure
    .input(z.object({ appId: z.string().cuid(), days: z.number().int().max(365).default(30) }))
    .query(async ({ ctx, input }) => {
      await assertAppInOrg(ctx.db, input.appId, ctx.organizationId);
      const { start, end } = dateRange(input.days);

      const rows = await ctx.db.chartRank.findMany({
        where: { appId: input.appId, date: { gte: start, lte: end } },
        orderBy: { date: "asc" },
      });

      // Group into one series per chart/country/category combination.
      const series = new Map<
        string,
        {
          chart: string;
          country: string;
          category: string;
          scanDepth: number;
          points: { date: string; rank: number | null }[];
        }
      >();

      for (const row of rows) {
        const key = `${row.chart}:${row.country}:${row.category}`;
        const entry =
          series.get(key) ??
          {
            chart: row.chart,
            country: row.country,
            category: row.category,
            scanDepth: row.scanDepth,
            points: [],
          };
        entry.scanDepth = row.scanDepth;
        entry.points.push({ date: ymd(row.date), rank: row.rank });
        series.set(key, entry);
      }

      return Array.from(series.values())
        .map((entry) => {
          const ranked = entry.points.filter((p) => p.rank !== null);
          const latest = entry.points[entry.points.length - 1];
          const previous = entry.points[entry.points.length - 2];

          return {
            ...entry,
            current: latest?.rank ?? null,
            // Positive means the app moved up the chart.
            delta:
              latest?.rank != null && previous?.rank != null
                ? previous.rank - latest.rank
                : null,
            best: ranked.length ? Math.min(...ranked.map((p) => p.rank!)) : null,
            daysCharted: ranked.length,
          };
        })
        // Charted positions first; an app absent from every chart is not the
        // headline.
        .sort((a, b) => (a.current ?? 9999) - (b.current ?? 9999));
    }),

  refresh: memberProcedure
    .input(z.object({ appId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertAppInOrg(ctx.db, input.appId, ctx.organizationId);
      await enqueue({ type: "app.listing", appId: input.appId });
      await enqueue({ type: "app.ranks", appId: input.appId }, { delay: 5000 });
      await enqueue({ type: "app.charts", appId: input.appId }, { delay: 10_000 });
      return { queued: true };
    }),
});
