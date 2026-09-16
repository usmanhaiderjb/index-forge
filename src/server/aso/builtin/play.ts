import "server-only";

import { isNotFound, storeFetch } from "@/server/aso/builtin/http";
import type { AsoAppDetail, AsoSearchResult } from "@/server/aso/types";

const DETAILS = "https://play.google.com/store/apps/details";
const SEARCH = "https://play.google.com/store/search";
const SUGGEST = "https://suggestqueries.google.com/complete/search";

/**
 * Play Store pages embed their data in `AF_initDataCallback({... data:[...]})`
 * blocks. Google reshuffles the array indices without notice, so this parser
 * never hardcodes a path: it collects every embedded array and then locates
 * fields by shape and content.
 */
function extractDataBlobs(html: string): unknown[] {
  const blobs: unknown[] = [];
  const regex = /AF_initDataCallback\((\{.*?\})\);<\/script>/gs;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null) {
    const raw = match[1];
    if (!raw) continue;
    const dataStart = raw.indexOf("data:");
    if (dataStart === -1) continue;

    // `data:` runs to `, sideChannel:` or to the end of the object.
    const tail = raw.slice(dataStart + 5);
    const sideChannel = tail.lastIndexOf(", sideChannel:");
    const jsonText = (sideChannel === -1 ? tail : tail.slice(0, sideChannel)).trim();

    try {
      blobs.push(JSON.parse(jsonText));
    } catch {
      // Non-JSON callback payloads exist; skip them.
    }
  }

  return blobs;
}

/** Depth-first walk yielding every node, so field detection can pattern-match. */
function* walk(node: unknown, depth = 0): Generator<unknown> {
  if (depth > 30 || node === null || node === undefined) return;
  yield node;
  if (Array.isArray(node)) {
    for (const child of node) yield* walk(child, depth + 1);
  }
}

function findString(blobs: unknown[], predicate: (s: string) => boolean): string | undefined {
  for (const blob of blobs) {
    for (const node of walk(blob)) {
      if (typeof node === "string" && predicate(node)) return node;
    }
  }
  return undefined;
}

function findAllStrings(blobs: unknown[], predicate: (s: string) => boolean): string[] {
  const out: string[] = [];
  for (const blob of blobs) {
    for (const node of walk(blob)) {
      if (typeof node === "string" && predicate(node)) out.push(node);
    }
  }
  return out;
}

/**
 * Decode the entities Play actually emits.
 *
 * This used to live inside `stripTags`, so only descriptions were decoded and
 * every title and developer name kept its raw entities — "AllTrails: Hike, Bike
 * &amp; Run" was stored, and displayed, exactly like that.
 */
export function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(html: string): string {
  return decodeEntities(
    html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""),
  ).trim();
}

/** Reads a meta tag from the raw HTML — more stable than the data blobs. */
function meta(html: string, property: string): string | undefined {
  const regex = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']*)["']`,
    "i",
  );
  const alt = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${property}["']`,
    "i",
  );
  const value = html.match(regex)?.[1] ?? html.match(alt)?.[1];
  return value === undefined ? undefined : decodeEntities(value).trim();
}

