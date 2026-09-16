import { TRPCError } from "@trpc/server";
import { createHash } from "node:crypto";

import { env } from "@/env";
import { contactInput, type ContactInput } from "@aso/shared";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { SITE } from "@/content/site";

/**
 * Two limits, because the two signals mean different things.
 *
 * An email address identifies one sender, so a low cap is right. An IP can be
 * a whole office behind one NAT — capping it as tightly would mean the third
 * person at a company to write in gets refused, which looks like the product
 * is broken. Loose enough not to catch a team, tight enough to stop a flood.
 */
const RATE_LIMIT = { perEmail: 3, perIp: 20, windowMinutes: 60 };

/**
 * Hashed, never stored raw. Rate limiting needs to recognise a repeat sender;
 * it does not need to be able to identify them afterwards.
 */
function hashIp(ip: string): string {
  return createHash("sha256").update(`${ip}:${env.ENCRYPTION_KEY}`).digest("hex").slice(0, 32);
}

function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;
  return headers.get("x-real-ip");
}

export const contactRouter = createTRPCRouter({
  /** Public by design — requiring an account to ask a question is absurd. */
  send: publicProcedure.input(contactInput).mutation(async ({ ctx, input }) => {
    // Silently accepted, never stored. Telling a bot it was detected only
    // tells whoever wrote it which field to leave alone next time.
    if (input.website) {
      return { ok: true as const, delivered: false };
    }

    const ip = clientIp(ctx.headers);
    const ipHash = ip ? hashIp(ip) : null;
    const since = new Date(Date.now() - RATE_LIMIT.windowMinutes * 60_000);

    const [fromEmail, fromIp] = await Promise.all([
      ctx.db.contactMessage.count({
        where: { createdAt: { gte: since }, email: input.email },
      }),
      ipHash
        ? ctx.db.contactMessage.count({ where: { createdAt: { gte: since }, ipHash } })
        : Promise.resolve(0),
    ]);

    if (fromEmail >= RATE_LIMIT.perEmail || fromIp >= RATE_LIMIT.perIp) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `You have already sent ${RATE_LIMIT.perEmail} messages in the last hour. Email ${SITE.contact.email} directly if it is urgent.`,
      });
    }

    const saved = await ctx.db.contactMessage.create({
      data: {
        name: input.name,
        email: input.email,
        company: input.company || null,
        topic: input.topic,
        message: input.message,
        ipHash,
        userAgent: ctx.headers.get("user-agent")?.slice(0, 500) ?? null,
      },
    });

    // The message is already saved, so a mail failure must not fail the
    // request — that would tell the sender it did not go through when it did.
    const delivered = await notify(saved.id, input).catch(() => false);

    return { ok: true as const, delivered };
  }),
});

/**
 * Emails the message on, when SMTP is configured. Returns whether it went out
 * so the UI can be honest about whether anyone has been pinged yet.
 */
async function notify(id: string, input: ContactInput): Promise<boolean> {
  const server = process.env.EMAIL_SERVER;
  const from = process.env.EMAIL_FROM;
  const to = process.env.CONTACT_EMAIL_TO ?? from;

  if (!server || !from || !to) return false;

  const { createTransport } = await import("nodemailer");
  const transport = createTransport(server);

  await transport.sendMail({
    from,
    to,
    // So a reply goes to the person who wrote in, not to our own sender.
    replyTo: `${input.name} <${input.email}>`,
    subject: `[${input.topic.toLowerCase()}] Contact form — ${input.name}`,
    text: [
      input.message,
      "",
      "---",
      `Name:    ${input.name}`,
      `Email:   ${input.email}`,
      input.company ? `Company: ${input.company}` : null,
      `Topic:   ${input.topic}`,
      `Ref:     ${id}`,
    ]
      .filter(Boolean)
      .join("\n"),
  });

  return true;
}
