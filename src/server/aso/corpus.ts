import "server-only";

import type { Platform, SignalSource, TermDiscovery } from "@prisma/client";

import { db } from "@/server/db";
import { itunesSuggest } from "@/server/aso/builtin/itunes";
import { playSuggest } from "@/server/aso/builtin/play";

/**
 * The keyword corpus: a global term universe, built from store autocomplete.
 *
 * The insight this rests on is that **both stores return their suggestions in
 * popularity order**. Apple and Google refuse to publish search volume, but they
 * will happily tell you that "habit tracker" is searched more than "habit
 * journal" — by putting it first. That ordering is free, observable, and is the
 * only demand signal available without paying a data vendor.
 *
 * It supports an ordinal index and nothing more. This module deliberately does
 * not produce a monthly search figure, because one cannot be derived from
 * ordering alone. See docs/KEYWORD-DATABASE.md §6.
 */

/**
 * Prefixes the term genuinely answers, shortest first.
 *
 * Store autocomplete is fuzzy. "b-isolar" came back for "b js", "b ks" and
 * "b us" — queries it does not even begin with — so nine prefixes looked like
 * nine corroborations when eight of them were the engine reaching for anything
 * that vaguely matched a sparse letter-space. Only prefixes the term actually
 * starts with count as evidence; the rest are recorded but say nothing about
 * demand.
 *
 * Spaces and punctuation are stripped on both sides, because the crawl expands
 * into "b is" and "b-is" and the store treats them as the same query.
 */
export function directPrefixes(term: string, contexts: string[]): string[] {
  const target = flatten(term);

  return [...new Set(contexts)]
    .filter((context) => context.length > 0 && target.startsWith(flatten(context)))
    .sort((a, b) => flatten(a).length - flatten(b).length);
}

