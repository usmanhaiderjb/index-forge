import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  assertAppInOrg,
  createTRPCRouter,
  memberProcedure,
  orgProcedure,
} from "@/server/api/trpc";
import { encryptJson } from "@/server/crypto";
import { enqueue } from "@/server/jobs/queues";
import { rateLimit } from "@/server/redis";
import { getAccessToken, parseServiceAccount } from "@/server/push/fcm";

/**
 * Push campaigns.
 *
 * The point of the feature: Firebase makes you send a notification once per
 * project, from a console that has no idea the other eleven apps exist. This is
 * one composer across a portfolio.
 *
 * What it cannot do, and the UI says so: reach "all users" the way the Firebase
 * Console does. The public API has no such target — see docs/PUSH-PLAN.md §1.
 */

/**
 * A topic name Firebase will accept.
 *
 * Validated here rather than discovered at send time, because an invalid topic
 * fails per-app with INVALID_ARGUMENT and looks like eleven separate problems.
 */
const topicPattern = /^[a-zA-Z0-9-_.~%]{1,900}$/;

const targetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("TOPIC"), topic: z.string().regex(topicPattern, {
    message: "Topic names may only contain letters, numbers and - _ . ~ %",
  }) }),
  z.object({ kind: z.literal("CONDITION"), condition: z.string().min(3).max(500) }),
]);

