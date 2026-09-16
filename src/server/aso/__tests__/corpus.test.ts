import { describe, expect, it } from "vitest";

import {
  confidenceFor,
  directPrefixes,
  isUsefulTerm,
  normalizeTerm,
  prefixes,
  rankScore,
  wonAgainst,
} from "../corpus";

/**
 * The corpus crawler's pure logic.
 *
 * These cover normalisation, filtering and the rank-to-score curve — the parts
 * that decide what the keyword database contains and how it orders itself. A
 * mistake here does not throw; it quietly produces a corpus full of noise, or an
 * index that ranks terms in the wrong order, and both look fine on a chart.
 */

describe("normalizeTerm", () => {
  it("collapses the variants that would otherwise become separate rows", () => {
    expect(normalizeTerm("  Habit  Tracker ")).toBe("habit tracker");
    expect(normalizeTerm("HABIT TRACKER")).toBe("habit tracker");
    expect(normalizeTerm("habit\ttracker")).toBe("habit tracker");
  });

  it("is idempotent", () => {
    const once = normalizeTerm("  Daily   Routine  ");
    expect(normalizeTerm(once)).toBe(once);
  });
});

describe("isUsefulTerm", () => {
  it("keeps real search terms", () => {
    for (const term of ["habit tracker", "budget", "daily routine planner"]) {
      expect(isUsefulTerm(term), term).toBe(true);
    }
  });

  it("drops what autocomplete returns alongside real terms", () => {
    // A single letter is the prefix echoed back, not a search.
    expect(isUsefulTerm("a")).toBe(false);
    // Pure digits and punctuation are not searches someone typed.
    expect(isUsefulTerm("12345")).toBe(false);
    expect(isUsefulTerm("!!!")).toBe(false);
    // Five or more words is a sentence, usually a scraped description fragment.
    expect(isUsefulTerm("the best habit tracker app ever")).toBe(false);
    // Absurdly long strings are junk from a malformed response.
    expect(isUsefulTerm("x".repeat(80))).toBe(false);
  });

  it("keeps a four-word term but not a five-word one", () => {
    expect(isUsefulTerm("best daily habit tracker")).toBe(true);
    expect(isUsefulTerm("best daily habit tracker app")).toBe(false);
  });
});

describe("rankScore", () => {
  it("scores the store's first suggestion highest", () => {
    expect(rankScore(0, 10)).toBe(100);
  });

  it("scores the last suggestion at zero", () => {
    expect(rankScore(9, 10)).toBe(0);
  });

  it("falls off steeply, the way search demand actually distributes", () => {
    // The gap between first and second must exceed the gap between eighth and
    // ninth. A linear curve would treat them as equal, which would flatten the
    // head of the distribution into the tail.
    const topGap = rankScore(0, 10) - rankScore(1, 10);
    const tailGap = rankScore(7, 10) - rankScore(8, 10);
    expect(topGap).toBeGreaterThan(tailGap);
  });

  it("is monotonic — a later suggestion never outscores an earlier one", () => {
    for (let i = 1; i < 10; i++) {
      expect(rankScore(i, 10)).toBeLessThanOrEqual(rankScore(i - 1, 10));
    }
  });

  it("handles a single-suggestion list without dividing by zero", () => {
    expect(rankScore(0, 1)).toBe(100);
    expect(Number.isFinite(rankScore(0, 1))).toBe(true);
  });

  it("returns zero for an empty list rather than NaN", () => {
    expect(rankScore(0, 0)).toBe(0);
  });

  it("clamps a rank beyond the list length", () => {
    expect(rankScore(99, 10)).toBe(0);
  });
});

describe("prefixes", () => {
  it("walks two letters by default, which is where the long tail lives", () => {
    const two = prefixes();
    expect(two).toHaveLength(26 * 26);
    expect(two[0]).toBe("aa");
    expect(two.at(-1)).toBe("zz");
  });

  it("can walk single letters for a cheap sweep", () => {
    expect(prefixes(1)).toHaveLength(26);
  });

  it("produces no duplicates", () => {
    const all = prefixes();
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("directPrefixes", () => {
  it("keeps only prefixes the term actually begins with", () => {
    // Store autocomplete is fuzzy: "b-isolar" came back for "b js" and "b us",
    // queries it does not begin with. Eight of its nine prefixes were the
    // engine reaching, not nine people searching.
    const direct = directPrefixes("b-isolar", ["b is", "b js", "b ks", "b us"]);

    expect(direct).toEqual(["b is"]);
  });

  it("ignores spaces and punctuation on both sides", () => {
    // The crawl expands into "b is" and "b-is"; the store treats them alike.
    expect(directPrefixes("b-isolar", ["b-is"])).toEqual(["b-is"]);
  });

  it("returns the shortest prefix first", () => {
    expect(directPrefixes("facebook", ["fac", "f", "fa"])[0]).toBe("f");
  });

  it("returns nothing when no prefix matches", () => {
    expect(directPrefixes("netflix", ["zz", "qq"])).toEqual([]);
  });
});

/**
 * Letter-space sizes measured from the real 200,000-term corpus. The contrast
 * is the whole point: "fa" and "zr" are both two letters, and winning them is
 * not remotely the same achievement.
 */
const SPACES = new Map<string, number>([
  ["f", 22644],
  ["fa", 1096],
  ["gm", 1016],
  ["ne", 412],
  ["lu", 123],
  ["zh", 64],
  ["zr", 46],
  ["gzj", 3],
]);

describe("wonAgainst", () => {
  it("reports the largest field the term beat", () => {
    expect(wonAgainst("facebook", ["fa", "f"], SPACES)).toBe(22644);
  });

  it("ignores prefixes the term does not begin with", () => {
    // Fuzzy autocomplete matches are not wins.
    expect(wonAgainst("zr cheaper", ["fa"], SPACES)).toBe(0);
  });

  it("ignores prefixes long enough that nothing competes", () => {
    expect(wonAgainst("gzj-u2pro", ["gzj u2"], SPACES)).toBe(0);
  });
});

describe("confidenceFor", () => {
  it("trusts a term that leads a crowded letter-space", () => {
    // "facebook" is the top suggestion for "f", ahead of 22,644 others.
    expect(confidenceFor("facebook", ["f", "fa"], 1, SPACES)).toBe("HIGH");
  });

  it("does not trust a term that leads an empty one", () => {
    // "zr cheaper" beat forty-six terms. Two letters, but no contest — this is
    // the case that survived the two previous versions of this rule.
    expect(confidenceFor("zr cheaper", ["zr"], 1, SPACES)).toBe("LOW");
  });

  it("rates a moderately contested space in between", () => {
    expect(confidenceFor("netflix", ["ne"], 1, SPACES)).toBe("MEDIUM");
  });

  it("distrusts a term whose prefixes were all fuzzy matches", () => {
    expect(confidenceFor("b-isolar", ["b js", "b ks", "b us"], 1, SPACES)).toBe("LOW");
  });

  it("lifts a verdict when both stores agree", () => {
    expect(confidenceFor("netflix", ["ne"], 2, SPACES)).toBe("HIGH");
  });

  it("cannot lift a term that won nothing", () => {
    // Corroboration of a non-observation is still nothing.
    expect(confidenceFor("zr cheaper", ["qq"], 2, SPACES)).toBe("LOW");
  });
});
