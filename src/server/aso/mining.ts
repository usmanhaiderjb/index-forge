import "server-only";

import type { Platform } from "@prisma/client";

import { itunesChart, playChart } from "@/server/aso/builtin/charts";
import { itunesLookup, itunesSuggest } from "@/server/aso/builtin/itunes";
import { playDetails, playSuggest } from "@/server/aso/builtin/play";
import { isUsefulTerm, normalizeTerm, rankScore, upsertTerm } from "@/server/aso/corpus";
import type { AsoAppDetail } from "@/server/aso/types";
import { db } from "@/server/db";

/**
 * Metadata mining: phase two of the keyword corpus.
 *
 * Prefix crawling finds terms the store is willing to suggest. Mining finds
 * terms **developers are betting on** — the ones written into the titles and
 * subtitles of apps that already rank in a category. Those two sets overlap but
 * neither contains the other, and the gap between them is interesting on its
 * own: a term every ranked app targets but the store never suggests is a term
 * the category has talked itself into.
 *
 * What mining is not is a demand signal. Frequency across ranked apps measures
 * supply — what competitors chose — and this module never lets that number
 * become a volume estimate. `validateMinedTerms` is the only bridge between the
 * two. See docs/KEYWORD-DATABASE.md §6.
 */

type MetadataField = "title" | "subtitle" | "shortDescription" | "description";

/**
 * How prominently a term must appear in at least one ranked app to be kept.
 *
 * The first mining run kept anything two apps happened to share, which meant
 * "contact us via app" — boilerplate that appears in half the descriptions on
 * the store. A term nobody put in a field the store actually indexes is prose,
 * not targeting.
 *
 * The thresholds follow the field weights: on iOS only a title or subtitle
 * clears the bar, because those are the only fields Apple indexes. On Play a
 * short description counts too.
 */
const MIN_INDEXED_WEIGHT: Record<Platform, number> = { IOS: 0.9, ANDROID: 0.5 };

/**
 * Which metadata fields the store's search actually indexes.
 *
 * This is not cosmetic weighting. **Apple does not index the description at
 * all** — iOS search reads the title, the subtitle, and the invisible keyword
 * field. Google indexes the title, the short description and the full
 * description. Mining an iOS description therefore tells you how a developer
 * positions the app, not what they target, so it is scored near zero rather
 * than dropped: it still discovers real vocabulary, it just must not outweigh
 * a title.
 */
const FIELD_WEIGHTS: Record<Platform, Record<MetadataField, number>> = {
  IOS: { title: 1, subtitle: 0.9, shortDescription: 0.3, description: 0.05 },
  ANDROID: { title: 1, subtitle: 0.5, shortDescription: 0.8, description: 0.35 },
};

/**
 * Words that carry no search intent on their own.
 *
 * Kept deliberately small. An aggressive list starts eating real keywords —
 * "free", "best" and "pro" are all stopwords in ordinary English and all
 * genuine, heavily searched app-store terms.
 */
const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "can", "for", "from", "has",
  "have", "in", "is", "it", "its", "of", "on", "or", "our", "that", "the",
  "their", "them", "then", "there", "these", "they", "this", "to", "up", "was",
  "we", "were", "what", "when", "which", "who", "will", "with", "you", "your",
  // Added after the first real mining run, which returned "into", "every" and
  // "about" as standalone keywords out of Play short descriptions. Every word
  // here is a function word that no one types into a store search on its own —
  // and, because only the first and last token of a phrase are checked, one
  // can still sit inside a real term like "all in one".
  "about", "after", "also", "any", "before", "both", "during", "each", "every",
  "into", "just", "more", "most", "much", "only", "other", "own", "per", "some",
  "such", "than", "very", "via", "while",
]);

/** Lowercased word tokens. Punctuation splits; digits are kept ("24 7", "3d"). */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9+]+/)
    .filter((token) => token.length > 0);
}

/**
 * Rejects strings of very short tokens.
 *
 * Play listings carry a language switcher and a supported-locales list, which
 * tokenise into runs like "fa ar hu" and "cz for help". Those pass every other
 * filter — they are short, lowercase, three words — and they poisoned the first
 * mining run. A real multi-word search has at least one substantial word in it.
 */
function hasSubstance(tokens: string[]): boolean {
  if (tokens.length === 1) return true;
  return tokens.some((token) => token.length > 2);
}

/**
 * Contiguous n-grams, 1 to `max` words.
 *
 * An n-gram that starts or ends on a stopword is a fragment of a sentence
 * rather than a phrase someone would type — "the habit" and "tracker for" are
 * both artefacts of prose. Interior stopwords are fine: "time to focus" is a
 * real search.
 */
export function ngrams(tokens: string[], max = 3): string[] {
  const out: string[] = [];

  for (let size = 1; size <= max; size++) {
    for (let start = 0; start + size <= tokens.length; start++) {
      const window = tokens.slice(start, start + size);
      const first = window[0];
      const last = window[window.length - 1];
      if (!first || !last) continue;
      if (STOPWORDS.has(first) || STOPWORDS.has(last)) continue;
      if (!hasSubstance(window)) continue;
      out.push(window.join(" "));
    }
  }

  return out;
}