export const pushRouter = createTRPCRouter({
  /* ------------------------------------------------------------ credentials */

  /**
   * Which apps can be sent to, and which cannot yet.
   *
   * Returns every app rather than only the configured ones — "you have eleven
   * apps and three of them can receive a push" is the useful answer, and a list
   * that silently omits the unconfigured ones hides the setup work.
   */
  readiness: orgProcedure.query(async ({ ctx }) => {
    const apps = await ctx.db.app.findMany({
      where: { organizationId: ctx.organizationId },
      select: {
        id: true,
        name: true,
        platform: true,
        iconUrl: true,
        pushCredential: {
          select: {
            projectId: true,
            clientEmail: true,
            status: true,
            lastError: true,
            lastVerifiedAt: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    return apps.map((app) => ({
      id: app.id,
      name: app.name,
      platform: app.platform,
      iconUrl: app.iconUrl,
      credential: app.pushCredential,
      ready: app.pushCredential?.status === "ACTIVE",
    }));
  }),

  /**
   * Store a service account for one app.
   *
   * The key is verified against Google before it is saved. Storing an unusable
   * key and finding out during a campaign attaches the failure to the send
   * rather than to the upload that caused it.
   */
  saveCredential: memberProcedure
    .input(z.object({ appId: z.string().cuid(), serviceAccountJson: z.string().min(50) }))
    .mutation(async ({ ctx, input }) => {
      await assertAppInOrg(ctx.db, input.appId, ctx.organizationId);

      const parsed = parseServiceAccount(input.serviceAccountJson);
      if ("error" in parsed) {
        throw new TRPCError({ code: "BAD_REQUEST", message: parsed.error });
      }

      // Prove it can actually mint a token before we keep it.
      let status: "ACTIVE" | "INVALID" = "ACTIVE";
      let lastError: string | null = null;
      try {
        await getAccessToken(parsed);
      } catch (error) {
        status = "INVALID";
        lastError =
          error instanceof Error
            ? `Google rejected this key: ${error.message}`
            : "Google rejected this key.";
      }

      const credential = await ctx.db.pushCredential.upsert({
        where: { appId: input.appId },
        create: {
          organizationId: ctx.organizationId,
          appId: input.appId,
          projectId: parsed.project_id,
          clientEmail: parsed.client_email,
          credentials: encryptJson(parsed),
          status,
          lastError,
          lastVerifiedAt: status === "ACTIVE" ? new Date() : null,
          createdById: ctx.session.user.id,
        },
        update: {
          projectId: parsed.project_id,
          clientEmail: parsed.client_email,
          credentials: encryptJson(parsed),
          status,
          lastError,
          lastVerifiedAt: status === "ACTIVE" ? new Date() : null,
        },
        select: { id: true, projectId: true, clientEmail: true, status: true, lastError: true },
      });

      await ctx.db.auditLog.create({
        data: {
          organizationId: ctx.organizationId,
          actorId: ctx.session.user.id,
          action: "push.credential.save",
          targetType: "App",
          targetId: input.appId,
          // Deliberately no key material, not even a fingerprint of the private
          // half. The client email identifies which key this was.
          meta: { projectId: parsed.project_id, clientEmail: parsed.client_email, status },
        },
      });

      return credential;
    }),

  removeCredential: memberProcedure
    .input(z.object({ appId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertAppInOrg(ctx.db, input.appId, ctx.organizationId);
      await ctx.db.pushCredential.deleteMany({ where: { appId: input.appId } });

      await ctx.db.auditLog.create({
        data: {
          organizationId: ctx.organizationId,
          actorId: ctx.session.user.id,
          action: "push.credential.remove",
          targetType: "App",
          targetId: input.appId,
        },
      });

      return { ok: true };
    }),

  /* -------------------------------------------------------------- campaigns */

  /**
   * Compose and queue a campaign.
   *
   * Sending happens on the queue: twelve apps is twelve independent calls to
   * twelve Firebase projects, and a request that waits for all of them times out
   * on exactly the campaigns that matter most.
   */
  send: memberProcedure
    .input(
      z.object({
        title: z.string().min(1).max(120),
        body: z.string().min(1).max(1000),
        imageUrl: z.string().url().max(2000).optional().nullable(),
        linkUrl: z.string().url().max(2000).optional().nullable(),
        appIds: z.array(z.string().cuid()).min(1).max(100),
        target: targetSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      /*
       * A tighter limit than the generic 60-writes-a-minute on every mutation.
       *
       * This is the one procedure in the product that pushes a notification to
       * other people's phones. A loop here does not cost us a database row; it
       * costs a customer their users' goodwill and, if Firebase notices,
       * their project. Ten campaigns an hour is far above any real editorial
       * cadence and far below anything that looks like abuse.
       *
       * Fails open if Redis is unreachable — the same choice the generic
       * limiter makes, because refusing to send during a Redis outage is worse
       * than the risk it guards against.
       */
      const limit = await rateLimit(`push:send:${ctx.organizationId}`, 10, 3600).catch(
        () => null,
      );
      if (limit && !limit.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `That is a lot of campaigns in one hour. Try again in ${Math.ceil(
            limit.resetIn / 60,
          )} minutes.`,
        });
      }

      // Every app must belong to the caller's organization. Checked before
      // anything is written, so a bad id cannot create a half-built campaign.
      const apps = await ctx.db.app.findMany({
        where: { id: { in: input.appIds }, organizationId: ctx.organizationId },
        select: { id: true, pushCredential: { select: { status: true } } },
      });

      if (apps.length !== input.appIds.length) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "One or more of those apps is not in this workspace.",
        });
      }

      const sendable = apps.filter((a) => a.pushCredential?.status === "ACTIVE");
      if (sendable.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "None of the selected apps has a working Firebase key yet. Add one under Push settings first.",
        });
      }

      const campaign = await ctx.db.pushCampaign.create({
        data: {
          organizationId: ctx.organizationId,
          title: input.title,
          body: input.body,
          imageUrl: input.imageUrl ?? null,
          linkUrl: input.linkUrl ?? null,
          target: input.target.kind,
          targetValue:
            input.target.kind === "TOPIC" ? input.target.topic : input.target.condition,
          status: "QUEUED",
          createdById: ctx.session.user.id,
          deliveries: {
            // Apps without a working key are recorded as SKIPPED rather than
            // dropped, so the campaign shows what did not go out and why.
            create: apps.map((app) => ({
              appId: app.id,
              status: app.pushCredential?.status === "ACTIVE" ? "PENDING" : "SKIPPED",
              error:
                app.pushCredential?.status === "ACTIVE"
                  ? null
                  : "No working Firebase key for this app.",
            })),
          },
        },
        select: { id: true },
      });

      await enqueue({ type: "push.send", campaignId: campaign.id });

      await ctx.db.auditLog.create({
        data: {
          organizationId: ctx.organizationId,
          actorId: ctx.session.user.id,
          action: "push.campaign.send",
          targetType: "PushCampaign",
          targetId: campaign.id,
          meta: {
            apps: sendable.length,
            skipped: apps.length - sendable.length,
            target: input.target.kind,
            title: input.title,
          },
        },
      });

      return { id: campaign.id, queued: sendable.length, skipped: apps.length - sendable.length };
    }),

  list: orgProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(25) }))
    .query(async ({ ctx, input }) => {
      const campaigns = await ctx.db.pushCampaign.findMany({
        where: { organizationId: ctx.organizationId },
        orderBy: { createdAt: "desc" },
        take: input.limit,
        select: {
          id: true,
          title: true,
          body: true,
          target: true,
          targetValue: true,
          status: true,
          sentAt: true,
          createdAt: true,
          deliveries: { select: { status: true } },
        },
      });

      return campaigns.map((c) => {
        const counts = { sent: 0, failed: 0, pending: 0, skipped: 0 };
        for (const d of c.deliveries) {
          if (d.status === "SENT") counts.sent++;
          else if (d.status === "FAILED") counts.failed++;
          else if (d.status === "SKIPPED") counts.skipped++;
          else counts.pending++;
        }
        const { deliveries: _deliveries, ...rest } = c;
        return { ...rest, counts };
      });
    }),

  /** One campaign with per-app results — which app failed, and why. */
  byId: orgProcedure
    .input(z.object({ id: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const campaign = await ctx.db.pushCampaign.findFirst({
        where: { id: input.id, organizationId: ctx.organizationId },
        include: {
          deliveries: {
            orderBy: { createdAt: "asc" },
            include: { app: { select: { id: true, name: true, platform: true } } },
          },
        },
      });

      if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });
      return campaign;
    }),
});
