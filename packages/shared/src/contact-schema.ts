import { z } from "zod";

/**
 * Contact form validation.
 *
 * Deliberately in `lib` rather than beside the router: the router pulls in
 * auth and the database, and the schema is shared with the client form. Keeping
 * it dependency-free means the browser bundle and the tests both get the rules
 * without dragging the server in.
 */
export const contactInput = z.object({
  name: z.string().trim().min(1, "Tell us your name").max(120),
  email: z.string().trim().toLowerCase().email("That does not look like an email address").max(254),
  company: z.string().trim().max(120).optional(),
  topic: z.enum(["GENERAL", "SALES", "SUPPORT", "PARTNERSHIP"]).default("GENERAL"),
  message: z
    .string()
    .trim()
    .min(20, "A few more words would help us answer properly")
    .max(4000, "That is longer than we can accept — send the essentials and we will follow up"),
  /**
   * Honeypot. Real users never see this field, so anything in it is a bot.
   * Named plausibly on purpose — a field called "honeypot" defeats the point.
   */
  website: z.string().max(0).optional(),
});

export type ContactInput = z.infer<typeof contactInput>;

export const CONTACT_TOPICS = [
  { value: "GENERAL", label: "General question" },
  { value: "SALES", label: "Pricing and plans" },
  { value: "SUPPORT", label: "Technical support" },
  { value: "PARTNERSHIP", label: "Partnership" },
] as const;
