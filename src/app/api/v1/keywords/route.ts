import { requireParam, resolveApp, withApiKey } from "@/server/api-key";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

export const GET = withApiKey(async (request, ctx) => {
  const appId = requireParam(request, "appId");
  const app = await resolveApp(appId, ctx.organization.id);

  const keywords = await db.keyword.findMany({
    where: { appId: app.id },
    include: {
      ranks: { orderBy: { date: "desc" }, take: 1 },
      metrics: { orderBy: { date: "desc" }, take: 1 },
      competitorRanks: {
        orderBy: { date: "desc" },
        distinct: ["competitorId"],
        include: { competitor: { select: { name: true, storeId: true } } },
      },
    },
    orderBy: { term: "asc" },
  });

  return {
    app: { id: app.id, name: app.name, platform: app.platform },
    data: keywords.map((keyword) => {
      const rank = keyword.ranks[0];
      const metric = keyword.metrics[0];

      return {
        id: keyword.id,
        term: keyword.term,
        country: keyword.country,
        locale: keyword.locale,
        source: keyword.source,
        isTracked: keyword.isTracked,
        // null rank means the app was outside the scanned results, which is
        // different from never having been checked.
        rank: rank?.rank ?? null,
        previousRank: rank?.prevRank ?? null,
        // How deep the scan went, so a consumer can tell "not in the top 100"
        // from "not in the top 10".
        scanDepth: rank?.scanDepth ?? null,
        lastCheckedAt: rank?.capturedAt ?? null,
        competitors: keyword.competitorRanks
          .map((row) => ({
            name: row.competitor.name,
            storeId: row.competitor.storeId,
            rank: row.rank,
            previousRank: row.prevRank,
          }))
          .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity)),
        popularity: metric?.popularity ?? null,
        difficulty: metric?.difficulty ?? null,
        opportunity: metric?.opportunity ?? null,
      };
    }),
  };
});
