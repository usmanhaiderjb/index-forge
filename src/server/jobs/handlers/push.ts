import "server-only";

import { db } from "@/server/db";
import { decryptJson } from "@/server/crypto";
import { sendMessage, type FcmTarget, type ServiceAccount } from "@/server/push/fcm";

/**
 * Deliver one campaign to every app it targets.
 *
 * Fan-out lives here rather than in the request that created the campaign: a
 * twelve-app campaign is twelve independent calls to twelve Firebase projects,
 * and a request that waits for all of them times out on exactly the campaigns
 * that matter most.
 *
 * Each app gets its own `PushDelivery` row, so a partial failure is legible —
 * eleven sent, one has an expired key, and the UI can name which.
 */
export async function handlePushSend(campaignId: string): Promise<void> {
  const campaign = await db.pushCampaign.findUnique({
    where: { id: campaignId },
    include: {
      deliveries: {
        where: { status: "PENDING" },
        include: { app: { select: { id: true, name: true, pushCredential: true } } },
      },
    },
  });

  if (!campaign) return;

  // A campaign with nothing pending has already run. Re-running would send the
  // notification twice, which is the one failure mode users notice immediately.
  if (campaign.deliveries.length === 0) {
    await finalize(campaignId);
    return;
  }

  await db.pushCampaign.update({
    where: { id: campaignId },
    data: { status: "SENDING" },
  });

  const target: FcmTarget =
    campaign.target === "CONDITION"
      ? { kind: "condition", condition: campaign.targetValue }
      : { kind: "topic", topic: campaign.targetValue };

  for (const delivery of campaign.deliveries) {
    const credential = delivery.app.pushCredential;

    if (!credential || credential.status !== "ACTIVE") {
      await db.pushDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "SKIPPED",
          error: "No working Firebase key for this app.",
          attempts: { increment: 1 },
        },
      });
      continue;
    }

    let account: ServiceAccount;
    try {
      account = decryptJson<ServiceAccount>(credential.credentials);
    } catch {
      // Almost always ENCRYPTION_KEY rotation. Say that, rather than leaving a
      // decryption stack trace attached to a marketing campaign.
      await db.pushDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "FAILED",
          error:
            "The stored key could not be decrypted. If ENCRYPTION_KEY was rotated, re-upload the service account.",
          attempts: { increment: 1 },
        },
      });
      continue;
    }

    const result = await sendMessage(account, target, {
      title: campaign.title,
      body: campaign.body,
      imageUrl: campaign.imageUrl,
      linkUrl: campaign.linkUrl,
    });

    if (result.ok) {
      await db.pushDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "SENT",
          messageId: result.messageId,
          error: null,
          sentAt: new Date(),
          attempts: { increment: 1 },
        },
      });
      continue;
    }

    // A retryable failure stays PENDING so the job's own retry picks it up.
    // Marking it FAILED here would make a transient Firebase blip permanent.
    await db.pushDelivery.update({
      where: { id: delivery.id },
      data: {
        status: result.retryable ? "PENDING" : "FAILED",
        error: result.detail,
        attempts: { increment: 1 },
      },
    });

    // A key Firebase has rejected outright will reject every later campaign
    // too. Flagging it here means the next composer shows the app as not ready
    // rather than silently failing again.
    if (result.code === "UNAUTHENTICATED" || result.code === "PERMISSION_DENIED") {
      await db.pushCredential.updateMany({
        where: { appId: delivery.appId },
        data: { status: "INVALID", lastError: result.detail },
      });
    }

    if (result.retryable) {
      // Let BullMQ retry the whole job rather than looping here.
      throw new Error(`Firebase is rate limiting or unavailable: ${result.detail}`);
    }
  }

  await finalize(campaignId);
}

/**
 * Set the campaign's terminal status from its deliveries.
 *
 * `PARTIAL` exists separately from `SENT` on purpose. Reporting a campaign as
 * "sent" when three of twelve apps failed is the same class of error as a chart
 * drawing zero for missing data.
 */
async function finalize(campaignId: string): Promise<void> {
  const deliveries = await db.pushDelivery.findMany({
    where: { campaignId },
    select: { status: true },
  });

  const pending = deliveries.filter((d) => d.status === "PENDING").length;
  if (pending > 0) return;

  const sent = deliveries.filter((d) => d.status === "SENT").length;
  const failed = deliveries.filter((d) => d.status === "FAILED").length;

  const status =
    sent === 0 ? "FAILED" : failed > 0 || sent < deliveries.length ? "PARTIAL" : "SENT";

  await db.pushCampaign.update({
    where: { id: campaignId },
    data: { status, sentAt: new Date() },
  });
}
