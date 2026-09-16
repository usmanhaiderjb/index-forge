import "server-only";

import { db } from "@/server/db";
import { getConnector } from "@/server/integrations/registry";
import { loadCredentials, recordConnectionError } from "@/server/integrations/service";

export class ReplyNotSupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReplyNotSupportedError";
  }
}

/**
 * Resolves the connection that can answer a given review.
 *
 * A review is tied to the source that produced it, not merely to the app — an
 * app linked to both stores must not have its Play review answered through the
 * App Store Connect key.
 */
async function resolveReplyTarget(reviewId: string, organizationId: string) {
  const review = await db.review.findFirst({
    where: { id: reviewId, app: { organizationId } },
    include: { app: true },
  });

  if (!review) throw new ReplyNotSupportedError("Review not found");

  const link = await db.resourceLink.findFirst({
    where: {
      appId: review.appId,
      connection: {
        organizationId,
        status: { in: ["ACTIVE", "PENDING"] },
        provider: review.source === "PLAY_CONSOLE" ? "PLAY_CONSOLE" : "APP_STORE_CONNECT",
      },
    },
    include: { connection: true },
  });

  if (!link) {
    throw new ReplyNotSupportedError(
      `No active ${review.source === "PLAY_CONSOLE" ? "Play Console" : "App Store Connect"} connection is linked to this app, so the reply cannot be published.`,
    );
  }

  const connector = getConnector(link.connection.provider);
  if (!connector.replyToReview) {
    throw new ReplyNotSupportedError(
      `${link.connection.provider} does not support replying to reviews`,
    );
  }

  return { review, link, connector };
}

/**
 * Published limits per store, used when no connection is linked yet — showing
 * Google's 350 for an iOS review would be wrong by a factor of seventeen.
 */
const LIMIT_BY_SOURCE: Record<string, number> = {
  PLAY_CONSOLE: 350,
  APP_STORE_CONNECT: 5970,
};

/** The store's own limit, so the UI can enforce it before anything is sent. */
export async function replyLimitFor(reviewId: string, organizationId: string): Promise<number> {
  const { connector } = await resolveReplyTarget(reviewId, organizationId);
  return connector.replyCharLimit ?? 350;
}

/** Best-effort limit from the review's source alone, for the unlinked case. */
export async function replyLimitBySource(
  reviewId: string,
  organizationId: string,
): Promise<number> {
  const review = await db.review.findFirst({
    where: { id: reviewId, app: { organizationId } },
    select: { source: true },
  });
  return LIMIT_BY_SOURCE[review?.source ?? ""] ?? 350;
}

/**
 * Publishes a developer reply to the store and records it locally.
 *
 * The local row is written only after the store accepts, so a failed publish
 * never leaves the dashboard claiming a reply that nobody can see.
 */
export async function replyToReview(
  reviewId: string,
  organizationId: string,
  body: string,
): Promise<{ repliedAt: Date }> {
  const { review, link, connector } = await resolveReplyTarget(reviewId, organizationId);

  const text = body.trim();
  if (!text) throw new ReplyNotSupportedError("Reply text is empty");

  const limit = connector.replyCharLimit ?? 350;
  if (text.length > limit) {
    throw new ReplyNotSupportedError(
      `This store limits replies to ${limit} characters; yours is ${text.length}.`,
    );
  }

  const credentials = loadCredentials(link.connection);

  try {
    await connector.replyToReview!(
      {
        connection: link.connection,
        credentials,
        externalId: link.externalId,
        externalRef: link.externalRef,
        linkMetadata: (link.metadata ?? null) as Record<string, unknown> | null,
      },
      review.externalId,
      text,
    );
  } catch (error) {
    await recordConnectionError(link.connection.id, error);
    throw error;
  }

  const repliedAt = new Date();

  await db.review.update({
    where: { id: review.id },
    data: { developerReply: text, repliedAt },
  });

  await db.auditLog.create({
    data: {
      organizationId,
      action: "review.reply",
      targetType: "Review",
      targetId: review.id,
      meta: { appId: review.appId, source: review.source, length: text.length },
    },
  });

  return { repliedAt };
}
