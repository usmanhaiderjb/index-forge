import "server-only";

import type { Platform } from "@prisma/client";

import { clamp } from "@aso/shared";
import { itunesChart, playChart } from "@/server/aso/builtin/charts";
import { estimateDifficulty } from "@/server/aso/difficulty";
import { itunesLookup, itunesSearch, itunesSuggest } from "@/server/aso/builtin/itunes";
import { playDetails, playSearch, playSuggest } from "@/server/aso/builtin/play";
import type {
  AsoAppDetail,
  AsoKeywordStats,
  AsoProvider,
  AsoSearchResult,
  ChartResult,
} from "@/server/aso/types";

/**
 * Popularity proxy: how many autocomplete suggestions the store returns that
 * contain the term, and whether the term itself is suggested from its own
 * prefix. Stores only suggest terms people actually search for.
 */
function estimatePopularity(term: string, suggestions: string[]): number {
  const normalized = term.toLowerCase().trim();
  if (suggestions.length === 0) return 5;

  const exactIndex = suggestions.findIndex((s) => s.toLowerCase() === normalized);
  const containing = suggestions.filter((s) => s.toLowerCase().includes(normalized)).length;

  // Being suggested at all is the strongest signal; rank within the list refines it.
  const exactScore = exactIndex === -1 ? 0 : 60 - exactIndex * 4;
  const breadthScore = clamp(containing * 4, 0, 30);
  const lengthPenalty = clamp((normalized.split(/\s+/).length - 1) * 6, 0, 18);

  return Math.round(clamp(exactScore + breadthScore + 10 - lengthPenalty, 1, 100));
}

export const builtinAsoProvider: AsoProvider = {
  name: "builtin",

  async getApp(platform: Platform, storeId, opts): Promise<AsoAppDetail | null> {
    return platform === "IOS" ? itunesLookup(storeId, opts) : playDetails(storeId, opts);
  },

  async search(platform: Platform, term, opts): Promise<AsoSearchResult[]> {
    return platform === "IOS" ? itunesSearch(term, opts) : playSearch(term, opts);
  },

  async suggest(platform: Platform, prefix, opts): Promise<string[]> {
    return platform === "IOS" ? itunesSuggest(prefix, opts) : playSuggest(prefix, opts);
  },

  async chart(platform: Platform, opts): Promise<ChartResult> {
    return platform === "IOS" ? itunesChart(opts) : playChart(opts);
  },

  async keywordStats(platform, terms, opts): Promise<AsoKeywordStats[]> {
    const out: AsoKeywordStats[] = [];

    for (const term of terms) {
      const [results, suggestions] = await Promise.all([
        this.search(platform, term, { ...opts, limit: 50 }).catch(() => [] as AsoSearchResult[]),
        this.suggest(platform, term.slice(0, Math.max(3, term.length - 2)), {
          country: opts.country,
        }).catch(() => [] as string[]),
      ]);

      out.push({
        term,
        popularity: estimatePopularity(term, suggestions),
        difficulty: estimateDifficulty(results),
        resultCount: results.length,
      });
    }

    return out;
  },
};
