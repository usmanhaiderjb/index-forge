import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { generateCppStrategy } from "@/server/aso/builtin/cpp";

export const cppRouter = createTRPCRouter({
  strategy: protectedProcedure
    .input(
      z.object({
        appId: z.string().min(1),
      }),
    )
    .query(async ({ input }) => {
      try {
        return await generateCppStrategy(input.appId);
      } catch (err) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: (err as Error).message,
        });
      }
    }),
});
