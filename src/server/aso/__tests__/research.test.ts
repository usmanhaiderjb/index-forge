import { describe, expect, it } from "vitest";

import {
  describeEstimate,
  escapeLike,
  marketFactor,
  normalizeQuery,
  opportunity,
  verdict,
} from "../research";

/**
 * The research screen's pure logic.
 *
 * Two of these matter more than they look. `escapeLike` decides whether a
 * search does what the person asked, and `opportunity` decides the order of the
 * page — a corpus of hundreds of thousands of terms is only usable if the first
 * fifty rows are the right fifty.
 */

describe("opportunity", () => {
  it("rewards demand and punishes a contested field", () => {
    expect(opportunity(80, 10)).toBeGreaterThan(opportunity(80, 70));
  });

  it("ranks a high-demand easy term above a low-demand easy one", () => {
    expect(opportunity(90, 20)).toBeGreaterThan(opportunity(30, 20));
  });

  it("treats an unscored term as averagely contested, not as free", () => {
    // Ranking unscored terms first would put the corpus's least examined rows
    // at the top of the page, which is exactly backwards.
    expect(opportunity(80, null)).toBeLessThan(opportunity(80, 0));
    expect(opportunity(80, null)).toBeGreaterThan(opportunity(80, 100));
  });

  it("keeps something on the table for a maximally contested term", () => {
    // The divisor is 130 rather than 100 for this reason: a term everyone
    // fights over is still worth knowing about.
    expect(opportunity(100, 100)).toBeGreaterThan(0);
  });

  it("returns zero when there is no demand signal at all", () => {
    expect(opportunity(null, 10)).toBe(0);
  });

  it("ranks a well-evidenced term above a perfect score seen once", () => {
    // The defect this fixes: the first research page opened on "gk gs masti"
    // and "dchb 2027" — obscure names that were the only suggestion for a rare
    // two-letter prefix, so they scored a perfect 100 from one observation.
    const seenOnce = opportunity(100, 5, "LOW");
    const seenOften = opportunity(70, 5, "HIGH");

    expect(seenOften).toBeGreaterThan(seenOnce);
  });

  it("orders the confidence discount the way the evidence runs", () => {
    expect(opportunity(80, 20, "HIGH")).toBeGreaterThan(opportunity(80, 20, "MEDIUM"));
    expect(opportunity(80, 20, "MEDIUM")).toBeGreaterThan(opportunity(80, 20, "LOW"));
  });

  it("stays within 0-100", () => {
    expect(opportunity(100, 0)).toBeLessThanOrEqual(100);
    expect(opportunity(0, 100)).toBeGreaterThanOrEqual(0);
  });
});

describe("marketFactor", () => {
  it("scores a term nothing ranks for as zero", () => {
    // "dfq th" returned zero apps, so the difficulty model called it easy and
    // it floated to the top of the research page. Nothing ranking for a term
    // is not an open goal, it is a dead term.
    expect(marketFactor(0)).toBe(0);
  });

  it("discounts a thin result set without erasing it", () => {
    expect(marketFactor(3)).toBeGreaterThan(0);
    expect(marketFactor(3)).toBeLessThan(1);
  });

  it("stops discounting once the market is real", () => {
    expect(marketFactor(10)).toBe(1);
    expect(marketFactor(500)).toBe(1);
  });

  it("leaves an unscored term alone rather than assuming an empty market", () => {
    expect(marketFactor(null)).toBe(1);
  });
});

describe("opportunity with market size", () => {
  it("refuses to call a term with no results an opportunity", () => {
    expect(opportunity(100, 0, "HIGH", 0)).toBe(0);
  });

  it("ranks a real market above a near-empty one at equal demand", () => {
    expect(opportunity(90, 20, "HIGH", 40)).toBeGreaterThan(
      opportunity(90, 20, "HIGH", 2),
    );
  });

  it("does not penalise a term that has never been scored", () => {
    expect(opportunity(90, null, "HIGH", null)).toBeGreaterThan(0);
  });
});

describe("verdict", () => {
  it("separates easy, contested and hard", () => {
    expect(verdict(10)).toBe("easy");
    expect(verdict(45)).toBe("contested");
    expect(verdict(85)).toBe("hard");
  });

  it("says unknown rather than easy for an unscored term", () => {
    // "Easy" for something nobody measured would be an invented claim.
    expect(verdict(null)).toBe("unknown");
  });
});

describe("normalizeQuery", () => {
  it("matches how terms are stored, or a search finds nothing", () => {
    expect(normalizeQuery("  Habit   Tracker ")).toBe("habit tracker");
  });
});

describe("escapeLike", () => {
  it("escapes the wildcards, so a search means what was typed", () => {
    // Unescaped, "100%" matches every term in the corpus.
    expect(escapeLike("100%")).toBe("100\\%");
    expect(escapeLike("a_b")).toBe("a\\_b");
  });

  it("escapes the escape character itself", () => {
    expect(escapeLike("a\\b")).toBe("a\\\\b");
  });

  it("leaves an ordinary term alone", () => {
    expect(escapeLike("habit tracker")).toBe("habit tracker");
  });
});

describe("describeEstimate", () => {
  it("never calls an inference a measurement", () => {
    const estimated = describeEstimate("ESTIMATED", "autocomplete rank across 4 prefixes");

    expect(estimated).toContain("Estimated");
    expect(estimated).toContain("not a monthly figure");
  });

  it("says measured only when it is", () => {
    expect(describeEstimate("MEASURED", "Search Ads impressions")).toContain("Measured");
  });
});
