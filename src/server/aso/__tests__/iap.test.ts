import { describe, expect, it } from "vitest";

import { calculatePppMatrix } from "../builtin/iap";

describe("In-App Purchase & Pricing Parity Engine", () => {
  it("calculates Purchasing Power Parity (PPP) matrix for a standard $39.99 subscription", () => {
    const matrix = calculatePppMatrix(39.99);

    expect(matrix.length).toBeGreaterThanOrEqual(14);

    const us = matrix.find((m) => m.country === "us");
    expect(us).toBeDefined();
    expect(us?.suggestedPriceLocal).toBe(39.99);
    expect(us?.tier).toBe("TIER_1_PREMIUM");

    const inMarket = matrix.find((m) => m.country === "in");
    expect(inMarket).toBeDefined();
    expect(inMarket?.currency).toBe("INR");
    expect(inMarket?.tier).toBe("TIER_3_EMERGING");
    expect(inMarket?.suggestedPriceLocal).toBeGreaterThan(0);

    const brMarket = matrix.find((m) => m.country === "br");
    expect(brMarket).toBeDefined();
    expect(brMarket?.currency).toBe("BRL");
    expect(brMarket?.purchasingPowerRatio).toBeLessThan(0.6);
  });

  it("handles low and high boundary prices safely without negative values", () => {
    const low = calculatePppMatrix(0.99);
    expect(low.every((m) => m.suggestedPriceLocal > 0)).toBe(true);

    const high = calculatePppMatrix(199.99);
    expect(high.every((m) => m.suggestedPriceLocal > 0)).toBe(true);
  });
});
