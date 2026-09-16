import { dateRange, ymd } from "@aso/shared";
import { optionalInt, requireParam, resolveApp, withApiKey } from "@/server/api-key";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

export const GET = withApiKey(async (request, ctx) => {
  const appId = requireParam(request, "appId");
  const app = await resolveApp(appId, ctx.organization.id);
  const days = optionalInt(request, "days", 30, 365);

  const { start, end } = dateRange(days);

  const rows = await db.chartRank.findMany({
    where: { appId: app.id, date: { gte: start, lte: end } },
    orderBy: [{ chart: "asc" }, { country: "asc" }, { date: "asc" }],
  });

  return {
    app: { id: app.id, name: app.name, platform: app.platform },
    range: { start: ymd(start), end: ymd(end), days },
    note: "A null rank means the app was outside the scanned depth on that day, which is different from the chart not having been checked — an unchecked day has no row at all.",
    data: rows.map((row) => ({
      date: ymd(row.date),
      country: row.country,
      chart: row.chart,
      category: row.category,
      rank: row.rank,
      previousRank: row.prevRank,
      scanDepth: row.scanDepth,
    })),
  };
});
