import { TRPCError } from "@trpc/server";
import { createTRPCRouter, orgProcedure } from "@/server/api/trpc";
import { auditPortfolioCannibalization } from "@/server/aso/builtin/cannibalization";

export const cannibalizationRouter = createTRPCRouter({
  audit: orgProcedure.query(async ({ ctx }) => {
    try {
      return await auditPortfolioCannibalization(ctx.organizationId);
    } catch (err) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: (err as Error).message,
      });
    }
  }),
});
