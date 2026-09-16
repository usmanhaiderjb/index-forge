import { MetricKey, MetricSource } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  chooseSource,
  chooseSources,
  describeSource,
  preferAuthoritativeSource,
  SOURCE_PRECEDENCE,
} from "@/server/metrics/precedence";

function row(
  metric: MetricKey,
  source: MetricSource,
  value: number,
  appId = "app_1",
) {
  return { appId, metric, source, value };
}

describe("chooseSource", () => {
  it("prefers the system that processes the money over the one observing it", () => {
    expect(
      chooseSource(MetricKey.AD_REVENUE, [MetricSource.FIREBASE, MetricSource.ADMOB]),
    ).toBe(MetricSource.ADMOB);

    expect(
      chooseSource(MetricKey.IAP_REVENUE, [
        MetricSource.FIREBASE,
        MetricSource.APP_STORE_CONNECT,
      ]),
    ).toBe(MetricSource.APP_STORE_CONNECT);
  });

  it("falls back down the order when the preferred source has no data", () => {
    expect(chooseSource(MetricKey.AD_REVENUE, [MetricSource.FIREBASE])).toBe(
      MetricSource.FIREBASE,
    );
  });

  it("prefers the store console over the scraper for ratings", () => {
    expect(
      chooseSource(MetricKey.RATING_AVERAGE, [
        MetricSource.ASO_SCRAPER,
        MetricSource.PLAY_CONSOLE,
      ]),
    ).toBe(MetricSource.PLAY_CONSOLE);
  });

  it("returns null when nothing is available", () => {
    expect(chooseSource(MetricKey.AD_REVENUE, [])).toBeNull();
  });

  it("returns null when no listed source is present", () => {
    expect(chooseSource(MetricKey.SPEND, [MetricSource.FIREBASE])).toBeNull();
  });

  it("names no single source when an additive tier has more than one contributor", () => {
    // Labelling this "Google Ads" would credit one network with the other's
    // spend, so there is deliberately no single answer to give.
    expect(
      chooseSource(MetricKey.SPEND, [
        MetricSource.GOOGLE_ADS,
        MetricSource.APPLE_SEARCH_ADS,
      ]),
    ).toBeNull();
  });
});

describe("chooseSources", () => {
  it("returns every ad network, because their spend is additive", () => {
    expect(
      chooseSources(MetricKey.SPEND, [
        MetricSource.APPLE_SEARCH_ADS,
        MetricSource.GOOGLE_ADS,
      ]),
    ).toEqual([MetricSource.GOOGLE_ADS, MetricSource.APPLE_SEARCH_ADS]);
  });

  it("returns only the higher tier when a lower one also has data", () => {
    expect(
      chooseSources(MetricKey.AD_REVENUE, [MetricSource.ADMOB, MetricSource.FIREBASE]),
    ).toEqual([MetricSource.ADMOB]);
  });

  it("skips an empty tier and uses the next one", () => {
    // No ad network connected, so store-listing impressions are all there is.
    expect(chooseSources(MetricKey.IMPRESSIONS, [MetricSource.PLAY_CONSOLE])).toEqual([
      MetricSource.PLAY_CONSOLE,
    ]);
  });
});