export async function playDetails(
  packageName: string,
  opts: { country: string; locale: string },
): Promise<AsoAppDetail | null> {
  const url = new URL(DETAILS);
  url.searchParams.set("id", packageName);
  url.searchParams.set("hl", opts.locale);
  url.searchParams.set("gl", opts.country);

  let html: string;
  try {
    html = await storeFetch(url.toString(), { acceptLanguage: opts.locale });
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }

  const blobs = extractDataBlobs(html);

  const ogTitle = meta(html, "og:title");
  const ogDescription = meta(html, "og:description");
  const ogImage = meta(html, "og:image");

  // The long description is the longest HTML-bearing string in the payload.
  const descriptionCandidates = findAllStrings(
    blobs,
    (s) => s.length > 180 && /<br|\n|\. /.test(s),
  ).sort((a, b) => b.length - a.length);

  const version = findString(blobs, (s) => /^\d+(\.\d+){1,3}([a-z0-9.\-+]*)?$/i.test(s) && s.length <= 20);
  const installsText = findString(blobs, (s) => /^[\d.,]+\+?$/.test(s) && s.includes("+"));
  const contentRating = findString(blobs, (s) => /^(Everyone|Teen|Mature|Rated for|PEGI|USK|ESRB)/i.test(s));

  // The name sits inside a nested <span>, not directly after the anchor:
  //   <a href="/store/apps/developer?id=Strava+Inc."><span>Strava Inc.</span></a>
  // An earlier pattern matched only the direct-text form and silently returned
  // undefined for every app on the store.
  const developer =
    meta(html, "appstore:developer") ??
    html
      .match(/href="\/store\/apps\/dev(?:eloper)?\?id=[^"]*"[^>]*>\s*(?:<[^>]+>\s*)?([^<]+)</)?.[1]
      ?.replace(/&amp;/g, "&")
      .trim();

  // Document order matches gallery order. The first match is the app icon,
  // which is not a screenshot.
  const screenshotUrls = Array.from(
    new Set(
      Array.from(
        html.matchAll(/https:\/\/play-lh\.googleusercontent\.com\/[A-Za-z0-9_\-=]+/g),
      ).map((m) => m[0]),
    ),
  );
  const galleryUrls = screenshotUrls.slice(1);

  // "4.5star" / rating numbers appear as bare numbers next to the rating count.
  const ratingText = html.match(/([\d.]+)\s*star/i)?.[1];
  const ratingCountText = html.match(/([\d.,KMkm]+)\s*reviews?/i)?.[1];

  return {
    platform: "ANDROID",
    storeId: packageName,
    bundleId: packageName,
    name: ogTitle?.replace(/\s*-\s*Apps on Google Play$/i, "") ?? packageName,
    title: ogTitle?.replace(/\s*-\s*Apps on Google Play$/i, ""),
    developer,
    iconUrl: ogImage,
    shortDescription: ogDescription,
    description: descriptionCandidates[0] ? stripTags(descriptionCandidates[0]) : ogDescription,
    version,
    ratingAverage: ratingText ? Number(ratingText) : undefined,
    ratingCount: ratingCountText ? parseCompactNumber(ratingCountText) : undefined,
    contentRating,
    installsText,
    screenshotCount: galleryUrls.length,
    screenshotUrls: galleryUrls,
    hasVideo: /youtube\.com\/embed|\.mp4/.test(html),
    category: html.match(/\/store\/apps\/category\/([A-Z_]+)/)?.[1],
    url: url.toString(),
  };
}

function parseCompactNumber(text: string): number | undefined {
  const clean = text.replace(/,/g, "").trim();
  const match = clean.match(/^([\d.]+)\s*([KMB])?$/i);
  if (!match) return undefined;
  const base = Number(match[1]);
  if (!Number.isFinite(base)) return undefined;
  const suffix = match[2]?.toUpperCase();
  const multiplier = suffix === "B" ? 1e9 : suffix === "M" ? 1e6 : suffix === "K" ? 1e3 : 1;
  return Math.round(base * multiplier);
}

/**
 * Play search results appear in the HTML in ranked order. Reading the package
 * ids in document order is far more stable than decoding the nested result
 * arrays, and order is all rank tracking needs.
 */
