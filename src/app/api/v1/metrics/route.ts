import { MetricKey } from "@prisma/client";

import { dateRange, METRIC_META, ymd } from "@aso/shared";
import { ApiError, optionalInt, requireParam, resolveApp, withApiKey } from "@/server/api-key";
import { db } from "@/server/db";
import { parseDimension } from "@/server/integrations/types";

export const dynamic = "force-dynamic";

export const GET = withApiKey(async (request, ctx) => {
  const url = new URL(request.url);

  const appId = requireParam(request, "appId");
  const app = await resolveApp(appId, ctx.organization.id);
  const days = optionalInt(request, "days", 30, 730);

  const requested = url.searchParams.getAll("metric");
  if (requested.length === 0) {
    throw new ApiError(
      400,
      `Provide at least one "metric". Valid values: ${Object.values(MetricKey).join(", ")}`,
      "bad_request",
    );
  }

  const invalid = requested.filter((m) => !(m in MetricKey));
  if (invalid.length > 0) {
    throw new ApiError(400, `Unknown metric(s): ${invalid.join(", ")}`, "bad_request");
  }
  const metrics = requested as MetricKey[];

  // An absent dimension parameter means app-wide totals; supplying one returns
  // the per-value breakdown instead, which is a different shape.
  const dimensionKey = url.searchParams.get("dimension");
  const { start, end } = dateRange(days);

  const rows = await db.metricPoint.findMany({
    where: {
      appId: app.id,
      metric: { in: metrics },
      date: { gte: start, lte: end },
      ...(dimensionKey ? { dimension: { contains: `${dimensionKey}=` } } : { dimension: "" }),
    },
    orderBy: { date: "asc" },
    select: { date: true, metric: true, value: true, dimension: true, currency: true },
  });

  return {
    app: { id: app.id, name: app.name, platform: app.platform },
    range: { start: ymd(start), end: ymd(end), days },
    dimension: dimensionKey ?? null,
    units: Object.fromEntries(
      metrics.map((metric) => [metric, METRIC_META[metric].unit]),
    ),
    data: rows.map((row) => ({
      date: ymd(row.date),
      metric: row.metric,
      value: row.value,
      currency: row.currency,
      ...(dimensionKey
        ? { dimensionValue: parseDimension(row.dimension)[dimensionKey] ?? null }
        : {}),
    })),
  };
});