describe("preferAuthoritativeSource", () => {
  it("counts ad revenue once when AdMob and Firebase both report it", () => {
    // This is the bug: 100 from AdMob plus 98 from Firebase summed to 198.
    const rows = [
      row(MetricKey.AD_REVENUE, MetricSource.ADMOB, 100),
      row(MetricKey.AD_REVENUE, MetricSource.FIREBASE, 98),
    ];

    const kept = preferAuthoritativeSource(rows);

    expect(kept).toHaveLength(1);
    expect(kept[0]?.source).toBe(MetricSource.ADMOB);
    expect(kept.reduce((sum, r) => sum + r.value, 0)).toBe(100);
  });

  it("counts IAP revenue once when the store and Firebase both report it", () => {
    const kept = preferAuthoritativeSource([
      row(MetricKey.IAP_REVENUE, MetricSource.FIREBASE, 480),
      row(MetricKey.IAP_REVENUE, MetricSource.APP_STORE_CONNECT, 500),
    ]);

    expect(kept.reduce((sum, r) => sum + r.value, 0)).toBe(500);
  });

  it("keeps every day from the winning source", () => {
    const rows = [
      row(MetricKey.AD_REVENUE, MetricSource.ADMOB, 10),
      row(MetricKey.AD_REVENUE, MetricSource.ADMOB, 20),
      row(MetricKey.AD_REVENUE, MetricSource.FIREBASE, 9),
      row(MetricKey.AD_REVENUE, MetricSource.FIREBASE, 19),
    ];

    const kept = preferAuthoritativeSource(rows);
    expect(kept).toHaveLength(2);
    expect(kept.reduce((sum, r) => sum + r.value, 0)).toBe(30);
  });

  it("decides per app, since one app may have AdMob linked and another not", () => {
    const kept = preferAuthoritativeSource([
      row(MetricKey.AD_REVENUE, MetricSource.ADMOB, 100, "app_1"),
      row(MetricKey.AD_REVENUE, MetricSource.FIREBASE, 98, "app_1"),
      // app_2 has only Firebase, so its figure must survive.
      row(MetricKey.AD_REVENUE, MetricSource.FIREBASE, 55, "app_2"),
    ]);

    expect(kept).toHaveLength(2);
    expect(kept.reduce((sum, r) => sum + r.value, 0)).toBe(155);
  });

  it("does not confuse two different metrics from the same source", () => {
    const kept = preferAuthoritativeSource([
      row(MetricKey.AD_REVENUE, MetricSource.ADMOB, 100),
      row(MetricKey.AD_IMPRESSIONS, MetricSource.ADMOB, 5000),
    ]);

    expect(kept).toHaveLength(2);
  });

  it("leaves a single-source metric untouched", () => {
    const rows = [
      row(MetricKey.SESSIONS, MetricSource.FIREBASE, 10),
      row(MetricKey.SESSIONS, MetricSource.FIREBASE, 12),
    ];
    expect(preferAuthoritativeSource(rows)).toHaveLength(2);
  });

  it("keeps everything when a contested metric has no declared rule", () => {
    // Dropping data on a guess is worse than a double count that stays
    // visible, so an unlisted combination is passed through untouched.
    const unruled = Object.values(MetricKey).find((m) => !SOURCE_PRECEDENCE[m]);

    if (!unruled) {
      // Every metric currently has a rule, which is the desired end state.
      expect(SOURCE_PRECEDENCE[MetricKey.AD_REVENUE]).toBeDefined();
      return;
    }

    const kept = preferAuthoritativeSource([
      row(unruled, MetricSource.FIREBASE, 10),
      row(unruled, MetricSource.DERIVED, 11),
    ]);
    expect(kept).toHaveLength(2);
  });

  it("prefers the ads figure for spend over a derived one", () => {
    const kept = preferAuthoritativeSource([
      row(MetricKey.SPEND, MetricSource.GOOGLE_ADS, 10),
      row(MetricKey.SPEND, MetricSource.DERIVED, 11),
    ]);
    expect(kept).toHaveLength(1);
    expect(kept[0]?.source).toBe(MetricSource.GOOGLE_ADS);
  });

  it("sums spend across ad networks instead of picking one", () => {
    // The mirror of the double-count bug. Google Ads and Apple Search Ads bill
    // separately, so dropping either understates what was actually spent.
    const kept = preferAuthoritativeSource([
      row(MetricKey.SPEND, MetricSource.GOOGLE_ADS, 400),
      row(MetricKey.SPEND, MetricSource.APPLE_SEARCH_ADS, 250),
    ]);

    expect(kept).toHaveLength(2);
    expect(kept.reduce((sum, r) => sum + r.value, 0)).toBe(650);
  });

  it("sums paid installs across ad networks", () => {
    const kept = preferAuthoritativeSource([
      row(MetricKey.PAID_INSTALLS, MetricSource.GOOGLE_ADS, 120),
      row(MetricKey.PAID_INSTALLS, MetricSource.APPLE_SEARCH_ADS, 80),
    ]);

    expect(kept.reduce((sum, r) => sum + r.value, 0)).toBe(200);
  });

  it("still drops store impressions once an ad network reports campaign impressions", () => {
    // Different tiers: these measure different things and must not be summed.
    const kept = preferAuthoritativeSource([
      row(MetricKey.IMPRESSIONS, MetricSource.GOOGLE_ADS, 900),
      row(MetricKey.IMPRESSIONS, MetricSource.APPLE_SEARCH_ADS, 600),
      row(MetricKey.IMPRESSIONS, MetricSource.PLAY_CONSOLE, 5000),
    ]);

    expect(kept).toHaveLength(2);
    expect(kept.reduce((sum, r) => sum + r.value, 0)).toBe(1500);
  });

  it("handles an empty input", () => {
    expect(preferAuthoritativeSource([])).toEqual([]);
  });
});

describe("SOURCE_PRECEDENCE", () => {
  it("lists no source twice within a metric", () => {
    for (const [metric, tiers] of Object.entries(SOURCE_PRECEDENCE)) {
      const flat = (tiers ?? []).flat();
      expect(new Set(flat).size, `${metric} repeats a source`).toBe(flat.length);
    }
  });

  it("declares no empty tiers, which would silently rank nothing", () => {
    for (const [metric, tiers] of Object.entries(SOURCE_PRECEDENCE)) {
      for (const tier of tiers ?? []) {
        expect(tier.length, `${metric} has an empty tier`).toBeGreaterThan(0);
      }
    }
  });

  it("declares a rule for every metric, so nothing can double count unnoticed", () => {
    const missing = Object.values(MetricKey).filter((m) => !SOURCE_PRECEDENCE[m]);
    expect(missing, `metrics without a source rule: ${missing.join(", ")}`).toEqual([]);
  });

  it("gives every source a human label", () => {
    for (const source of Object.values(MetricSource)) {
      expect(describeSource(source)).toBeTruthy();
    }
  });
});
