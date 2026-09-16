import { describe, expect, it } from "vitest";

import { estimateDifficulty } from "@/server/aso/difficulty";
import type { AsoSearchResult } from "@/server/aso/types";

const app = (over: Partial<AsoSearchResult>): AsoSearchResult => ({
  position: 1,
  storeId: "com.example",
  name: "Example",
  ...over,
});

/**
 * Play publishes no rating counts in search results.
 *
 * Treating that absence as "zero ratings" scored every Android term from
 * result count alone: 23,679 rows, all in the 0-10 band, none carrying any
 * information about the term they described.
 */
describe("estimateDifficulty without rating volume", () => {
  const strong = Array.from({ length: 10 }, (_, i) =>
    app({ position: i + 1, storeId: `com.strong${i}`, ratingAverage: 4.8 }),
  );
  const weak = Array.from({ length: 10 }, (_, i) =>
    app({ position: i + 1, storeId: `com.weak${i}`, ratingAverage: 3.2 }),
  );

  it("separates strong from weak incumbents on star ratings alone", () => {
    const hard = estimateDifficulty(strong);
    const easy = estimateDifficulty(weak);

    expect(hard).toBeGreaterThan(easy);
    // The old weighting compressed every result into a single low band.
    expect(hard).toBeGreaterThan(10);
  });

  it("still uses volume when the store does publish it", () => {
    const withVolume = strong.map((r) => ({ ...r, ratingCount: 2_000_000 }));

    expect(estimateDifficulty(withVolume)).toBeGreaterThan(estimateDifficulty(strong));
  });

  it("returns 0 for a term with no results at all", () => {
    expect(estimateDifficulty([])).toBe(0);
  });
});
