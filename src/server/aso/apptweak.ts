import "server-only";

import type { Platform } from "@prisma/client";

import { env } from "@/env";
import { withRetry } from "@aso/shared";
import type {
  AsoAppDetail,
  AsoKeywordStats,
  AsoProvider,
  AsoSearchResult,
} from "@/server/aso/types";

const BASE = "https://api.apptweak.com/ios";
const BASE_ANDROID = "https://api.apptweak.com/android";

function base(platform: Platform) {
  return platform === "IOS" ? BASE : BASE_ANDROID;
}

async function call<T>(path: string, params: Record<string, string>): Promise<T> {
  if (!env.APPTWEAK_API_KEY) throw new Error("APPTWEAK_API_KEY is not set");

  const url = new URL(path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  return withRetry(async () => {
    const res = await fetch(url, {
      headers: { "X-Apptweak-Key": env.APPTWEAK_API_KEY!, Accept: "application/json" },
    });
    if (!res.ok) {
      throw Object.assign(new Error(`AppTweak ${res.status}: ${await res.text()}`), {
        status: res.status,
      });
    }
    return (await res.json()) as T;
  });
}

/**
 * AppTweak adapter. Present so a deployment can switch to measured keyword
 * volume and difficulty by setting ASO_PROVIDER=apptweak and a key; the rest
 * of the app is unchanged because it only talks to the AsoProvider interface.
 */
export const apptweakProvider: AsoProvider = {
  name: "apptweak",

  async getApp(platform, storeId, opts): Promise<AsoAppDetail | null> {
    const res = await call<{ content?: Record<string, unknown> }>(
      `${base(platform)}/applications/${storeId}/metadata.json`,
      { country: opts.country, language: opts.locale.split("-")[0] ?? "en" },
    );
    const content = res.content;
    if (!content) return null;

    return {
      platform,
      storeId,
      name: String(content.title ?? storeId),
      title: content.title as string | undefined,
      subtitle: content.subtitle as string | undefined,
      developer: content.developer as string | undefined,
      description: content.description as string | undefined,
      iconUrl: content.icon as string | undefined,
      version: content.version as string | undefined,
      ratingAverage: content.rating as number | undefined,
      ratingCount: content.rating_count as number | undefined,
      screenshotCount: Array.isArray(content.screenshots) ? content.screenshots.length : undefined,
    };
  },

  async search(platform, term, opts): Promise<AsoSearchResult[]> {
    const res = await call<{ content?: { id: string; title?: string }[] }>(
      `${base(platform)}/searches.json`,
      { query: term, country: opts.country, language: opts.locale.split("-")[0] ?? "en" },
    );
    return (res.content ?? []).map((item, index) => ({
      position: index + 1,
      storeId: item.id,
      name: item.title ?? item.id,
    }));
  },

  async suggest(platform, prefix, opts): Promise<string[]> {
    const res = await call<{ content?: string[] }>(`${base(platform)}/keywords/suggestions.json`, {
      keyword: prefix,
      country: opts.country,
    });
    return res.content ?? [];
  },

  async keywordStats(platform, terms, opts): Promise<AsoKeywordStats[]> {
    const res = await call<{
      content?: Record<string, { volume?: number; difficulty?: number; results?: number }>;
    }>(`${base(platform)}/keywords/stats.json`, {
      keywords: terms.join(","),
      country: opts.country,
      language: opts.locale.split("-")[0] ?? "en",
    });

    return terms.map((term) => {
      const stats = res.content?.[term];
      return {
        term,
        popularity: stats?.volume,
        difficulty: stats?.difficulty,
        resultCount: stats?.results,
      };
    });
  },
};
