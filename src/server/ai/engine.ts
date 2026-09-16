import "server-only";

import { type App, type Platform } from "@prisma/client";

import { formatMetric, METRIC_META, ymd } from "@aso/shared";
import { generateStructured } from "@/server/ai/client";
import {
  anomalySchema,
  competitorGapSchema,
  keywordStrategySchema,
  metadataVariantsSchema,
  recommendationsSchema,
  reviewAnalysisSchema,
  reviewReplySchema,
  reviewThemesSchema,
  screenshotAnalysisSchema,
} from "@/server/ai/schemas";
import {
  auditListing,
  fetchableScreenshotUrls,
  FIELD_LIMITS,
  type ListingInput,
} from "@/server/aso/analysis";
import { db } from "@/server/db";

const BASE_SYSTEM = `You are an App Store Optimization analyst. You work from the data you are given and nothing else.

Rules you follow without exception:
- Never invent numbers, competitor names, keyword volumes, or ranks. If the data does not contain something, say so.
- Respect the store's character limits exactly. A suggestion one character over the limit is wrong.
- iOS and Android index differently: iOS indexes the title, subtitle, and the hidden 100-character keyword field, and does NOT index the description. Google Play indexes the title, short description, and full description, and has no keyword field.
- Never repeat a keyword across iOS fields — the keyword field is combined with the title and subtitle, so duplication wastes characters.
- Prefer concrete, checkable actions over general advice. "Move 'budget tracker' into the subtitle" beats "improve your subtitle".`;

function platformNotes(platform: Platform): string {
  return platform === "IOS"
    ? `Platform: iOS App Store. Indexed fields: title (30), subtitle (30), keyword field (100, comma separated, no spaces after commas). The description is not indexed and only affects conversion.`
    : `Platform: Google Play. Indexed fields: title (30), short description (80), full description (4000). Keyword repetition in the description carries weight up to roughly 3 mentions; beyond that it reads as spam to users.`;
}

/** Compact, deterministic serialization of a listing for the prompt. */
function describeListing(app: App, listing: ListingInput): string {
  const audit = auditListing(listing);
  const lines = [
    `App: ${app.name} (${app.platform}, store id ${app.storeId}, ${app.country.toUpperCase()}/${app.locale})`,
    `Category: ${app.category ?? "unknown"}`,
    `Current title: ${listing.title ?? "(none)"} [${(listing.title ?? "").length} chars]`,
  ];

  if (app.platform === "IOS") {
    lines.push(`Current subtitle: ${listing.subtitle ?? "(none)"} [${(listing.subtitle ?? "").length} chars]`);
    lines.push(
      `Current keyword field: ${listing.keywordField ?? "(none)"} [${(listing.keywordField ?? "").length}/100 chars]`,
    );
  } else {
    lines.push(
      `Current short description: ${listing.shortDescription ?? "(none)"} [${(listing.shortDescription ?? "").length}/80 chars]`,
    );
  }

  lines.push(
    `Description (first 1200 chars): ${(listing.fullDescription ?? "(none)").slice(0, 1200)}`,
    `Rating: ${listing.ratingAverage?.toFixed(2) ?? "unknown"} from ${listing.ratingCount ?? 0} ratings`,
    `Screenshots: ${listing.screenshotCount ?? 0}, preview video: ${listing.hasVideo ? "yes" : "no"}`,
    `Deterministic listing score: ${audit.score}/100`,
    `Failing checks: ${audit.checks.filter((c) => c.status !== "pass").map((c) => `${c.label} (${c.detail})`).join("; ") || "none"}`,
  );

  return lines.join("\n");
}

async function loadListing(
  appId: string,
  storefront?: { country: string; locale: string },
): Promise<{ app: App; listing: ListingInput }> {
  const app = await db.app.findUniqueOrThrow({ where: { id: appId } });
  const snapshot = await db.storeListing.findFirst({
    where: {
      appId,
      ...(storefront ? { country: storefront.country, locale: storefront.locale } : {}),
    },
    orderBy: { capturedAt: "desc" },
  });

  return {
    app,
    listing: {
      platform: app.platform,
      title: snapshot?.title,
      subtitle: snapshot?.subtitle,
      keywordField: snapshot?.keywordField,
      shortDescription: snapshot?.shortDescription,
      fullDescription: snapshot?.fullDescription,
      screenshotCount: snapshot?.screenshotCount,
      hasVideo: snapshot?.hasVideo,
      ratingAverage: snapshot?.ratingAverage,
      ratingCount: snapshot?.ratingCount,
    },
  };
}

