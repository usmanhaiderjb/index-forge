import type { Platform } from "@prisma/client";

import { clamp } from "@aso/shared";

/**
 * Store field limits. These drive both the UI counters and the constraints
 * handed to the AI so it cannot suggest text that would be rejected.
 */
export const FIELD_LIMITS: Record<Platform, Partial<Record<string, number>>> = {
  IOS: {
    TITLE: 30,
    SUBTITLE: 30,
    KEYWORDS: 100,
    PROMOTIONAL_TEXT: 170,
    FULL_DESCRIPTION: 4000,
    WHATS_NEW: 4000,
  },
  ANDROID: {
    TITLE: 30,
    SHORT_DESCRIPTION: 80,
    FULL_DESCRIPTION: 4000,
    WHATS_NEW: 500,
  },
};

/** Words the stores ignore or that waste indexable characters. */
const STOP_WORDS = new Set([
  "a", "an", "and", "app", "are", "as", "at", "be", "but", "by", "for", "free",
  "from", "has", "have", "in", "is", "it", "its", "of", "on", "or", "our",
  "that", "the", "this", "to", "was", "were", "will", "with", "you", "your",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^['-]+|['-]+$/g, ""))
    .filter((w) => w.length > 1);
}

export function contentWords(text: string): string[] {
  return tokenize(text).filter((w) => !STOP_WORDS.has(w));
}

/**
 * Keyword density as a percentage of content words.
 *
 * Phrase matching runs over the *full* token stream, not the stop-word-filtered
 * one: "habit and tracker" must not count as an occurrence of "habit tracker"
 * just because "and" was stripped out first.
 */
export function keywordDensity(text: string, term: string): number {
  const denominator = contentWords(text).length;
  if (denominator === 0) return 0;

  const termWords = contentWords(term);
  if (termWords.length === 0) return 0;

  if (termWords.length === 1) {
    const target = termWords[0]!;
    const hits = contentWords(text).filter((w) => w === target).length;
    return (hits / denominator) * 100;
  }

  const allWords = tokenize(text);
  let hits = 0;
  for (let i = 0; i <= allWords.length - termWords.length; i++) {
    if (termWords.every((t, j) => allWords[i + j] === t)) hits++;
  }
  return (hits / denominator) * 100;
}

export type ListingInput = {
  platform: Platform;
  title?: string | null;
  subtitle?: string | null;
  keywordField?: string | null;
  shortDescription?: string | null;
  fullDescription?: string | null;
  screenshotCount?: number | null;
  hasVideo?: boolean | null;
  ratingAverage?: number | null;
  ratingCount?: number | null;
};

export type MetadataCheck = {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
  /** Contribution to the overall score, 0-100 scale weight. */
  weight: number;
  score: number;
};

/**
 * Deterministic listing audit. Everything here is a rule the stores or the
 * published ASO literature actually support — the AI layer builds on top of
 * this rather than replacing it, so scores stay stable between runs.
 */
