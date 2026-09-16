import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { assertAppInOrg, createTRPCRouter, orgProcedure } from "@/server/api/trpc";
import { inspectTechStack } from "@/server/aso/builtin/techstack";
import { getAsoProvider } from "@/server/aso/provider";

export const techStackRouter = createTRPCRouter({
  inspect: orgProcedure
    .input(z.object({ appId: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const app = await assertAppInOrg(ctx.db, input.appId, ctx.organizationId);
      const provider = await getAsoProvider();

      const detail = await provider.getApp(app.platform, app.storeId, {
        country: app.country,
        locale: app.locale,
      });

      if (!detail) {
        return inspectTechStack({
          platform: app.platform,
          storeId: app.storeId,
          name: app.name,
          developer: app.developer ?? undefined,
          iconUrl: app.iconUrl ?? undefined,
        });
      }

      return inspectTechStack(detail);
    }),
});
