import { ListingField, RecommendationStatus } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { assertAppInOrg, createTRPCRouter, memberProcedure, orgProcedure } from "@/server/api/trpc";
import { aiConfigured, usageSummary } from "@/server/ai/client";
import {
  analyzeCompetitorGap,
  analyzeScreenshots,
  generateKeywordStrategy,
  generateMetadataVariants,
  generateRecommendations,
  summarizeReviewThemes,
} from "@/server/ai/engine";
import { FIELD_LIMITS } from "@/server/aso/analysis";
import { enqueue } from "@/server/jobs/queues";
import { rateLimit } from "@/server/redis";

/** AI calls are the expensive path — cap them per organization per minute. */
async function guard(organizationId: string, feature: string, perMinute = 10) {
  if (!aiConfigured()) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "AI features need GEMINI_API_KEY or ANTHROPIC_API_KEY set on this deployment",
    });
  }
  const { allowed, resetIn } = await rateLimit(`ai:${organizationId}:${feature}`, perMinute, 60);
  if (!allowed) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Too many AI requests. Try again in ${resetIn}s.`,
    });
  }
}

export const aiRouter = createTRPCRouter({
  status: orgProcedure.query(async ({ ctx }) => ({
    configured: aiConfigured(),
    usage: aiConfigured() ? await usageSummary(ctx.organizationId) : null,
  })),

  insights: orgProcedure
    .input(
      z.object({
        appId: z.string().cuid().optional(),
        unreadOnly: z.boolean().default(false),
        limit: z.number().int().max(100).default(25),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (input.appId) await assertAppInOrg(ctx.db, input.appId, ctx.organizationId);

      return ctx.db.aiInsight.findMany({
        where: {
          organizationId: ctx.organizationId,
          ...(input.appId ? { appId: input.appId } : {}),
          ...(input.unreadOnly ? { isRead: false } : {}),
        },
        orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
        take: input.limit,
        include: { app: { select: { id: true, name: true, platform: true, iconUrl: true } } },
      });
    }),

  markRead: memberProcedure
    .input(z.object({ insightId: z.string().cuid(), isRead: z.boolean().default(true) }))
    .mutation(async ({ ctx, input }) => {
      const insight = await ctx.db.aiInsight.findFirst({
        where: { id: input.insightId, organizationId: ctx.organizationId },
      });
      if (!insight) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.aiInsight.update({
        where: { id: input.insightId },
        data: { isRead: input.isRead },
      });
    }),

  recommendations: orgProcedure
    .input(
      z.object({
        appId: z.string().cuid(),
        status: z.nativeEnum(RecommendationStatus).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertAppInOrg(ctx.db, input.appId, ctx.organizationId);
      return ctx.db.aiRecommendation.findMany({
        where: {
          appId: input.appId,
          ...(input.status ? { status: input.status } : { status: { not: "DISMISSED" } }),
        },
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      });
    }),

  setRecommendationStatus: memberProcedure
    .input(
      z.object({
        appId: z.string().cuid(),
        recommendationId: z.string().cuid(),
        status: z.nativeEnum(RecommendationStatus),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertAppInOrg(ctx.db, input.appId, ctx.organizationId);
      return ctx.db.aiRecommendation.update({
        where: { id: input.recommendationId },
        data: {
          status: input.status,
          appliedAt: input.status === "APPLIED" ? new Date() : null,
        },
      });
    }),

  // -------------------------------------------------------------------------
  // Generation
  // -------------------------------------------------------------------------

  keywordStrategy: memberProcedure
    .input(z.object({ appId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertAppInOrg(ctx.db, input.appId, ctx.organizationId);
      await guard(ctx.organizationId, "keyword-strategy");

      const { data, model } = await generateKeywordStrategy(ctx.organizationId, input.appId);
      const keywords = Array.isArray(data?.keywords) ? data.keywords : [];
      const avoid = Array.isArray(data?.avoid) ? data.avoid : [];
      const summary = data?.summary ?? "";

      await ctx.db.aiInsight.create({
        data: {
          organizationId: ctx.organizationId,
          appId: input.appId,
          type: "KEYWORD_OPPORTUNITY",
          severity: "INFO",
          title: `Keyword strategy — ${keywords.length} terms proposed`,
          summary: summary,
          detail: keywords
            .map(
              (k) =>
                `- **${k.term}** (${k.intent}, ${k.priority}) → ${k.placement}\n  ${k.rationale}`,
            )
            .join("\n"),
          evidence: data as never,
          model,
        },
      });

      return {
        ...data,
        summary,
        keywords,
        avoid,
      };
    }),

  metadataVariants: memberProcedure
    .input(
      z.object({
        appId: z.string().cuid(),
        targetKeywords: z.array(z.string()).optional(),
        count: z.number().int().min(1).max(5).default(3),
        persist: z.boolean().default(true),
        /** Defaults to the app's primary storefront. */
        country: z.string().length(2).optional(),
        locale: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const app = await assertAppInOrg(ctx.db, input.appId, ctx.organizationId);
      await guard(ctx.organizationId, "metadata");

      const storefront =
        input.country && input.locale
          ? { country: input.country, locale: input.locale }
          : undefined;

      const { data, model } = await generateMetadataVariants(ctx.organizationId, input.appId, {
        targetKeywords: input.targetKeywords,
        count: input.count,
        storefront,
      });

      const rawVariants = Array.isArray(data?.variants) ? data.variants : [];
      const limits = FIELD_LIMITS[app.platform];
      const listing = await ctx.db.storeListing.findFirst({
        where: {
          appId: input.appId,
          ...(storefront ? { country: storefront.country, locale: storefront.locale } : {}),
        },
        orderBy: { capturedAt: "desc" },
      });

      // The model is told the limits, but a suggestion one character over is
      // still rejected here rather than shown to the user as valid.
      const variants = rawVariants
        .filter((v) => {
          const limit = limits[v.field];
          return limit !== undefined && v.text && v.text.length <= limit;
        })
        .map((v) => ({
          ...v,
          charCount: v.text.length,
          charLimit: limits[v.field]!,
          targetKeywords: Array.isArray(v.targetKeywords) ? v.targetKeywords : [],
        }));

      if (input.persist && variants.length > 0) {
        await ctx.db.metadataSuggestion.createMany({
          data: variants.map((v) => ({
            appId: input.appId,
            locale: storefront?.locale ?? app.locale,
            field: v.field as ListingField,
            current: currentFieldValue(v.field, listing),
            suggested: v.text,
            rationale: v.rationale,
            targetKeywords: Array.isArray(v.targetKeywords) ? v.targetKeywords : [],
            charCount: v.charCount,
            charLimit: v.charLimit,
            model,
          })),
        });
      }

      return {
        variants,
        rejected: rawVariants.length - variants.length,
      };
    }),

  suggestions: orgProcedure
    .input(z.object({ appId: z.string().cuid(), field: z.nativeEnum(ListingField).optional() }))
    .query(async ({ ctx, input }) => {
      await assertAppInOrg(ctx.db, input.appId, ctx.organizationId);
      const rows = await ctx.db.metadataSuggestion.findMany({
        where: {
          appId: input.appId,
          ...(input.field ? { field: input.field } : {}),
          status: { not: "DISMISSED" },
        },
        orderBy: { createdAt: "desc" },
        take: 60,
      });
      return rows.map((r) => ({
        ...r,
        targetKeywords: Array.isArray(r.targetKeywords) ? r.targetKeywords : [],
      }));
    }),

  setSuggestionStatus: memberProcedure
    .input(
      z.object({
        appId: z.string().cuid(),
        suggestionId: z.string().cuid(),
        status: z.nativeEnum(RecommendationStatus),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertAppInOrg(ctx.db, input.appId, ctx.organizationId);
      return ctx.db.metadataSuggestion.update({
        where: { id: input.suggestionId },
        data: { status: input.status },
      });
    }),

  /** The captured gallery, so the UI can show it without an AI call. */
  screenshots: orgProcedure
    .input(
      z.object({
        appId: z.string().cuid(),
        country: z.string().length(2).optional(),
        locale: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const app = await assertAppInOrg(ctx.db, input.appId, ctx.organizationId);

      const listing = await ctx.db.storeListing.findFirst({
        where: {
          appId: input.appId,
          country: input.country ?? app.country,
          locale: input.locale ?? app.locale,
        },
        orderBy: { capturedAt: "desc" },
        select: { screenshotUrls: true, hasVideo: true, capturedAt: true },
      });

      return {
        urls: listing?.screenshotUrls ?? [],
        hasVideo: listing?.hasVideo ?? false,
        capturedAt: listing?.capturedAt ?? null,
      };
    }),

  analyzeScreenshots: memberProcedure
    .input(
      z.object({
        appId: z.string().cuid(),
        country: z.string().length(2).optional(),
        locale: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertAppInOrg(ctx.db, input.appId, ctx.organizationId);
      // Vision calls are the most expensive thing here, so they get a tighter
      // budget than the text features.
      await guard(ctx.organizationId, "screenshots", 4);

      const storefront =
        input.country && input.locale
          ? { country: input.country, locale: input.locale }
          : undefined;

      const { data, model, analyzedUrls, totalCount } = await analyzeScreenshots(
        ctx.organizationId,
        input.appId,
        storefront,
      );

      const screenshots = Array.isArray(data?.screenshots) ? data.screenshots : [];
      const suggestedOrder = Array.isArray(data?.suggestedOrder) ? data.suggestedOrder : [];
      const recommendations = Array.isArray(data?.recommendations) ? data.recommendations : [];
      const weak = screenshots.filter((s) => s.strength === "weak").length;

      await ctx.db.aiInsight.create({
        data: {
          organizationId: ctx.organizationId,
          appId: input.appId,
          type: "METADATA_GAP",
          severity: weak >= 2 ? "MEDIUM" : "INFO",
          title: `Screenshot review — ${weak} of ${screenshots.length} need work`,
          summary: data?.summary ?? "",
          detail: [
            `**First impression:** ${data?.firstImpression ?? ""}`,
            "",
            ...screenshots.map(
              (s) =>
                `### ${s.position}. ${s.headline} (${s.strength})\n${s.communicates}${
                  Array.isArray(s.issues) && s.issues.length ? `\n\n- ${s.issues.join("\n- ")}` : ""
                }`,
            ),
            "",
            `**Suggested order:** ${suggestedOrder.join(" → ")}`,
            data?.orderRationale ?? "",
          ].join("\n"),
          evidence: { ...data, analyzedUrls } as never,
          model,
        },
      });

      return { ...data, screenshots, suggestedOrder, recommendations, analyzedUrls, totalCount };
    }),

  reviewThemes: memberProcedure
    .input(z.object({ appId: z.string().cuid(), days: z.number().int().max(180).default(30) }))
    .mutation(async ({ ctx, input }) => {
      await assertAppInOrg(ctx.db, input.appId, ctx.organizationId);
      await guard(ctx.organizationId, "review-themes");
      const { data } = await summarizeReviewThemes(ctx.organizationId, input.appId, input.days);
      return {
        ...data,
        themes: Array.isArray(data?.themes) ? data.themes : [],
      };
    }),

  competitorGap: memberProcedure
    .input(z.object({ appId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertAppInOrg(ctx.db, input.appId, ctx.organizationId);
      await guard(ctx.organizationId, "competitor-gap");

      const { data, model } = await analyzeCompetitorGap(ctx.organizationId, input.appId);
      const gaps = Array.isArray(data?.gaps) ? data.gaps : [];

      await ctx.db.aiInsight.create({
        data: {
          organizationId: ctx.organizationId,
          appId: input.appId,
          type: "COMPETITOR_MOVE",
          severity: gaps.some((g) => g.impact === "high") ? "MEDIUM" : "INFO",
          title: `Competitor gap analysis — ${gaps.length} findings`,
          summary: data?.summary ?? "",
          detail: gaps
            .map((g) => `### ${g.area} (${g.impact})\n${g.finding}\n\n> ${g.competitorExample}\n\n**Action:** ${g.action}`)
            .join("\n\n"),
          evidence: data as never,
          model,
        },
      });

      return {
        ...data,
        gaps,
      };
    }),

  refreshRecommendations: memberProcedure
    .input(z.object({ appId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertAppInOrg(ctx.db, input.appId, ctx.organizationId);
      await guard(ctx.organizationId, "recommendations");
      const { data } = await generateRecommendations(ctx.organizationId, input.appId);
      return data;
    }),

  /** Queues the full nightly pass on demand. */
  runInsightPass: memberProcedure
    .input(z.object({ appId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertAppInOrg(ctx.db, input.appId, ctx.organizationId);
      await enqueue(
        { type: "ai.insights", appId: input.appId },
        { jobId: `ai.insights-${input.appId}-${Date.now()}` },
      );
      return { queued: true };
    }),
});

function currentFieldValue(
  field: string,
  listing: {
    title: string | null;
    subtitle: string | null;
    keywordField: string | null;
    shortDescription: string | null;
    fullDescription: string | null;
    promotionalText: string | null;
  } | null,
): string | null {
  if (!listing) return null;
  switch (field) {
    case "TITLE":
      return listing.title;
    case "SUBTITLE":
      return listing.subtitle;
    case "KEYWORDS":
      return listing.keywordField;
    case "SHORT_DESCRIPTION":
      return listing.shortDescription;
    case "FULL_DESCRIPTION":
      return listing.fullDescription;
    case "PROMOTIONAL_TEXT":
      return listing.promotionalText;
    default:
      return null;
  }
}
