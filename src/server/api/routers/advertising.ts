import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
  buildAdvertisingReport,
  getTrackedAppAdvertisingReport,
  simulateAdBudget,
} from "@/server/aso/builtin/advertising";

export const advertisingRouter = createTRPCRouter({
  inspect: protectedProcedure
    .input(
      z.object({
        platform: z.enum(["IOS", "ANDROID"]).default("IOS"),
        urlOrId: z.string().min(1),
        country: z.string().length(2).default("us"),
      }),
    )
    .query(async ({ input }) => {
      try {
        return await buildAdvertisingReport(input.platform, input.urlOrId, input.country);
      } catch (err) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: (err as Error).message,
        });
      }
    }),

  app: protectedProcedure
    .input(
      z.object({
        appId: z.string().min(1),
      }),
    )
    .query(async ({ input }) => {
      try {
        return await getTrackedAppAdvertisingReport(input.appId);
      } catch (err) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: (err as Error).message,
        });
      }
    }),

  simulate: protectedProcedure
    .input(
      z.object({
        monthlyBudgetUsd: z.number().min(100).max(10_000_000).default(5000),
        platform: z.enum(["IOS", "ANDROID"]).default("IOS"),
        category: z.string().default("Utilities"),
      }),
    )
    .query(({ input }) => {
      return simulateAdBudget(input.monthlyBudgetUsd, input.platform, input.category);
    }),
});
