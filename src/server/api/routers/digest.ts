import { DigestCadence } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, memberProcedure, orgProcedure } from "@/server/api/trpc";
import { buildDigest, digestChannels, renderDigestText } from "@/server/digest";
import { deliverReport } from "@/server/notify";

const channelsInput = z
  .object({
    webhook: z.string().url().optional(),
    email: z.array(z.string().email()).optional(),
  })
  .optional();

export const digestRouter = createTRPCRouter({
  list: orgProcedure.query(async ({ ctx }) => {
    return ctx.db.digest.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { createdAt: "desc" },
    });
  }),

  /** Renders the digest without sending it, so the content can be reviewed first. */
  preview: orgProcedure
    .input(
      z.object({
        cadence: z.nativeEnum(DigestCadence).default("WEEKLY"),
        appIds: z.array(z.string().cuid()).default([]),
      }),
    )
    .query(async ({ ctx, input }) => {
      const data = await buildDigest(ctx.organizationId, {
        days: input.cadence === "DAILY" ? 1 : 7,
        appIds: input.appIds,
      });
      return { data, text: renderDigestText(data) };
    }),

  create: memberProcedure
    .input(
      z.object({
        name: z.string().min(1).max(120),
        cadence: z.nativeEnum(DigestCadence).default("WEEKLY"),
        sendHourUtc: z.number().int().min(0).max(23).default(8),
        appIds: z.array(z.string().cuid()).default([]),
        channels: channelsInput,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // An empty appIds means "every active app", so the digest keeps working
      // as apps are added rather than silently omitting them.
      if (input.appIds.length > 0) {
        const count = await ctx.db.app.count({
          where: { id: { in: input.appIds }, organizationId: ctx.organizationId },
        });
        if (count !== input.appIds.length) {
          throw new TRPCError({ code: "NOT_FOUND", message: "One of those apps does not exist" });
        }
      }

      return ctx.db.digest.create({
        data: {
          organizationId: ctx.organizationId,
          name: input.name,
          cadence: input.cadence,
          sendHourUtc: input.sendHourUtc,
          appIds: input.appIds,
          channels: (input.channels ?? undefined) as never,
        },
      });
    }),

  setEnabled: memberProcedure
    .input(z.object({ digestId: z.string().cuid(), isEnabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const digest = await ctx.db.digest.findFirst({
        where: { id: input.digestId, organizationId: ctx.organizationId },
      });
      if (!digest) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.db.digest.update({
        where: { id: input.digestId },
        data: { isEnabled: input.isEnabled },
      });
    }),

  remove: memberProcedure
    .input(z.object({ digestId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const digest = await ctx.db.digest.findFirst({
        where: { id: input.digestId, organizationId: ctx.organizationId },
      });
      if (!digest) throw new TRPCError({ code: "NOT_FOUND" });

      await ctx.db.digest.delete({ where: { id: input.digestId } });
      return { ok: true };
    }),

  /** Sends now, inline, so a delivery failure is reported to the caller. */
  sendNow: memberProcedure
    .input(z.object({ digestId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const digest = await ctx.db.digest.findFirst({
        where: { id: input.digestId, organizationId: ctx.organizationId },
      });
      if (!digest) throw new TRPCError({ code: "NOT_FOUND" });

      const channels = digestChannels(digest.channels);
      if (!channels.webhook && !channels.email?.length) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Add a webhook URL or an email address to this digest first",
        });
      }

      const data = await buildDigest(ctx.organizationId, {
        days: digest.cadence === "DAILY" ? 1 : 7,
        appIds: digest.appIds,
      });

      try {
        const outcome = await deliverReport({
          organizationId: ctx.organizationId,
          channels,
          subject: `${data.cadence} ASO summary — ${data.organizationName}`,
          text: renderDigestText(data),
        });

        await ctx.db.digest.update({
          where: { id: digest.id },
          data: { lastSentAt: new Date(), lastError: null },
        });

        return { ok: true, outcome };
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Delivery failed",
        });
      }
    }),
});
