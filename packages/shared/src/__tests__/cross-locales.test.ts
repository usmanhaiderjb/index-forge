import { describe, expect, it } from "vitest";

import {
  analyzeCrossLocaleKeywords,
  APPLE_CROSS_LOCALIZATION,
  getCrossLocaleRules,
} from "../cross-locales";

describe("Apple Cross-Localization Engine", () => {
  it("returns verified secondary indexed locales for the US storefront", () => {
    const rules = getCrossLocaleRules("us");
    expect(rules.country).toBe("us");
    expect(rules.primaryLocale).toBe("en-US");
    expect(rules.multiplier).toBe(9.0);
    expect(rules.totalKeywordCapacity).toBe(900);
    expect(rules.locales.length).toBe(9);

    const locales = rules.locales.map((l) => l.locale);
    expect(locales).toContain("en-US");
    expect(locales).toContain("es-MX");
    expect(locales).toContain("ar-SA");
    expect(locales).toContain("fr-CA");
    expect(locales).toContain("zh-Hans");
  });

  it("returns cross-localization rules for Canada and UK", () => {
    const ca = getCrossLocaleRules("ca");
    expect(ca.locales.map((l) => l.locale)).toContain("fr-CA");
    expect(ca.locales.map((l) => l.locale)).toContain("en-US");

    const gb = getCrossLocaleRules("gb");
    expect(gb.locales.map((l) => l.locale)).toContain("en-US");
    expect(gb.locales.map((l) => l.locale)).toContain("ar-SA");
  });

  it("falls back gracefully for an unlisted country", () => {
    const fallback = getCrossLocaleRules("xx");
    expect(fallback.country).toBe("xx");
    expect(fallback.locales.length).toBe(2);
    expect(fallback.multiplier).toBe(2.0);
  });

  it("detects keyword duplicates across secondary indexed locales and computes wasted characters", () => {
    const keywordsByLocale = {
      "en-US": ["habit tracker", "streak", "daily routine"],
      "es-MX": ["habit tracker", "metas diarias", "streak"], // 2 duplicates: habit tracker, streak
      "fr-CA": ["suivi", "streak"], // 1 duplicate: streak
    };

    const analysis = analyzeCrossLocaleKeywords(keywordsByLocale);

    expect(analysis.totalTerms).toBe(8);
    expect(analysis.uniqueTerms.length).toBe(5);
    expect(analysis.duplicateTerms.length).toBe(2);

    const streakDup = analysis.duplicateTerms.find((d) => d.term === "streak");
    expect(streakDup?.locales).toEqual(["en-US", "es-MX", "fr-CA"]);

    expect(analysis.wastedCharacters).toBeGreaterThan(0);
    expect(analysis.efficiencyScore).toBeLessThan(100);
    expect(analysis.recommendations.length).toBeGreaterThan(0);
  });

  it("gives 100 efficiency score when all keywords are completely unique across locales", () => {
    const keywordsByLocale = {
      "en-US": ["workout", "fitness", "gym"],
      "es-MX": ["ejercicio", "entrenamiento"],
      "fr-CA": ["musculation", "sante"],
    };

    const analysis = analyzeCrossLocaleKeywords(keywordsByLocale);
    expect(analysis.duplicateTerms.length).toBe(0);
    expect(analysis.wastedCharacters).toBe(0);
    expect(analysis.efficiencyScore).toBe(100);
  });
});