function flatten(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * How many terms compete in each short letter-space, from the corpus itself.
 *
 * Built once per pass rather than queried per term: three GROUP BYs over
 * `keyword_terms` beats 200,000 individual counts by a wide margin.
 */
export type LetterSpaces = Map<string, number>;

export async function letterSpaces(): Promise<LetterSpaces> {
  const spaces: LetterSpaces = new Map();

  for (const length of [1, 2, 3]) {
    const rows = await db.$queryRawUnsafe<{ p: string; n: bigint }[]>(
      `SELECT left(regexp_replace(lower(term), '[^a-z0-9]', '', 'g'), ${length}) AS p,
              count(*) AS n
       FROM keyword_terms
       GROUP BY 1`,
    );
    for (const row of rows) if (row.p) spaces.set(row.p, Number(row.n));
  }

  return spaces;
}

/**
 * How much to trust a term's demand index.
 *
 * **What matters is how contested the letter-space is that the term wins**, not
 * how short the prefix was. This took three attempts to get right, and each
 * wrong answer looked plausible:
 *
 *   - *Counting prefixes* measured how hard the crawler looked. Deep frontier
 *     expansion inflated obscure strings to HIGH.
 *   - *Requiring a direct prefix* removed the fuzzy matches — "b-isolar" came
 *     back for "b js" and "b us", which it does not begin with — but still
 *     rated "zr cheaper" as highly as "facebook".
 *   - *Rewarding short prefixes* assumed every two letters were equally hard to
 *     win. They are not: 1,096 terms in this corpus start "fa" and 46 start
 *     "zr", so winning "zr" beats almost nothing.
 *
 * So a term is trusted in proportion to the crowd it beat. "facebook" is the
 * top suggestion for "f", ahead of 22,644 others; "zr cheaper" leads a field of
 * forty-six.
 */
export function confidenceFor(
  term: string,
  contexts: string[],
  stores: number,
  spaces: LetterSpaces,
): "LOW" | "MEDIUM" | "HIGH" {
  const size = wonAgainst(term, contexts, spaces);
  if (size === 0) return "LOW";

  const level = size >= 1000 ? 2 : size >= 200 ? 1 : 0;

  // Both stores suggesting a term is independent corroboration — different
  // engines, different populations — so it lifts the verdict one step.
  const total = Math.min(2, level + (stores > 1 ? 1 : 0));
  return total >= 2 ? "HIGH" : total === 1 ? "MEDIUM" : "LOW";
}

/**
 * The size of the field the term beat, or 0 if it never won a short prefix.
 *
 * Prefixes longer than three characters are not scored: at that length the
 * searcher has typed most of the term and the store has almost no alternatives
 * to offer, so winning says nothing.
 */
export function wonAgainst(term: string, contexts: string[], spaces: LetterSpaces): number {
  const direct = directPrefixes(term, contexts);

  let best = 0;
  for (const prefix of direct) {
    const flat = flatten(prefix);
    if (flat.length > 3) continue;
    best = Math.max(best, spaces.get(flat) ?? 0);
  }

  return best;
}

/** Normalised so "Habit  Tracker" and "habit tracker" are one row, not two. */
export function normalizeTerm(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Terms worth keeping.
 *
 * Autocomplete returns app names, misspellings and single letters alongside real
 * search terms. Storing everything makes the corpus large and the index
 * meaningless, so the obvious noise is dropped at the door.
 */
export function isUsefulTerm(term: string): boolean {
  if (term.length < 2 || term.length > 50) return false;
  // A term that is mostly punctuation or digits is not a search someone typed.
  if (!/[a-z]/i.test(term)) return false;
  // More than four words is a sentence, not a store search.
  if (term.split(" ").length > 4) return false;
  return true;
}

/**
 * Rank to score, 0-100.
 *
 * Position 0 is the store's most-searched completion for that prefix, so it
 * scores highest. The curve is deliberately steep: the gap between first and
 * second suggestion is much larger than between eighth and ninth, which is how
 * search demand actually distributes.
 */
export function rankScore(rank: number, listLength: number): number {
  if (listLength <= 0) return 0;
  const normalized = Math.min(rank, listLength - 1) / Math.max(1, listLength - 1);
  return Math.round((1 - normalized) ** 2 * 100);
}

export type CrawlResult = {
  prefix: string;
  suggested: number;
  created: number;
  updated: number;
};

/**
 * Expand one prefix through a store's autocomplete and record what comes back.
 *
 * Each suggestion produces two rows: the term itself, and a SUGGEST_RANK signal
 * carrying its position. The prefix is kept in `context` so an estimate can be
 * traced back to the exact observation that produced it.
 */
export async function crawlPrefix(
  prefix: string,
  options: { platform: Platform; country: string; locale?: string },
): Promise<CrawlResult> {
  const suggestions =
    options.platform === "IOS"
      ? await itunesSuggest(prefix, { country: options.country })
      : await playSuggest(prefix, { country: options.country });

  const seen = new Set<string>();
  let created = 0;
  let updated = 0;

  for (const [rank, raw] of suggestions.entries()) {
    const term = normalizeTerm(raw);
    if (!isUsefulTerm(term) || seen.has(term)) continue;
    seen.add(term);

    const record = await upsertTerm(term, {
      country: options.country,
      locale: options.locale ?? "en-US",
      discovery: "PREFIX_CRAWL",
    });

    if (record.isNew) created++;
    else updated++;

    await recordSignal(record.id, "SUGGEST_RANK", rankScore(rank, suggestions.length), prefix, options.platform);
  }

  return { prefix, suggested: suggestions.length, created, updated };
}

/**
 * Insert a term, or note that we have seen it again.
 *
 * `lastSeenAt` matters: a term that stops appearing in suggestions has stopped
 * being searched, and a corpus that never forgets slowly fills with dead terms.
 */
export async function upsertTerm(
  term: string,
  options: { country: string; locale: string; discovery: TermDiscovery },
): Promise<{ id: string; isNew: boolean }> {
  const existing = await db.keywordTerm.findUnique({
    where: { term_country: { term, country: options.country } },
    select: { id: true },
  });

  if (existing) {
    await db.keywordTerm.update({
      where: { id: existing.id },
      data: { lastSeenAt: new Date() },
    });
    return { id: existing.id, isNew: false };
  }

  const created = await db.keywordTerm.create({
    data: {
      term,
      country: options.country,
      locale: options.locale,
      discovery: options.discovery,
    },
    select: { id: true },
  });

  return { id: created.id, isNew: true };
}

async function recordSignal(
  termId: string,
  source: SignalSource,
  value: number,
  context?: string,
  platform?: Platform,
): Promise<void> {
  await db.keywordSignal.create({ data: { termId, source, value, context, platform } });
}

/**
 * The alphabet a crawl walks.
 *
 * Two-letter prefixes rather than one: a single letter returns the same handful
 * of enormous head terms in every locale, while two letters reach the long tail
 * where the useful, winnable keywords live.
 */
export function prefixes(depth: 1 | 2 = 2): string[] {
  const letters = "abcdefghijklmnopqrstuvwxyz".split("");
  if (depth === 1) return letters;
  return letters.flatMap((a) => letters.map((b) => `${a}${b}`));
}

/**
 * Recompute the ordinal index for terms with new observations.
 *
 * The mean of a term's rank scores across every prefix that surfaced it. A term
 * suggested first for several different prefixes is genuinely in demand; one
 * that scraped in eighth place once is not.
 *
 * Confidence is a function of how many independent prefixes saw it, not of the
 * score itself — a high score from a single observation is a guess, and should
 * say so.
 */
export async function recomputeEstimates(limit = 500): Promise<number> {
  // Terms with no estimate yet come first, oldest estimate second.
  //
  // Ordering by `lastSeenAt` was wrong during a large crawl: the newest terms
  // are seen constantly, so the pass kept recomputing the same few thousand
  // rows while hundreds of thousands of terms discovered an hour earlier never
  // got an index at all.
  // One pass over the corpus, reused for every term in this batch.
  const spaces = await letterSpaces();

  const select = {
    id: true,
    // The term itself, because confidence now depends on whether a prefix is
    // actually a prefix of it.
    term: true,
    signals: {
      where: { source: "SUGGEST_RANK" as const },
      select: { value: true, context: true, platform: true },
    },
  };

  const missing = await db.keywordTerm.findMany({
    take: limit,
    where: { signals: { some: { source: "SUGGEST_RANK" } }, estimate: { is: null } },
    orderBy: { firstSeenAt: "asc" },
    select,
  });

  const remaining = limit - missing.length;

  const stale =
    remaining > 0
      ? await db.keywordTerm.findMany({
          take: remaining,
          where: { signals: { some: { source: "SUGGEST_RANK" } }, estimate: { isNot: null } },
          orderBy: { estimate: { computedAt: "asc" } },
          select,
        })
      : [];

  const terms = [...missing, ...stale];

  let written = 0;

  for (const term of terms) {
    if (term.signals.length === 0) continue;

    const total = term.signals.reduce((sum, s) => sum + s.value, 0);
    const value = Math.round(total / term.signals.length);

    const contexts = term.signals.map((s) => s.context ?? "");
    const stores = new Set(
      term.signals.map((s) => s.platform).filter((p): p is Platform => p !== null),
    ).size;

    const confidence = confidenceFor(term.term, contexts, stores, spaces);
    const method = describeMethod(term.term, contexts, term.signals, spaces);

    await db.keywordVolumeEstimate.upsert({
      where: { termId: term.id },
      create: {
        termId: term.id,
        value,
        kind: "ESTIMATED",
        confidence,
        method,
      },
      update: {
        value,
        confidence,
        method,
        computedAt: new Date(),
      },
    });

    written++;
  }

  return written;
}

/**
 * The sentence shown next to the number.
 *
 * Naming the stores matters: a term confirmed by both Apple and Google is a
 * far stronger signal than one seen only on Play, and a reader who cannot tell
 * those apart has no way to judge the index they are looking at.
 */
function describeMethod(
  term: string,
  contexts: string[],
  signals: { platform: Platform | null }[],
  spaces: LetterSpaces,
): string {
  const stores = new Set(signals.map((s) => s.platform).filter((p): p is Platform => p !== null));
  const where =
    stores.size === 2
      ? " on both stores"
      : stores.has("IOS")
        ? " on the App Store"
        : stores.has("ANDROID")
          ? " on Play"
          : "";

  const direct = directPrefixes(term, contexts);
  if (direct.length === 0) {
    return `suggested${where}, but never for a prefix of itself`;
  }

  const field = wonAgainst(term, contexts, spaces);
  if (field === 0) {
    return `suggested from "${direct[0]}"${where} — a prefix specific enough that little competes for it`;
  }

  return `top suggestions for "${direct[0]}"${where}, ahead of ${field.toLocaleString("en-US")} other terms starting the same way`;
}
