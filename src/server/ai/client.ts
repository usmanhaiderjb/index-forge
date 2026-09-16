import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

import { env } from "@/env";
import { db } from "@/server/db";

const globalForAnthropic = globalThis as unknown as { anthropic: Anthropic | undefined };

export function aiConfigured(): boolean {
  // Either scheme counts. Checking only the api key would report AI as
  // unavailable on a perfectly working gateway setup.
  return Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN);
}

export class AiNotConfiguredError extends Error {
  constructor() {
    super("ANTHROPIC_API_KEY is not set on this deployment");
    this.name = "AiNotConfiguredError";
  }
}

export class AiBudgetExceededError extends Error {
  constructor(used: number, budget: number) {
    super(`AI budget exhausted for this month (${used}/${budget} output tokens)`);
    this.name = "AiBudgetExceededError";
  }
}

/**
 * Turns provider errors into something a user can act on.
 *
 * The raw SDK error is a JSON blob with a status code; surfacing that in a
 * toast tells someone nothing about what to do next. The distinctions that
 * matter are whose problem it is: billing and auth are the account owner's,
 * overload and rate limits resolve on their own.
 */
export function describeAiError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const status = (error as { status?: number })?.status;

  if (/credit balance is too low|insufficient.*credit|billing/i.test(message)) {
    return "The Anthropic account has no credits. Add credits at console.anthropic.com under Plans & Billing, then try again.";
  }
  if (status === 401 || /invalid x-api-key|authentication_error/i.test(message)) {
    return "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY on this deployment.";
  }
  if (status === 403 || /permission_error/i.test(message)) {
    return "This Anthropic key does not have access to the requested model.";
  }
  if (status === 429 || /rate_limit/i.test(message)) {
    return "Anthropic rate limit reached. Wait a moment and try again.";
  }
  if (status === 529 || /overloaded/i.test(message)) {
    return "Anthropic is temporarily overloaded. Try again shortly.";
  }
  if (status === 404 || /model.*not.*found/i.test(message)) {
    return `The configured model is unavailable to this key. Check ANTHROPIC_MODEL.`;
  }

  return message.slice(0, 400);
}

/** A provider failure that has already been translated for a human. */
export class AiRequestError extends Error {
  constructor(readonly cause: unknown) {
    super(describeAiError(cause));
    this.name = "AiRequestError";
  }
}

function client(): Anthropic {
  if (!aiConfigured()) throw new AiNotConfiguredError();
  /*
   * Two auth schemes, one client.
   *
   * Anthropic authenticates with `x-api-key`; Anthropic-compatible gateways
   * such as AgentRouter expect `Authorization: Bearer`. The SDK picks the
   * header from which option is set, so passing the wrong one produces a 401
   * that is indistinguishable from a bad key.
   *
   * `authToken` wins when both are present, because a gateway is the more
   * specific intent — nobody sets it by accident.
   */
  globalForAnthropic.anthropic ??= new Anthropic({
    ...(env.ANTHROPIC_AUTH_TOKEN
      ? { authToken: env.ANTHROPIC_AUTH_TOKEN }
      : { apiKey: env.ANTHROPIC_API_KEY }),
    baseURL: env.ANTHROPIC_BASE_URL,
  });
  return globalForAnthropic.anthropic;
}

/**
 * List prices in USD per million tokens. Used for the per-organization cost
 * attribution shown in settings — not for billing.
 */
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const price = PRICING[model] ?? PRICING["claude-opus-5"]!;
  return (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;
}

async function assertBudget(organizationId: string) {
  if (env.AI_MONTHLY_TOKEN_BUDGET === 0) return;

  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);

  const used = await db.aiUsage.aggregate({
    where: { organizationId, createdAt: { gte: start } },
    _sum: { outputTokens: true },
  });

  const total = used._sum.outputTokens ?? 0;
  if (total >= env.AI_MONTHLY_TOKEN_BUDGET) {
    throw new AiBudgetExceededError(total, env.AI_MONTHLY_TOKEN_BUDGET);
  }
}

