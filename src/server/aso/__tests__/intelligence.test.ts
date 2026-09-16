import { describe, expect, it } from "vitest";
import { getCrossLocaleRules } from "@aso/shared";

import {
  calculateGeographicSplit,
  estimateAdCampaigns,
  estimateDownloads,
  estimateRevenue,
  compareDossiers,
} from "../builtin/intelligence";
import type { AsoAppDetail } from "../types";

describe("Market Intelligence Engine", () => {
  const sampleDetail: AsoAppDetail = {
    platform: "IOS",
    storeId: "389801252",
    name: "Calm: Sleep & Meditation",
    category: "Health & Fitness",
    developer: "Calm.com, Inc.",
    ratingCount: 1_250_000,
    ratingAverage: 4.8,
    price: 0,
  };

  it("models realistic monthly downloads from rating volume and velocity", () => {
    const downloads = estimateDownloads(sampleDetail);
    expect(downloads.monthlyDownloads).toBeGreaterThan(50_000);
    expect(downloads.dailyAverage).toBeGreaterThan(1_000);
    expect(downloads.historicalTrend.length).toBe(6);
    expect(downloads.confidence).toBe("HIGH");
    expect(downloads.organicPct + downloads.paidUaPct).toBe(100);
  });

  it("calculates gross and net revenue, ARPPU, and subscription splits", () => {
    const downloads = estimateDownloads(sampleDetail);
    const monetization = {
      platform: "IOS" as const,
      storeId: "389801252",
      hasIap: true,
      hasSubscriptions: true,
      minPrice: 14.99,
      maxPrice: 69.99,
      currency: "USD",
      items: [],
      subscriptionTiers: [
        { period: "MONTHLY" as const, price: 14.99, priceFormatted: "$14.99", name: "Monthly" },
        { period: "ANNUAL" as const, price: 69.99, priceFormatted: "$69.99", name: "Annual" },
      ],
      pppRecommendations: [],
      paywallStrategy: "Freemium Subscription",
      estimatedMonthlyArppu: 14.99,
    };

    const revenue = estimateRevenue(sampleDetail, monetization, downloads);

    expect(revenue.monthlyGrossRevenueUsd).toBeGreaterThan(100_000);
    expect(revenue.monthlyNetRevenueUsd).toBeLessThan(revenue.monthlyGrossRevenueUsd);
    expect(revenue.annualRunRateUsd).toBe(revenue.monthlyGrossRevenueUsd * 12);
    expect(revenue.rpd).toBeGreaterThan(0);
    expect(revenue.arppu).toBeGreaterThan(0);
    expect(revenue.revenueSources.subscriptionsPct).toBeGreaterThan(50);
  });

  it("estimates ad campaign UA spend, active ad networks, and paid CPI", () => {
    const downloads = estimateDownloads(sampleDetail);
    const monetization = {
      platform: "IOS" as const,
      storeId: "389801252",
      hasIap: true,
      hasSubscriptions: true,
      minPrice: 14.99,
      maxPrice: 69.99,
      currency: "USD",
      items: [],
      subscriptionTiers: [],
      pppRecommendations: [],
      paywallStrategy: "Freemium Subscription",
      estimatedMonthlyArppu: 14.99,
    };
    const revenue = estimateRevenue(sampleDetail, monetization, downloads);
    const techStack = {
      platform: "IOS" as const,
      storeId: "389801252",
      framework: "Native Swift",
      sdks: [{ id: "applovin", name: "AppLovin", category: "MONETIZATION" as const, vendor: "AppLovin", description: "", confidence: "HIGH" as const }],
      permissions: [],
      privacyScore: 85,
      conversionFrictionScore: 20,
      sdkCountByCategory: {} as never,
      dataSafetyDisclosures: { dataCollected: [], dataShared: [], securityPractices: [] },
      recommendations: [],
    };

    const adIntel = estimateAdCampaigns(sampleDetail, downloads, revenue, techStack);

    expect(adIntel.estimatedMonthlyAdSpendUsd).toBeGreaterThan(10_000);
    expect(adIntel.activeAdNetworks.length).toBeGreaterThanOrEqual(3);
    expect(adIntel.paidCpiEstimateUsd).toBeGreaterThan(1.0);
    expect(adIntel.paidMonthlyInstalls + adIntel.organicMonthlyInstalls).toBe(downloads.monthlyDownloads);
  });

  it("distributes downloads and revenue accurately across top global markets", () => {
    const geo = calculateGeographicSplit(100_000, 500_000);
    expect(geo.length).toBe(8);

    const us = geo.find((g) => g.country === "us");
    expect(us).toBeDefined();
    expect(us?.revenuePct).toBe(54);
    expect(us?.monthlyRevenueUsd).toBe(270_000);
  });

  it("generates head-to-head battlecards comparing two app dossiers", () => {
    const mockA = {
      detail: { storeId: "1", platform: "IOS" as const, name: "App A", ratingAverage: 4.8 },
      platform: "IOS" as const,
      storeId: "1",
      downloads: { monthlyDownloads: 500000, monthlyDownloadsFormatted: "500K", dailyAverage: 16000, growthMomPct: 10, historicalTrend: [], confidence: "HIGH" as const, organicPct: 70, paidUaPct: 30 },
      revenue: { monthlyGrossRevenueUsd: 2000000, monthlyGrossFormatted: "$2.0M", monthlyNetRevenueUsd: 1640000, monthlyNetFormatted: "$1.6M", annualRunRateUsd: 24000000, annualRunRateFormatted: "$24M", rpd: 4.0, arppu: 80, payingUserConversionRatePct: 5, revenueSources: { subscriptionsPct: 80, iapConsumablesPct: 10, inAppAdsPct: 10 } },
      adIntelligence: { estimatedMonthlyAdSpendUsd: 400000, estimatedMonthlyAdSpendFormatted: "$400K", shareOfVoicePct: 50, activeAdNetworks: [], paidCpiEstimateUsd: 2.5, paidMonthlyInstalls: 150000, organicMonthlyInstalls: 350000 },
      geographicBreakdown: [],
      monetization: { platform: "IOS" as const, storeId: "1", hasIap: true, hasSubscriptions: true, minPrice: 9.99, maxPrice: 49.99, currency: "USD", items: [], subscriptionTiers: [], pppRecommendations: [], paywallStrategy: "Sub", estimatedMonthlyArppu: 9.99 },
      techStack: { platform: "IOS" as const, storeId: "1", framework: "Native Swift", sdks: [{ id: "adjust", name: "Adjust", category: "ATTRIBUTION" as const, vendor: "Adjust", description: "", confidence: "HIGH" as const }], permissions: [], privacyScore: 90, conversionFrictionScore: 10, sdkCountByCategory: {} as never, dataSafetyDisclosures: { dataCollected: [], dataShared: [], securityPractices: [] }, recommendations: [] },
      creatives: { totalCount: 5, dominantOrientation: "PORTRAIT" as const, hasVideoPreview: true, hasIcon: true, screenshots: [], visualConversionScore: 90, strengths: [], weaknesses: [], actionableAudit: [] },
      crossLocale: getCrossLocaleRules("us"),
      overallHealthScore: 90,
    };

    const mockB = {
      ...mockA,
      detail: { storeId: "2", platform: "IOS" as const, name: "App B", ratingAverage: 4.5 },
      downloads: { ...mockA.downloads, monthlyDownloads: 250000, monthlyDownloadsFormatted: "250K" },
      revenue: { ...mockA.revenue, monthlyGrossRevenueUsd: 900000, monthlyGrossFormatted: "$900K" },
      overallHealthScore: 80,
    };

    const battlecard = compareDossiers(mockA, mockB);
    expect(battlecard.appA).toBeDefined();
    expect(battlecard.appB).toBeDefined();
    expect(battlecard.downloadsWinner).toBe("A");
    expect(battlecard.revenueWinner).toBe("A");
    expect(battlecard.keyTakeaways.length).toBe(3);
  });
});
