import { AlertComparator, AlertStatus, MetricKey, Severity } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { adminProcedure, createTRPCRouter, memberProcedure, orgProcedure } from "@/server/api/trpc";
import { enqueue } from "@/server/jobs/queues";
import { deliverAlert, parseChannels, webhookSecret } from "@/server/notify";

const ruleInput = z.object({
  name: z.string().min(1).max(120),
  appId: z.string().cuid().nullable().optional(),
  metric: z.nativeEnum(MetricKey),
  comparator: z.nativeEnum(AlertComparator),
  threshold: z.number(),
  windowDays: z.number().int().min(1).max(90).default(1),
  severity: z.nativeEnum(Severity).default("MEDIUM"),
  channels: z
    .object({
      email: z.array(z.string().email()).optional(),
      webhook: z.string().url().optional(),
    })
    .optional(),
});

export const alertRouter = createTRPCRouter({
  rules: orgProcedure.query(async ({ ctx }) => {
    return ctx.db.alertRule.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { createdAt: "desc" },
      include: {
        app: { select: { id: true, name: true } },
        _count: { select: { events: true } },
      },
    });
  }),

  create: memberProcedure.input(ruleInput).mutation(async ({ ctx, input }) => {
    if (input.appId) {
      const app = await ctx.db.app.findFirst({
        where: { id: input.appId, organizationId: ctx.organizationId },
      });
      if (!app) throw new TRPCError({ code: "NOT_FOUND", message: "App not found" });
    }

    return ctx.db.alertRule.create({
      data: {
        organizationId: ctx.organizationId,
        name: input.name,
        appId: input.appId ?? null,
        metric: input.metric,
        comparator: input.comparator,
        threshold: input.threshold,
        windowDays: input.windowDays,
        severity: input.severity,
        channels: (input.channels ?? undefined) as never,
      },
    });
  }),

  update: memberProcedure
    .input(ruleInput.partial().extend({ ruleId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const { ruleId, channels, ...rest } = input;
      const rule = await ctx.db.alertRule.findFirst({
        where: { id: ruleId, organizationId: ctx.organizationId },
      });
      if (!rule) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.db.alertRule.update({
        where: { id: ruleId },
        data: { ...rest, ...(channels ? { channels: channels as never } : {}) },
      });
    }),

  setEnabled: memberProcedure
    .input(z.object({ ruleId: z.string().cuid(), isEnabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const rule = await ctx.db.alertRule.findFirst({
        where: { id: input.ruleId, organizationId: ctx.organizationId },
      });
      if (!rule) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.alertRule.update({
        where: { id: input.ruleId },
        data: { isEnabled: input.isEnabled },
      });
    }),

  remove: memberProcedure
    .input(z.object({ ruleId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const rule = await ctx.db.alertRule.findFirst({
        where: { id: input.ruleId, organizationId: ctx.organizationId },
      });
      if (!rule) throw new TRPCError({ code: "NOT_FOUND" });
      await ctx.db.alertRule.delete({ where: { id: input.ruleId } });
      return { ok: true };
    }),

  events: orgProcedure
    .input(
      z.object({
        status: z.nativeEnum(AlertStatus).optional(),
        limit: z.number().int().max(100).default(25),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.alertEvent.findMany({
        where: {
          rule: { organizationId: ctx.organizationId },
          ...(input.status ? { status: input.status } : {}),
        },
        orderBy: { triggeredAt: "desc" },
        take: input.limit,
        include: {
          rule: {
            select: {
              id: true,
              name: true,
              metric: true,
              severity: true,
              app: { select: { name: true } },
            },
          },
        },
      });
    }),

  setEventStatus: memberProcedure
    .input(z.object({ eventId: z.string().cuid(), status: z.nativeEnum(AlertStatus) }))
    .mutation(async ({ ctx, input }) => {
      const event = await ctx.db.alertEvent.findFirst({
        where: { id: input.eventId, rule: { organizationId: ctx.organizationId } },
      });
      if (!event) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.db.alertEvent.update({
        where: { id: input.eventId },
        data: {
          status: input.status,
          resolvedAt: input.status === "RESOLVED" ? new Date() : null,
        },
      });
    }),

  evaluateNow: memberProcedure.mutation(async ({ ctx }) => {
    await enqueue(
      { type: "alerts.evaluate", organizationId: ctx.organizationId },
      { jobId: `alerts.evaluate:${ctx.organizationId}:${Date.now()}` },
    );
    return { queued: true };
  }),

  /** The signing secret receivers use to verify our webhook deliveries. */
  webhookSecret: adminProcedure.query(({ ctx }) => ({
    secret: webhookSecret(ctx.organizationId),
    header: "X-ASO-Signature",
    algorithm: "HMAC-SHA256 over `${X-ASO-Timestamp}.${rawBody}`",
  })),

  /**
   * Fires a marked test event and delivers it inline.
   *
   * Deliberately not queued: the whole point is to hand the user the delivery
   * error immediately, and a queued job would only surface it in a log.
   */
  sendTest: memberProcedure
    .input(z.object({ ruleId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const rule = await ctx.db.alertRule.findFirst({
        where: { id: input.ruleId, organizationId: ctx.organizationId },
        include: { app: true },
      });
      if (!rule) throw new TRPCError({ code: "NOT_FOUND" });

      const channels = parseChannels(rule.channels);
      if (!channels.webhook && !channels.email?.length) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Add a webhook URL or an email address to this rule first",
        });
      }

      const event = await ctx.db.alertEvent.create({
        data: {
          ruleId: rule.id,
          isTest: true,
          status: "RESOLVED",
          value: rule.threshold,
          baseline: null,
          message: `Test delivery for "${rule.name}". If you are reading this, the channel works.`,
        },
      });

      try {
        const outcome = await deliverAlert(event.id);
        return { ok: true, outcome };
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Delivery failed",
        });
      }
    }),

  /** Re-attempts a delivery that failed, without re-firing the alert. */
  redeliver: memberProcedure
    .input(z.object({ eventId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      const event = await ctx.db.alertEvent.findFirst({
        where: { id: input.eventId, rule: { organizationId: ctx.organizationId } },
      });
      if (!event) throw new TRPCError({ code: "NOT_FOUND" });

      try {
        const outcome = await deliverAlert(event.id);
        return { ok: true, outcome };
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Delivery failed",
        });
      }
    }),
});
