import "server-only";

import { createHmac } from "node:crypto";
import type { Severity } from "@prisma/client";

import { env } from "@/env";
import { formatMetric, METRIC_META, withRetry } from "@aso/shared";
import { db } from "@/server/db";
import { resolveRecipients, sendPush } from "@/server/notify/push";

/**
 * Channel configuration stored on AlertRule.channels.
 *
 *   { "webhook": "https://…", "email": ["ops@acme.com"] }
 *
 * Slack and Discord incoming webhooks are ordinary webhooks — they are
 * detected by URL and sent a payload shaped the way they expect, so a user
 * pastes one URL and it works.
 */
export type AlertChannels = {
  webhook?: string;
  email?: string[];
  /**
   * Push targets a set of users rather than an address, because a phone is not
   * an endpoint someone types in — it is registered by signing in. An empty
   * `userIds` means every member of the organization.
   */
  push?: { userIds?: string[] };
};

/**
 * HTTPS is required for anything leaving the machine — an alert body carries
 * metric values and app names, and plaintext on the open network leaks them.
 * Plain HTTP is accepted only for loopback, which never leaves the host and is
 * how a self-hosted receiver on the same box is reached.
 */
export function isDeliverableUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }

  if (url.protocol === "https:") return true;
  if (url.protocol !== "http:") return false;

  return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname);
}

export function parseChannels(raw: unknown): AlertChannels {
  if (!raw || typeof raw !== "object") return {};
  const value = raw as Record<string, unknown>;

  const webhook =
    typeof value.webhook === "string" && isDeliverableUrl(value.webhook)
      ? value.webhook
      : undefined;

  const email = Array.isArray(value.email)
    ? value.email.filter((e): e is string => typeof e === "string" && e.includes("@"))
    : undefined;

  // `push: true` and `push: {}` both mean "everyone in the org" — the shorthand
  // exists because that is what a user toggling a switch means.
  let push: AlertChannels["push"];
  if (value.push === true) {
    push = {};
  } else if (value.push && typeof value.push === "object") {
    const raw = (value.push as Record<string, unknown>).userIds;
    const userIds = Array.isArray(raw)
      ? raw.filter((id): id is string => typeof id === "string")
      : undefined;
    push = userIds?.length ? { userIds } : {};
  }

  return { webhook, email: email?.length ? email : undefined, push };
}

/**
 * Per-organization signing secret, derived rather than stored.
 *
 * Receivers verify with:
 *   HMAC-SHA256(secret, `${timestamp}.${rawBody}`) === signature
 *
 * The timestamp is inside the signed payload so a captured delivery cannot be
 * replayed later.
 */
export function webhookSecret(organizationId: string): string {
  return createHmac("sha256", Buffer.from(env.ENCRYPTION_KEY, "base64"))
    .update(`webhook:${organizationId}`)
    .digest("hex");
}

export type AlertPayload = {
  event: "alert.triggered";
  id: string;
  isTest: boolean;
  triggeredAt: string;
  rule: {
    id: string;
    name: string;
    metric: string;
    metricLabel: string;
    comparator: string;
    threshold: number;
    windowDays: number;
    // The enum rather than a loose string: push filters on it, so a typo here
    // would silently stop delivering instead of failing to compile.
    severity: Severity;
  };
  app: { id: string; name: string; platform: string } | null;
  value: number;
  valueFormatted: string;
  baseline: number | null;
  message: string;
};

type DeliveryOutcome = Record<string, string>;

/**
 * Delivers one alert event to every configured channel.
 *
 * Channels are independent: a broken webhook must not stop the email, so each
 * is attempted and its outcome recorded separately. The overall delivery is
 * marked failed only when every configured channel failed.
 */
