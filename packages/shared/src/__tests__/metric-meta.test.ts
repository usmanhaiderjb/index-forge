import { MetricKey } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { METRIC_META } from "@aso/shared";

describe("METRIC_META", () => {
  it("describes every metric", () => {
    const missing = Object.values(MetricKey).filter((m) => !METRIC_META[m]);
    expect(missing, `metrics without metadata: ${missing.join(", ")}`).toEqual([]);
  });

  it("gives every metric a distinct label", () => {
    // Two metrics sharing a label are indistinguishable in a chart legend or a
    // CSV header. PAID_CLICKS and AD_CLICKS are the near miss here: one is what
    // we pay for, the other is what we earn from.
    const labels = Object.values(MetricKey).map((m) => METRIC_META[m].label);
    const duplicates = labels.filter((label, i) => labels.indexOf(label) !== i);
    expect(duplicates, `duplicate metric labels: ${duplicates.join(", ")}`).toEqual([]);
  });

  it("averages every rate and ratio rather than summing it", () => {
    // Summing a per-day rate produces a number with no meaning — 30 days of a
    // 40% conversion rate is not 1200%.
    for (const metric of Object.values(MetricKey)) {
      const meta = METRIC_META[metric];
      if (meta.unit !== "percent") continue;
      expect(meta.aggregation, `${metric} is a percent but sums`).toBe("average");
    }
  });

  it("averages the cost-per metrics", () => {
    for (const metric of [MetricKey.CPI, MetricKey.CPC, MetricKey.AD_ECPM] as const) {
      expect(METRIC_META[metric].aggregation, `${metric} sums`).toBe("average");
    }
  });

  it("sums the count and money metrics", () => {
    for (const metric of [
      MetricKey.INSTALLS,
      MetricKey.PAID_INSTALLS,
      MetricKey.ORGANIC_INSTALLS,
      MetricKey.PAID_CLICKS,
      MetricKey.SPEND,
      MetricKey.AD_REVENUE,
      MetricKey.TOTAL_REVENUE,
    ] as const) {
      expect(METRIC_META[metric].aggregation, `${metric} averages`).toBe("sum");
    }
  });
});
