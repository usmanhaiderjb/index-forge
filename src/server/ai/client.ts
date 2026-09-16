import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

import { env } from "@/env";
import { db } from "@/server/db";

const globalForAnthropic = globalThis as unknown as { anthropic: Anthropic | undefined };

export function aiConfigured(): boolean {
  return Boolean(env.GEMINI_API_KEY || env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN);
}

export function activeProvider(): "gemini" | "anthropic" | null {
  if (env.GEMINI_API_KEY) return "gemini";
  if (env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN) return "anthropic";
  return null;
}

export class AiNotConfiguredError extends Error {
  constructor() {
    super("Neither GEMINI_API_KEY nor ANTHROPIC_API_KEY is set on this deployment");
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
 * The raw SDK/API error is a JSON blob with a status code; surfacing that in a
 * toast tells someone nothing about what to do next. The distinctions that
 * matter are whose problem it is: billing and auth are the account owner's,
 * overload and rate limits resolve on their own.
 */
export function describeAiError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const status = (error as { status?: number })?.status;

  // Google Gemini errors
  if (/API_KEY_INVALID|API key not valid|invalid api key/i.test(message)) {
    return "The Gemini API key was rejected. Check GEMINI_API_KEY on this deployment.";
  }
  if (/RESOURCE_EXHAUSTED|quota exceeded|rate_limit_exceeded/i.test(message) || status === 429) {
    return "AI rate limit or quota reached. Wait a moment and try again.";
  }
  if (/PERMISSION_DENIED/i.test(message) || status === 403) {
    return "This AI key does not have access to the requested model.";
  }
  if (/MODEL_NOT_FOUND|model.*not.*found/i.test(message) || status === 404) {
    return "The configured AI model is unavailable. Check GEMINI_MODEL or ANTHROPIC_MODEL.";
  }

  // Anthropic errors
  if (/credit balance is too low|insufficient.*credit|billing/i.test(message)) {
    return "The Anthropic account has no credits. Add credits at console.anthropic.com under Plans & Billing, then try again.";
  }
  if (status === 401 || /invalid x-api-key|authentication_error/i.test(message)) {
    return "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY on this deployment.";
  }
  if (status === 529 || status === 503 || /overloaded|high demand|temporarily unavailable/i.test(message)) {
    return "AI service is temporarily overloaded. Try again shortly.";
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
  // Gemini 2.5 & 1.5 Models (Google AI Studio)
  "gemini-2.5-flash": { input: 0.15, output: 0.60 },
  "gemini-2.5-pro": { input: 1.25, output: 5.00 },
  "gemini-1.5-flash": { input: 0.075, output: 0.30 },
  "gemini-1.5-pro": { input: 1.25, output: 5.00 },
  // Anthropic Claude Models
  "claude-opus-5": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const price = PRICING[model] ?? PRICING["gemini-2.5-flash"]!;
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

/** Converts JSON Schema / Zod schema into clean Gemini OpenAPI 3.0 schema */
function cleanGeminiSchema(schema: unknown): unknown {
  if (!schema || typeof schema !== "object") return schema;
  if (Array.isArray(schema)) return schema.map(cleanGeminiSchema);

  const s = schema as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  if (s.type) out.type = s.type;
  if (s.format) out.format = s.format;
  if (s.description && typeof s.description === "string" && !s.description.startsWith("{$schema:")) {
    out.description = s.description;
  }
  if (s.nullable !== undefined) out.nullable = s.nullable;
  if (s.enum) out.enum = s.enum;

  if (s.properties && typeof s.properties === "object") {
    const props: Record<string, unknown> = {};
    for (const [propName, propDef] of Object.entries(s.properties as Record<string, unknown>)) {
      props[propName] = cleanGeminiSchema(propDef);
    }
    out.properties = props;
  }

  if (s.items) {
    out.items = cleanGeminiSchema(s.items);
  }

  if (Array.isArray(s.required)) {
    const propKeys = out.properties ? Object.keys(out.properties as Record<string, unknown>) : [];
    out.required = s.required.filter((r) => typeof r === "string" && propKeys.includes(r));
  }

  return out;
}

async function urlToInlineData(url: string): Promise<{ inlineData: { mimeType: string; data: string } } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const mimeType = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
    const arrayBuffer = await res.arrayBuffer();
    const data = Buffer.from(arrayBuffer).toString("base64");
    return { inlineData: { mimeType, data } };
  } catch {
    return null;
  }
}

async function generateGeminiStructured<T extends z.ZodTypeAny>(
  opts: GenerateOptions<T>,
): Promise<{ data: z.infer<T>; model: string; usage: { input: number; output: number } }> {
  const model = opts.bulk ? env.GEMINI_MODEL_BULK : env.GEMINI_MODEL;
  const apiKey = env.GEMINI_API_KEY!;
  const images = (opts.images ?? []).slice(0, MAX_IMAGES_PER_CALL);

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

  if (images.length) {
    for (const image of images) {
      parts.push({ text: `Image (${image.label}):` });
      const inline = await urlToInlineData(image.url);
      if (inline) {
        parts.push(inline);
      } else {
        parts.push({ text: `[Image at ${image.url} could not be downloaded]` });
      }
    }
  }

  parts.push({ text: opts.prompt });

  const rawSchema = (zodOutputFormat(opts.schema) as unknown as { schema: unknown })?.schema;
  const cleanSchema = cleanGeminiSchema(rawSchema);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  type GeminiResponse = {
    error?: { message?: string; code?: number; status?: string };
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
    }>;
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    };
  };

  let json: GeminiResponse | null = null;

  const MAX_RETRIES = 3;
  let lastErrObj: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(12000, 3000 * Math.pow(2, attempt - 1));
      await new Promise((r) => setTimeout(r, delay));
    }

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          systemInstruction: {
            parts: [{ text: `${opts.system}\n\nYou must return strictly valid JSON matching the specified schema without any enclosing markdown.` }],
          },
          generationConfig: {
            responseMimeType: "application/json",
            ...(cleanSchema ? { responseSchema: cleanSchema } : {}),
            temperature: 0.2,
            maxOutputTokens: opts.maxTokens ?? 8192,
          },
        }),
      });
    } catch (error) {
      if (attempt < MAX_RETRIES) continue;
      throw new AiRequestError(error);
    }

    json = (await res.json().catch(() => null)) as GeminiResponse | null;

    if (!res.ok || json?.error) {
      const errMsg = json?.error?.message ?? `Gemini API responded with HTTP status ${res.status}`;
      lastErrObj = Object.assign(new Error(errMsg), { status: res.status });

      const isTransient =
        res.status === 429 ||
        res.status === 503 ||
        res.status === 529 ||
        /high demand|temporarily unavailable|overloaded|RESOURCE_EXHAUSTED/i.test(errMsg);

      if (isTransient && attempt < MAX_RETRIES) {
        const retryMatch = /retry in\s+([\d.]+)s/i.exec(errMsg);
        const backoff = retryMatch
          ? Math.min(65000, Math.ceil(parseFloat(retryMatch[1]!) * 1000) + 1500)
          : 5000 * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      throw new AiRequestError(lastErrObj);
    }

    break;
  }

  let text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    const finishReason = json?.candidates?.[0]?.finishReason;
    if (finishReason === "SAFETY") {
      throw new Error("The model declined this request due to safety filters.");
    }
    throw new Error("Gemini returned empty output");
  }

  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`Failed to parse JSON response from Gemini: ${(err as Error).message}`);
  }

  // 1. Unwrap outer container key if Gemini wrapped the object (e.g. { keywordStrategy: { ... } } or { data: { ... } })
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const keys = Object.keys(parsed);
    if (keys.length === 1) {
      const singleKey = keys[0]!;
      const inner = (parsed as Record<string, unknown>)[singleKey];
      const rawProps = (rawSchema as { properties?: Record<string, unknown> })?.properties;
      if (rawProps && !(singleKey in rawProps) && inner && typeof inner === "object") {
        parsed = inner;
      } else if (!rawProps && inner && typeof inner === "object") {
        parsed = inner;
      }
    }
  }

  // 2. Normalization and fallback defaults for schema fields
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const p = parsed as Record<string, any>;

    // Keyword Strategy
    if ("keywords" in p || "avoid" in p || typeof p.summary === "string") {
      p.summary = typeof p.summary === "string" ? p.summary : "";
      if (!Array.isArray(p.keywords)) {
        p.keywords = [];
      } else {
        const validIntents = ["brand", "category", "competitor", "feature", "long-tail"];
        const validPriorities = ["high", "medium", "low"];
        const validPlacements = ["title", "subtitle", "keyword_field", "short_description", "long_description"];

        p.keywords = p.keywords
          .map((k: any) => {
            if (!k || typeof k !== "object") return null;
            const intentNorm = String(k.intent || "").toLowerCase().replace(/_/g, "-");
            const priorityNorm = String(k.priority || "").toLowerCase();
            const placementNorm = String(k.placement || "").toLowerCase().replace(/-/g, "_");

            return {
              term: String(k.term || "").trim(),
              intent: validIntents.includes(intentNorm) ? intentNorm : "feature",
              rationale: String(k.rationale || "Relevant term for app positioning."),
              priority: validPriorities.includes(priorityNorm) ? priorityNorm : "medium",
              placement: validPlacements.includes(placementNorm) ? placementNorm : "keyword_field",
            };
          })
          .filter((k: any) => k && k.term);
      }

      if (!Array.isArray(p.avoid)) {
        p.avoid = [];
      } else {
        p.avoid = p.avoid
          .map((item: any) => {
            if (typeof item === "string") {
              return { term: item.trim(), reason: "Too competitive or off-intent" };
            }
            if (item && typeof item === "object") {
              return {
                term: String(item.term || "").trim(),
                reason: String(item.reason || "Too competitive or off-intent"),
              };
            }
            return null;
          })
          .filter((item: any) => item && item.term);
      }
    }

    // Metadata Variants
    if ("variants" in p || Array.isArray(p.variants)) {
      if (!Array.isArray(p.variants)) {
        p.variants = [];
      } else {
        const validFields = [
          "TITLE",
          "SUBTITLE",
          "KEYWORDS",
          "SHORT_DESCRIPTION",
          "FULL_DESCRIPTION",
          "PROMOTIONAL_TEXT",
        ];
        p.variants = p.variants
          .map((v: any) => {
            if (!v || typeof v !== "object") return null;
            const fieldNorm = String(v.field || "").toUpperCase().replace(/[\s-]/g, "_");
            const text = String(v.text || "").trim();
            const targetKeywords = Array.isArray(v.targetKeywords)
              ? v.targetKeywords.map((t: any) => String(t).trim()).filter(Boolean)
              : typeof v.targetKeywords === "string" && v.targetKeywords.trim()
                ? [v.targetKeywords.trim()]
                : [];

            return {
              field: validFields.includes(fieldNorm) ? fieldNorm : "TITLE",
              text,
              charCount: typeof v.charCount === "number" ? v.charCount : text.length,
              targetKeywords,
              rationale: String(v.rationale || "Optimized variant for store visibility."),
            };
          })
          .filter((v: any) => v && v.text);
      }
    }

    // Review Themes
    if ("themes" in p || (p.summary && "themes" in p)) {
      p.summary = typeof p.summary === "string" ? p.summary : "";
      if (!Array.isArray(p.themes)) {
        p.themes = [];
      } else {
        const validSentiments = ["POSITIVE", "NEUTRAL", "NEGATIVE"];
        const validSeverities = ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"];
        p.themes = p.themes
          .map((t: any) => {
            if (!t || typeof t !== "object") return null;
            const sentimentNorm = String(t.sentiment || "").toUpperCase();
            const severityNorm = String(t.severity || "").toUpperCase();
            return {
              theme: String(t.theme || "General"),
              sentiment: validSentiments.includes(sentimentNorm) ? sentimentNorm : "NEUTRAL",
              mentionCount: typeof t.mentionCount === "number" && t.mentionCount > 0 ? t.mentionCount : 1,
              severity: validSeverities.includes(severityNorm) ? severityNorm : "INFO",
              exampleQuote: String(t.exampleQuote || ""),
              recommendation: String(t.recommendation || ""),
            };
          })
          .filter(Boolean);
      }
    }

    // Screenshot Analysis
    if ("screenshots" in p || "firstImpression" in p) {
      p.summary = typeof p.summary === "string" ? p.summary : "";
      p.firstImpression = typeof p.firstImpression === "string" ? p.firstImpression : "";
      p.orderRationale = typeof p.orderRationale === "string" ? p.orderRationale : "";
      if (!Array.isArray(p.screenshots)) p.screenshots = [];
      if (!Array.isArray(p.suggestedOrder)) p.suggestedOrder = [];
      if (!Array.isArray(p.recommendations)) p.recommendations = [];

      p.screenshots = p.screenshots
        .map((s: any, idx: number) => {
          if (!s || typeof s !== "object") return null;
          const validStrengths = ["strong", "adequate", "weak"];
          const strengthNorm = String(s.strength || "").toLowerCase();
          return {
            position: typeof s.position === "number" ? s.position : idx + 1,
            headline: String(s.headline || "none"),
            readableOnAPhone: Boolean(s.readableOnAPhone),
            communicates: String(s.communicates || ""),
            issues: Array.isArray(s.issues) ? s.issues.map(String) : [],
            strength: validStrengths.includes(strengthNorm) ? strengthNorm : "adequate",
          };
        })
        .filter(Boolean);

      const validPriorities = ["high", "medium", "low"];
      p.recommendations = p.recommendations
        .map((r: any) => {
          if (!r || typeof r !== "object") return null;
          const priorityNorm = String(r.priority || "").toLowerCase();
          return {
            action: String(r.action || ""),
            reason: String(r.reason || ""),
            priority: validPriorities.includes(priorityNorm) ? priorityNorm : "medium",
          };
        })
        .filter(Boolean);
    }

    // Recommendations
    if ("recommendations" in p && Array.isArray(p.recommendations)) {
      const validCats = [
        "keywords",
        "metadata",
        "creatives",
        "reviews",
        "conversion",
        "monetization",
        "paid_acquisition",
      ];
      p.recommendations = p.recommendations
        .map((r: any) => {
          if (!r || typeof r !== "object") return null;
          const catNorm = String(r.category || "").toLowerCase().replace(/[\s-]/g, "_");
          const impact = typeof r.impact === "number" ? Math.min(5, Math.max(1, Math.round(r.impact))) : 3;
          const effort = typeof r.effort === "number" ? Math.min(5, Math.max(1, Math.round(r.effort))) : 3;

          let actions = Array.isArray(r.actions) ? r.actions : [];
          actions = actions
            .map((a: any) => {
              if (typeof a === "string") return { step: "Action", detail: a };
              if (a && typeof a === "object") return { step: String(a.step || "Action"), detail: String(a.detail || "") };
              return null;
            })
            .filter(Boolean);

          if (actions.length === 0) {
            actions = [{ step: "Next step", detail: "Review and apply this recommendation." }];
          }

          return {
            category: validCats.includes(catNorm) ? catNorm : "metadata",
            title: String(r.title || "Optimization opportunity"),
            rationale: String(r.rationale || ""),
            impact,
            effort,
            actions,
          };
        })
        .filter(Boolean);
    }

    // Review Analysis
    if ("sentiment" in p && ("topics" in p || "isActionable" in p)) {
      const validSentiments = ["POSITIVE", "NEUTRAL", "NEGATIVE"];
      const sentimentNorm = String(p.sentiment || "").toUpperCase();
      p.sentiment = validSentiments.includes(sentimentNorm) ? sentimentNorm : "NEUTRAL";
      p.topics = Array.isArray(p.topics) ? p.topics.map(String) : [];
      p.isActionable = Boolean(p.isActionable);
    }

    // Review Reply
    if ("reply" in p || "tone" in p) {
      const reply = String(p.reply || "").trim();
      p.reply = reply;
      p.charCount = typeof p.charCount === "number" ? p.charCount : reply.length;
      const validTones = ["apologetic", "helpful", "appreciative", "informative"];
      const toneNorm = String(p.tone || "").toLowerCase();
      p.tone = validTones.includes(toneNorm) ? toneNorm : "helpful";
      p.addressesIssue = String(p.addressesIssue || "User feedback");
      p.needsHumanReview = Boolean(p.needsHumanReview);
    }

    // Competitor Gap
    if ("gaps" in p || "positioning" in p) {
      p.summary = typeof p.summary === "string" ? p.summary : "";
      p.positioning = typeof p.positioning === "string" ? p.positioning : "";
      if (!Array.isArray(p.gaps)) {
        p.gaps = [];
      } else {
        const validAreas = ["keywords", "creatives", "description", "ratings", "pricing", "features"];
        const validImpacts = ["high", "medium", "low"];
        p.gaps = p.gaps
          .map((g: any) => {
            if (!g || typeof g !== "object") return null;
            const areaNorm = String(g.area || "").toLowerCase();
            const impactNorm = String(g.impact || "").toLowerCase();
            return {
              area: validAreas.includes(areaNorm) ? areaNorm : "features",
              finding: String(g.finding || ""),
              competitorExample: String(g.competitorExample || ""),
              action: String(g.action || ""),
              impact: validImpacts.includes(impactNorm) ? impactNorm : "medium",
            };
          })
          .filter(Boolean);
      }
    }
  }

  const validated = opts.schema.parse(parsed) as z.infer<T>;

  const inputTokens = json?.usageMetadata?.promptTokenCount ?? 0;
  const outputTokens = json?.usageMetadata?.candidatesTokenCount ?? 0;

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

  return { data: validated, model, usage: { input: inputTokens, output: outputTokens } };
}

/**
 * Single structured-output call. The schema is enforced by the API rather than
 * parsed out of prose, so callers get a typed object or an error — never a
 * half-parsed blob.
 */
export async function generateStructured<T extends z.ZodTypeAny>(
  opts: GenerateOptions<T>,
): Promise<{ data: z.infer<T>; model: string; usage: { input: number; output: number } }> {
  await assertBudget(opts.organizationId);

  if (env.GEMINI_API_KEY) {
    return generateGeminiStructured(opts);
  }

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
