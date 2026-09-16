export type Platform = "IOS" | "ANDROID";

export type StoreDetectionResult = {
  platform?: Platform;
  storeId?: string;
  country?: string;
};

/**
 * Detects whether an input string is an iOS App Store or Google Play Store URL / identifier,
 * and extracts the normalized storeId, platform, and optional country code.
 */
export function detectStoreInput(input: string): StoreDetectionResult {
  const trimmed = input.trim();
  if (!trimmed) return {};

  // 1. Google Play Store URL
  if (/play\.google\.com|market:\/\/details/i.test(trimmed)) {
    const pkgMatch =
      trimmed.match(/[?&]id=([a-zA-Z0-9._]+)/i) ??
      trimmed.match(/details\/([a-zA-Z0-9._]+)/i) ??
      trimmed.match(/apps\/details\?id=([a-zA-Z0-9._]+)/i);
    const countryMatch = trimmed.match(/[?&]gl=([a-zA-Z]{2})/i);
    return {
      platform: "ANDROID",
      storeId: pkgMatch && pkgMatch[1] ? pkgMatch[1] : undefined,
      country: countryMatch && countryMatch[1] ? countryMatch[1].toLowerCase() : undefined,
    };
  }

  // 2. Apple App Store URL
  if (/apps\.apple\.com|itunes\.apple\.com/i.test(trimmed)) {
    const idMatch = trimmed.match(/id(\d+)/i);
    const countryMatch =
      trimmed.match(/apps\.apple\.com\/([a-zA-Z]{2})\//i) ??
      trimmed.match(/[?&]country=([a-zA-Z]{2})/i);
    return {
      platform: "IOS",
      storeId: idMatch && idMatch[1] ? idMatch[1] : undefined,
      country: countryMatch && countryMatch[1] ? countryMatch[1].toLowerCase() : undefined,
    };
  }

  // 3. Android Package Name pattern (e.g. com.spotify.music, org.mozilla.firefox, io.flutter.app)
  if (
    /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)+$/.test(trimmed) &&
    !trimmed.startsWith("http")
  ) {
    return {
      platform: "ANDROID",
      storeId: trimmed,
    };
  }

  // 4. Apple Track ID pattern (e.g. id570060128, 570060128)
  if (/^id(\d{5,12})$/i.test(trimmed)) {
    const match = trimmed.match(/^id(\d{5,12})$/i);
    return {
      platform: "IOS",
      storeId: match && match[1] ? match[1] : undefined,
    };
  }

  if (/^\d{6,12}$/.test(trimmed)) {
    return {
      platform: "IOS",
      storeId: trimmed,
    };
  }

  return {};
}