// ---------------------------------------------------------------------------
// Keyword strategy
// ---------------------------------------------------------------------------

export async function generateKeywordStrategy(organizationId: string, appId: string) {
  const { app, listing } = await loadListing(appId);

  const [tracked, competitors] = await Promise.all([
    db.keyword.findMany({
      where: { appId },
      include: {
        ranks: { orderBy: { date: "desc" }, take: 1 },
        metrics: { orderBy: { date: "desc" }, take: 1 },
      },
      take: 100,
    }),
    db.competitor.findMany({
      where: { appId, isTracked: true },
      include: { snapshots: { orderBy: { capturedAt: "desc" }, take: 1 } },
      take: 10,
    }),
  ]);

  const trackedBlock = tracked.length
    ? tracked
        .map((k) => {
          const rank = k.ranks[0]?.rank;
          const metric = k.metrics[0];
          return `- "${k.term}" | rank ${rank ?? "not in top results"} | popularity ${metric?.popularity ?? "?"} | difficulty ${metric?.difficulty ?? "?"} | opportunity ${metric?.opportunity ?? "?"}`;
        })
        .join("\n")
    : "(no keywords tracked yet)";

  const competitorBlock = competitors.length
    ? competitors
        .map((c) => `- ${c.name}: "${c.snapshots[0]?.title ?? "?"}" / "${c.snapshots[0]?.subtitle ?? ""}"`)
        .join("\n")
    : "(no competitors tracked)";

  const result = await generateStructured({
    organizationId,
    feature: "keyword-strategy",
    schema: keywordStrategySchema,
    system: BASE_SYSTEM,
    prompt: `${platformNotes(app.platform)}

${describeListing(app, listing)}

Currently tracked keywords and their measured position:
${trackedBlock}

Competitor listings:
${competitorBlock}

Propose a keyword strategy. Include terms the app is close to ranking for, terms competitors own that this app never mentions, and long-tail terms that fit the app's actual functionality. For each, say exactly which field it belongs in. Do not propose a term that is already well placed.`,
  });

  return result;
}

// ---------------------------------------------------------------------------
// Metadata generation
// ---------------------------------------------------------------------------

