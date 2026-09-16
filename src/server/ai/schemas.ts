import { z } from "zod";

/**
 * Structured-output schemas. Kept flat and free of the JSON Schema features
 * the API does not support (no recursion, no min/max constraints) so the
 * schema compiles on the first call.
 */

export const keywordStrategySchema = z.object({
  summary: z.string().describe("Two or three sentences on the current keyword position."),
  keywords: z.array(
    z.object({
      term: z.string(),
      intent: z.enum(["brand", "category", "competitor", "feature", "long-tail"]),
      rationale: z.string().describe("Why this term is worth targeting for this specific app."),
      priority: z.enum(["high", "medium", "low"]),
      placement: z
        .enum(["title", "subtitle", "keyword_field", "short_description", "long_description"])
        .describe("Where this term should be placed to be indexed."),
    }),
  ),
  avoid: z
    .array(z.object({ term: z.string(), reason: z.string() }))
    .describe("Terms already covered elsewhere, too competitive, or off-intent."),
});

export const metadataVariantsSchema = z.object({
  variants: z.array(
    z.object({
      field: z.enum([
        "TITLE",
        "SUBTITLE",
        "KEYWORDS",
        "SHORT_DESCRIPTION",
        "FULL_DESCRIPTION",
        "PROMOTIONAL_TEXT",
      ]),
      text: z.string(),
      charCount: z.number().int(),
      targetKeywords: z.array(z.string()),
      rationale: z.string(),
    }),
  ),
});

export const reviewAnalysisSchema = z.object({
  sentiment: z.enum(["POSITIVE", "NEUTRAL", "NEGATIVE"]),
  topics: z.array(z.string()).describe("Two to four lowercase theme tags, e.g. \"crash\", \"pricing\"."),
  isActionable: z.boolean().describe("True when the review names a specific, fixable problem."),
});

export const reviewThemesSchema = z.object({
  summary: z.string(),
  themes: z.array(
    z.object({
      theme: z.string(),
      sentiment: z.enum(["POSITIVE", "NEUTRAL", "NEGATIVE"]),
      mentionCount: z.number().int(),
      severity: z.enum(["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"]),
      exampleQuote: z.string(),
      recommendation: z.string(),
    }),
  ),
});

export const reviewReplySchema = z.object({
  reply: z.string().describe("The reply text, ready to publish as written."),
  charCount: z.number().int(),
  tone: z.enum(["apologetic", "helpful", "appreciative", "informative"]),
  addressesIssue: z
    .string()
    .describe("The specific complaint or praise this reply responds to."),
  needsHumanReview: z
    .boolean()
    .describe(
      "True when the review alleges data loss, a billing problem, a legal issue, or anything a template should not answer.",
    ),
});

export const screenshotAnalysisSchema = z.object({
  summary: z.string().describe("Two or three sentences on the gallery as a whole."),
  firstImpression: z
    .string()
    .describe(
      "What a visitor understands about the app from the first two screenshots alone, since most never scroll further.",
    ),
  screenshots: z.array(
    z.object({
      position: z.number().int().describe("1-based position in the gallery as shown."),
      headline: z.string().describe("The caption text visible in the image, or \"none\" if absent."),
      readableOnAPhone: z
        .boolean()
        .describe("Whether the caption is large enough to read at gallery thumbnail size."),
      communicates: z.string().describe("The single benefit or feature this image conveys."),
      issues: z.array(z.string()).describe("Concrete problems, empty when there are none."),
      strength: z.enum(["strong", "adequate", "weak"]),
    }),
  ),
  suggestedOrder: z
    .array(z.number().int())
    .describe("Positions reordered strongest-first, or the original order if it is already right."),
  orderRationale: z.string(),
  recommendations: z.array(
    z.object({
      action: z.string(),
      reason: z.string(),
      priority: z.enum(["high", "medium", "low"]),
    }),
  ),
});

export const competitorGapSchema = z.object({
  summary: z.string(),
  positioning: z.string().describe("How this app is currently positioned relative to the set."),
  gaps: z.array(
    z.object({
      area: z.enum(["keywords", "creatives", "description", "ratings", "pricing", "features"]),
      finding: z.string(),
      competitorExample: z.string(),
      action: z.string(),
      impact: z.enum(["high", "medium", "low"]),
    }),
  ),
});

export const anomalySchema = z.object({
  headline: z.string(),
  explanation: z.string(),
  severity: z.enum(["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  likelyCauses: z.array(z.object({ cause: z.string(), confidence: z.enum(["high", "medium", "low"]) })),
  checks: z.array(z.string()).describe("Concrete things to verify, in order."),
});

export const recommendationsSchema = z.object({
  recommendations: z.array(
    z.object({
      category: z.enum([
        "keywords",
        "metadata",
        "creatives",
        "reviews",
        "conversion",
        "monetization",
        "paid_acquisition",
      ]),
      title: z.string(),
      rationale: z.string(),
      impact: z.number().int().describe("1 (low) to 5 (high)."),
      effort: z.number().int().describe("1 (easy) to 5 (hard)."),
      actions: z.array(z.object({ step: z.string(), detail: z.string() })),
    }),
  ),
});

export type KeywordStrategy = z.infer<typeof keywordStrategySchema>;
export type MetadataVariants = z.infer<typeof metadataVariantsSchema>;
export type ReviewAnalysis = z.infer<typeof reviewAnalysisSchema>;
export type ReviewThemes = z.infer<typeof reviewThemesSchema>;
export type ReviewReply = z.infer<typeof reviewReplySchema>;
export type ScreenshotAnalysis = z.infer<typeof screenshotAnalysisSchema>;
export type CompetitorGap = z.infer<typeof competitorGapSchema>;
export type AnomalyExplanation = z.infer<typeof anomalySchema>;
export type Recommendations = z.infer<typeof recommendationsSchema>;
