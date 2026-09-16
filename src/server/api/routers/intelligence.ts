import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { buildFullAppIntelligence, compareTwoApps } from "@/server/aso/builtin/intelligence";
import { fastCache } from "@/server/cache/fast-cache";

export const intelligenceRouter = createTRPCRouter({
  inspectApp: protectedProcedure
    .input(
      z.object({
        platform: z.enum(["IOS", "ANDROID"]).default("IOS"),
        urlOrId: z.string().min(1),
        country: z.string().length(2).default("us"),
      }),
    )
    .query(async ({ input }) => {
      const cacheKey = `intelligence:dossier:${input.platform}:${input.urlOrId.trim()}:${input.country}`;
      return await fastCache.getOrSet(cacheKey, 1800, async () => {
        try {
          return await buildFullAppIntelligence(input.platform, input.urlOrId, input.country);
        } catch (err) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: (err as Error).message,
          });
        }
      });
    }),

  compareApps: protectedProcedure
    .input(
      z.object({
        appA: z.object({
          platform: z.enum(["IOS", "ANDROID"]).default("IOS"),
          urlOrId: z.string().min(1),
        }),
        appB: z.object({
          platform: z.enum(["IOS", "ANDROID"]).default("IOS"),
          urlOrId: z.string().min(1),
        }),
        country: z.string().length(2).default("us"),
      }),
    )
    .query(async ({ input }) => {
      const cacheKey = `intelligence:battlecard:${input.appA.platform}:${input.appA.urlOrId.trim()}:${input.appB.platform}:${input.appB.urlOrId.trim()}:${input.country}`;
      return await fastCache.getOrSet(cacheKey, 1800, async () => {
        try {
          return await compareTwoApps(
            input.appA.platform,
            input.appA.urlOrId,
            input.appB.platform,
            input.appB.urlOrId,
            input.country,
          );
        } catch (err) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: (err as Error).message,
          });
        }
      });
    }),
});
