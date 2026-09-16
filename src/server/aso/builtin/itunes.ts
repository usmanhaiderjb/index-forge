import "server-only";

import { isNotFound, storeFetch, storeFetchJson } from "@/server/aso/builtin/http";
import type { AsoAppDetail, AsoSearchResult } from "@/server/aso/types";

const LOOKUP = "https://itunes.apple.com/lookup";
const SEARCH = "https://itunes.apple.com/search";
const HINTS = "https://search.itunes.apple.com/WebObjects/MZSearchHints.woa/wa/hints";

type ItunesResult = {
  trackId: number;
  trackName: string;
  bundleId?: string;
  artistName?: string;
  artworkUrl512?: string;
  artworkUrl100?: string;
  description?: string;
  releaseNotes?: string;
  version?: string;
  primaryGenreName?: string;
  price?: number;
  currency?: string;
  averageUserRating?: number;
  userRatingCount?: number;
  contentAdvisoryRating?: string;
  screenshotUrls?: string[];
  ipadScreenshotUrls?: string[];
  releaseDate?: string;
  currentVersionReleaseDate?: string;
  trackViewUrl?: string;
};

function toDetail(result: ItunesResult): AsoAppDetail {
  return {
    platform: "IOS",
    storeId: String(result.trackId),
    bundleId: result.bundleId,
    name: result.trackName,
    // The iTunes API returns the full store title but not the separate
    // subtitle field. Titles are conventionally "Name: Subtitle".
    title: result.trackName,
    subtitle: result.trackName.includes(":")
      ? result.trackName.split(":").slice(1).join(":").trim()
      : undefined,
    developer: result.artistName,
    iconUrl: result.artworkUrl512 ?? result.artworkUrl100,
    description: result.description,
    whatsNew: result.releaseNotes,
    version: result.version,
    category: result.primaryGenreName,
    price: result.price,
    currency: result.currency,
    ratingAverage: result.averageUserRating,
    ratingCount: result.userRatingCount,
    reviewCount: result.userRatingCount,
    contentRating: result.contentAdvisoryRating,
    screenshotCount: (result.screenshotUrls?.length ?? 0) + (result.ipadScreenshotUrls?.length ?? 0),
    // iPhone shots first — that is the gallery the overwhelming majority of
    // visitors actually see.
    screenshotUrls: [...(result.screenshotUrls ?? []), ...(result.ipadScreenshotUrls ?? [])],
    releasedAt: result.releaseDate ? new Date(result.releaseDate) : undefined,
    updatedAt: result.currentVersionReleaseDate
      ? new Date(result.currentVersionReleaseDate)
      : undefined,
    url: result.trackViewUrl,
  };
}

export async function itunesLookup(
  storeId: string,
  opts: { country: string; locale: string },
): Promise<AsoAppDetail | null> {
  const url = new URL(LOOKUP);
  // Numeric ids are track ids; anything else is treated as a bundle id.
  if (/^\d+$/.test(storeId)) url.searchParams.set("id", storeId);
  else url.searchParams.set("bundleId", storeId);
  url.searchParams.set("country", opts.country);
  url.searchParams.set("entity", "software");
  url.searchParams.set("lang", opts.locale.replace("-", "_"));

  try {
    const json = await storeFetchJson<{ resultCount: number; results: ItunesResult[] }>(
      url.toString(),
      { acceptLanguage: opts.locale },
    );
    const first = json.results?.[0];
    return first ? toDetail(first) : null;
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

/**
 * The iTunes Search API returns results in relevance order. That order is not
 * byte-identical to App Store search, but it tracks it closely enough to
 * measure movement, which is what rank tracking is for.
 */
export async function itunesSearch(
  term: string,
  opts: { country: string; locale: string; limit?: number },
): Promise<AsoSearchResult[]> {
  const url = new URL(SEARCH);
  url.searchParams.set("term", term);
  url.searchParams.set("country", opts.country);
  url.searchParams.set("entity", "software");
  url.searchParams.set("limit", String(Math.min(opts.limit ?? 100, 200)));
  url.searchParams.set("lang", opts.locale.replace("-", "_"));

  const json = await storeFetchJson<{ results: ItunesResult[] }>(url.toString(), {
    acceptLanguage: opts.locale,
  });

  return (json.results ?? []).map((result, index) => ({
    position: index + 1,
    storeId: String(result.trackId),
    name: result.trackName,
    developer: result.artistName,
    iconUrl: result.artworkUrl512 ?? result.artworkUrl100,
    ratingAverage: result.averageUserRating,
    ratingCount: result.userRatingCount,
  }));
}

/**
 * App Store search hints. Apple returns an XML plist; the terms are the
 * <string> values that follow a "term" key.
 */
export async function itunesSuggest(
  prefix: string,
  opts: { country: string },
): Promise<string[]> {
  const url = new URL(HINTS);
  url.searchParams.set("clientApplication", "Software");
  url.searchParams.set("term", prefix);

  try {
    const xml = await storeFetch(url.toString(), {
      headers: { "X-Apple-Store-Front": storeFrontFor(opts.country) },
    });

    const terms: string[] = [];
    const regex = /<key>term<\/key>\s*<string>([^<]+)<\/string>/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(xml)) !== null) {
      if (match[1]) terms.push(match[1].trim());
    }
    return Array.from(new Set(terms));
  } catch {
    return [];
  }
}

/**
 * Storefront ids are required by the hints endpoint. This covers the largest
 * markets; unknown countries fall back to the US storefront.
 */
const STOREFRONTS: Record<string, string> = {
  us: "143441", gb: "143444", ca: "143455", au: "143460", de: "143443",
  fr: "143442", it: "143450", es: "143454", nl: "143452", se: "143456",
  br: "143503", mx: "143468", jp: "143462", kr: "143466", cn: "143465",
  in: "143467", ru: "143469", tr: "143480", id: "143476", pl: "143478",
};

function storeFrontFor(country: string): string {
  return `${STOREFRONTS[country.toLowerCase()] ?? "143441"}-1,29`;
}
