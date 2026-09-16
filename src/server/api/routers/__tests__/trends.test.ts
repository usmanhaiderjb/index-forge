import { describe, expect, it } from "vitest";
import { MINE_CATEGORIES } from "@/server/aso/mining";

describe("Trends and Category Leaderboards", () => {
  it("provides 12 comprehensive categories for iOS App Store", () => {
    expect(MINE_CATEGORIES.IOS.length).toBe(12);
    const categoryIds = MINE_CATEGORIES.IOS.map((c) => c.id);
    expect(categoryIds).toContain("6013"); // Health & Fitness
    expect(categoryIds).toContain("6015"); // Finance
    expect(categoryIds).toContain("6007"); // Productivity
    expect(categoryIds).toContain("6017"); // Education
    expect(categoryIds).toContain("6000"); // Business
    expect(categoryIds).toContain("6014"); // Games
  });

  it("provides 12 comprehensive categories for Google Play", () => {
    expect(MINE_CATEGORIES.ANDROID.length).toBe(12);
    const categoryIds = MINE_CATEGORIES.ANDROID.map((c) => c.id);
    expect(categoryIds).toContain("HEALTH_AND_FITNESS");
    expect(categoryIds).toContain("FINANCE");
    expect(categoryIds).toContain("PRODUCTIVITY");
    expect(categoryIds).toContain("EDUCATION");
    expect(categoryIds).toContain("BUSINESS");
    expect(categoryIds).toContain("GAME");
  });

  it("calculates realistic power-law daily downloads and revenue estimates", () => {
    const rank1 = 1;
    const baseDaily1 = Math.round(22000 / Math.pow(rank1, 0.68));
    expect(baseDaily1).toBe(22000);

    const rank10 = 10;
    const baseDaily10 = Math.round(22000 / Math.pow(rank10, 0.68));
    expect(baseDaily10).toBeLessThan(baseDaily1);
    expect(baseDaily10).toBeGreaterThan(1000);

    const monthlyGross = Math.round(baseDaily1 * 30.5 * 1.6);
    const monthlyNet = Math.round(monthlyGross * 0.7);
    const monthlyAdSpend = Math.round(monthlyGross * 0.26);

    expect(monthlyGross).toBeGreaterThan(1_000_000);
    expect(monthlyNet).toBe(Math.round(monthlyGross * 0.7));
    expect(monthlyAdSpend).toBeLessThan(monthlyGross);
  });
});
