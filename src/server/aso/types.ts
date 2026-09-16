import type { Platform } from "@prisma/client";

export type AsoAppDetail = {
  platform: Platform;
  storeId: string;
  bundleId?: string;
  name: string;
  developer?: string;
  iconUrl?: string;
  title?: string;
  subtitle?: string;
  shortDescription?: string;
  description?: string;
  whatsNew?: string;
  promotionalText?: string;
  version?: string;
  category?: string;
  price?: number;
  currency?: string;
  ratingAverage?: number;
  ratingCount?: number;
  reviewCount?: number;
  contentRating?: string;
  screenshotCount?: number;
  /** Ordered as the store serves them; position carries most of the effect. */
  screenshotUrls?: string[];
  hasVideo?: boolean;
  releasedAt?: Date;
  updatedAt?: Date;
  /** Android only, e.g. "1,000,000+". Apple does not publish install counts. */
  installsText?: string;
  url?: string;
};

export type AsoSearchResult = {
  position: number;
  storeId: string;
  name: string;
  developer?: string;
  iconUrl?: string;
  ratingAverage?: number;
  ratingCount?: number;
};

export type AsoKeywordStats = {
  term: string;
  /** 0-100 search-volume proxy. */
  popularity?: number;
  /** 0-100, how contested the term is. */
  difficulty?: number;
  resultCount?: number;
};

export type ChartKind = "TOP_FREE" | "TOP_PAID" | "TOP_GROSSING";

export type ChartEntry = {
  position: number;
  storeId: string;
  name: string;
};

export type ChartResult = {
  chart: ChartKind;
  country: string;
  /** Store category id, or null for the overall chart. */
  category: string | null;
  entries: ChartEntry[];
  /** How deep the scan reached, so an absent app reads as "outside the top N". */
  scanDepth: number;
};

export interface AsoProvider {
  readonly name: string;
  /** Full store listing for one app. */
  getApp(
    platform: Platform,
    storeId: string,
    opts: { country: string; locale: string },
  ): Promise<AsoAppDetail | null>;
  /** Ordered search results, used for rank tracking and competitor discovery. */
  search(
    platform: Platform,
    term: string,
    opts: { country: string; locale: string; limit?: number },
  ): Promise<AsoSearchResult[]>;
  /** Store autocomplete, the closest public signal to real search demand. */
  suggest(platform: Platform, prefix: string, opts: { country: string }): Promise<string[]>;
  /** Market stats for a term. Built-in provider estimates; paid providers measure. */
  keywordStats?(
    platform: Platform,
    terms: string[],
    opts: { country: string; locale: string },
  ): Promise<AsoKeywordStats[]>;
  /**
   * A store chart, top-down. Chart position reflects download velocity rather
   * than relevance, so it moves for different reasons than keyword rank.
   */
  chart?(
    platform: Platform,
    opts: { chart: ChartKind; country: string; category?: string | null; limit?: number },
  ): Promise<ChartResult>;
}
