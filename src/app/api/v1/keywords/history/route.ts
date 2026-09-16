import { dateRange, ymd } from "@aso/shared";
import { ApiError, optionalInt, requireParam, withApiKey } from "@/server/api-key";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

export const GET = withApiKey(async (request, ctx) => {
  const keywordId = requireParam(request, "keywordId");
  const days = optionalInt(request, "days", 90, 730);

  // Scope through the app so a key cannot read another organization's keyword.
  const keyword = await db.keyword.findFirst({
    where: { id: keywordId, app: { organizationId: ctx.organization.id } },
    include: { app: { select: { id: true, name: true, platform: true } } },
  });

  if (!keyword) {
    throw new ApiError(404, `No keyword with id "${keywordId}"`, "not_found");
  }

  const { start, end } = dateRange(days);

  const [ranks, metrics] = await Promise.all([
    db.keywordRank.findMany({
      where: { keywordId: keyword.id, date: { gte: start, lte: end } },
      orderBy: { date: "asc" },
      select: { date: true, rank: true },
    }),
    db.keywordMetric.findMany({
      where: { keywordId: keyword.id, date: { gte: start, lte: end } },
      orderBy: { date: "asc" },
      select: { date: true, popularity: true, difficulty: true, opportunity: true },
    }),
  ]);

  return {
    keyword: {
      id: keyword.id,
      term: keyword.term,
      country: keyword.country,
      app: keyword.app,
    },
    range: { start: ymd(start), end: ymd(end), days },
    ranks: ranks.map((r) => ({ date: ymd(r.date), rank: r.rank })),
    metrics: metrics.map((m) => ({
      date: ymd(m.date),
      popularity: m.popularity,
      difficulty: m.difficulty,
      opportunity: m.opportunity,
    })),
  };
});
