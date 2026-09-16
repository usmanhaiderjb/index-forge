import "server-only";

import { storeFetch, storeFetchJson } from "@/server/aso/builtin/http";
import type { ChartEntry, ChartKind, ChartResult } from "@/server/aso/types";

/**
 * Apple publishes charts as RSS feeds. The legacy endpoint is used rather than
 * the newer marketing-tools API because only the legacy one supports a genre
 * filter, and a category chart is far more actionable than the overall one —
 * few apps ever appear in an overall top 200.
 */
const ITUNES_RSS = "https://itunes.apple.com";

const ITUNES_FEED: Record<ChartKind, string> = {
  TOP_FREE: "topfreeapplications",
  TOP_PAID: "toppaidapplications",
  TOP_GROSSING: "topgrossingapplications",
};

type ItunesFeed = {
  feed?: {
    entry?:
      | {
          id?: { attributes?: { "im:id"?: string } };
          "im:name"?: { label?: string };
        }[]
      | {
          id?: { attributes?: { "im:id"?: string } };
          "im:name"?: { label?: string };
        };
  };
};

export async function itunesChart(opts: {
  chart: ChartKind;
  country: string;
  category?: string | null;
  limit?: number;
}): Promise<ChartResult> {
  const limit = Math.min(opts.limit ?? 200, 200);
  const genre = opts.category ? `/genre=${opts.category}` : "";
  const url = `${ITUNES_RSS}/${opts.country}/rss/${ITUNES_FEED[opts.chart]}/limit=${limit}${genre}/json`;

  const json = await storeFetchJson<ItunesFeed>(url);

  // A feed with exactly one entry returns an object rather than an array.
  const raw = json.feed?.entry;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];

  const entries: ChartEntry[] = list
    .map((entry, index) => ({
      position: index + 1,
      storeId: entry.id?.attributes?.["im:id"] ?? "",
      name: entry["im:name"]?.label ?? "",
    }))
    .filter((entry) => entry.storeId !== "");

  return {
    chart: opts.chart,
    country: opts.country,
    category: opts.category ?? null,
    entries,
    scanDepth: entries.length,
  };
}

/**
 * Google publishes no chart API, and the old collection URLs now redirect.
 * The charts do render on the store's category pages, and package ids appear
 * there in rank order — the same document-order approach used for search,
 * which survives Google reshuffling the embedded payload.
 *
 * Top grossing is not exposed on those pages at all, so it is reported as an
 * empty scan rather than silently returning the free chart.
 */
const PLAY_STORE = "https://play.google.com/store/apps";

const PLAY_CHART_PARAM: Record<ChartKind, string | null> = {
  TOP_FREE: "topselling_free",
  TOP_PAID: "topselling_paid",
  TOP_GROSSING: null,
};

export async function playChart(opts: {
  chart: ChartKind;
  country: string;
  category?: string | null;
  limit?: number;
}): Promise<ChartResult> {
  const chartParam = PLAY_CHART_PARAM[opts.chart];

  if (!chartParam) {
    return {
      chart: opts.chart,
      country: opts.country,
      category: opts.category ?? null,
      entries: [],
      scanDepth: 0,
    };
  }

  const limit = Math.min(opts.limit ?? 100, 200);

  const url = new URL(
    opts.category
      ? `${PLAY_STORE}/category/${opts.category}`
      : `${PLAY_STORE}/top`,
  );
  url.searchParams.set("hl", "en");
  url.searchParams.set("gl", opts.country);

  const html = await storeFetch(url.toString());

  const seen = new Set<string>();
  const entries: ChartEntry[] = [];
  const regex = /\/store\/apps\/details\?id=([A-Za-z0-9._]+)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null && entries.length < limit) {
    const packageName = match[1];
    if (!packageName || seen.has(packageName)) continue;
    seen.add(packageName);
    entries.push({ position: entries.length + 1, storeId: packageName, name: packageName });
  }

  return {
    chart: opts.chart,
    country: opts.country,
    category: opts.category ?? null,
    entries,
    scanDepth: entries.length,
  };
}
