import { KeywordSource } from "@prisma/client";
import { z } from "zod";

import { dateRange, eachDay, ymd } from "@aso/shared";
import { assertAppInOrg, createTRPCRouter, memberProcedure, orgProcedure } from "@/server/api/trpc";
import { getAsoProvider, opportunityScore } from "@/server/aso/provider";
import { suggestKeywords } from "@/server/jobs/handlers/aso";
import { enqueue } from "@/server/jobs/queues";

export const keywordRouter = createTRPCRouter({
  list: orgProcedure
    .input(
      z.object({
        appId: z.string().cuid(),
        sort: z.enum(["rank", "opportunity", "popularity", "term"]).default("opportunity"),
        onlyTracked: z.boolean().default(true),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertAppInOrg(ctx.db, input.appId, ctx.organizationId);

      const keywords = await ctx.db.keyword.findMany({
        where: { appId: input.appId, ...(input.onlyTracked ? { isTracked: true } : {}) },
        include: {
          ranks: { orderBy: { date: "desc" }, take: 2 },
          metrics: { orderBy: { date: "desc" }, take: 1 },
        },
      });

      const rows = keywords.map((keyword) => {
        const current = keyword.ranks[0];
        const previous = keyword.ranks[1];
        const metric = keyword.metrics[0];

        return {
          id: keyword.id,
          term: keyword.term,
          country: keyword.country,
          source: keyword.source,
          isTracked: keyword.isTracked,
          rank: current?.rank ?? null,
          prevRank: current?.prevRank ?? previous?.rank ?? null,
          // Positive delta means the app moved up the results.
          delta:
            current?.rank && (current.prevRank ?? previous?.rank)
              ? (current.prevRank ?? previous!.rank!) - current.rank
              : null,
          popularity: metric?.popularity ?? null,
          difficulty: metric?.difficulty ?? null,
          opportunity: metric?.opportunity ?? null,
          scanDepth: current?.scanDepth ?? null,
          lastCheckedAt: current?.capturedAt ?? null,
        };
      });

      const sorters = {
        rank: (a: (typeof rows)[number], b: (typeof rows)[number]) =>
          (a.rank ?? 9999) - (b.rank ?? 9999),
        opportunity: (a: (typeof rows)[number], b: (typeof rows)[number]) =>
          (b.opportunity ?? 0) - (a.opportunity ?? 0),
        popularity: (a: (typeof rows)[number], b: (typeof rows)[number]) =>
          (b.popularity ?? 0) - (a.popularity ?? 0),
        term: (a: (typeof rows)[number], b: (typeof rows)[number]) => a.term.localeCompare(b.term),
      };

      return rows.sort(sorters[input.sort]);
    }),

  /** Rank history for the chart. Null ranks are preserved as gaps, not zeros. */
  history: orgProcedure
    .input(
      z.object({
        appId: z.string().cuid(),
        keywordIds: z.array(z.string().cuid()).max(10),
        days: z.number().int().max(365).default(90),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertAppInOrg(ctx.db, input.appId, ctx.organizationId);
      const { start, end } = dateRange(input.days);

      const keywords = await ctx.db.keyword.findMany({
        where: { id: { in: input.keywordIds }, appId: input.appId },
        include: {
          ranks: { where: { date: { gte: start, lte: end } }, orderBy: { date: "asc" } },
        },
      });

      const byDate = new Map<string, Record<string, number | string | null>>();
      for (const date of eachDay(start, end)) {
        byDate.set(ymd(date), { date: ymd(date) });
      }

      for (const keyword of keywords) {
        for (const rank of keyword.ranks) {
          const row = byDate.get(ymd(rank.date));
          if (row) row[keyword.term] = rank.rank;
        }
      }

      return {
        terms: keywords.map((k) => ({ id: k.id, term: k.term })),
        series: Array.from(byDate.values()),
      };
    }),

  add: memberProcedure
    .input(
      z.object({
        appId: z.string().cuid(),
        terms: z.array(z.string().min(1).max(80)).min(1).max(200),
        source: z.nativeEnum(KeywordSource).default("MANUAL"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const app = await assertAppInOrg(ctx.db, input.appId, ctx.organizationId);

      const normalized = Array.from(
        new Set(input.terms.map((t) => t.trim().toLowerCase()).filter(Boolean)),
      );

      const created = await ctx.db.keyword.createMany({
        data: normalized.map((term) => ({
          appId: input.appId,
          term,
          country: app.country,
          locale: app.locale,
          source: input.source,
        })),
        skipDuplicates: true,
      });

      // Rank the new terms now rather than waiting for tomorrow's pass.
      await enqueue({ type: "app.ranks", appId: input.appId }, { delay: 5000 });

      return { added: created.count, requested: normalized.length };
    }),

  setTracked: memberProcedure
    .input(z.object({ appId: z.string().cuid(), keywordId: z.string().cuid(), isTracked: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await assertAppInOrg(ctx.db, input.appId, ctx.organizationId);
      return ctx.db.keyword.update({
        where: { id: input.keywordId },
        data: { isTracked: input.isTracked },
      });
    }),

  remove: memberProcedure
    .input(z.object({ appId: z.string().cuid(), keywordId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertAppInOrg(ctx.db, input.appId, ctx.organizationId);
      await ctx.db.keyword.delete({ where: { id: input.keywordId } });
      return { ok: true };
    }),

  /** Non-AI suggestions: the app's own listing plus store autocomplete. */
  suggest: orgProcedure
    .input(z.object({ appId: z.string().cuid(), limit: z.number().int().max(60).default(25) }))
    .query(async ({ ctx, input }) => {
      await assertAppInOrg(ctx.db, input.appId, ctx.organizationId);
      const terms = await suggestKeywords(input.appId, input.limit);

      const existing = await ctx.db.keyword.findMany({
        where: { appId: input.appId },
        select: { term: true },
      });
      const known = new Set(existing.map((k) => k.term));

      return terms.filter((t) => !known.has(t));
    }),

  /** On-demand market stats for terms the user is considering. */
  research: orgProcedure
    .input(
      z.object({
        appId: z.string().cuid(),
        terms: z.array(z.string().min(1)).min(1).max(20),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const app = await assertAppInOrg(ctx.db, input.appId, ctx.organizationId);
      const provider = await getAsoProvider();

      if (!provider.keywordStats) {
        return input.terms.map((term) => ({ term, popularity: null, difficulty: null, opportunity: null, resultCount: null }));
      }

      const stats = await provider.keywordStats(app.platform, input.terms, {
        country: app.country,
        locale: app.locale,
      });

      return stats.map((s) => ({
        ...s,
        opportunity: opportunityScore(s.popularity, s.difficulty),
      }));
    }),

  /** Live SERP for one term, so the user can see who they are up against. */
  serp: orgProcedure
    .input(z.object({ appId: z.string().cuid(), term: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const app = await assertAppInOrg(ctx.db, input.appId, ctx.organizationId);
      const provider = await getAsoProvider();

      const results = await provider.search(app.platform, input.term, {
        country: app.country,
        locale: app.locale,
        limit: 25,
      });

      return results.map((r) => ({ ...r, isUs: r.storeId === app.storeId }));
    }),

  /**
   * Us against every tracked competitor, per keyword — the comparison the
   * stored SERP positions exist to answer.
   *
   * Reads history rather than re-scanning: a live search would show today's
   * page, which is not the page yesterday's rank was measured on.
   */
  competitorRanks: orgProcedure
    .input(
      z.object({
        appId: z.string().cuid(),
        keywordIds: z.array(z.string().cuid()).max(50).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const app = await assertAppInOrg(ctx.db, input.appId, ctx.organizationId);

      const keywords = await ctx.db.keyword.findMany({
        where: {
          appId: input.appId,
          isTracked: true,
          ...(input.keywordIds ? { id: { in: input.keywordIds } } : {}),
        },
        include: {
          // Two rows, so a null prevRank can fall back to the previous day —
          // the same rule `list` uses, or the same data would read two ways.
          ranks: { orderBy: { date: "desc" }, take: 2 },
          competitorRanks: {
            orderBy: { date: "desc" },
            distinct: ["competitorId"],
            include: { competitor: true },
          },
        },
      });

      return keywords.map((keyword) => {
        const ours = keyword.ranks[0];
        const oursPrev = ours?.prevRank ?? keyword.ranks[1]?.rank ?? null;

        const rivals = keyword.competitorRanks
          .map((row) => ({
            competitorId: row.competitorId,
            name: row.competitor.name,
            iconUrl: row.competitor.iconUrl,
            storeId: row.competitor.storeId,
            rank: row.rank,
            prevRank: row.prevRank,
            delta: row.rank && row.prevRank ? row.prevRank - row.rank : null,
            capturedAt: row.capturedAt,
          }))
          // Unranked competitors last, but still listed — "they fell out of
          // the top 100" is worth seeing, not worth hiding.
          .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));

        const ranked = rivals.filter((r) => r.rank !== null);
        const ahead = ours?.rank ? ranked.filter((r) => r.rank! < ours.rank!).length : null;

        return {
          keywordId: keyword.id,
          term: keyword.term,
          country: keyword.country,
          scanDepth: ours?.scanDepth ?? null,
          us: {
            name: app.name,
            rank: ours?.rank ?? null,
            prevRank: oursPrev,
            delta: ours?.rank && oursPrev ? oursPrev - ours.rank : null,
          },
          rivals,
          // Null when we do not rank at all — "0 competitors ahead" would read
          // as winning, which is the opposite of what an unranked app means.
          competitorsAhead: ahead,
          competitorsRanked: ranked.length,
        };
      });
    }),

  refreshRanks: memberProcedure
    .input(z.object({ appId: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertAppInOrg(ctx.db, input.appId, ctx.organizationId);
      await enqueue({ type: "app.ranks", appId: input.appId });
      return { queued: true };
    }),
});