type GenerateOptions<T extends z.ZodTypeAny> = {
  organizationId: string;
  /** Feature name recorded against the usage row, e.g. "keyword-strategy". */
  feature: string;
  system: string;
  prompt: string;
  schema: T;
  /**
   * Images to analyze, referenced by public URL — the store CDN serves them,
   * so nothing needs downloading and re-encoding here. Each is preceded by a
   * label so the model can refer to them by position.
   */
  images?: { url: string; label: string }[];
  /** Set true for high-volume per-item classification. */
  bulk?: boolean;
  maxTokens?: number;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
};

/** Images cost tokens; more than this per call is rarely worth the spend. */
const MAX_IMAGES_PER_CALL = 8;

/**
 * Single structured-output call. The schema is enforced by the API rather than
 * parsed out of prose, so callers get a typed object or an error — never a
 * half-parsed blob.
 */
export async function generateStructured<T extends z.ZodTypeAny>(
  opts: GenerateOptions<T>,
): Promise<{ data: z.infer<T>; model: string; usage: { input: number; output: number } }> {
  await assertBudget(opts.organizationId);

  const model = opts.bulk ? env.ANTHROPIC_MODEL_BULK : env.ANTHROPIC_MODEL;

  const images = (opts.images ?? []).slice(0, MAX_IMAGES_PER_CALL);

  // Each image is labelled immediately before it, so the model can cite one by
  // position rather than describing it back.
  const content = images.length
    ? [
        ...images.flatMap((image) => [
          { type: "text" as const, text: image.label },
          { type: "image" as const, source: { type: "url" as const, url: image.url } },
        ]),
        { type: "text" as const, text: opts.prompt },
      ]
    : opts.prompt;

  let response;
  try {
    response = await client().messages.parse({
      model,
      max_tokens: opts.maxTokens ?? 16000,
      system: opts.system,
      thinking: { type: "adaptive" },
      output_config: {
        effort: opts.effort ?? (opts.bulk ? "low" : env.ANTHROPIC_EFFORT),
        format: zodOutputFormat(opts.schema),
      },
      messages: [{ role: "user", content }],
    });
  } catch (error) {
    throw new AiRequestError(error);
  }

  if (response.stop_reason === "refusal") {
    throw new Error(
      `The model declined this request${
        response.stop_details?.explanation ? `: ${response.stop_details.explanation}` : ""
      }`,
    );
  }

  const parsed = response.parsed_output as z.infer<T> | null;
  if (!parsed) {
    throw new Error(
      response.stop_reason === "max_tokens"
        ? "Response was truncated before it could be parsed. Retry with a larger max_tokens."
        : "The model returned no parseable output",
    );
  }

  const inputTokens = response.usage.input_tokens + (response.usage.cache_read_input_tokens ?? 0);
  const outputTokens = response.usage.output_tokens;

  await db.aiUsage.create({
    data: {
      organizationId: opts.organizationId,
      feature: opts.feature,
      model,
      inputTokens,
      outputTokens,
      costUsd: estimateCost(model, inputTokens, outputTokens),
    },
  });

  return { data: parsed, model, usage: { input: inputTokens, output: outputTokens } };
}

/** Month-to-date AI spend and token counts for one organization. */
export async function usageSummary(organizationId: string) {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);

  const [totals, byFeature] = await Promise.all([
    db.aiUsage.aggregate({
      where: { organizationId, createdAt: { gte: start } },
      _sum: { inputTokens: true, outputTokens: true, costUsd: true },
      _count: true,
    }),
    db.aiUsage.groupBy({
      by: ["feature"],
      where: { organizationId, createdAt: { gte: start } },
      _sum: { outputTokens: true, costUsd: true },
    }),
  ]);

  return {
    calls: totals._count,
    inputTokens: totals._sum.inputTokens ?? 0,
    outputTokens: totals._sum.outputTokens ?? 0,
    costUsd: totals._sum.costUsd ?? 0,
    budget: env.AI_MONTHLY_TOKEN_BUDGET,
    byFeature: byFeature.map((row) => ({
      feature: row.feature,
      outputTokens: row._sum.outputTokens ?? 0,
      costUsd: row._sum.costUsd ?? 0,
    })),
  };
}
