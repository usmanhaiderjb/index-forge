import "server-only";

import type { Platform } from "@prisma/client";

import { storefrontLabel } from "@aso/shared";
import { auditListing, FIELD_LIMITS, type ListingInput } from "@/server/aso/analysis";
import { db } from "@/server/db";

export type LocaleCoverage = {
  country: string;
  locale: string;
  label: string;
  isPrimary: boolean;
  isActive: boolean;
  /** Null when the storefront has never been captured. */
  capturedAt: Date | null;
  /**
   * The deterministic listing score for this storefront.
   *
   * It measures whether the fields are *used*, not whether they are in the
   * right language — a storefront serving the primary's English text scores
   * just as well. `isLocalized` is what makes that distinction, and the two
   * must be read together.
   */
  score: number | null;
  /** False when any indexed field still carries the primary's text verbatim. */
  isLocalized: boolean;
  untranslatedFields: number;
  /** Per-indexed-field fill state, so a half-localized storefront is visible. */
  fields: {
    field: string;
    label: string;
    filled: boolean;
    chars: number;
    limit: number;
    /** True when the text is byte-identical to the primary storefront. */
    sameAsPrimary: boolean;
  }[];
  keywordCount: number;
  rankedCount: number;
};

const IOS_FIELDS = [
  { field: "title", label: "Title", limitKey: "TITLE" },
  { field: "subtitle", label: "Subtitle", limitKey: "SUBTITLE" },
  { field: "keywordField", label: "Keywords", limitKey: "KEYWORDS" },
] as const;

const ANDROID_FIELDS = [
  { field: "title", label: "Title", limitKey: "TITLE" },
  { field: "shortDescription", label: "Short description", limitKey: "SHORT_DESCRIPTION" },
  { field: "fullDescription", label: "Long description", limitKey: "FULL_DESCRIPTION" },
] as const;

/**
 * Localization coverage across every tracked storefront.
 *
 * The question this answers is not "is the listing good" but "did anyone
 * actually translate it" — an app is routinely serving its English keyword
 * field to Japan, which costs it every Japanese search, and nothing in a
 * single-locale view surfaces that.
 */
export async function localeCoverage(appId: string): Promise<LocaleCoverage[]> {
  const app = await db.app.findUniqueOrThrow({ where: { id: appId } });

  const [locales, listings, keywords] = await Promise.all([
    db.appLocale.findMany({
      where: { appId },
      orderBy: [{ isPrimary: "desc" }, { country: "asc" }],
    }),
    db.storeListing.findMany({
      where: { appId },
      orderBy: { capturedAt: "desc" },
    }),
    db.keyword.groupBy({
      by: ["country"],
      where: { appId, isTracked: true },
      _count: true,
    }),
  ]);

  // Latest snapshot per storefront.
  const latest = new Map<string, (typeof listings)[number]>();
  for (const listing of listings) {
    const key = `${listing.country}:${listing.locale}`;
    if (!latest.has(key)) latest.set(key, listing);
  }

  const rankedByCountry = await db.keywordRank.groupBy({
    by: ["keywordId"],
    where: { keyword: { appId, isTracked: true }, rank: { not: null } },
    _max: { date: true },
  });
  const rankedKeywordIds = new Set(rankedByCountry.map((r) => r.keywordId));
  const rankedKeywords = await db.keyword.findMany({
    where: { id: { in: [...rankedKeywordIds] } },
    select: { country: true },
  });
  const rankedPerCountry = new Map<string, number>();
  for (const keyword of rankedKeywords) {
    rankedPerCountry.set(keyword.country, (rankedPerCountry.get(keyword.country) ?? 0) + 1);
  }

  const effective = locales.length
    ? locales
    : [
        {
          country: app.country,
          locale: app.locale,
          isPrimary: true,
          isActive: true,
        },
      ];

  const primaryKey = (() => {
    const primary = effective.find((l) => l.isPrimary) ?? effective[0]!;
    return `${primary.country}:${primary.locale}`;
  })();
  const primaryListing = latest.get(primaryKey);

  return effective.map((entry) => {
    const key = `${entry.country}:${entry.locale}`;
    const listing = latest.get(key);

    const input: ListingInput | null = listing
      ? {
          platform: app.platform,
          title: listing.title,
          subtitle: listing.subtitle,
          keywordField: listing.keywordField,
          shortDescription: listing.shortDescription,
          fullDescription: listing.fullDescription,
          screenshotCount: listing.screenshotCount,
          hasVideo: listing.hasVideo,
          ratingAverage: listing.ratingAverage,
          ratingCount: listing.ratingCount,
        }
      : null;

    const spec = app.platform === "IOS" ? IOS_FIELDS : ANDROID_FIELDS;
    const limits = FIELD_LIMITS[app.platform as Platform];

    const fields = spec.map((field) => {
        const value = (listing?.[field.field as keyof typeof listing] as string | null) ?? null;
        const primaryValue =
          (primaryListing?.[field.field as keyof typeof primaryListing] as string | null) ?? null;

        return {
          field: field.field,
          label: field.label,
          filled: Boolean(value && value.trim().length > 0),
          chars: value?.length ?? 0,
          limit: limits[field.limitKey] ?? 0,
          // Identical text in a different-language storefront means the
          // listing was never actually localized.
          sameAsPrimary:
            key !== primaryKey && Boolean(value) && value === primaryValue,
        };
      });

    const untranslatedFields = fields.filter((f) => f.sameAsPrimary).length;

    return {
      country: entry.country,
      locale: entry.locale,
      label: storefrontLabel(entry.country, entry.locale),
      isPrimary: entry.isPrimary,
      isActive: entry.isActive,
      capturedAt: listing?.capturedAt ?? null,
      score: input ? auditListing(input).score : null,
      isLocalized: entry.isPrimary || untranslatedFields === 0,
      untranslatedFields,
      fields,
      keywordCount: keywords.find((k) => k.country === entry.country)?._count ?? 0,
      rankedCount: rankedPerCountry.get(entry.country) ?? 0,
    };
  });
}
