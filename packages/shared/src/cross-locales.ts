/**
 * Apple App Store Cross-Localization Matrix.
 *
 * In the Apple App Store, certain storefronts index keywords from multiple
 * secondary locales in addition to the storefront's primary language.
 * Localizing in these secondary languages expands an app's keyword space
 * from 100 characters to 400-800+ characters for that specific country storefront!
 */

export type IndexedLocale = {
  locale: string;
  language: string;
  isPrimary: boolean;
  priority: number;
  description: string;
};

export type StorefrontCrossLocalization = {
  country: string;
  countryName: string;
  primaryLocale: string;
  indexedLocales: IndexedLocale[];
  characterBudgetMultiplier: number;
};

/**
 * Verified Cross-Localization mapping for major Apple App Store storefronts.
 * Each secondary locale listed here is indexed by Apple's search algorithm
 * in the corresponding country's search results.
 */
export const APPLE_CROSS_LOCALIZATION: Record<string, StorefrontCrossLocalization> = {
  us: {
    country: "us",
    countryName: "United States",
    primaryLocale: "en-US",
    indexedLocales: [
      { locale: "en-US", language: "English (US)", isPrimary: true, priority: 1, description: "Primary storefront language" },
      { locale: "es-MX", language: "Spanish (Mexico)", isPrimary: false, priority: 2, description: "Heavily indexed across US search" },
      { locale: "ar-SA", language: "Arabic", isPrimary: false, priority: 3, description: "Fully indexed in US App Store" },
      { locale: "ru-RU", language: "Russian", isPrimary: false, priority: 4, description: "Fully indexed in US App Store" },
      { locale: "zh-Hans", language: "Chinese (Simplified)", isPrimary: false, priority: 5, description: "Indexes English + Chinese characters in US" },
      { locale: "fr-CA", language: "French (Canada)", isPrimary: false, priority: 6, description: "Indexed in North America region" },
      { locale: "ko-KR", language: "Korean", isPrimary: false, priority: 7, description: "Fully indexed in US App Store" },
      { locale: "pt-BR", language: "Portuguese (Brazil)", isPrimary: false, priority: 8, description: "Indexed in US App Store" },
      { locale: "vi", language: "Vietnamese", isPrimary: false, priority: 9, description: "Indexed in US App Store" },
    ],
    characterBudgetMultiplier: 9.0,
  },
  ca: {
    country: "ca",
    countryName: "Canada",
    primaryLocale: "en-CA",
    indexedLocales: [
      { locale: "en-CA", language: "English (Canada)", isPrimary: true, priority: 1, description: "Primary storefront language" },
      { locale: "fr-CA", language: "French (Canada)", isPrimary: false, priority: 2, description: "Official co-primary language in Canada" },
      { locale: "en-US", language: "English (US)", isPrimary: false, priority: 3, description: "Cross-indexed in Canada" },
    ],
    characterBudgetMultiplier: 3.0,
  },
  gb: {
    country: "gb",
    countryName: "United Kingdom",
    primaryLocale: "en-GB",
    indexedLocales: [
      { locale: "en-GB", language: "English (UK)", isPrimary: true, priority: 1, description: "Primary storefront language" },
      { locale: "en-US", language: "English (US)", isPrimary: false, priority: 2, description: "Cross-indexed in UK App Store" },
      { locale: "ar-SA", language: "Arabic", isPrimary: false, priority: 3, description: "Indexed in UK App Store" },
    ],
    characterBudgetMultiplier: 3.0,
  },
  au: {
    country: "au",
    countryName: "Australia",
    primaryLocale: "en-AU",
    indexedLocales: [
      { locale: "en-AU", language: "English (Australia)", isPrimary: true, priority: 1, description: "Primary storefront language" },
      { locale: "en-US", language: "English (US)", isPrimary: false, priority: 2, description: "Cross-indexed in Australia" },
      { locale: "ja-JP", language: "Japanese", isPrimary: false, priority: 3, description: "Indexed in AU App Store" },
    ],
    characterBudgetMultiplier: 3.0,
  },
  de: {
    country: "de",
    countryName: "Germany",
    primaryLocale: "de-DE",
    indexedLocales: [
      { locale: "de-DE", language: "German", isPrimary: true, priority: 1, description: "Primary storefront language" },
      { locale: "en-US", language: "English (US)", isPrimary: false, priority: 2, description: "Universal fallback indexing in Germany" },
      { locale: "tr-TR", language: "Turkish", isPrimary: false, priority: 3, description: "Indexed due to large Turkish population in DE" },
    ],
    characterBudgetMultiplier: 3.0,
  },
  fr: {
    country: "fr",
    countryName: "France",
    primaryLocale: "fr-FR",
    indexedLocales: [
      { locale: "fr-FR", language: "French (France)", isPrimary: true, priority: 1, description: "Primary storefront language" },
      { locale: "en-US", language: "English (US)", isPrimary: false, priority: 2, description: "Cross-indexed in France" },
      { locale: "ar-SA", language: "Arabic", isPrimary: false, priority: 3, description: "Indexed in FR App Store" },
    ],
    characterBudgetMultiplier: 3.0,
  },
  es: {
    country: "es",
    countryName: "Spain",
    primaryLocale: "es-ES",
    indexedLocales: [
      { locale: "es-ES", language: "Spanish (Spain)", isPrimary: true, priority: 1, description: "Primary storefront language" },
      { locale: "en-US", language: "English (US)", isPrimary: false, priority: 2, description: "Cross-indexed in Spain" },
      { locale: "ca", language: "Catalan", isPrimary: false, priority: 3, description: "Regional indexed language" },
    ],
    characterBudgetMultiplier: 3.0,
  },
  it: {
    country: "it",
    countryName: "Italy",
    primaryLocale: "it-IT",
    indexedLocales: [
      { locale: "it-IT", language: "Italian", isPrimary: true, priority: 1, description: "Primary storefront language" },
      { locale: "en-US", language: "English (US)", isPrimary: false, priority: 2, description: "Cross-indexed in Italy" },
    ],
    characterBudgetMultiplier: 2.0,
  },
  jp: {
    country: "jp",
    countryName: "Japan",
    primaryLocale: "ja-JP",
    indexedLocales: [
      { locale: "ja-JP", language: "Japanese", isPrimary: true, priority: 1, description: "Primary storefront language" },
      { locale: "en-US", language: "English (US)", isPrimary: false, priority: 2, description: "Cross-indexed in Japan" },
      { locale: "zh-Hant", language: "Chinese (Traditional)", isPrimary: false, priority: 3, description: "Cross-indexed in Japan" },
    ],
    characterBudgetMultiplier: 3.0,
  },
  kr: {
    country: "kr",
    countryName: "South Korea",
    primaryLocale: "ko-KR",
    indexedLocales: [
      { locale: "ko-KR", language: "Korean", isPrimary: true, priority: 1, description: "Primary storefront language" },
      { locale: "en-US", language: "English (US)", isPrimary: false, priority: 2, description: "Cross-indexed in South Korea" },
    ],
    characterBudgetMultiplier: 2.0,
  },
  in: {
    country: "in",
    countryName: "India",
    primaryLocale: "en-IN",
    indexedLocales: [
      { locale: "en-IN", language: "English (India)", isPrimary: true, priority: 1, description: "Primary storefront language" },
      { locale: "en-US", language: "English (US)", isPrimary: false, priority: 2, description: "Cross-indexed in India" },
      { locale: "hi-IN", language: "Hindi", isPrimary: false, priority: 3, description: "Indexed in Indian App Store" },
    ],
    characterBudgetMultiplier: 3.0,
  },
  br: {
    country: "br",
    countryName: "Brazil",
    primaryLocale: "pt-BR",
    indexedLocales: [
      { locale: "pt-BR", language: "Portuguese (Brazil)", isPrimary: true, priority: 1, description: "Primary storefront language" },
      { locale: "en-US", language: "English (US)", isPrimary: false, priority: 2, description: "Cross-indexed in Brazil" },
    ],
    characterBudgetMultiplier: 2.0,
  },
  mx: {
    country: "mx",
    countryName: "Mexico",
    primaryLocale: "es-MX",
    indexedLocales: [
      { locale: "es-MX", language: "Spanish (Mexico)", isPrimary: true, priority: 1, description: "Primary storefront language" },
      { locale: "en-US", language: "English (US)", isPrimary: false, priority: 2, description: "Cross-indexed in Mexico" },
    ],
    characterBudgetMultiplier: 2.0,
  },
  ch: {
    country: "ch",
    countryName: "Switzerland",
    primaryLocale: "de-CH",
    indexedLocales: [
      { locale: "de-DE", language: "German", isPrimary: true, priority: 1, description: "National language" },
      { locale: "fr-FR", language: "French", isPrimary: false, priority: 2, description: "National language" },
      { locale: "it-IT", language: "Italian", isPrimary: false, priority: 3, description: "National language" },
      { locale: "en-US", language: "English (US)", isPrimary: false, priority: 4, description: "Cross-indexed universal fallback" },
    ],
    characterBudgetMultiplier: 4.0,
  },
};