export async function playSearch(
  term: string,
  opts: { country: string; locale: string; limit?: number },
): Promise<AsoSearchResult[]> {
  const url = new URL(SEARCH);
  url.searchParams.set("q", term);
  url.searchParams.set("c", "apps");
  url.searchParams.set("hl", opts.locale);
  url.searchParams.set("gl", opts.country);

  const html = await storeFetch(url.toString(), { acceptLanguage: opts.locale });

  const seen = new Set<string>();
  const results: AsoSearchResult[] = [];
  const limit = opts.limit ?? 100;

  const regex = /\/store\/apps\/details\?id=([A-Za-z0-9._]+)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null && results.length < limit) {
    const packageName = match[1];
    if (!packageName || seen.has(packageName)) continue;
    seen.add(packageName);
    results.push({
      position: results.length + 1,
      storeId: packageName,
      name: packageName,
    });
  }

  // Fill in display names from the embedded payload where they are available.
  const blobs = extractDataBlobs(html);
  const names = new Map<string, string>();
  for (const blob of blobs) {
    for (const node of walk(blob)) {
      if (
        Array.isArray(node) &&
        node.length >= 2 &&
        typeof node[0] === "string" &&
        typeof node[1] === "string" &&
        seen.has(node[0])
      ) {
        names.set(node[0], node[1]);
      }
    }
  }
  for (const result of results) {
    const name = names.get(result.storeId);
    if (name) result.name = name;
  }

  const ratings = searchRatings(html);
  for (const result of results) {
    const rating = ratings.get(result.storeId);
    if (rating !== undefined) result.ratingAverage = rating;
  }

  return results;
}

/**
 * Star ratings from a search results page, keyed by package.
 *
 * **Rating counts are not here to be had.** They exist only on detail pages,
 * which would cost ten extra requests per scored term. Search cards carry the
 * average and nothing else, so that is what difficulty gets to work with on
 * Play — see `estimateDifficulty`, which is explicit about the missing half.
 *
 * The rating follows its app's link in document order, so a card's rating is
 * attributed to the most recent package seen.
 */
export function searchRatings(html: string): Map<string, number> {
  const out = new Map<string, number>();
  const token =
    /\/store\/apps\/details\?id=([A-Za-z0-9._]+)|aria-label="Rated ([\d.]+) stars? out of five stars?"/g;

  let current: string | undefined;
  let match: RegExpExecArray | null;

  while ((match = token.exec(html)) !== null) {
    if (match[1]) {
      current = match[1];
      continue;
    }
    if (current && match[2] && !out.has(current)) {
      const value = Number(match[2]);
      if (Number.isFinite(value) && value > 0 && value <= 5) out.set(current, value);
    }
  }

  return out;
}

/** Play Store autocomplete. Returns plain suggestion strings. */
/**
 * Play Store search suggestions, ordered by popularity.
 *
 * Not `market.android.com/suggest/SuggRequest` — Google retired that endpoint
 * and it now answers 404, which the old `catch` swallowed into an empty array.
 * The effect was silent: Android keyword popularity degraded to a constant
 * floor and nothing reported an error.
 *
 * The replacement is Google's suggest service with `ds=play`, which is
 * Play-specific rather than web search. That distinction matters — plain
 * `suggestqueries` without `ds` returns things like "habit tracker excel
 * template", a web intent that says nothing about app-store demand.
 *
 * Responses arrive as `play/{locale}&{type}@{vertical}|{term}`, mixing apps
 * with books and movies, so only the `@apps` rows are kept.
 */
export async function playSuggest(prefix: string, opts: { country: string }): Promise<string[]> {
  const url = new URL(SUGGEST);
  url.searchParams.set("client", "chrome");
  url.searchParams.set("ds", "play");
  url.searchParams.set("hl", "en");
  url.searchParams.set("gl", opts.country);
  url.searchParams.set("q", prefix);
  // Without these the endpoint answers in Latin-1 and every accented or
  // non-Latin term comes back mangled — "l'oréal" arrived as "l'or�al" and
  // was stored that way, which quietly corrupts the whole non-English half of
  // the corpus rather than failing.
  url.searchParams.set("ie", "UTF-8");
  url.searchParams.set("oe", "UTF-8");

  try {
    const text = await storeFetch(url.toString());
    const parsed = JSON.parse(text) as [string, string[]];
    const raw = Array.isArray(parsed?.[1]) ? parsed[1] : [];

    return raw
      .filter((entry) => entry.includes("@apps|"))
      .map((entry) => entry.slice(entry.indexOf("|") + 1).trim())
      .filter((term) => term.length > 0);
  } catch {
    return [];
  }
}