/**
 * One app's metadata, reduced to weighted terms.
 *
 * A term is scored once per app, at its best-placed occurrence, not once per
 * appearance. Repeating "budget" thirty times in a description is a thing
 * developers do, and counting it thirty times would let one app's keyword
 * stuffing decide what a whole category is about.
 */
export function extractTerms(detail: AsoAppDetail, platform: Platform): Map<string, number> {
  const weights = FIELD_WEIGHTS[platform];
  const best = new Map<string, number>();

  const fields: [MetadataField, string | undefined][] = [
    ["title", detail.title ?? detail.name],
    ["subtitle", detail.subtitle],
    ["shortDescription", detail.shortDescription],
    // Descriptions run to 4000 characters of marketing prose. The opening is
    // where the pitch — and the targeting — lives; the tail is feature lists
    // and changelog. Truncating keeps the n-gram count sane.
    ["description", detail.description?.slice(0, 800)],
  ];

  for (const [field, text] of fields) {
    if (!text) continue;
    const weight = weights[field];
    if (weight <= 0) continue;

    for (const raw of ngrams(tokenize(text))) {
      const term = normalizeTerm(raw);
      if (!isUsefulTerm(term) || STOPWORDS.has(term)) continue;
      const current = best.get(term) ?? 0;
      if (weight > current) best.set(term, weight);
    }
  }

  return best;
}

export type MineResult = {
  platform: Platform;
  category: string;
  /** Apps whose metadata was read. Fewer than the chart depth if fetches failed. */
  appsRead: number;
  /** Distinct terms seen at least once, before the shared-term filter. */
  candidates: number;
  /** Terms kept: seen in `minApps` or more of the ranked apps. */
  kept: number;
  created: number;
};

/**
 * Mine one category chart.
 *
 * The unit of evidence is **how many ranked apps use a term**, not how often it
 * appears. A term used by one app is that app's brand or its own phrasing; a
 * term used by eight of the top twenty is what the category calls itself.
 */
export async function mineCategory(options: {
  platform: Platform;
  category: string;
  country: string;
  locale?: string;
  /** Chart depth. Twenty apps is enough for a category vocabulary to converge. */
  apps?: number;
  /** How many ranked apps must share a term before it is kept. */
  minApps?: number;
}): Promise<MineResult> {
  const locale = options.locale ?? "en-US";
  const depth = options.apps ?? 20;
  const minApps = options.minApps ?? 2;

  const chart =
    options.platform === "IOS"
      ? await itunesChart({
          chart: "TOP_FREE",
          country: options.country,
          category: options.category,
          limit: depth,
        })
      : await playChart({
          chart: "TOP_FREE",
          country: options.country,
          category: options.category,
          limit: depth,
        });

  // Document frequency and accumulated weight, per term.
  const appCount = new Map<string, number>();
  const weightSum = new Map<string, number>();
  const maxWeight = new Map<string, number>();
  let appsRead = 0;

  for (const entry of chart.entries.slice(0, depth)) {
    const detail = await fetchDetail(options.platform, entry.storeId, {
      country: options.country,
      locale,
    });
    if (!detail) continue;
    appsRead++;

    for (const [term, weight] of extractTerms(detail, options.platform)) {
      appCount.set(term, (appCount.get(term) ?? 0) + 1);
      weightSum.set(term, (weightSum.get(term) ?? 0) + weight);
      maxWeight.set(term, Math.max(maxWeight.get(term) ?? 0, weight));
    }
  }

  // Nothing to normalise against if every fetch failed, and dividing by zero
  // would write Infinity into every signal.
  if (appsRead === 0) {
    return {
      platform: options.platform,
      category: options.category,
      appsRead: 0,
      candidates: appCount.size,
      kept: 0,
      created: 0,
    };
  }

  let kept = 0;
  let created = 0;

  const floor = MIN_INDEXED_WEIGHT[options.platform];

  for (const [term, count] of appCount) {
    if (count < minApps) continue;
    // Shared by enough apps, but only ever in a description body.
    if ((maxWeight.get(term) ?? 0) < floor) continue;
    kept++;

    const record = await upsertTerm(term, {
      country: options.country,
      locale,
      discovery: "METADATA_MINING",
    });
    if (record.isNew) created++;

    await db.keywordSignal.create({
      data: {
        termId: record.id,
        source: "CHART_PRESENCE",
        value: presenceScore(weightSum.get(term) ?? 0, appsRead),
        context: `${options.platform}:${options.category}`,
      },
    });
  }

  return {
    platform: options.platform,
    category: options.category,
    appsRead,
    candidates: appCount.size,
    kept,
    created,
  };
}

/**
 * 0-100: the share of ranked apps using a term, scaled by where they put it.
 *
 * A term in eight of twenty titles outranks one buried in eight descriptions,
 * which is the whole point of the field weights. Clamped because a term can
 * reach weight 1.0 in every app, and nothing downstream should have to cope
 * with 103.
 */
