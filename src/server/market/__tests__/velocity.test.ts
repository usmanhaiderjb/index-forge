import { describe, expect, it } from "vitest";

import {
  daysBetween,
  describeVelocity,
  isNew,
  lifetimeVelocity,
  recentVelocity,
  risingScore,
  velocityConfidence,
} from "../velocity";

/**
 * Rating velocity.
 *
 * Two silent failures are guarded here. One is a rating reset rendering as
 * enormous negative growth — arithmetic applied to an event that did not
 * happen. The other is a three-day-old app with thirty ratings computing to
 * 10/day and topping a "fastest growing" list, which looks like a discovery and
 * is noise.
 */

const NOW = new Date("2026-08-27T12:00:00Z");
const days = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

describe("daysBetween", () => {
  it("floors at one day so nothing divides by zero", () => {
    expect(daysBetween(NOW, NOW)).toBe(1);
  });
});

describe("lifetimeVelocity", () => {
  it("computes from a single observation", () => {
    // The whole reason a rising-apps view can ship before any history exists.
    const velocity = lifetimeVelocity({ ratingCount: 45_000, releasedAt: days(90), now: NOW });

    expect(velocity?.ratingsPerDay).toBe(500);
    expect(velocity?.basis).toBe("LIFETIME");
  });

  it("returns null without a release date", () => {
    expect(lifetimeVelocity({ ratingCount: 1000, releasedAt: null, now: NOW })).toBeNull();
  });

  it("returns null without a rating count", () => {
    expect(lifetimeVelocity({ ratingCount: null, releasedAt: days(30), now: NOW })).toBeNull();
  });

  it("rejects a release date in the future", () => {
    // Bad store data, not a zero-day-old app.
    expect(
      lifetimeVelocity({ ratingCount: 500, releasedAt: new Date(NOW.getTime() + 86_400_000), now: NOW }),
    ).toBeNull();
  });
});

describe("recentVelocity", () => {
  it("measures momentum between two observations", () => {
    const velocity = recentVelocity(
      { ratingCount: 10_000, capturedAt: days(7) },
      { ratingCount: 17_000, capturedAt: NOW },
    );

    expect(velocity?.ratingsPerDay).toBe(1000);
    expect(velocity?.basis).toBe("RECENT");
  });

  it("returns null when the counter went backwards", () => {
    // iOS lets an app reset its rating on a new version. Reporting that as
    // "-4,000 ratings/day" would be arithmetic on something that did not happen.
    expect(
      recentVelocity(
        { ratingCount: 50_000, capturedAt: days(7) },
        { ratingCount: 12, capturedAt: NOW },
      ),
    ).toBeNull();
  });

  it("returns null when either reading is missing", () => {
    expect(
      recentVelocity({ ratingCount: null, capturedAt: days(7) }, { ratingCount: 100, capturedAt: NOW }),
    ).toBeNull();
  });

  it("reports zero growth rather than nothing when a count is flat", () => {
    const velocity = recentVelocity(
      { ratingCount: 5000, capturedAt: days(7) },
      { ratingCount: 5000, capturedAt: NOW },
    );

    expect(velocity?.ratingsPerDay).toBe(0);
  });
});

describe("isNew", () => {
  it("accepts an app inside the window and rejects one outside", () => {
    expect(isNew(days(90), 180, NOW)).toBe(true);
    expect(isNew(days(400), 180, NOW)).toBe(false);
  });

  it("treats an unknown release date as not new", () => {
    // Absence of evidence is not evidence of newness.
    expect(isNew(null, 180, NOW)).toBe(false);
  });
});

describe("velocityConfidence", () => {
  it("distrusts a figure from a handful of days", () => {
    expect(velocityConfidence({ ratingsPerDay: 10, basis: "LIFETIME", days: 3 }, 30)).toBe("LOW");
  });

  it("distrusts a figure from a handful of ratings", () => {
    expect(velocityConfidence({ ratingsPerDay: 1, basis: "LIFETIME", days: 40 }, 40)).toBe("LOW");
  });

  it("trusts a long window with real volume", () => {
    expect(velocityConfidence({ ratingsPerDay: 200, basis: "LIFETIME", days: 200 }, 40_000)).toBe(
      "HIGH",
    );
  });
});

describe("risingScore", () => {
  it("ranks a young fast app above an old fast app", () => {
    const young = risingScore({
      velocity: { ratingsPerDay: 500, basis: "LIFETIME", days: 90 },
      ratingCount: 45_000,
      ageDays: 90,
    });
    const old = risingScore({
      velocity: { ratingsPerDay: 500, basis: "LIFETIME", days: 2000 },
      ratingCount: 1_000_000,
      ageDays: 2000,
    });

    expect(young).toBeGreaterThan(old);
  });

  it("keeps an unreliable figure off the top", () => {
    // Three days old, thirty ratings, computes to 10/day. Must not outrank a
    // well-evidenced 8/day.
    const noisy = risingScore({
      velocity: { ratingsPerDay: 10, basis: "LIFETIME", days: 3 },
      ratingCount: 30,
      ageDays: 3,
    });
    const solid = risingScore({
      velocity: { ratingsPerDay: 8, basis: "LIFETIME", days: 120 },
      ratingCount: 960,
      ageDays: 120,
    });

    expect(solid).toBeGreaterThan(noisy);
  });

  it("never returns a negative score", () => {
    expect(
      risingScore({
        velocity: { ratingsPerDay: 0, basis: "RECENT", days: 30 },
        ratingCount: 5000,
        ageDays: 90,
      }),
    ).toBeGreaterThanOrEqual(0);
  });
});

describe("describeVelocity", () => {
  it("says which measurement the reader is looking at", () => {
    // A lifetime average and a recent delta are different claims and must not
    // be presented as the same number.
    expect(describeVelocity({ ratingsPerDay: 500, basis: "LIFETIME", days: 90 })).toContain(
      "since release",
    );
    expect(describeVelocity({ ratingsPerDay: 500, basis: "RECENT", days: 7 })).toContain(
      "last 7 days",
    );
  });
});

describe("recentVelocity window floor", () => {
  it("refuses to report a daily rate from readings taken minutes apart", () => {
    // Play rounds rating counts, so a fast-growing app looks unchanged over a
    // short window. The honest answer is "not measured", never "0 per day".
    const earlier = { ratingCount: 1_580_000, capturedAt: new Date("2026-08-27T10:00:00Z") };
    const later = { ratingCount: 1_580_000, capturedAt: new Date("2026-08-27T10:20:00Z") };

    expect(recentVelocity(earlier, later)).toBeNull();
  });

  it("reports once a full day separates the readings", () => {
    const earlier = { ratingCount: 1_000, capturedAt: new Date("2026-08-26T10:00:00Z") };
    const later = { ratingCount: 1_240, capturedAt: new Date("2026-08-27T10:00:00Z") };

    expect(recentVelocity(earlier, later)?.ratingsPerDay).toBe(240);
  });
});