export async function generateMetadataVariants(
  organizationId: string,
  appId: string,
  opts: {
    targetKeywords?: string[];
    count?: number;
    /** Which storefront to write for. Defaults to the app's primary. */
    storefront?: { country: string; locale: string };
  } = {},
) {
  const { app, listing } = await loadListing(appId, opts.storefront);
  const limits = FIELD_LIMITS[app.platform];
  const country = opts.storefront?.country ?? app.country;
  const locale = opts.storefront?.locale ?? app.locale;

  const targets = opts.targetKeywords?.length
    ? opts.targetKeywords
    : (
        await db.keyword.findMany({
          // Keywords are per storefront — writing German copy against
          // US-tracked English terms would target the wrong market entirely.
          where: { appId, isTracked: true, country },
          include: { metrics: { orderBy: { date: "desc" }, take: 1 } },
          take: 30,
        })
      )
        .sort((a, b) => (b.metrics[0]?.opportunity ?? 0) - (a.metrics[0]?.opportunity ?? 0))
        .slice(0, 12)
        .map((k) => k.term);

  const limitLines = Object.entries(limits)
    .map(([field, limit]) => `- ${field}: ${limit} characters maximum`)
    .join("\n");

  const result = await generateStructured({
    organizationId,
    feature: "metadata-variants",
    schema: metadataVariantsSchema,
    system: BASE_SYSTEM,
    prompt: `${platformNotes(app.platform)}

Storefront: ${country.toUpperCase()}, listing language ${locale}.

${describeListing(app, listing)}

Keywords to work in, highest value first:
${targets.join(", ") || "(none supplied — infer from the listing)"}

Hard character limits for this platform:
${limitLines}

Write ${opts.count ?? 3} distinct variants for each indexed field on this platform. Each variant must:
- Be written in ${locale}. Write as a native speaker of that market would search, not as a translation of English copy — the words people actually type differ from the dictionary equivalents.
- Stay within the character limit. Set charCount to the exact character count of the text you wrote. Note that this limit counts characters, not bytes, so scripts such as Japanese fit more meaning per character.
- Read as something a person would tap, not a keyword list.
- Avoid repeating any term that already appears in another field of the same variant set.

Only produce variants for fields that exist on this platform.`,
  });

  return result;
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

/** Per-review classification. Runs on the bulk model — thousands of short calls. */
export async function classifyReview(
  organizationId: string,
  review: { rating: number; title?: string | null; body?: string | null },
) {
  return generateStructured({
    organizationId,
    feature: "review-classify",
    schema: reviewAnalysisSchema,
    bulk: true,
    maxTokens: 1024,
    system:
      "You classify app store reviews. Return the sentiment the reviewer expresses, not the sentiment implied by the star rating alone.",
    prompt: `Rating: ${review.rating}/5
Title: ${review.title ?? "(none)"}
Body: ${review.body ?? "(none)"}`,
  });
}

/**
 * Drafts a reply to one review.
 *
 * The draft is never published automatically — it is returned for a human to
 * read, edit and send. `needsHumanReview` marks the cases a template must not
 * answer at all.
 */
export async function draftReviewReply(
  organizationId: string,
  reviewId: string,
  opts: { charLimit: number; instructions?: string },
) {
  const review = await db.review.findUniqueOrThrow({
    where: { id: reviewId },
    include: { app: true },
  });

  // Recent replies set the voice, so drafts stay consistent with whatever the
  // team already sounds like rather than inventing a new tone each time.
  const priorReplies = await db.review.findMany({
    where: { appId: review.appId, developerReply: { not: null } },
    orderBy: { repliedAt: "desc" },
    take: 5,
    select: { rating: true, body: true, developerReply: true },
  });

  const voiceBlock = priorReplies.length
    ? priorReplies
        .map((r) => `- To a ${r.rating}-star review: "${r.developerReply}"`)
        .join("\n")
    : "(no previous replies — use a plain, warm, non-corporate voice)";

  return generateStructured({
    organizationId,
    feature: "review-reply",
    schema: reviewReplySchema,
    maxTokens: 2048,
    system: `You draft developer replies to app store reviews.

These replies are published publicly under the developer's name and are read by every future visitor to the listing, not only by the reviewer. Write accordingly:
- Answer the specific thing the reviewer raised. A generic "thanks for the feedback" is worse than no reply.
- Never promise a fix, a date, or a refund. You do not know the roadmap.
- Never ask the reviewer to change their rating.
- Do not invent features, versions, or causes.
- If the review alleges lost data, a billing problem, a security issue, or anything legal, set needsHumanReview and keep the draft to an acknowledgement plus a support contact.`,
    prompt: `App: ${review.app.name} (${review.app.platform})

Review to answer:
Rating: ${review.rating}/5
Version: ${review.appVersion ?? "unknown"}
Title: ${review.title ?? "(none)"}
Body: ${review.body ?? "(none)"}

How this team has replied before:
${voiceBlock}

${opts.instructions ? `Additional instruction from the team: ${opts.instructions}\n` : ""}
Hard limit: ${opts.charLimit} characters. Set charCount to the exact length of the reply you wrote. A reply over the limit is rejected by the store, so stay under it.`,
  });
}

export async function summarizeReviewThemes(organizationId: string, appId: string, days = 30) {
  const since = new Date(Date.now() - days * 86_400_000);

  const reviews = await db.review.findMany({
    where: { appId, submittedAt: { gte: since } },
    orderBy: { submittedAt: "desc" },
    take: 300,
  });

  if (reviews.length === 0) {
    throw new Error(`No reviews in the last ${days} days to analyze`);
  }

  const block = reviews
    .map((r) => `[${r.rating}/5 | ${ymd(r.submittedAt)} | v${r.appVersion ?? "?"}] ${r.title ? `${r.title}: ` : ""}${(r.body ?? "").slice(0, 400)}`)
    .join("\n");

  return generateStructured({
    organizationId,
    feature: "review-themes",
    schema: reviewThemesSchema,
    system: BASE_SYSTEM,
    prompt: `${reviews.length} reviews from the last ${days} days:

${block}

Group these into themes. mentionCount must be the number of reviews in this set that actually raise the theme — count them, do not estimate. Order themes by how much they are hurting the rating.`,
  });
}

// ---------------------------------------------------------------------------
// Creatives
// ---------------------------------------------------------------------------

/**
 * Vision critique of the screenshot gallery.
 *
 * Screenshots move conversion more than any text field, and unlike the text
 * fields nothing else in this product can read them. The model is given the
 * images in gallery order so it can judge sequence, not only each image alone.
 */
export async function analyzeScreenshots(
  organizationId: string,
  appId: string,
  storefront?: { country: string; locale: string },
) {
  const app = await db.app.findUniqueOrThrow({ where: { id: appId } });

  const listing = await db.storeListing.findFirst({
    where: {
      appId,
      ...(storefront ? { country: storefront.country, locale: storefront.locale } : {}),
      screenshotUrls: { isEmpty: false },
    },
    orderBy: { capturedAt: "desc" },
  });

  if (!listing || listing.screenshotUrls.length === 0) {
    throw new Error(
      "No screenshots captured for this storefront yet. Refresh the listing, then try again.",
    );
  }

  // Images are referenced by public URL, so anything inline (seed data, a
  // manual import) cannot be fetched and is rejected with a reason rather than
  // failing inside the API call.
  const fetchable = fetchableScreenshotUrls(listing.screenshotUrls);

  if (fetchable.length === 0) {
    throw new Error(
      "These screenshots are not publicly fetchable URLs, so they cannot be analyzed. Refresh the listing to capture the real store images.",
    );
  }

  // The first few carry nearly all of the conversion effect, and each image
  // costs tokens — analysing twenty would spend most of the budget on images
  // almost nobody scrolls to.
  const urls = fetchable.slice(0, 6);

  const { data, model, usage } = await generateStructured({
    organizationId,
    feature: "screenshot-analysis",
    schema: screenshotAnalysisSchema,
    maxTokens: 8000,
    images: urls.map((url, index) => ({
      url,
      label: `Screenshot ${index + 1} of ${listing.screenshotUrls.length}:`,
    })),
    system: `${BASE_SYSTEM}

You are looking at an app's store screenshots as a visitor would.

What actually matters here:
- Most visitors see only the first two images, and see them small. A caption that is unreadable at thumbnail size is not doing any work.
- Each image should carry one idea. An image showing three features communicates none of them.
- The gallery is a sequence: the first image should state what the app is, not show a settings screen.
- Judge what is actually visible. Do not guess at features you cannot see, and do not describe the UI back — say what a visitor would take away.`,
    prompt: `App: ${app.name} (${app.platform === "IOS" ? "App Store" : "Google Play"})
Category: ${app.category ?? "unknown"}
Storefront: ${(storefront?.country ?? app.country).toUpperCase()}
Listing title: ${listing.title ?? "unknown"}
${listing.subtitle ? `Subtitle: ${listing.subtitle}` : ""}

${urls.length} of ${fetchable.length} screenshots are shown above, in gallery order.

Critique them. Set position to match the numbering above. In suggestedOrder, return the positions reordered so the strongest, clearest images come first — if the current order is already right, return it unchanged rather than inventing a change.`,
  });

  return { data, model, usage, analyzedUrls: urls, totalCount: fetchable.length };
}

// ---------------------------------------------------------------------------
// Competitors
// ---------------------------------------------------------------------------

export async function analyzeCompetitorGap(organizationId: string, appId: string) {
  const { app, listing } = await loadListing(appId);

  const competitors = await db.competitor.findMany({
    where: { appId, isTracked: true },
    include: { snapshots: { orderBy: { capturedAt: "desc" }, take: 1 } },
    take: 8,
  });

  if (competitors.length === 0) {
    throw new Error("Add at least one competitor before running a gap analysis");
  }

  const block = competitors
    .map((c) => {
      const s = c.snapshots[0];
      return `- ${c.name} (${c.storeId})
  title: ${s?.title ?? "?"}
  subtitle: ${s?.subtitle ?? "-"}
  rating: ${s?.ratingAverage?.toFixed(2) ?? "?"} (${s?.ratingCount ?? 0} ratings)
  description opening: ${(s?.description ?? "").slice(0, 400)}`;
    })
    .join("\n");

  return generateStructured({
    organizationId,
    feature: "competitor-gap",
    schema: competitorGapSchema,
    system: BASE_SYSTEM,
    prompt: `${platformNotes(app.platform)}

Our app:
${describeListing(app, listing)}

Competitors:
${block}

Find where competitors are doing something this app is not. Quote the specific competitor in competitorExample. Skip anything this app already does.`,
  });
}

// ---------------------------------------------------------------------------
// Anomalies
// ---------------------------------------------------------------------------

export async function explainAnomaly(
  organizationId: string,
  appId: string,
  input: {
    metric: keyof typeof METRIC_META;
    current: number;
    baseline: number;
    windowDays: number;
    series: { date: Date; value: number }[];
  },
) {
  const { app, listing } = await loadListing(appId);

  const recentListingChanges = await db.storeListing.findMany({
    where: { appId },
    orderBy: { capturedAt: "desc" },
    take: 5,
    select: { capturedAt: true, version: true, contentHash: true, title: true },
  });

  const changeBlock = recentListingChanges
    .map((s) => `- ${ymd(s.capturedAt)}: version ${s.version ?? "?"}, title "${s.title ?? "?"}"`)
    .join("\n");

  const seriesBlock = input.series
    .map((p) => `${ymd(p.date)}: ${formatMetric(input.metric, p.value)}`)
    .join("\n");

  return generateStructured({
    organizationId,
    feature: "anomaly-explain",
    schema: anomalySchema,
    system: BASE_SYSTEM,
    prompt: `${describeListing(app, listing)}

Metric: ${METRIC_META[input.metric].label}
Current ${input.windowDays}-day value: ${formatMetric(input.metric, input.current)}
Prior period baseline: ${formatMetric(input.metric, input.baseline)}

Daily series:
${seriesBlock}

Recent store listing snapshots:
${changeBlock || "(none captured)"}

Explain what changed. Only propose causes the data above can support, and rank them by confidence. The checks should be things the team can verify today.`,
  });
}

// ---------------------------------------------------------------------------
// Prioritized recommendations
// ---------------------------------------------------------------------------

export async function generateRecommendations(organizationId: string, appId: string) {
  const { app, listing } = await loadListing(appId);
  const audit = auditListing(listing);

  const [insights, recentMetrics, keywordCount, reviewStats] = await Promise.all([
    db.aiInsight.findMany({
      where: { appId },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { type: true, title: true, summary: true, severity: true },
    }),
    db.metricPoint.groupBy({
      by: ["metric"],
      where: {
        appId,
        dimension: "",
        date: { gte: new Date(Date.now() - 30 * 86_400_000) },
      },
      _sum: { value: true },
      _avg: { value: true },
    }),
    db.keyword.count({ where: { appId, isTracked: true } }),
    db.review.groupBy({
      by: ["sentiment"],
      where: { appId, submittedAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
      _count: true,
    }),
  ]);

  const metricBlock = recentMetrics
    .map((m) => {
      const meta = METRIC_META[m.metric];
      const value = meta.unit === "percent" ? (m._avg.value ?? 0) : (m._sum.value ?? 0);
      return `- ${meta.label}: ${formatMetric(m.metric, value)} (30 days)`;
    })
    .join("\n");

  const insightBlock = insights
    .map((i) => `- [${i.severity}] ${i.title}: ${i.summary}`)
    .join("\n");

  const reviewBlock = reviewStats
    .map((r) => `- ${r.sentiment ?? "unclassified"}: ${r._count}`)
    .join("\n");

  return generateStructured({
    organizationId,
    feature: "recommendations",
    schema: recommendationsSchema,
    system: BASE_SYSTEM,
    prompt: `${platformNotes(app.platform)}

${describeListing(app, listing)}

Listing audit: ${audit.score}/100
${audit.checks.map((c) => `- ${c.label}: ${c.status} — ${c.detail}`).join("\n")}

Performance over the last 30 days:
${metricBlock || "(no metrics synced yet)"}

Tracked keywords: ${keywordCount}

Review sentiment, last 30 days:
${reviewBlock || "(no reviews)"}

Existing insights:
${insightBlock || "(none)"}

Produce a prioritized action list. Rank by impact against effort. Do not repeat an existing insight unless you are adding a concrete next step to it. Every action must be something the team can start this week.`,
  });
}