export function presenceScore(weightSum: number, appsRead: number): number {
  if (appsRead <= 0) return 0;
  return Math.min(100, Math.round((weightSum / appsRead) * 100));
}

async function fetchDetail(
  platform: Platform,
  storeId: string,
  opts: { country: string; locale: string },
): Promise<AsoAppDetail | null> {
  try {
    return platform === "IOS" ? await itunesLookup(storeId, opts) : await playDetails(storeId, opts);
  } catch {
    // One unreadable listing must not abort a category. Play in particular
    // serves interstitials for age-gated apps.
    return null;
  }
}

export type ValidationResult = {
  checked: number;
  /** Terms the store suggests back — real searches, now carrying an index. */
  confirmed: number;
};

/**
 * The bridge from supply to demand.
 *
 * A mined term is evidence that developers target it. It is not evidence that
 * anyone searches it, so mined terms get no volume estimate on their own. This
 * asks the store directly: type the term, and see whether the store offers it
 * back. If it does, the term is a real search, and its position in that list is
 * the same ordinal signal a prefix crawl produces — so it is recorded as one.
 *
 * If the store stays silent the term keeps its CHART_PRESENCE rows and no
 * estimate. That is the honest answer: a word the category likes and shoppers
 * do not type.
 */
export async function validateMinedTerms(options: {
  platform: Platform;
  country: string;
  limit?: number;
}): Promise<ValidationResult> {
  // Excluded by SUGGEST_CONTAINS, not by SUGGEST_RANK.
  //
  // Most mined terms are never suggested back, and keying the candidate set on
  // a confirmation the term will never get meant the same fifty rows were
  // rechecked every cycle forever while the other thousands were never looked
  // at once. Every check writes a SUGGEST_CONTAINS row — 1 when the store
  // offered the term, 0 when it did not — so a negative result is recorded as
  // a finding rather than as an absence, and the pass moves on.
  const candidates = await db.keywordTerm.findMany({
    where: {
      country: options.country,
      discovery: "METADATA_MINING",
      signals: { none: { source: "SUGGEST_CONTAINS", platform: options.platform } },
    },
    take: options.limit ?? 100,
    orderBy: { firstSeenAt: "desc" },
    select: { id: true, term: true },
  });

  let confirmed = 0;

  for (const candidate of candidates) {
    const suggestions =
      options.platform === "IOS"
        ? await itunesSuggest(candidate.term, { country: options.country })
        : await playSuggest(candidate.term, { country: options.country });

    const rank = suggestions.findIndex((s) => normalizeTerm(s) === candidate.term);

    await db.keywordSignal.create({
      data: {
        termId: candidate.id,
        source: "SUGGEST_CONTAINS",
        platform: options.platform,
        value: rank === -1 ? 0 : 1,
        context: candidate.term,
      },
    });

    if (rank === -1) continue;

    confirmed++;
    await db.keywordSignal.create({
      data: {
        termId: candidate.id,
        source: "SUGGEST_RANK",
        platform: options.platform,
        value: rankScore(rank, suggestions.length),
        // The term is its own prefix here, and naming it keeps the observation
        // reproducible in exactly the way a crawl's context does.
        context: candidate.term,
      },
    });
  }

  return { checked: candidates.length, confirmed };
}

/**
 * Categories worth mining first.
 *
 * The store ids are not interchangeable: Apple uses numeric genre ids in its
 * RSS feeds, Google uses uppercase category slugs in its page URLs.
 */
export const MINE_CATEGORIES: Record<Platform, { id: string; label: string }[]> = {
  IOS: [
    { id: "6013", label: "Health & Fitness" },
    { id: "6015", label: "Finance" },
    { id: "6007", label: "Productivity" },
    { id: "6017", label: "Education" },
    { id: "6000", label: "Business" },
    { id: "6012", label: "Lifestyle" },
    { id: "6002", label: "Utilities" },
    { id: "6005", label: "Social Networking" },
    { id: "6016", label: "Entertainment" },
    { id: "6008", label: "Photo & Video" },
    { id: "6024", label: "Shopping" },
    { id: "6014", label: "Games" },
  ],
  ANDROID: [
    { id: "HEALTH_AND_FITNESS", label: "Health & Fitness" },
    { id: "FINANCE", label: "Finance" },
    { id: "PRODUCTIVITY", label: "Productivity" },
    { id: "EDUCATION", label: "Education" },
    { id: "BUSINESS", label: "Business" },
    { id: "LIFESTYLE", label: "Lifestyle" },
    { id: "TOOLS", label: "Tools & Utilities" },
    { id: "SOCIAL", label: "Social" },
    { id: "ENTERTAINMENT", label: "Entertainment" },
    { id: "PHOTOGRAPHY", label: "Photography" },
    { id: "SHOPPING", label: "Shopping" },
    { id: "GAME", label: "Games" },
  ],
};
