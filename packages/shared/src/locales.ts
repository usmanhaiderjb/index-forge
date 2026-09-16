/**
 * Storefronts the built-in scrapers can reach.
 *
 * A storefront is a country plus the language its listing is written in. Both
 * stores serve different text per pair, so "the US listing" and "the Brazil
 * listing" are separate artefacts that need separate tracking.
 */
export type Storefront = {
  country: string;
  locale: string;
  label: string;
  language: string;
};

export const STOREFRONTS: Storefront[] = [
  { country: "us", locale: "en-US", label: "United States", language: "English" },
  { country: "gb", locale: "en-GB", label: "United Kingdom", language: "English" },
  { country: "ca", locale: "en-CA", label: "Canada", language: "English" },
  { country: "au", locale: "en-AU", label: "Australia", language: "English" },
  { country: "de", locale: "de-DE", label: "Germany", language: "German" },
  { country: "fr", locale: "fr-FR", label: "France", language: "French" },
  { country: "es", locale: "es-ES", label: "Spain", language: "Spanish" },
  { country: "it", locale: "it-IT", label: "Italy", language: "Italian" },
  { country: "nl", locale: "nl-NL", label: "Netherlands", language: "Dutch" },
  { country: "se", locale: "sv-SE", label: "Sweden", language: "Swedish" },
  { country: "pl", locale: "pl-PL", label: "Poland", language: "Polish" },
  { country: "tr", locale: "tr-TR", label: "Turkey", language: "Turkish" },
  { country: "ru", locale: "ru-RU", label: "Russia", language: "Russian" },
  { country: "br", locale: "pt-BR", label: "Brazil", language: "Portuguese" },
  { country: "mx", locale: "es-MX", label: "Mexico", language: "Spanish" },
  { country: "jp", locale: "ja-JP", label: "Japan", language: "Japanese" },
  { country: "kr", locale: "ko-KR", label: "South Korea", language: "Korean" },
  { country: "cn", locale: "zh-CN", label: "China", language: "Chinese" },
  { country: "tw", locale: "zh-TW", label: "Taiwan", language: "Chinese" },
  { country: "in", locale: "en-IN", label: "India", language: "English" },
  { country: "id", locale: "id-ID", label: "Indonesia", language: "Indonesian" },
  { country: "sa", locale: "ar-SA", label: "Saudi Arabia", language: "Arabic" },
];

const BY_KEY = new Map(STOREFRONTS.map((s) => [storefrontKey(s.country, s.locale), s]));

export function storefrontKey(country: string, locale: string): string {
  return `${country.toLowerCase()}:${locale}`;
}

export function findStorefront(country: string, locale: string): Storefront | undefined {
  return BY_KEY.get(storefrontKey(country, locale));
}

/**
 * Human label for a storefront, falling back to the raw pair so an unlisted
 * one still renders as something meaningful rather than "undefined".
 */
export function storefrontLabel(country: string, locale: string): string {
  const known = findStorefront(country, locale);
  return known ? `${known.label} · ${known.language}` : `${country.toUpperCase()} · ${locale}`;
}

/** Storefronts sharing a language, used to suggest reusing translated copy. */
export function sameLanguage(locale: string): Storefront[] {
  const language = STOREFRONTS.find((s) => s.locale === locale)?.language;
  return language ? STOREFRONTS.filter((s) => s.language === language) : [];
}
