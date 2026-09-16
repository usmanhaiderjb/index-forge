import { describe, expect, it } from "vitest";

import {
  aggregateThemes,
  describeTheme,
  themeKey,
  themeWeight,
  type ClassifiedReview,
} from "../themes";

/**
 * Theme aggregation.
 *
 * The failure this guards against is subtle and would look like a working
 * product: rank by mention count and the app with the most reviews wins every
 * row, so the tool reports the loudest app's complaints as the market's gaps.
 * Nothing errors, the page fills up, and the output is worthless.
 */

function review(
  marketAppId: string,
  rating: number,
  themes: { kind: "MISSING_FEATURE" | "DEFECT" | "MONETISATION" | "CHURN_REASON"; label: string }[],
  reviewId = `${marketAppId}-${Math.random().toString(36).slice(2, 8)}`,
): ClassifiedReview {
  return { reviewId, marketAppId, rating, themes };
}

describe("themeKey", () => {
  it("collapses casing and spacing into one finding", () => {
    // Otherwise the same gap splits into three rows, each below the threshold,
    // and the strongest signal in the niche vanishes.
    expect(themeKey("MISSING_FEATURE", "No Offline Mode")).toBe(
      themeKey("MISSING_FEATURE", "no offline  mode"),
    );
  });

  it("keeps different kinds apart even with the same words", () => {
    expect(themeKey("DEFECT", "sync")).not.toBe(themeKey("MISSING_FEATURE", "sync"));
  });
});

describe("themeWeight", () => {
  it("rewards breadth faster than linearly", () => {
    // A gap is defined by being shared. Five apps must count for much more than
    // twice what two apps does, or one app's mention pile beats a real pattern.
    const two = themeWeight(2, 3);
    const five = themeWeight(5, 3);

    expect(five).toBeGreaterThan(two * 2);
  });

  it("weights an angry theme above a wishful one", () => {
    expect(themeWeight(3, 1.2)).toBeGreaterThan(themeWeight(3, 4.6));
  });

  it("never zeroes a theme raised in positive reviews", () => {
    // A feature request inside a five-star review is still a signal.
    expect(themeWeight(3, 5)).toBeGreaterThan(0);
  });
});

describe("aggregateThemes", () => {
  it("ranks a theme shared across apps above one app's pile of complaints", () => {
    // The whole point. Twelve mentions about one app versus three mentions
    // spread across three apps — the second is the market finding.
    const reviews: ClassifiedReview[] = [
      ...Array.from({ length: 12 }, () =>
        review("app-1", 2, [{ kind: "DEFECT", label: "crashes on launch" }]),
      ),
      review("app-1", 2, [{ kind: "MISSING_FEATURE", label: "no offline mode" }]),
      review("app-2", 2, [{ kind: "MISSING_FEATURE", label: "no offline mode" }]),
      review("app-3", 2, [{ kind: "MISSING_FEATURE", label: "no offline mode" }]),
    ];

    const themes = aggregateThemes(reviews);

    expect(themes[0]?.label).toBe("no offline mode");
    expect(themes[0]?.appCount).toBe(3);
  });

  it("drops a theme only one app carries", () => {
    const themes = aggregateThemes([
      review("app-1", 1, [{ kind: "DEFECT", label: "crashes" }]),
      review("app-1", 1, [{ kind: "DEFECT", label: "crashes" }]),
    ]);

    expect(themes).toHaveLength(0);
  });

  it("counts a theme once per review however often it is repeated", () => {
    // Otherwise one rambling reviewer outweighs an entire app's users.
    const themes = aggregateThemes([
      review("app-1", 2, [
        { kind: "MISSING_FEATURE", label: "no widget" },
        { kind: "MISSING_FEATURE", label: "No Widget" },
      ]),
      review("app-2", 2, [{ kind: "MISSING_FEATURE", label: "no widget" }]),
    ]);

    expect(themes[0]?.mentionCount).toBe(2);
    expect(themes[0]?.appCount).toBe(2);
  });

  it("leads its evidence with the angriest review", () => {
    const themes = aggregateThemes([
      review("app-1", 5, [{ kind: "MONETISATION", label: "too many ads" }], "calm"),
      review("app-2", 1, [{ kind: "MONETISATION", label: "too many ads" }], "furious"),
    ]);

    expect(themes[0]?.evidenceIds[0]).toBe("furious");
  });

  it("always carries evidence, so a theme can show its receipts", () => {
    const themes = aggregateThemes([
      review("app-1", 2, [{ kind: "DEFECT", label: "sync fails" }]),
      review("app-2", 3, [{ kind: "DEFECT", label: "sync fails" }]),
    ]);

    expect(themes[0]?.evidenceIds.length).toBeGreaterThan(0);
  });

  it("caps evidence so one huge theme cannot bloat a row", () => {
    const reviews = Array.from({ length: 40 }, (_, i) =>
      review(`app-${i % 6}`, 1, [{ kind: "DEFECT", label: "battery drain" }]),
    );

    expect(aggregateThemes(reviews, { maxEvidence: 5 })[0]?.evidenceIds).toHaveLength(5);
  });

  it("returns nothing for reviews with no themes at all", () => {
    expect(aggregateThemes([review("app-1", 4, [])])).toEqual([]);
  });

  it("respects a raised bar for a crowded niche", () => {
    const reviews = [
      review("app-1", 2, [{ kind: "DEFECT", label: "slow" }]),
      review("app-2", 2, [{ kind: "DEFECT", label: "slow" }]),
    ];

    expect(aggregateThemes(reviews, { minApps: 2 })).toHaveLength(1);
    expect(aggregateThemes(reviews, { minApps: 3 })).toHaveLength(0);
  });
});

describe("describeTheme", () => {
  it("states the sample the theme came from", () => {
    const [theme] = aggregateThemes([
      review("app-1", 1, [{ kind: "DEFECT", label: "sync fails" }]),
      review("app-2", 3, [{ kind: "DEFECT", label: "sync fails" }]),
    ]);

    const line = describeTheme(theme!, 10);

    expect(line).toContain("2 reviews");
    expect(line).toContain("2 of 10 apps");
    expect(line).toContain("2.0 stars");
  });
});
