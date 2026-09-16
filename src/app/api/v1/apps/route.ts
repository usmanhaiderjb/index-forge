import { withApiKey } from "@/server/api-key";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

export const GET = withApiKey(async (_request, ctx) => {
  const apps = await db.app.findMany({
    where: { organizationId: ctx.organization.id },
    orderBy: { createdAt: "asc" },
    include: {
      _count: { select: { keywords: true, competitors: true, reviews: true } },
      listings: {
        orderBy: { capturedAt: "desc" },
        take: 1,
        select: { capturedAt: true, ratingAverage: true, ratingCount: true, version: true },
      },
    },
  });

  return {
    data: apps.map((app) => ({
      id: app.id,
      platform: app.platform,
      storeId: app.storeId,
      bundleId: app.bundleId,
      name: app.name,
      developer: app.developer,
      country: app.country,
      locale: app.locale,
      category: app.category,
      version: app.currentVersion,
      isActive: app.isActive,
      counts: {
        keywords: app._count.keywords,
        competitors: app._count.competitors,
        reviews: app._count.reviews,
      },
      rating: app.listings[0]
        ? {
            average: app.listings[0].ratingAverage,
            count: app.listings[0].ratingCount,
            capturedAt: app.listings[0].capturedAt,
          }
        : null,
    })),
  };
});
