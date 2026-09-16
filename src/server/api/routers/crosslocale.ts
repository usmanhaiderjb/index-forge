import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { analyzeCrossLocaleKeywords, getCrossLocaleRules } from "@aso/shared";
import { assertAppInOrg, createTRPCRouter, orgProcedure } from "@/server/api/trpc";

export const crossLocaleRouter = createTRPCRouter({
  rules: orgProcedure
    .input(z.object({ country: z.string().length(2) }))
    .query(({ input }) => {
      return getCrossLocaleRules(input.country);
    }),

  matrix: orgProcedure
    .input(z.object({ appId: z.string().cuid(), country: z.string().length(2).default("us") }))
    .query(async ({ ctx, input }) => {
      const app = await assertAppInOrg(ctx.db, input.appId, ctx.organizationId);
      const rules = getCrossLocaleRules(input.country);

      const trackedLocales = await ctx.db.appLocale.findMany({
        where: { appId: app.id, country: input.country.toLowerCase() },
      });

      const trackedSet = new Set(trackedLocales.map((l) => l.locale));

      const localesWithStatus = rules.locales.map((l) => ({
        ...l,
        isTracked: trackedSet.has(l.locale) || (l.isPrimary && app.locale === l.locale),
      }));

      return {
        ...rules,
        locales: localesWithStatus,
        coveragePct: Math.round(
          (localesWithStatus.filter((l) => l.isTracked).length / localesWithStatus.length) * 100,
        ),
      };
    }),

  analyzeKeywords: orgProcedure
    .input(
      z.object({
        appId: z.string().cuid(),
        country: z.string().length(2).default("us"),
        keywordsByLocale: z.record(z.string(), z.array(z.string())),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertAppInOrg(ctx.db, input.appId, ctx.organizationId);
      return analyzeCrossLocaleKeywords(input.keywordsByLocale);
    }),
});
