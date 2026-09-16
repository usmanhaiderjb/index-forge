import { Prisma, type PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { getCrossLocaleRules } from "@aso/shared";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { analyzeCreatives } from "@/server/aso/builtin/creatives";
import { getAppStoreIap, getPlayStoreIap } from "@/server/aso/builtin/iap";
import { inspectTechStack } from "@/server/aso/builtin/techstack";
import { cluster, relatedTo, type ClusterInput } from "@/server/aso/clustering";
import { getAsoProvider } from "@/server/aso/provider";
import {
  CONFIDENCE_WEIGHT,
  escapeLike,
  MARKET_FLOOR,
  normalizeQuery,
  OPPORTUNITY_DIVISOR,
} from "@/server/aso/research";
import { fastCache } from "@/server/cache/fast-cache";
import { redis } from "@/server/redis";

const SORTS = ["opportunity", "demand", "difficulty", "term"] as const;

export const researchRouter = createTRPCRouter({
  search: protectedProcedure
    .input(
      z.object({
        q: z.string().max(60).optional(),
        match: z.enum(["prefix", "contains"]).default("prefix"),
        country: z.string().length(2).default("us"),
        platform: z.enum(["IOS", "ANDROID"]).default("IOS"),
        minIndex: z.number().min(0).max(100).default(0),
        maxDifficulty: z.number().min(0).max(100).default(100),
        scoredOnly: z.boolean().default(false),
        sort: z.enum(SORTS).default("opportunity"),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const query = input.q ? normalizeQuery(input.q) : "";
      const searchCacheKey = `research:search:${input.country}:${input.platform}:${input.minIndex}:${input.maxDifficulty}:${input.scoredOnly}:${query}:${input.match}:${input.sort}:${input.limit}:${input.offset}`;

      return await fastCache.getOrSet(searchCacheKey, 180, async () => {
        const pattern = query
          ? input.match === "prefix"
            ? `${escapeLike(query)}%`
            : `%${escapeLike(query)}%`
          : null;

        const filters = [
          Prisma.sql`t.country = ${input.country}`,
          Prisma.sql`e.value IS NOT NULL`,
          Prisma.sql`e.value >= ${input.minIndex}`,
          pattern ? Prisma.sql`t.term LIKE ${pattern} ESCAPE '\\'` : Prisma.empty,
          input.scoredOnly ? Prisma.sql`c.difficulty IS NOT NULL` : Prisma.empty,
          Prisma.sql`(c.difficulty IS NULL OR c.difficulty <= ${input.maxDifficulty})`,
        ].filter((fragment) => fragment !== Prisma.empty);

        const where = Prisma.join(filters, " AND ");

        const trust = Prisma.sql`CASE e.confidence
          WHEN 'HIGH' THEN ${CONFIDENCE_WEIGHT.HIGH}::numeric
          WHEN 'MEDIUM' THEN ${CONFIDENCE_WEIGHT.MEDIUM}::numeric
          ELSE ${CONFIDENCE_WEIGHT.LOW}::numeric END`;

        const market = Prisma.sql`CASE
          WHEN c."resultCount" IS NULL THEN 1::numeric
          WHEN c."resultCount" <= 0 THEN 0::numeric
          ELSE LEAST(1, c."resultCount"::numeric / ${MARKET_FLOOR}::numeric) END`;

        const opportunity = Prisma.sql`ROUND(GREATEST(0, LEAST(100, e.value * ${trust} * ${market} * (1 - COALESCE(c.difficulty, 50) / ${OPPORTUNITY_DIVISOR}::numeric))))`;

        const orderBy = {
          opportunity: Prisma.sql`${opportunity} DESC, e.value DESC`,
          demand: Prisma.sql`e.value DESC, ${trust} DESC`,
          difficulty: Prisma.sql`c.difficulty ASC NULLS LAST, e.value DESC`,
          term: Prisma.sql`t.term ASC`,
        }[input.sort];

        const countCacheKey = `corpus:count:${input.country}:${input.platform}:${input.minIndex}:${input.maxDifficulty}:${input.scoredOnly}:${query}:${input.match}`;

        let cachedTotal: number | null = null;
        try {
          const cached = await redis.get(countCacheKey);
          if (cached !== null) {
            cachedTotal = Number(cached);
          }
        } catch {
          // Redis fallback
        }

        const rowsPromise = ctx.db.$queryRaw<
          {
            id: string;
            term: string;
            country: string;
            discovery: string;
            lastSeenAt: Date;
            index: number;
            confidence: string;
            kind: string;
            method: string;
            difficulty: number | null;
            resultCount: number | null;
            opportunity: number;
          }[]
        >(Prisma.sql`
          SELECT t.id, t.term, t.country, t.discovery::text AS discovery, t."lastSeenAt",
                 e.value AS index, e.confidence::text AS confidence,
                 e.kind::text AS kind, e.method,
                 c.difficulty, c."resultCount",
                 ${opportunity}::int AS opportunity
          FROM keyword_terms t
          JOIN keyword_volume_estimates e ON e."termId" = t.id
          LEFT JOIN keyword_competition c
            ON c."termId" = t.id AND c.platform = ${input.platform}::"Platform"
          WHERE ${where}
          ORDER BY ${orderBy}
          LIMIT ${input.limit} OFFSET ${input.offset}
        `);

        const countPromise =
          cachedTotal !== null
            ? Promise.resolve([{ count: BigInt(cachedTotal) }])
            : ctx.db.$queryRaw<{ count: bigint }[]>(Prisma.sql`
                SELECT count(*) AS count
                FROM keyword_terms t
                JOIN keyword_volume_estimates e ON e."termId" = t.id
                LEFT JOIN keyword_competition c
                  ON c."termId" = t.id AND c.platform = ${input.platform}::"Platform"
                WHERE ${where}
              `);

        const [rows, counted] = await Promise.all([rowsPromise, countPromise]);
        const total = Number(counted[0]?.count ?? 0);

        if (cachedTotal === null) {
          try {
            await redis.setex(countCacheKey, 180, String(total));
          } catch {
            // Ignore cache write error
          }
        }

        return {
          total,
          rows: rows.map((row) => ({
            ...row,
            index: Math.round(row.index),
            opportunity: Number(row.opportunity),
          })),
        };
      });
    }),

  stats: protectedProcedure
    .input(z.object({ country: z.string().length(2).default("us") }))
    .query(async ({ ctx, input }) => {
      const statsCacheKey = `research:stats:${input.country}`;
      return await fastCache.getOrSet(statsCacheKey, 300, async () => {
        const [terms, indexed, scored, byDiscovery, byConfidence] = await Promise.all([
          ctx.db.keywordTerm.count({ where: { country: input.country } }),
          ctx.db.keywordVolumeEstimate.count({ where: { term: { country: input.country } } }),
          ctx.db.keywordCompetition.count({ where: { term: { country: input.country } } }),
          ctx.db.keywordTerm.groupBy({
            by: ["discovery"],
            where: { country: input.country },
            _count: { _all: true },
          }),
          ctx.db.keywordVolumeEstimate.groupBy({
            by: ["confidence"],
            where: { term: { country: input.country } },
            _count: { _all: true },
          }),
        ]);

        const discovery: Record<string, number> = {};
        for (const row of byDiscovery) {
          discovery[row.discovery] = row._count._all;
        }

        const confidence: Record<string, number> = {};
        for (const row of byConfidence) {
          confidence[row.confidence] = row._count._all;
        }

        return {
          terms,
          indexed,
          scored,
          discovery,
          confidence,
        };
      });
    }),

  /** Cluster a user's candidate keywords by intent and competitive strength. */
  cluster: protectedProcedure
    .input(
      z.object({
        terms: z.array(z.string().min(1).max(80)).min(1).max(50),
        country: z.string().length(2).default("us"),
        platform: z.enum(["IOS", "ANDROID"]).default("IOS"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const normalised = input.terms.map(normalizeQuery).filter(Boolean);

      const rows = await ctx.db.keywordTerm.findMany({
        where: { country: input.country, term: { in: normalised } },
        include: {
          estimate: true,
          competition: { where: { platform: input.platform } },
          signals: { where: { context: { not: null } }, select: { context: true } },
        },
      });

      const inputs: ClusterInput[] = rows.map((r) => {
        const comp = r.competition[0];
        const prefixes = r.signals
          .map((s) => s.context)
          .filter((c): c is string => typeof c === "string");
        return {
          id: r.id,
          term: r.term,
          demand: r.estimate?.value ?? 0,
          prefixes,
          categories: [],
          apps: comp?.topApps ?? [],
        };
      });

      return cluster(inputs);
    }),

  /** Look up corpus terms that share top-ranking apps with the given term. */
  related: protectedProcedure
    .input(
      z.object({
        term: z.string().min(1).max(80),
        country: z.string().length(2).default("us"),
        platform: z.enum(["IOS", "ANDROID"]).default("IOS"),
        limit: z.number().min(1).max(30).default(10),
      }),
    )
    .query(async ({ ctx, input }) => {
      const termNorm = normalizeQuery(input.term);
      const row = await ctx.db.keywordTerm.findUnique({
        where: { term_country: { term: termNorm, country: input.country } },
        include: {
          estimate: true,
          competition: { where: { platform: input.platform } },
          signals: { where: { context: { not: null } }, select: { context: true } },
        },
      });

      const topApps = row?.competition[0]?.topApps ?? [];
      if (topApps.length === 0 && !row) return [];

      const candidates = await ctx.db.keywordCompetition.findMany({
        where: {
          platform: input.platform,
          topApps: topApps.length > 0 ? { hasSome: topApps } : undefined,
          term: { country: input.country, term: { not: termNorm } },
        },
        include: {
          term: {
            include: {
              estimate: true,
              signals: { where: { context: { not: null } }, select: { context: true } },
            },
          },
        },
        take: input.limit * 3,
      });

      const inputItems: ClusterInput[] = candidates.map((c) => ({
        id: c.term.id,
        term: c.term.term,
        demand: c.term.estimate?.value ?? 0,
        prefixes: c.term.signals
          .map((s) => s.context)
          .filter((cx): cx is string => typeof cx === "string"),
        categories: [],
        apps: c.topApps,
      }));

      const target: ClusterInput = {
        id: row?.id ?? "target",
        term: termNorm,
        demand: row?.estimate?.value ?? 0,
        prefixes:
          row?.signals
            .map((s) => s.context)
            .filter((cx): cx is string => typeof cx === "string") ?? [],
        categories: [],
        apps: topApps,
      };

      return relatedTo(target, inputItems, { limit: input.limit });
    }),

  /** Reverse-ASO: top ranked keywords for any competitor app by URL or store ID. */
  competitorKeywords: protectedProcedure
    .input(
      z.object({
        platform: z.enum(["IOS", "ANDROID"]).default("IOS"),
        urlOrId: z.string().min(1),
        country: z.string().length(2).default("us"),
      }),
    )
    .query(async ({ ctx, input }) => {
      let storeId = input.urlOrId.trim();

      if (input.platform === "IOS") {
        const idMatch = storeId.match(/id(\d+)/i) || storeId.match(/^(\d+)$/);
        if (idMatch && idMatch[1]) {
          storeId = idMatch[1];
        }
      } else {
        const pkgMatch = storeId.match(/id=([a-zA-Z0-9._]+)/i);
        if (pkgMatch && pkgMatch[1]) {
          storeId = pkgMatch[1];
        }
      }

      const rows = await ctx.db.keywordCompetition.findMany({
        where: {
          platform: input.platform,
          topApps: { has: storeId },
          term: { country: input.country },
        },
        include: {
          term: {
            include: {
              estimate: true,
            },
          },
        },
        take: 100,
      });

      return rows
        .map((c) => {
          const rank = c.topApps.indexOf(storeId) + 1;
          const index = c.term.estimate?.value ?? 0;
          const confidence = (c.term.estimate?.confidence ?? "LOW") as "LOW" | "MEDIUM" | "HIGH";
          const trust = CONFIDENCE_WEIGHT[confidence] ?? 0.5;
          const market = Math.min(1, Math.max(0, c.resultCount) / MARKET_FLOOR);
          const opp = Math.round(
            Math.max(0, Math.min(100, index * trust * market * (1 - c.difficulty / OPPORTUNITY_DIVISOR))),
          );

          return {
            term: c.term.term,
            rank,
            volumeIndex: Math.round(index),
            difficulty: c.difficulty,
            opportunity: opp,
            resultCount: c.resultCount,
            confidence,
          };
        })
        .sort((a, b) => a.rank - b.rank || b.opportunity - a.opportunity);
    }),

  techStack: protectedProcedure
    .input(
      z.object({
        platform: z.enum(["IOS", "ANDROID"]).default("IOS"),
        urlOrId: z.string().min(1),
        country: z.string().length(2).default("us"),
      }),
    )
    .query(async ({ input }) => {
      try {
        let storeId = input.urlOrId.trim();
        if (input.platform === "IOS") {
          const idMatch = storeId.match(/id(\d+)/i) || storeId.match(/^(\d+)$/);
          if (idMatch && idMatch[1]) {
            storeId = idMatch[1];
          }
        } else {
          const pkgMatch = storeId.match(/id=([a-zA-Z0-9._]+)/i);
          if (pkgMatch && pkgMatch[1]) {
            storeId = pkgMatch[1];
          }
        }

        const provider = await getAsoProvider();
        const detail = await provider.getApp(input.platform, storeId, {
          country: input.country,
          locale: input.country === "us" ? "en-US" : input.country,
        });

        if (!detail) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `App ${storeId} not found on ${input.platform}`,
          });
        }

        return inspectTechStack(detail);
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({
          code: "NOT_FOUND",
          message: (err as Error).message,
        });
      }
    }),

  monetization: protectedProcedure
    .input(
      z.object({
        platform: z.enum(["IOS", "ANDROID"]).default("IOS"),
        urlOrId: z.string().min(1),
        country: z.string().length(2).default("us"),
      }),
    )
    .query(async ({ input }) => {
      try {
        let storeId = input.urlOrId.trim();
        if (input.platform === "IOS") {
          const idMatch = storeId.match(/id(\d+)/i) || storeId.match(/^(\d+)$/);
          if (idMatch && idMatch[1]) {
            storeId = idMatch[1];
          }
          return await getAppStoreIap(storeId, { country: input.country, locale: input.country });
        } else {
          const pkgMatch = storeId.match(/id=([a-zA-Z0-9._]+)/i);
          if (pkgMatch && pkgMatch[1]) {
            storeId = pkgMatch[1];
          }
          return await getPlayStoreIap(storeId, { country: input.country, locale: input.country });
        }
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({
          code: "NOT_FOUND",
          message: (err as Error).message,
        });
      }
    }),

  creatives: protectedProcedure
    .input(
      z.object({
        platform: z.enum(["IOS", "ANDROID"]).default("IOS"),
        urlOrId: z.string().min(1),
        country: z.string().length(2).default("us"),
      }),
    )
    .query(async ({ input }) => {
      try {
        let storeId = input.urlOrId.trim();
        if (input.platform === "IOS") {
          const idMatch = storeId.match(/id(\d+)/i) || storeId.match(/^(\d+)$/);
          if (idMatch && idMatch[1]) {
            storeId = idMatch[1];
          }
        } else {
          const pkgMatch = storeId.match(/id=([a-zA-Z0-9._]+)/i);
          if (pkgMatch && pkgMatch[1]) {
            storeId = pkgMatch[1];
          }
        }

        const provider = await getAsoProvider();
        const detail = await provider.getApp(input.platform, storeId, {
          country: input.country,
          locale: input.country === "us" ? "en-US" : input.country,
        });

        if (!detail) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `App ${storeId} not found on ${input.platform}`,
          });
        }

        return analyzeCreatives(detail.screenshotUrls ?? [], detail.hasVideo ?? false, detail.iconUrl);
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({
          code: "NOT_FOUND",
          message: (err as Error).message,
        });
      }
    }),

  crossLocale: protectedProcedure
    .input(z.object({ country: z.string().length(2).default("us") }))
    .query(({ input }) => {
      return getCrossLocaleRules(input.country);
    }),
});
