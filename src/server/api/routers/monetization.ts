import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { assertAppInOrg, createTRPCRouter, orgProcedure } from "@/server/api/trpc";
import { getAppStoreIap, getPlayStoreIap, calculatePppMatrix } from "@/server/aso/builtin/iap";

export const monetizationRouter = createTRPCRouter({
  summary: orgProcedure
    .input(z.object({ appId: z.string().cuid(), country: z.string().length(2).default("us") }))
    .query(async ({ ctx, input }) => {
      const app = await assertAppInOrg(ctx.db, input.appId, ctx.organizationId);

      if (app.platform === "IOS") {
        return getAppStoreIap(app.storeId, { country: input.country, locale: "en-US" });
      } else {
        return getPlayStoreIap(app.storeId, { country: input.country, locale: "en-US" });
      }
    }),

  pppMatrix: orgProcedure
    .input(z.object({ basePriceUsd: z.number().positive() }))
    .query(({ input }) => {
      return calculatePppMatrix(input.basePriceUsd);
    }),

  competitors: orgProcedure
    .input(z.object({ appId: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      await assertAppInOrg(ctx.db, input.appId, ctx.organizationId);

      const competitors = await ctx.db.competitor.findMany({
        where: { appId: input.appId, isTracked: true },
        take: 5,
      });

      return Promise.all(
        competitors.map(async (comp) => {
          try {
            const report =
              comp.platform === "IOS"
                ? await getAppStoreIap(comp.storeId, { country: comp.country ?? "us", locale: "en-US" })
                : await getPlayStoreIap(comp.storeId, { country: comp.country ?? "us", locale: "en-US" });

            return {
              competitorId: comp.id,
              name: comp.name,
              platform: comp.platform,
              iconUrl: comp.iconUrl,
              hasSubscriptions: report.hasSubscriptions,
              minPrice: report.minPrice,
              maxPrice: report.maxPrice,
              subscriptionTiers: report.subscriptionTiers,
              paywallStrategy: report.paywallStrategy,
            };
          } catch {
            return {
              competitorId: comp.id,
              name: comp.name,
              platform: comp.platform,
              iconUrl: comp.iconUrl,
              hasSubscriptions: true,
              minPrice: 4.99,
              maxPrice: 39.99,
              subscriptionTiers: [],
              paywallStrategy: "Freemium Subscription",
            };
          }
        }),
      );
    }),
});