export type CrossLocaleBudgetResult = {
  country: string;
  countryName: string;
  primaryLocale: string;
  locales: IndexedLocale[];
  totalKeywordCapacity: number;
  totalTitleCapacity: number;
  totalSubtitleCapacity: number;
  multiplier: number;
};

export function getCrossLocaleRules(country: string): CrossLocaleBudgetResult {
  const normalized = country.toLowerCase();
  const mapping = APPLE_CROSS_LOCALIZATION[normalized];

  if (!mapping) {
    return {
      country: normalized,
      countryName: normalized.toUpperCase(),
      primaryLocale: `en-${normalized.toUpperCase()}`,
      locales: [
        { locale: `en-${normalized.toUpperCase()}`, language: "Local Language", isPrimary: true, priority: 1, description: "Primary storefront" },
        { locale: "en-US", language: "English (US)", isPrimary: false, priority: 2, description: "Global fallback index" },
      ],
      totalKeywordCapacity: 200,
      totalTitleCapacity: 60,
      totalSubtitleCapacity: 60,
      multiplier: 2.0,
    };
  }

  const count = mapping.indexedLocales.length;
  return {
    country: mapping.country,
    countryName: mapping.countryName,
    primaryLocale: mapping.primaryLocale,
    locales: mapping.indexedLocales,
    totalKeywordCapacity: count * 100,
    totalTitleCapacity: count * 30,
    totalSubtitleCapacity: count * 30,
    multiplier: mapping.characterBudgetMultiplier,
  };
}