export async function deliverAlert(eventId: string): Promise<DeliveryOutcome> {
  const event = await db.alertEvent.findUnique({
    where: { id: eventId },
    include: { rule: { include: { app: true, organization: true } } },
  });

  if (!event) throw new Error(`Alert event ${eventId} not found`);

  const channels = parseChannels(event.rule.channels);
  const outcome: DeliveryOutcome = {};

  if (!channels.webhook && !channels.email?.length && !channels.push) {
    await db.alertEvent.update({
      where: { id: eventId },
      data: {
        deliveryLog: { note: "no channels configured" } as never,
        deliveredAt: new Date(),
        deliveryAttempts: { increment: 1 },
      },
    });
    return { note: "no channels configured" };
  }

  const payload: AlertPayload = {
    event: "alert.triggered",
    id: event.id,
    isTest: event.isTest,
    triggeredAt: event.triggeredAt.toISOString(),
    rule: {
      id: event.rule.id,
      name: event.rule.name,
      metric: event.rule.metric,
      metricLabel: METRIC_META[event.rule.metric].label,
      comparator: event.rule.comparator,
      threshold: event.rule.threshold,
      windowDays: event.rule.windowDays,
      severity: event.rule.severity,
    },
    app: event.rule.app
      ? { id: event.rule.app.id, name: event.rule.app.name, platform: event.rule.app.platform }
      : null,
    value: event.value,
    valueFormatted: formatMetric(event.rule.metric, event.value),
    baseline: event.baseline,
    message: event.message,
  };

  if (channels.webhook) {
    try {
      await sendWebhook(channels.webhook, payload, event.rule.organizationId);
      outcome.webhook = "ok";
    } catch (error) {
      outcome.webhook = error instanceof Error ? error.message.slice(0, 300) : "failed";
    }
  }

  if (channels.email?.length) {
    try {
      outcome.email = await sendEmail(channels.email, payload);
    } catch (error) {
      outcome.email = error instanceof Error ? error.message.slice(0, 300) : "failed";
    }
  }

  if (channels.push) {
    try {
      outcome.push = await deliverPush(channels.push, event.rule.organizationId, payload);
    } catch (error) {
      outcome.push = error instanceof Error ? error.message.slice(0, 300) : "failed";
    }
  }

  const anyDelivered = Object.values(outcome).some(
    (v) => v === "ok" || v.startsWith("sent") || /^[1-9]\d*\//.test(v),
  );

  await db.alertEvent.update({
    where: { id: eventId },
    data: {
      deliveryAttempts: { increment: 1 },
      deliveredAt: anyDelivered ? new Date() : null,
      deliveryError: anyDelivered ? null : Object.values(outcome).join("; ").slice(0, 2000),
      deliveryLog: outcome as never,
    },
  });

  if (!anyDelivered) {
    throw new Error(`Every channel failed: ${Object.values(outcome).join("; ")}`);
  }

  return outcome;
}

/**
 * Resolves who gets the push and sends it.
 *
 * An empty `userIds` means every member of the organization — but membership is
 * resolved here rather than trusted from the stored channel config, so a user
 * removed from an org stops receiving its alerts immediately.
 */
async function deliverPush(
  push: NonNullable<AlertChannels["push"]>,
  organizationId: string,
  payload: AlertPayload,
): Promise<string> {
  const members = await db.membership.findMany({
    where: {
      organizationId,
      ...(push.userIds?.length ? { userId: { in: push.userIds } } : {}),
    },
    select: { userId: true },
  });

  const tokens = await resolveRecipients(
    members.map((m) => m.userId),
    payload.rule.severity,
  );

  return sendPush(tokens, {
    title: payload.app ? `${payload.app.name} — ${payload.rule.name}` : payload.rule.name,
    body: payload.message,
    severity: payload.rule.severity,
    // Deep link straight at the alert, so a tap lands on what changed.
    url: `${env.APP_URL}/alerts?event=${payload.id}`,
    data: { eventId: payload.id, ruleId: payload.rule.id },
  });
}

/**
 * Sends a plain-text report to a rule's channels.
 *
 * Shares the transport with alerts but not the payload: a digest is prose, not
 * an event, so a receiver gets the rendered text rather than a signed event
 * object it would have to template itself.
 */
export async function deliverReport(opts: {
  organizationId: string;
  channels: AlertChannels;
  subject: string;
  text: string;
}): Promise<Record<string, string>> {
  const outcome: Record<string, string> = {};

  if (opts.channels.webhook) {
    try {
      await sendWebhookText(opts.channels.webhook, opts.subject, opts.text, opts.organizationId);
      outcome.webhook = "ok";
    } catch (error) {
      outcome.webhook = error instanceof Error ? error.message.slice(0, 300) : "failed";
    }
  }

  if (opts.channels.email?.length) {
    try {
      outcome.email = await sendPlainEmail(opts.channels.email, opts.subject, opts.text);
    } catch (error) {
      outcome.email = error instanceof Error ? error.message.slice(0, 300) : "failed";
    }
  }

  if (Object.keys(outcome).length === 0) {
    return { note: "no channels configured" };
  }

  const delivered = Object.values(outcome).some((v) => v === "ok" || v.startsWith("sent"));
  if (!delivered) {
    throw new Error(`Every channel failed: ${Object.values(outcome).join("; ")}`);
  }

  return outcome;
}

