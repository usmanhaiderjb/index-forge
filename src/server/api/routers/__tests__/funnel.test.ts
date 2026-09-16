import { describe, expect, it } from "vitest";

import { conversionRate, isTrafficSource, normalizeTrafficSource } from "@aso/shared";
import { parseDimension } from "@aso/shared";

/**
 * The arithmetic the `metrics.funnel` procedure performs.
 *
 * These are pure-function tests of the rules the procedure follows rather than
 * a test of the procedure itself, which would need a database. The rules are
 * where the bugs live: every one of these has a plausible wrong implementation
 * that would still render a chart.
 */

type Row = { metric: string; dimension: string; value: number };

/** Mirrors the bucketing in the procedure. */
function bucket(rows: Row[]) {
  const buckets = new Map<
    string,
    { impressions: number | null; pageViews: number | null; installs: number | null }
  >();

  for (const row of rows) {
    const raw = parseDimension(row.dimension).source;
    if (!raw || !isTrafficSource(raw)) continue;

    const b = buckets.get(raw) ?? { impressions: null, pageViews: null, installs: null };
    if (row.metric === "IMPRESSIONS") b.impressions = (b.impressions ?? 0) + row.value;
    if (row.metric === "STORE_PAGE_VIEWS") b.pageViews = (b.pageViews ?? 0) + row.value;
    if (row.metric === "INSTALLS") b.installs = (b.installs ?? 0) + row.value;
    buckets.set(raw, b);
  }
  return buckets;
}

describe("funnel bucketing", () => {
  it("sums daily rows per source before computing any rate", () => {
    // The whole reason the procedure exists. Day one converts at 1%, day two at
    // 90%. The window rate is 10/110 = 9.09%, not the 45.5% mean of the two.
    const rows: Row[] = [
      { metric: "STORE_PAGE_VIEWS", dimension: "source=search", value: 100 },
      { metric: "INSTALLS", dimension: "source=search", value: 1 },
      { metric: "STORE_PAGE_VIEWS", dimension: "source=search", value: 10 },
      { metric: "INSTALLS", dimension: "source=search", value: 9 },
    ];

    const b = bucket(rows).get("search")!;
    expect(b.pageViews).toBe(110);
    expect(b.installs).toBe(10);
    expect(conversionRate(b.installs!, b.pageViews!)).toBe(9.09);

    const meanOfDailyRates = (1 + 90) / 2;
    expect(conversionRate(b.installs!, b.pageViews!)).not.toBe(meanOfDailyRates);
  });

  it("keeps sources separate", () => {
    const rows: Row[] = [
      { metric: "STORE_PAGE_VIEWS", dimension: "source=search", value: 100 },
      { metric: "INSTALLS", dimension: "source=search", value: 30 },
      { metric: "STORE_PAGE_VIEWS", dimension: "source=browse", value: 100 },
      { metric: "INSTALLS", dimension: "source=browse", value: 10 },
    ];

    const buckets = bucket(rows);
    expect(conversionRate(buckets.get("search")!.installs!, 100)).toBe(30);
    expect(conversionRate(buckets.get("browse")!.installs!, 100)).toBe(10);
  });

  it("ignores rows filed under other dimension keys", () => {
    // Country rows carry the same installs sliced a different way. Counting
    // them here would double every total.
    const rows: Row[] = [
      { metric: "INSTALLS", dimension: "source=search", value: 30 },
      { metric: "INSTALLS", dimension: "country=us", value: 999 },
      { metric: "INSTALLS", dimension: "", value: 999 },
    ];

    const buckets = bucket(rows);
    expect(buckets.size).toBe(1);
    expect(buckets.get("search")!.installs).toBe(30);
  });

  it("drops rows filed under an unknown source rather than miscounting them", () => {
    const rows: Row[] = [
      { metric: "INSTALLS", dimension: "source=search", value: 30 },
      { metric: "INSTALLS", dimension: "source=teleportation", value: 500 },
    ];

    const buckets = bucket(rows);
    expect(buckets.has("search")).toBe(true);
    expect(buckets.size).toBe(1);
  });

  it("distinguishes a source with no data from a source with zero", () => {
    // A source absent from the report is unknown; a source reporting zero
    // installs converted at 0%. Rendering both as 0% loses that.
    const rows: Row[] = [{ metric: "STORE_PAGE_VIEWS", dimension: "source=browse", value: 500 }];

    const b = bucket(rows).get("browse")!;
    expect(b.pageViews).toBe(500);
    expect(b.installs).toBeNull();
    expect(conversionRate(b.installs ?? 0, b.pageViews!)).toBe(0);

    expect(bucket(rows).has("search")).toBe(false);
  });

  it("reports an unknown rate when the denominator is missing", () => {
    const rows: Row[] = [{ metric: "INSTALLS", dimension: "source=referral", value: 40 }];
    const b = bucket(rows).get("referral")!;

    // 40 installs from an unknown number of views is not a 0% or 100% rate.
    expect(conversionRate(b.installs!, b.pageViews ?? 0)).toBeNull();
  });
});

describe("provider vocabulary reaches the right bucket", () => {
  it("routes both stores' wording into the same four buckets", () => {
    const apple = ["App Store Search", "App Store Browse", "Web Referrer", "Unavailable"];
    const google = ["Play Store search", "Explore", "Third-party referrers", "Other"];

    expect(apple.map(normalizeTrafficSource)).toEqual([
      "search",
      "browse",
      "referral",
      "other",
    ]);
    expect(google.map(normalizeTrafficSource)).toEqual([
      "search",
      "browse",
      "referral",
      "other",
    ]);
  });
});