export function auditListing(listing: ListingInput): {
  score: number;
  checks: MetadataCheck[];
} {
  const limits = FIELD_LIMITS[listing.platform];
  const checks: MetadataCheck[] = [];

  const push = (
    id: string,
    label: string,
    weight: number,
    score: number,
    detail: string,
  ) => {
    checks.push({
      id,
      label,
      weight,
      score: clamp(score, 0, 1),
      status: score >= 0.85 ? "pass" : score >= 0.5 ? "warn" : "fail",
      detail,
    });
  };

  // --- Title -------------------------------------------------------------
  const title = listing.title?.trim() ?? "";
  const titleLimit = limits.TITLE ?? 30;
  if (!title) {
    push("title", "Title", 20, 0, "No title captured for this listing.");
  } else {
    const usage = title.length / titleLimit;
    const hasKeyword = contentWords(title).length >= 2;
    const score = clamp(usage, 0, 1) * 0.6 + (hasKeyword ? 0.4 : 0);
    push(
      "title",
      "Title",
      20,
      score,
      `${title.length}/${titleLimit} characters. ${
        usage < 0.7
          ? "Unused title characters are the single most valuable ranking space you have."
          : hasKeyword
            ? "Length and keyword usage look healthy."
            : "Title is long enough but reads as brand-only; add one descriptive term."
      }`,
    );
  }

  // --- Subtitle (iOS) / short description (Android) ----------------------
  if (listing.platform === "IOS") {
    const subtitle = listing.subtitle?.trim() ?? "";
    const limit = limits.SUBTITLE ?? 30;
    push(
      "subtitle",
      "Subtitle",
      15,
      subtitle ? clamp(subtitle.length / limit, 0, 1) : 0,
      subtitle
        ? `${subtitle.length}/${limit} characters.`
        : "No subtitle. This field is indexed at nearly the weight of the title.",
    );

    const keywordField = listing.keywordField?.trim() ?? "";
    const kwLimit = limits.KEYWORDS ?? 100;
    const duplicated = keywordField
      ? keywordField
          .split(",")
          .map((k) => k.trim().toLowerCase())
          .filter((k) => k && (title.toLowerCase().includes(k) || subtitle.toLowerCase().includes(k)))
      : [];

    push(
      "keywords",
      "Keyword field",
      20,
      keywordField
        ? clamp(keywordField.length / kwLimit, 0, 1) - clamp(duplicated.length * 0.1, 0, 0.4)
        : 0,
      keywordField
        ? `${keywordField.length}/${kwLimit} characters.${
            duplicated.length
              ? ` ${duplicated.length} term(s) already appear in the title or subtitle and are wasted here: ${duplicated.join(", ")}.`
              : ""
          }`
        : "The 100-character keyword field is empty. It is invisible to users and indexed in full.",
    );
  } else {
    const short = listing.shortDescription?.trim() ?? "";
    const limit = limits.SHORT_DESCRIPTION ?? 80;
    push(
      "short_description",
      "Short description",
      25,
      short ? clamp(short.length / limit, 0, 1) : 0,
      short
        ? `${short.length}/${limit} characters.`
        : "Empty short description. It is indexed and it is the first thing users read.",
    );
  }

  // --- Long description --------------------------------------------------
  const description = listing.fullDescription?.trim() ?? "";
  const descLimit = limits.FULL_DESCRIPTION ?? 4000;
  if (!description) {
    push("description", "Long description", 15, 0, "No description captured.");
  } else {
    const usage = description.length / descLimit;
    const firstLines = description.slice(0, 250);
    const hasHook = firstLines.split(/[.!?\n]/).filter((s) => s.trim().length > 20).length >= 2;

    // The description is indexed on Google Play and not on iOS, so an
    // under-filled description means something different on each store.
    const shortDescriptionNote =
      usage < 0.5
        ? listing.platform === "ANDROID"
          ? " Well under the limit — Google Play indexes this field in full, so unused characters are unused ranking space."
          : " Well under the limit. iOS does not index the description, so this costs no ranking — but it is what convinces a visitor to tap Get."
        : "";

    push(
      "description",
      "Long description",
      // On iOS the description only affects conversion, so it carries less of
      // the score than on Android where it is also indexed.
      listing.platform === "ANDROID" ? 15 : 10,
      clamp(usage * 1.2, 0, 1) * 0.7 + (hasHook ? 0.3 : 0),
      `${description.length}/${descLimit} characters.${shortDescriptionNote}${
        hasHook
          ? ""
          : " The first 250 characters are the only part most users see; lead with the value proposition."
      }`,
    );
  }

  // --- Creatives ---------------------------------------------------------
  const screenshots = listing.screenshotCount ?? 0;
  push(
    "screenshots",
    "Screenshots",
    15,
    clamp(screenshots / 5, 0, 1),
    `${screenshots} screenshot${screenshots === 1 ? "" : "s"} detected. The first two drive most of the conversion effect; 5 or more is the practical target.`,
  );

  push(
    "video",
    "Preview video",
    5,
    listing.hasVideo ? 1 : 0,
    listing.hasVideo
      ? "A preview video is present."
      : "No preview video. Expect a measurable conversion gap in competitive categories.",
  );

  // --- Reputation --------------------------------------------------------
  const rating = listing.ratingAverage ?? 0;
  const ratingCount = listing.ratingCount ?? 0;
  push(
    "rating",
    "Rating",
    10,
    rating >= 4.5 ? 1 : rating >= 4.0 ? 0.7 : rating >= 3.5 ? 0.4 : rating > 0 ? 0.15 : 0,
    rating
      ? `${rating.toFixed(2)} stars across ${ratingCount.toLocaleString()} ratings.`
      : "No rating data captured.",
  );

  const totalWeight = checks.reduce((sum, c) => sum + c.weight, 0);
  const weighted = checks.reduce((sum, c) => sum + c.score * c.weight, 0);
  const score = totalWeight ? Math.round((weighted / totalWeight) * 100) : 0;

  return { score, checks };
}

/**
 * Extracts candidate keywords from a listing, ranked by where they appear.
 * Title and subtitle placement is worth far more than a body mention.
 */
export function extractCandidateKeywords(listing: ListingInput, limit = 40): string[] {
  const weights = new Map<string, number>();

  /**
   * Each term counts once per field, not once per occurrence. Placement is
   * what the stores weight, so a word repeated fifty times in the description
   * must not outrank a word in the title.
   */
  const add = (text: string | null | undefined, weight: number) => {
    if (!text) return;
    const words = contentWords(text);
    const seen = new Set<string>();

    for (const word of words) seen.add(word);
    // Bigrams carry most of the real search intent.
    for (let i = 0; i < words.length - 1; i++) {
      seen.add(`${words[i]} ${words[i + 1]}`);
    }

    for (const term of seen) {
      const isBigram = term.includes(" ");
      weights.set(term, (weights.get(term) ?? 0) + weight * (isBigram ? 1.2 : 1));
    }
  };

  add(listing.title, 5);
  add(listing.subtitle, 4);
  add(listing.keywordField?.replace(/,/g, " "), 4);
  add(listing.shortDescription, 3);
  add(listing.fullDescription?.slice(0, 1000), 1);

  return Array.from(weights.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([term]) => term);
}

/**
 * Screenshot URLs that can actually be handed to a vision model.
 *
 * Images are referenced by public URL rather than uploaded, so anything inline
 * (`data:`), local, or plain HTTP is unusable — filtering here turns that into
 * an explainable state instead of a failure inside the API call.
 */
export function fetchableScreenshotUrls(urls: string[]): string[] {
  return urls.filter((url) => {
    try {
      return new URL(url).protocol === "https:";
    } catch {
      return false;
    }
  });
}

/** Terms competitors rank on that the tracked app never mentions. */
export function keywordGaps(
  ourListing: ListingInput,
  competitorListings: ListingInput[],
  limit = 25,
): { term: string; competitorCount: number }[] {
  const ours = new Set(
    extractCandidateKeywords(ourListing, 200).map((t) => t.toLowerCase()),
  );

  const counts = new Map<string, number>();
  for (const competitor of competitorListings) {
    const theirs = new Set(extractCandidateKeywords(competitor, 60));
    for (const term of theirs) {
      if (ours.has(term.toLowerCase())) continue;
      counts.set(term, (counts.get(term) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([term, competitorCount]) => ({ term, competitorCount }));
}