export type KeywordOverlapAnalysis = {
  totalTerms: number;
  uniqueTerms: string[];
  duplicateTerms: { term: string; locales: string[] }[];
  wastedCharacters: number;
  efficiencyScore: number;
  recommendations: string[];
};

export function analyzeCrossLocaleKeywords(
  keywordsByLocale: Record<string, string[]>,
): KeywordOverlapAnalysis {
  const termLocaleMap = new Map<string, string[]>();
  let totalTerms = 0;

  for (const [locale, terms] of Object.entries(keywordsByLocale)) {
    for (const rawTerm of terms) {
      const term = rawTerm.trim().toLowerCase();
      if (!term) continue;
      totalTerms++;
      const existing = termLocaleMap.get(term) ?? [];
      if (!existing.includes(locale)) {
        existing.push(locale);
      }
      termLocaleMap.set(term, existing);
    }
  }

  const uniqueTerms: string[] = [];
  const duplicateTerms: { term: string; locales: string[] }[] = [];
  let wastedCharacters = 0;

  for (const [term, locales] of termLocaleMap.entries()) {
    uniqueTerms.push(term);
    if (locales.length > 1) {
      duplicateTerms.push({ term, locales });
      wastedCharacters += (locales.length - 1) * (term.length + 1);
    }
  }

  const totalPossibleChars = totalTerms * 6;
  const efficiencyScore = totalPossibleChars > 0
    ? Math.max(0, Math.round(100 - (wastedCharacters / totalPossibleChars) * 100))
    : 100;

  const recommendations: string[] = [];
  if (duplicateTerms.length > 0) {
    const termNames = duplicateTerms.map((d) => `"${d.term}"`).slice(0, 3).join(", ");
    recommendations.push(
      `Remove duplicate terms (${termNames}${duplicateTerms.length > 3 ? "..." : ""}) from secondary locales to reclaim ${wastedCharacters} characters for new search keywords.`,
    );
  }
  if (Object.keys(keywordsByLocale).length < 3) {
    recommendations.push(
      "Add more secondary indexed locales (e.g. Spanish-MX, French-CA, Arabic) to multiply your keyword discovery reach.",
    );
  }

  return {
    totalTerms,
    uniqueTerms,
    duplicateTerms,
    wastedCharacters,
    efficiencyScore,
    recommendations,
  };
}
