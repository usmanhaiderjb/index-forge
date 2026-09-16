import { Sentiment } from "@prisma/client";

import { ApiError, paging, requireParam, resolveApp, withApiKey } from "@/server/api-key";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

export const GET = withApiKey(async (request, ctx) => {
  const appId = requireParam(request, "appId");
  const app = await resolveApp(appId, ctx.organization.id);
  const { limit, cursor } = paging(request, 50, 500);

  const sentimentParam = new URL(request.url).searchParams.get("sentiment");
  if (sentimentParam && !(sentimentParam in Sentiment)) {
    throw new ApiError(
      400,
      `Unknown sentiment "${sentimentParam}". Valid: ${Object.values(Sentiment).join(", ")}`,
      "bad_request",
    );
  }

  const reviews = await db.review.findMany({
    where: {
      appId: app.id,
      ...(sentimentParam ? { sentiment: sentimentParam as Sentiment } : {}),
    },
    orderBy: { submittedAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = reviews.length > limit;
  const items = hasMore ? reviews.slice(0, limit) : reviews;

  return {
    app: { id: app.id, name: app.name, platform: app.platform },
    data: items.map((review) => ({
      id: review.id,
      source: review.source,
      externalId: review.externalId,
      rating: review.rating,
      title: review.title,
      body: review.body,
      author: review.authorName,
      country: review.country,
      appVersion: review.appVersion,
      submittedAt: review.submittedAt,
      sentiment: review.sentiment,
      topics: review.topics,
      developerReply: review.developerReply,
      repliedAt: review.repliedAt,
    })),
    nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
  };
});
