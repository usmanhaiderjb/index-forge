import "server-only";

import { db } from "@/server/db";
import { buildDigest, digestChannels, renderDigestText } from "@/server/digest";
import { deliverReport } from "@/server/notify";
import { enqueue } from "@/server/jobs/queues";

/** Builds and delivers one digest, recording the outcome on the row. */
export async function sendDigest(digestId: string) {
  const digest = await db.digest.findUnique({ where: { id: digestId } });
  if (!digest) throw new Error(`Digest ${digestId} not found`);

  const channels = digestChannels(digest.channels);
  if (!channels.webhook && !channels.email?.length) {
    await db.digest.update({
      where: { id: digestId },
      data: { lastError: "No channels configured" },
    });
    return { skipped: "no channels" };
  }

  const days = digest.cadence === "DAILY" ? 1 : 7;
  const data = await buildDigest(digest.organizationId, { days, appIds: digest.appIds });

  try {
    const outcome = await deliverReport({
      organizationId: digest.organizationId,
      channels,
      subject: `${data.cadence} ASO summary — ${data.organizationName}`,
      text: renderDigestText(data),
    });

    await db.digest.update({
      where: { id: digestId },
      data: { lastSentAt: new Date(), lastError: null },
    });

    return outcome;
  } catch (error) {
    await db.digest.update({
      where: { id: digestId },
      data: { lastError: error instanceof Error ? error.message.slice(0, 2000) : "failed" },
    });
    throw error;
  }
}

/**
 * Fans out the digests due this hour.
 *
 * Due-ness is decided from `lastSentAt` rather than from the clock alone, so a
 * worker that was down for a day sends one catch-up digest instead of skipping
 * the period silently — and a worker restarted twice in an hour does not send
 * two.
 */
export async function dispatchDueDigests(now = new Date()) {
  const hour = now.getUTCHours();

  const digests = await db.digest.findMany({
    where: { isEnabled: true, sendHourUtc: hour },
  });

  let queued = 0;

  for (const digest of digests) {
    const minimumGapMs = (digest.cadence === "DAILY" ? 20 : 6 * 24) * 3_600_000;

    if (digest.lastSentAt && now.getTime() - digest.lastSentAt.getTime() < minimumGapMs) {
      continue;
    }

    // Weekly digests go out on Monday, so "this week" means a whole week.
    if (digest.cadence === "WEEKLY" && now.getUTCDay() !== 1 && !digest.lastSentAt) {
      continue;
    }

    await enqueue(
      { type: "digest.send", digestId: digest.id },
      { jobId: `digest.send:${digest.id}:${now.toISOString().slice(0, 13)}` },
    );
    queued++;
  }

  return { candidates: digests.length, queued };
}