async function sendWebhookText(
  url: string,
  subject: string,
  text: string,
  organizationId: string,
) {
  const isSlack = /hooks\.slack\.com/.test(url);
  const isDiscord = /discord(app)?\.com\/api\/webhooks/.test(url);

  const body = isSlack
    ? JSON.stringify({ text: `*${subject}*\n\`\`\`${text}\`\`\`` })
    : isDiscord
      ? // Discord rejects messages over 2000 characters outright.
        JSON.stringify({ content: `**${subject}**\n\`\`\`${text.slice(0, 1800)}\`\`\`` })
      : JSON.stringify({ event: "digest", subject, text });

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (!isSlack && !isDiscord) {
    headers["X-ASO-Timestamp"] = timestamp;
    headers["X-ASO-Signature"] =
      "sha256=" +
      createHmac("sha256", webhookSecret(organizationId))
        .update(`${timestamp}.${body}`)
        .digest("hex");
    headers["X-ASO-Event"] = "digest";
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(url, { method: "POST", headers, body, signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Webhook responded ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

async function sendPlainEmail(
  recipients: string[],
  subject: string,
  text: string,
): Promise<string> {
  const server = process.env.EMAIL_SERVER;
  const from = process.env.EMAIL_FROM;

  if (!server || !from) {
    return "skipped — set EMAIL_SERVER and EMAIL_FROM to enable email";
  }

  const { createTransport } = await import("nodemailer");
  await createTransport(server).sendMail({
    from,
    to: recipients.join(", "),
    subject,
    text,
  });

  return `sent to ${recipients.length} recipient(s)`;
}

const SEVERITY_EMOJI: Record<string, string> = {
  INFO: "•",
  LOW: "•",
  MEDIUM: "!",
  HIGH: "!!",
  CRITICAL: "!!!",
};

async function sendWebhook(url: string, payload: AlertPayload, organizationId: string) {
  const isSlack = /hooks\.slack\.com/.test(url);
  const isDiscord = /discord(app)?\.com\/api\/webhooks/.test(url);

  const text =
    `${SEVERITY_EMOJI[payload.rule.severity] ?? "•"} *${payload.rule.name}*` +
    `${payload.isTest ? " _(test)_" : ""}\n${payload.message}`;

  // Slack and Discord require their own body shapes and ignore ours.
  const body = isSlack
    ? JSON.stringify({ text })
    : isDiscord
      ? JSON.stringify({ content: text.replace(/\*/g, "**") })
      : JSON.stringify(payload);

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  // Only sign our own payload shape — a Slack/Discord body is not ours to
  // authenticate and those services ignore unknown headers anyway.
  if (!isSlack && !isDiscord) {
    headers["X-ASO-Timestamp"] = timestamp;
    headers["X-ASO-Signature"] =
      "sha256=" +
      createHmac("sha256", webhookSecret(organizationId))
        .update(`${timestamp}.${body}`)
        .digest("hex");
    headers["X-ASO-Event"] = payload.event;
  }

  await withRetry(
    async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);

      try {
        const res = await fetch(url, {
          method: "POST",
          headers,
          body,
          signal: controller.signal,
        });

        if (!res.ok) {
          throw Object.assign(
            new Error(`Webhook responded ${res.status}: ${(await res.text()).slice(0, 200)}`),
            { status: res.status },
          );
        }
      } finally {
        clearTimeout(timer);
      }
    },
    { retries: 2, baseMs: 1000 },
  );
}

/**
 * Email is optional. Without SMTP configured this reports that rather than
 * failing the whole delivery — the webhook channel may still have worked.
 */
async function sendEmail(recipients: string[], payload: AlertPayload): Promise<string> {
  const server = process.env.EMAIL_SERVER;
  const from = process.env.EMAIL_FROM;

  if (!server || !from) {
    return "skipped — set EMAIL_SERVER and EMAIL_FROM to enable email alerts";
  }

  const { createTransport } = await import("nodemailer");
  const transport = createTransport(server);

  const subject = `${payload.isTest ? "[test] " : ""}${payload.rule.severity} — ${payload.rule.name}`;
  const lines = [
    payload.message,
    "",
    `Metric:    ${payload.rule.metricLabel}`,
    `Value:     ${payload.valueFormatted}`,
    payload.baseline !== null ? `Baseline:  ${payload.baseline}` : null,
    `Window:    ${payload.rule.windowDays} day(s)`,
    payload.app ? `App:       ${payload.app.name}` : "App:       all apps",
    "",
    `${env.APP_URL}/alerts`,
  ].filter(Boolean);

  await transport.sendMail({
    from,
    to: recipients.join(", "),
    subject,
    text: lines.join("\n"),
  });

  return `sent to ${recipients.length} recipient(s)`;
}
