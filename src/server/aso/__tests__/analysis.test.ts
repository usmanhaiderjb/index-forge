import { describe, expect, it } from "vitest";

import {
  auditListing,
  extractCandidateKeywords,
  fetchableScreenshotUrls,
  FIELD_LIMITS,
  keywordDensity,
  keywordGaps,
  tokenize,
} from "@/server/aso/analysis";

describe("tokenize", () => {
  it("keeps hyphenated and apostrophised words, drops punctuation", () => {
    expect(tokenize("Budget-planner: don't overspend!")).toEqual([
      "budget-planner",
      "don't",
      "overspend",
    ]);
  });

  it("keeps non-Latin scripts", () => {
    expect(tokenize("家計簿 アプリ")).toEqual(["家計簿", "アプリ"]);
  });
});

describe("keywordDensity", () => {
  it("counts single terms as a share of content words", () => {
    // "for" and "the" are stop words, so the denominator is 4: habit, tracker,
    // daily, habit. Two of those are the target.
    expect(keywordDensity("habit tracker for the daily habit", "habit")).toBeCloseTo(50, 1);
  });

  it("only counts genuinely contiguous occurrences of a multi-word term", () => {
    expect(keywordDensity("habit tracker daily", "habit tracker")).toBeGreaterThan(0);
    // "and" is a stop word, but the two words are still not adjacent in the
    // text the user actually wrote.
    expect(keywordDensity("habit and tracker", "habit tracker")).toBe(0);
  });

  it("returns zero for empty text", () => {
    expect(keywordDensity("", "habit")).toBe(0);
  });
});

describe("auditListing", () => {
  it("scores a complete iOS listing far above an empty one", () => {
    const full = auditListing({
      platform: "IOS",
      title: "Habitly: Habit Tracker",
      subtitle: "Streaks, reminders, insights",
      keywordField: "routine,streak,daily,goals,planner,journal,checklist,reminder,progress,focus",
      fullDescription: "x".repeat(3000),
      screenshotCount: 6,
      hasVideo: true,
      ratingAverage: 4.6,
      ratingCount: 12000,
    });

    const empty = auditListing({ platform: "IOS" });

    expect(full.score).toBeGreaterThan(70);
    expect(empty.score).toBe(0);
  });

  it("flags keyword-field terms that are already in the title", () => {
    const result = auditListing({
      platform: "IOS",
      title: "Habitly Habit Tracker",
      subtitle: "Build better routines",
      keywordField: "habit,streak,daily",
    });

    const keywords = result.checks.find((c) => c.id === "keywords");
    expect(keywords?.detail).toContain("wasted");
    expect(keywords?.detail).toContain("habit");
  });

  it("audits Android fields, not iOS ones", () => {
    const result = auditListing({ platform: "ANDROID", title: "Pocketwise" });
    const ids = result.checks.map((c) => c.id);

    expect(ids).toContain("short_description");
    expect(ids).not.toContain("keywords");
    expect(ids).not.toContain("subtitle");
  });

  it("describes the description field per platform — iOS does not index it", () => {
    const short = "Build habits that stick.";

    const ios = auditListing({ platform: "IOS", fullDescription: short });
    const android = auditListing({ platform: "ANDROID", fullDescription: short });

    expect(ios.checks.find((c) => c.id === "description")?.detail).toContain("does not index");
    expect(ios.checks.find((c) => c.id === "description")?.detail).not.toContain("Google Play");
    expect(android.checks.find((c) => c.id === "description")?.detail).toContain("Google Play");
  });

  it("is deterministic — the same listing always scores the same", () => {
    const listing = { platform: "IOS" as const, title: "Habitly", subtitle: "Track habits" };
    expect(auditListing(listing).score).toBe(auditListing(listing).score);
  });
});

describe("extractCandidateKeywords", () => {
  it("ranks title terms above body terms", () => {
    const terms = extractCandidateKeywords({
      platform: "IOS",
      title: "Budget Planner",
      fullDescription: "spreadsheet ".repeat(50),
    });

    expect(terms.indexOf("budget")).toBeLessThan(terms.indexOf("spreadsheet"));
  });

  it("skips stop words", () => {
    expect(extractCandidateKeywords({ platform: "IOS", title: "The Best Free App" })).not.toContain(
      "the",
    );
  });
});

describe("keywordGaps", () => {
  it("returns terms used by two or more competitors and by none of ours", () => {
    const gaps = keywordGaps(
      { platform: "IOS", title: "Habitly", subtitle: "Track habits" },
      [
        { platform: "IOS", title: "Streaks Pro", subtitle: "meditation timer" },
        { platform: "IOS", title: "Zen Habits", subtitle: "meditation journal" },
      ],
    );

    const terms = gaps.map((g) => g.term);
    expect(terms).toContain("meditation");
    expect(terms).not.toContain("habits");
  });
});

describe("fetchableScreenshotUrls", () => {
  it("keeps https URLs, which are the only ones a vision model can fetch", () => {
    expect(
      fetchableScreenshotUrls([
        "https://is1-ssl.mzstatic.com/image/a.png",
        "https://play-lh.googleusercontent.com/b",
      ]),
    ).toHaveLength(2);
  });

  it("drops inline data URLs", () => {
    expect(fetchableScreenshotUrls(["data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="])).toEqual([]);
  });

  it("drops plain http, which the API will not fetch", () => {
    expect(fetchableScreenshotUrls(["http://example.com/a.png"])).toEqual([]);
  });

  it("drops malformed URLs instead of throwing", () => {
    expect(fetchableScreenshotUrls(["not a url", ""])).toEqual([]);
  });

  it("preserves gallery order, since position is the signal", () => {
    const urls = ["https://a/1.png", "data:image/png;base64,x", "https://a/2.png"];
    expect(fetchableScreenshotUrls(urls)).toEqual(["https://a/1.png", "https://a/2.png"]);
  });
});

describe("FIELD_LIMITS", () => {
  it("matches the limits the stores actually enforce", () => {
    expect(FIELD_LIMITS.IOS.TITLE).toBe(30);
    expect(FIELD_LIMITS.IOS.KEYWORDS).toBe(100);
    expect(FIELD_LIMITS.ANDROID.SHORT_DESCRIPTION).toBe(80);
    expect(FIELD_LIMITS.ANDROID.KEYWORDS).toBeUndefined();
  });
});
