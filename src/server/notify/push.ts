import "server-only";

import type { DeviceToken, Severity } from "@prisma/client";

import { db } from "@/server/db";
import { redis } from "@/server/redis";
import { chunk } from "@aso/shared";

/**
 * Push delivery through Expo's service.
 *
 * Expo fronts APNs and FCM, so one token format and one endpoint covers both
 * stores. Going direct would mean holding an APNs key and an FCM service
 * account and implementing two retry models — worth doing at scale, not worth
 * doing to ship.
 */

const SEND_URL = "https://exp.host/--/api/v2/push/send";
const RECEIPT_URL = "https://exp.host/--/api/v2/push/getReceipts";

/** Expo accepts up to 100 messages per request. */
const BATCH = 100;

const SEVERITY_RANK: Record<Severity, number> = {
  INFO: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

export type PushMessage = {
  title: string;
  body: string;
  /** Deep link, so a tap lands on the thing that changed. */
  url?: string;
  severity: Severity;
  data?: Record<string, string>;
};

type ExpoTicket =
  | { status: "ok"; id: string }
  | { status: "error"; message: string; details?: { error?: string } };

/**
 * Whether this user wants this alert on their phone right now.
 *
 * Quiet hours are evaluated in the user's own zone — "22:00" means nothing on
 * the server's clock. CRITICAL ignores quiet hours: an alert nobody configured
 * as routine is exactly what quiet hours should not swallow.
 */
export async function shouldPush(userId: string, severity: Severity): Promise<boolean> {
  const prefs = await db.notificationPreference.findUnique({ where: { userId } });
  if (!prefs) return true; // No preferences saved yet means defaults, which are on.
  if (!prefs.pushEnabled) return false;

  if (SEVERITY_RANK[severity] < SEVERITY_RANK[prefs.minSeverity]) return false;
  if (severity === "CRITICAL") return true;

  return !inQuietHours(prefs.quietHoursFrom, prefs.quietHoursTo, prefs.timeZone);
}

/** Exported for tests: the midnight-spanning case is the one that breaks. */
export function inQuietHours(
  from: number | null,
  to: number | null,
  timeZone: string,
  now: Date = new Date(),
): boolean {
  if (from === null || to === null || from === to) return false;

  let hour: number;
  try {
    hour = Number(
      new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone }).format(now),
    );
  } catch {
    // An invalid stored zone must not silence every notification.
    return false;
  }

  // 22 → 8 spans midnight, so the window is a union rather than a range.
  return from < to ? hour >= from && hour < to : hour >= from || hour < to;
}

/** Live tokens for a set of users, respecting their preferences. */
export async function resolveRecipients(
  userIds: string[],
  severity: Severity,
): Promise<DeviceToken[]> {
  if (userIds.length === 0) return [];

  const tokens = await db.deviceToken.findMany({
    where: {
      userId: { in: userIds },
      invalidatedAt: null,
      // A revoked device must stop receiving immediately, not when its token
      // happens to expire.
      session: { revokedAt: null },
    },
  });

  const allowed = new Map<string, boolean>();
  for (const userId of new Set(tokens.map((t) => t.userId))) {
    allowed.set(userId, await shouldPush(userId, severity));
  }

  return tokens.filter((token) => allowed.get(token.userId));
}

/**
 * Sends to every token and returns a human-readable outcome.
 *
 * Never throws: push is one channel among several, and a failure here must not
 * stop the webhook or the email. See the note in notify/index.ts.
 */
export async function sendPush(
  tokens: DeviceToken[],
  message: PushMessage,
): Promise<string> {
  if (tokens.length === 0) return "no eligible devices";

  let accepted = 0;
  const ticketIds: string[] = [];
  const failures: string[] = [];

  for (const batch of chunk(tokens, BATCH)) {
    const messages = batch.map((token) => ({
      to: token.token,
      title: message.title,
      body: message.body,
      sound: message.severity === "CRITICAL" ? "default" : null,
      priority: message.severity === "CRITICAL" ? "high" : "normal",
      data: { ...message.data, ...(message.url ? { url: message.url } : {}) },
    }));

    try {
      const res = await fetch(SEND_URL, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(messages),
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        failures.push(`expo ${res.status}`);
        continue;
      }

      const json = (await res.json()) as { data?: ExpoTicket[] };
      const tickets = json.data ?? [];

      // Tickets come back positionally, so index maps back to the token.
      for (const [i, ticket] of tickets.entries()) {
        const token = batch[i];
        if (!token) continue;

        if (ticket.status === "ok") {
          accepted++;
          ticketIds.push(ticket.id);
          // Expo's receipts identify a ticket, not a token, so the mapping has
          // to be kept here or the receipt check cannot retire anything. Redis
          // with a TTL rather than a table: it is worthless after a day or two.
          await redis
            .set(`push:ticket:${ticket.id}`, token.id, "EX", 3 * 86_400)
            .catch(() => undefined);
          continue;
        }

        failures.push(ticket.message.slice(0, 120));
        if (ticket.details?.error === "DeviceNotRegistered") {
          await invalidateToken(token.id, "DeviceNotRegistered");
        }
      }
    } catch (error) {
      failures.push(error instanceof Error ? error.message.slice(0, 120) : "send failed");
    }
  }

  if (accepted > 0) {
    await db.deviceToken.updateMany({
      where: { id: { in: tokens.map((t) => t.id) } },
      data: { lastSentAt: new Date() },
    });
  }

  // Receipts are the only way to learn a token is dead — a ticket only says
  // Expo accepted the message, not that a phone received it. Checked out of
  // band so alert delivery does not wait on it.
  if (ticketIds.length > 0) {
    void checkReceipts(ticketIds).catch(() => undefined);
  }

  const parts = [`${accepted}/${tokens.length} accepted`];
  if (failures.length) parts.push(`${failures.length} failed: ${failures[0]}`);
  return parts.join(", ");
}

/**
 * Reads delivery receipts and retires tokens the device no longer holds.
 *
 * Expo keeps receipts for about a day. Called shortly after sending is good
 * enough for the common case; a scheduled sweep would catch the rest.
 */
export async function checkReceipts(ticketIds: string[]): Promise<number> {
  let retired = 0;

  for (const batch of chunk(ticketIds, 300)) {
    const res = await fetch(RECEIPT_URL, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ ids: batch }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) continue;

    const json = (await res.json()) as {
      data?: Record<string, { status: string; details?: { error?: string } }>;
    };

    for (const [ticketId, receipt] of Object.entries(json.data ?? {})) {
      if (receipt.status !== "error") {
        await redis.del(`push:ticket:${ticketId}`).catch(() => undefined);
        continue;
      }

      if (receipt.details?.error !== "DeviceNotRegistered") continue;

      const tokenId = await redis.get(`push:ticket:${ticketId}`).catch(() => null);
      if (!tokenId) continue;

      await invalidateToken(tokenId, "DeviceNotRegistered (receipt)");
      await redis.del(`push:ticket:${ticketId}`).catch(() => undefined);
      retired++;
    }
  }

  return retired;
}

async function invalidateToken(id: string, reason: string): Promise<void> {
  await db.deviceToken
    .update({ where: { id }, data: { invalidatedAt: new Date(), invalidReason: reason } })
    .catch(() => undefined);
}
