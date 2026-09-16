import { Sentiment } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { dateRange, eachDay, ymd } from "@aso/shared";
import {
  assertAppInOrg,
  createTRPCRouter,
  memberProcedure,
  orgProcedure,
} from "@/server/api/trpc";
import { aiConfigured } from "@/server/ai/client";
import { draftReviewReply } from "@/server/ai/engine";
import { replyLimitBySource, replyLimitFor, replyToReview } from "@/server/reviews/reply";
import { rateLimit } from "@/server/redis";

export const reviewRouter = createTRPCRouter({
  list: orgProcedure
    .input(
      z.object({
        appId: z.string().cuid(),
        sentiment: z.nativeEnum(Sentiment).optional(),
        rating: z.number().int().min(1).max(5).optional(),
        topic: z.string().optional(),
        unrepliedOnly: z.boolean().default(false),
        cursor: z.string().cuid().optional(),
        limit: z.number().int().max(100).default(25),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertAppInOrg(ctx.db, input.appId, ctx.organizationId);

      const reviews = await ctx.db.review.findMany({
        where: {
          appId: input.appId,
          ...(input.sentiment ? { sentiment: input.sentiment } : {}),
          ...(input.rating ? { rating: input.rating } : {}),
          ...(input.topic ? { topics: { has: input.topic } } : {}),
          ...(input.unrepliedOnly ? { developerReply: null } : {}),
        },
        orderBy: { submittedAt: "desc" },
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      });

      const hasMore = reviews.length > input.limit;
      const items = hasMore ? reviews.slice(0, input.limit) : reviews;

      return { items, nextCursor: hasMore ? items[items.length - 1]?.id : undefined };
    }),

  stats: orgProcedure
    .input(z.object({ appId: z.string().cuid(), days: z.number().int().max(365).default(30) }))
    .query(async ({ ctx, input }) => {
      await assertAppInOrg(ctx.db, input.appId, ctx.organizationId);
      const { start, end } = dateRange(input.days);

      const reviews = await ctx.db.review.findMany({
        where: { appId: input.appId, submittedAt: { gte: start, lte: end } },
        select: { rating: true, sentiment: true, topics: true, submittedAt: true, developerReply: true },
      });

      const byRating = [1, 2, 3, 4, 5].map((rating) => ({
        rating,
        count: reviews.filter((r) => r.rating === rating).length,
      }));

      const bySentiment = Object.values(Sentiment).map((sentiment) => ({
        sentiment,
        count: reviews.filter((r) => r.sentiment === sentiment).length,
      }));

      const topicCounts = new Map<string, number>();
      for (const review of reviews) {
        for (const topic of review.topics) {
          topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
        }
      }

      // Daily volume, zero-filled so the chart axis stays honest.
      const daily = new Map(eachDay(start, end).map((d) => [ymd(d), { date: ymd(d), count: 0, average: 0 }]));
      const dailyRatings = new Map<string, number[]>();

      for (const review of reviews) {
        const key = ymd(review.submittedAt);
        const row = daily.get(key);
        if (!row) continue;
        row.count++;
        const ratings = dailyRatings.get(key) ?? [];
        ratings.push(review.rating);
        dailyRatings.set(key, ratings);
      }

      for (const [key, ratings] of dailyRatings) {
        const row = daily.get(key);
        if (row) row.average = ratings.reduce((a, b) => a + b, 0) / ratings.length;
      }

      return {
        total: reviews.length,
        average: reviews.length
          ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
          : 0,
        unreplied: reviews.filter((r) => !r.developerReply).length,
        byRating,
        bySentiment,
        topics: Array.from(topicCounts.entries())
          .map(([topic, count]) => ({ topic, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 20),
        daily: Array.from(daily.values()),
      };
    }),

  /** The store's own reply limit, so the editor can enforce it before sending. */
  replyLimit: orgProcedure
    .input(z.object({ reviewId: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      try {
        return { limit: await replyLimitFor(input.reviewId, ctx.organizationId), canReply: true };
      } catch (error) {
        // Still report the store's real limit so the counter is not wrong
        // while the user reads why they cannot publish yet.
        return {
          limit: await replyLimitBySource(input.reviewId, ctx.organizationId),
          canReply: false,
          reason: error instanceof Error ? error.message : "Replies are unavailable",
        };
      }
    }),

  /** Drafts a reply for a human to read and edit. Never publishes. */
  draftReply: memberProcedure
    .input(
      z.object({
        reviewId: z.string().cuid(),
        instructions: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!aiConfigured()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Drafting needs GEMINI_API_KEY or ANTHROPIC_API_KEY set on this deployment",
        });
      }

      const review = await ctx.db.review.findFirst({
        where: { id: input.reviewId, app: { organizationId: ctx.organizationId } },
      });
      if (!review) throw new TRPCError({ code: "NOT_FOUND" });

      const { allowed, resetIn } = await rateLimit(
        `ai:${ctx.organizationId}:review-reply`,
        20,
        60,
      );
      if (!allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Too many drafts. Try again in ${resetIn}s.`,
        });
      }

      const limit = await replyLimitFor(input.reviewId, ctx.organizationId).catch(() =>
        replyLimitBySource(input.reviewId, ctx.organizationId),
      );
      const { data } = await draftReviewReply(ctx.organizationId, input.reviewId, {
        charLimit: limit,
        instructions: input.instructions,
      });

      // The model is told the limit, but an over-length draft is reported as
      // such rather than silently truncated into something ungrammatical.
      return { ...data, charCount: data.reply.length, limit, overLimit: data.reply.length > limit };
    }),

  /**
   * Publishes a reply to the store.
   *
   * This is public content under the developer's name, so it is deliberately a
   * separate, explicit action — nothing here is triggered by drafting.
   */
  reply: memberProcedure
    .input(
      z.object({
        reviewId: z.string().cuid(),
        body: z.string().min(1).max(6000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await replyToReview(input.reviewId, ctx.organizationId, input.body);
        return { ok: true, repliedAt: result.repliedAt };
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Could not publish the reply",
        });
      }
    }),
});
