import { z } from "zod";

import { createTRPCRouter, orgProcedure, protectedProcedure } from "@/server/api/trpc";
import { MINE_CATEGORIES } from "@/server/aso/mining";
import { buildNiche } from "@/server/market/ingest";
import { enqueue } from "@/server/jobs/queues";

/**
 * Gap Finder — what users say is missing from the apps in a niche.
 *
 * Reads are `protectedProcedure`: niches are market data and belong to no
 * organisation, exactly like the keyword corpus.
 *
 * The build mutation is `orgProcedure` because it spends money — theme
 * extraction is an AI call, and an AI call needs an organisation to bill and a
 * budget to check against.
 */
export const gapsRouter = createTRPCRouter({
  /** Categories that can be analysed, with whether we already have data. */
  categories: protectedProcedure.query(async ({ ctx }) => {
    const niches = await ctx.db.marketNiche.findMany({
      where: { kind: "CATEGORY", platform: "ANDROID" },
      select: { label: true, computedAt: true, _count: { select: { themes: true } } },
    });

    const built = new Map(niches.map((n) => [n.label, n]));

    return MINE_CATEGORIES.ANDROID.map((category) => {
      const niche = built.get(category.label);
      return {
        id: category.id,
        label: category.label,
        themes: niche?._count.themes ?? 0,
        analysedAt: niche?.computedAt ?? null,
      };
    });
  }),

  /**
   * Themes for one niche, with the reviews behind each.
   *
   * A theme whose evidence has gone — reviews deleted, ids stale — is dropped
   * here rather than rendered bare. The rule that a finding must be able to
   * show its receipts is enforced in the query, not left to the interface.
   */
  themes: protectedProcedure
    .input(z.object({ label: z.string().min(1).max(60) }))
    .query(async ({ ctx, input }) => {
      const niche = await ctx.db.marketNiche.findFirst({
        where: { kind: "CATEGORY", platform: "ANDROID", label: input.label },
        include: { themes: { orderBy: [{ appCount: "desc" }, { mentionCount: "desc" }] } },
      });

      if (!niche) return null;

      const appsInNiche = await ctx.db.marketApp.count({
        where: { platform: "ANDROID", category: { not: null }, reviews: { some: {} } },
      });

      const evidenceIds = niche.themes.flatMap((theme) => theme.evidenceIds);
      const evidence = await ctx.db.marketReview.findMany({
        where: { id: { in: evidenceIds } },
        select: {
          id: true,
          rating: true,
          body: true,
          submittedAt: true,
          app: { select: { name: true } },
        },
      });

      const byId = new Map(evidence.map((review) => [review.id, review]));

      return {
        label: niche.label,
        analysedAt: niche.computedAt,
        method: niche.method,
        appsInNiche,
        themes: niche.themes
          .map((theme) => ({
            id: theme.id,
            kind: theme.kind,
            label: theme.label,
            appCount: theme.appCount,
            mentionCount: theme.mentionCount,
            meanRating: theme.meanRating,
            evidence: theme.evidenceIds
              .map((id) => byId.get(id))
              .filter((review): review is NonNullable<typeof review> => Boolean(review))
              .map((review) => ({
                id: review.id,
                rating: review.rating,
                // Trimmed for display. The full text stays in the database.
                body: (review.body ?? "").slice(0, 320),
                app: review.app.name,
                submittedAt: review.submittedAt,
              })),
          }))
          // No receipts, no row.
          .filter((theme) => theme.evidence.length > 0),
      };
    }),

  /**
   * Analyse a category.
   *
   * Runs inline rather than through the queue when Redis is unavailable, so the
   * feature is usable on a machine without a worker — at the cost of a slow
   * request. Both paths do the same work.
   */
  analyse: orgProcedure
    .input(
      z.object({
        categoryId: z.string().min(1),
        apps: z.number().min(3).max(20).default(8),
        reviewsPerApp: z.number().min(20).max(200).default(60),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const category = MINE_CATEGORIES.ANDROID.find((c) => c.id === input.categoryId);
      if (!category) throw new Error(`Unknown category: ${input.categoryId}`);

      try {
        await enqueue({
          type: "market.niche",
          category: category.id,
          label: category.label,
          organizationId: ctx.organizationId,
        });
        return { queued: true as const, ...category };
      } catch {
        // Redis down. Do the work here instead of failing — see above.
        const result = await buildNiche({
          category: category.id,
          label: category.label,
          organizationId: ctx.organizationId,
          apps: input.apps,
          reviewsPerApp: input.reviewsPerApp,
        });
        return { queued: false as const, ...category, ...result };
      }
    }),
});
