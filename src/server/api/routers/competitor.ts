import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { assertAppInOrg, createTRPCRouter, memberProcedure, orgProcedure } from "@/server/api/trpc";
import { keywordGaps } from "@/server/aso/analysis";
import { getAsoProvider } from "@/server/aso/provider";
import { enqueue } from "@/server/jobs/queues";

export const competitorRouter = createTRPCRouter({
  list: orgProcedure
    .input(z.object({ appId: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      await assertAppInOrg(ctx.db, input.appId, ctx.organizationId);

      const competitors = await ctx.db.competitor.findMany({
        where: { appId: input.appId },
        include: { snapshots: { orderBy: { capturedAt: "desc" }, take: 2 } },
        orderBy: { createdAt: "asc" },
      });

      return competitors.map((competitor) => {
        const [latest, previous] = competitor.snapshots;
        return {
          ...competitor,
          latest,
          // A title or description change is the signal worth surfacing.
          changedSinceLast: Boolean(previous && previous.contentHash !== latest?.contentHash),
        };
      });
    }),

  add: memberProcedure
    .input(z.object({ appId: z.string().cuid(), storeId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const app = await assertAppInOrg(ctx.db, input.appId, ctx.organizationId);
      const provider = await getAsoProvider();

      const detail = await provider.getApp(app.platform, input.storeId, {
        country: app.country,
        locale: app.locale,
      });

      if (!detail) {
        throw new TRPCError({ code: "NOT_FOUND", message: "That app is not in this storefront" });
      }
      if (detail.storeId === app.storeId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "An app cannot compete with itself" });
      }

      const competitor = await ctx.db.competitor.upsert({
        where: {
          appId_platform_storeId_country: {
            appId: input.appId,
            platform: app.platform,
            storeId: input.storeId,
            country: app.country,
          },
        },
        create: {
          appId: input.appId,
          platform: app.platform,
          storeId: input.storeId,
          name: detail.name,
          developer: detail.developer,
          iconUrl: detail.iconUrl,
          country: app.country,
        },
        update: { isTracked: true },
      });

      await enqueue({ type: "app.competitors", appId: input.appId }, { delay: 3000 });
      return competitor;
    }),

  setTracked: memberProcedure
    .input(z.object({ appId: z.string().cuid(), competitorId: z.string().cuid(), isTracked: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await assertAppInOrg(ctx.db, input.appId, ctx.organizationId);
      return ctx.db.competitor.update({
        where: { id: input.competitorId },
        data: { isTracked: input.isTracked },
      });
    }),

  remove: memberProcedure
    .input(z.object({ appId: z.string().cuid(), competitorId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertAppInOrg(ctx.db, input.appId, ctx.organizationId);
      await ctx.db.competitor.delete({ where: { id: input.competitorId } });
      return { ok: true };
    }),

  /** Terms at least two competitors use that our listing never mentions. */
  keywordGaps: orgProcedure
    .input(z.object({ appId: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const app = await assertAppInOrg(ctx.db, input.appId, ctx.organizationId);

      const [listing, competitors] = await Promise.all([
        ctx.db.storeListing.findFirst({
          where: { appId: input.appId },
          orderBy: { capturedAt: "desc" },
        }),
        ctx.db.competitor.findMany({
          where: { appId: input.appId, isTracked: true },
          include: { snapshots: { orderBy: { capturedAt: "desc" }, take: 1 } },
        }),
      ]);

      if (!listing) return [];

      return keywordGaps(
        {
          platform: app.platform,
          title: listing.title,
          subtitle: listing.subtitle,
          keywordField: listing.keywordField,
          shortDescription: listing.shortDescription,
          fullDescription: listing.fullDescription,
        },
        competitors
          .filter((c) => c.snapshots[0])
          .map((c) => ({
            platform: c.platform,
            title: c.snapshots[0]!.title,
            subtitle: c.snapshots[0]!.subtitle,
            fullDescription: c.snapshots[0]!.description,
          })),
      );
    }),

  refresh: memberProcedure
    .input(z.object({ appId: z.string().cuid(), discover: z.boolean().default(false) }))
    .mutation(async ({ ctx, input }) => {
      await assertAppInOrg(ctx.db, input.appId, ctx.organizationId);
      await enqueue({ type: "app.competitors", appId: input.appId });
      return { queued: true };
    }),
});
