import type { StoreListing } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { diffListings } from "@/server/aso/impact";

function listing(overrides: Partial<StoreListing> = {}): StoreListing {
  return {
    id: "listing_1",
    appId: "app_1",
    locale: "en-US",
    country: "us",
    capturedAt: new Date("2026-01-01T00:00:00Z"),
    title: "Habitly",
    subtitle: "Build better habits",
    keywordField: "habit,routine",
    shortDescription: null,
    fullDescription: "Long description.",
    promotionalText: null,
    whatsNew: null,
    version: "1.0.0",
    screenshotCount: 4,
    hasVideo: false,
    iconUrl: null,
    ratingAverage: 4.4,
    ratingCount: 100,
    price: null,
    contentRating: null,
    contentHash: "hash",
    ...overrides,
  } as StoreListing;
}

describe("diffListings", () => {
  it("returns nothing when the indexed text is identical", () => {
    expect(diffListings(listing(), listing())).toEqual([]);
  });

  it("reports the character delta on text fields", () => {
    const diffs = diffListings(
      listing({ title: "Habitly" }),
      listing({ title: "Habitly: Habit Tracker" }),
    );

    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toMatchObject({
      field: "title",
      before: "Habitly",
      after: "Habitly: Habit Tracker",
      delta: 15,
      isCosmetic: false,
    });
  });

  it("counts screenshots rather than characters", () => {
    const diffs = diffListings(listing({ screenshotCount: 4 }), listing({ screenshotCount: 6 }));
    expect(diffs[0]).toMatchObject({ field: "screenshotCount", delta: 2 });
  });

  it("marks a version bump as cosmetic so a release is not read as an experiment", () => {
    const diffs = diffListings(listing({ version: "1.0.0" }), listing({ version: "1.1.0" }));
    expect(diffs).toHaveLength(1);
    expect(diffs[0]?.isCosmetic).toBe(true);
  });

  it("treats an ASO edit as non-cosmetic", () => {
    const diffs = diffListings(
      listing({ keywordField: "habit,routine" }),
      listing({ keywordField: "habit,routine,streak,daily" }),
    );
    expect(diffs[0]?.isCosmetic).toBe(false);
  });

  it("handles a field going from empty to set", () => {
    const diffs = diffListings(listing({ subtitle: null }), listing({ subtitle: "Track streaks" }));
    expect(diffs[0]).toMatchObject({ before: null, after: "Track streaks", delta: 13 });
  });

  it("renders booleans readably instead of as true/false", () => {
    const diffs = diffListings(listing({ hasVideo: false }), listing({ hasVideo: true }));
    expect(diffs[0]).toMatchObject({ field: "hasVideo", before: "no", after: "yes", delta: null });
  });

  it("reports every changed field at once", () => {
    const diffs = diffListings(
      listing(),
      listing({ title: "New", subtitle: "Also new", screenshotCount: 8 }),
    );
    expect(diffs.map((d) => d.field).sort()).toEqual(["screenshotCount", "subtitle", "title"]);
  });

  it("ignores fields that do not affect the listing", () => {
    // Rating movement is not a metadata change the developer made.
    const diffs = diffListings(listing({ ratingAverage: 4.4 }), listing({ ratingAverage: 4.9 }));
    expect(diffs).toEqual([]);
  });
});
