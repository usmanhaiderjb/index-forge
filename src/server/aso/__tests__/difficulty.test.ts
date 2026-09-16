import { describe, expect, it } from "vitest";

import { estimateDifficulty, topRatingCount } from "../difficulty";
import type { AsoSearchResult } from "../types";

/**
 * The difficulty model.
 *
 * It is a model, not a measurement — no store publishes keyword difficulty —
 * so what these tests protect is that it stays *ordered* and *bounded*. A
 * corpus of hundreds of thousands of scored terms is only useful if a higher
 * number reliably means a harder term, and a model that quietly returns 0 or
 * 140 for an edge case puts a wrong number on a screen without failing.
 */

function result(position: number, ratingCount: number, ratingAverage = 4.5): AsoSearchResult {
  return { position, storeId: `app${position}`, name: `App ${position}`, ratingCount, ratingAverage };
}

function results(count: number, ratingCount: number, ratingAverage = 4.5): AsoSearchResult[] {
  return Array.from({ length: count }, (_, i) => result(i + 1, ratingCount, ratingAverage));
}

describe("estimateDifficulty", () => {
  it("returns zero for a term nothing ranks for", () => {
    expect(estimateDifficulty([])).toBe(0);
  });

  it("scores a wall of million-rating incumbents above a field of unknowns", () => {
    const giants = estimateDifficulty(results(50, 2_000_000));
    const unknowns = estimateDifficulty(results(50, 12));

    expect(giants).toBeGreaterThan(unknowns);
  });

  it("scores a shallow result set below a deep one with the same incumbents", () => {
    // Few competitors is itself an opening, whoever they are.
    const shallow = estimateDifficulty(results(5, 100_000));
    const deep = estimateDifficulty(results(50, 100_000));

    expect(shallow).toBeLessThan(deep);
  });

  it("treats a well-rated incumbent as harder than a poorly rated one", () => {
    const loved = estimateDifficulty(results(20, 50_000, 4.9));
    const tolerated = estimateDifficulty(results(20, 50_000, 3.1));

    expect(loved).toBeGreaterThan(tolerated);
  });

  it("stays inside 0-100 at both extremes", () => {
    const absurd = estimateDifficulty(results(200, 500_000_000, 5));
    const empty = estimateDifficulty(results(1, 0, 0));

    expect(absurd).toBeLessThanOrEqual(100);
    expect(empty).toBeGreaterThanOrEqual(0);
  });

  it("only weighs the top ten, since nobody scrolls past them", () => {
    const topTenOnly = results(10, 1_000_000);
    const withWeakTail = [...topTenOnly, ...results(10, 5).map((r, i) => result(11 + i, 5))];

    // The tail changes result depth, so allow for that and compare the shape:
    // adding weak apps below rank ten must not make the term look easier to
    // break into than it was.
    expect(estimateDifficulty(withWeakTail)).toBeGreaterThanOrEqual(
      estimateDifficulty(topTenOnly),
    );
  });

  it("handles results with no ratings at all rather than returning NaN", () => {
    const unrated: AsoSearchResult[] = [{ position: 1, storeId: "a", name: "A" }];

    expect(Number.isFinite(estimateDifficulty(unrated))).toBe(true);
  });
});

describe("topRatingCount", () => {
  it("sums the top ten only", () => {
    expect(topRatingCount(results(20, 100))).toBe(1000);
  });

  it("counts a missing rating count as zero", () => {
    expect(topRatingCount([{ position: 1, storeId: "a", name: "A" }])).toBe(0);
  });
});
