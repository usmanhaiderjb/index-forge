import { describe, expect, it } from "vitest";

import {
  TRAFFIC_SOURCES,
  TRAFFIC_SOURCE_META,
  conversionRate,
  isTrafficSource,
  normalizeTrafficSource,
  trafficDimension,
} from "../traffic";
import { parseDimension } from "../dimension";

describe("normalizeTrafficSource", () => {
  it("maps Apple's wording", () => {
    expect(normalizeTrafficSource("App Store Search")).toBe("search");
    expect(normalizeTrafficSource("App Store Browse")).toBe("browse");
    expect(normalizeTrafficSource("App Referrer")).toBe("referral");
    expect(normalizeTrafficSource("Web Referrer")).toBe("referral");
    expect(normalizeTrafficSource("Institutional Purchase")).toBe("other");
    expect(normalizeTrafficSource("Unavailable")).toBe("other");
  });

  it("maps Google's wording, including 'explore' for what Apple calls browse", () => {
    expect(normalizeTrafficSource("Play Store search")).toBe("search");
    expect(normalizeTrafficSource("Play Store browse")).toBe("browse");
    expect(normalizeTrafficSource("Explore")).toBe("browse");
    expect(normalizeTrafficSource("Third-party referrers")).toBe("referral");
    expect(normalizeTrafficSource("Google Ads")).toBe("referral");
  });

  it("is case and whitespace insensitive", () => {
    expect(normalizeTrafficSource("  APP STORE SEARCH  ")).toBe("search");
  });

  it("buckets anything unrecognised as other rather than dropping it", () => {
    // A dropped row makes the funnel silently fail to add up. A row labelled
    // "Other" is visible and therefore correctable.
    expect(normalizeTrafficSource("Some New Surface Apple Invented")).toBe("other");
    expect(normalizeTrafficSource("")).toBe("other");
  });

  it("only ever returns a known source", () => {
    for (const raw of ["search", "", "???", "Browse", "referrers", "ads"]) {
      expect(TRAFFIC_SOURCES).toContain(normalizeTrafficSource(raw));
    }
  });
});

describe("trafficDimension", () => {
  it("produces a dimension the existing parser reads back", () => {
    for (const source of TRAFFIC_SOURCES) {
      expect(parseDimension(trafficDimension(source))).toEqual({ source });
    }
  });
});

describe("isTrafficSource", () => {
  it("accepts known values and rejects others", () => {
    expect(isTrafficSource("search")).toBe(true);
    expect(isTrafficSource("Search")).toBe(false);
    expect(isTrafficSource("paid")).toBe(false);
  });
});

describe("conversionRate", () => {
  it("computes a percentage to two decimals", () => {
    expect(conversionRate(25, 100)).toBe(25);
    expect(conversionRate(1, 3)).toBe(33.33);
  });

  it("returns null for a zero denominator rather than 0", () => {
    // Zero page views means the rate is unknown. Drawing 0% for an unknown
    // reads as a catastrophe rather than as missing data.
    expect(conversionRate(0, 0)).toBeNull();
    expect(conversionRate(5, 0)).toBeNull();
  });

  it("returns null for non-finite input", () => {
    expect(conversionRate(Number.NaN, 100)).toBeNull();
    expect(conversionRate(10, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("is not an average of ratios", () => {
    // Two days: 1/10 and 9/10. The rate for the pair is 50%, not the mean of
    // 10% and 90% — which happens to also be 50%, so use an asymmetric case.
    // 1/100 and 9/10 -> 10/110 = 9.09%, while the mean of the daily rates is
    // 45.5%. Callers must sum numerator and denominator first.
    expect(conversionRate(1 + 9, 100 + 10)).toBe(9.09);
  });
});

describe("TRAFFIC_SOURCE_META", () => {
  it("describes every source", () => {
    for (const source of TRAFFIC_SOURCES) {
      expect(TRAFFIC_SOURCE_META[source].label.length).toBeGreaterThan(0);
      expect(TRAFFIC_SOURCE_META[source].description.length).toBeGreaterThan(0);
    }
  });
});
