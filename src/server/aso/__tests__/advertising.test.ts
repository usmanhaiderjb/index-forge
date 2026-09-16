import { describe, expect, it } from "vitest";
import { getCrossLocaleRules } from "@aso/shared";
import { analyzeCreatives } from "../builtin/creatives";
import {
  generateAdvertisingReportFromDossier,
  simulateAdBudget,
} from "../builtin/advertising";
import type { FullAppDossier } from "../builtin/intelligence";

describe("Advertising Intelligence Suite", () => {
  const mockDossier: FullAppDossier = {
    detail: {
      storeId: "570060128",
      platform: "IOS",
      name: "Duolingo: Language Lessons",
      developer: "Duolingo",
      iconUrl: "https://example.com/icon.png",
      ratingAverage: 4.8,
      ratingCount: 2500000,
      price: 0,
      category: "Education",
      description: "Learn Spanish, French, German with fun lessons.",
      hasVideo: true,
      screenshotUrls: ["https://example.com/1.png"],
    },
    platform: "IOS",
    storeId: "570060128",
    downloads: {
      monthlyDownloads: 1125000,
      monthlyDownloadsFormatted: "1.1M",
      dailyAverage: 37500,
      growthMomPct: 14.2,
      historicalTrend: [],
      confidence: "HIGH",
      organicPct: 65,
      paidUaPct: 35,
    },
    revenue: {
      monthlyGrossRevenueUsd: 4850000,
      monthlyGrossFormatted: "$4.9M",
      monthlyNetRevenueUsd: 3977000,
      monthlyNetFormatted: "$4.0M",
      annualRunRateUsd: 58200000,
      annualRunRateFormatted: "$58.2M",
      rpd: 4.31,
      arppu: 89.20,
      payingUserConversionRatePct: 4.8,
      revenueSources: {
        subscriptionsPct: 82,
        iapConsumablesPct: 12,
        inAppAdsPct: 6,
      },
    },
    adIntelligence: {
      estimatedMonthlyAdSpendUsd: 1181250,
      estimatedMonthlyAdSpendFormatted: "$1.2M",
      shareOfVoicePct: 68,
      activeAdNetworks: [
        { network: "Apple Search Ads (ASA)", type: "SEARCH_ADS", status: "ACTIVE_CAMPAIGN", spendSharePct: 45 },
        { network: "Google App Campaigns (UAC)", type: "SEARCH_ADS", status: "ACTIVE_CAMPAIGN", spendSharePct: 30 },
      ],
      paidCpiEstimateUsd: 3.00,
      paidMonthlyInstalls: 393750,
      organicMonthlyInstalls: 731250,
    },
    geographicBreakdown: [],
    monetization: {
      platform: "IOS",
      storeId: "570060128",
      hasIap: true,
      hasSubscriptions: true,
      minPrice: 9.99,
      maxPrice: 83.99,
      currency: "USD",
      items: [],
      subscriptionTiers: [{ name: "Super Duolingo Annual", price: 83.99, priceFormatted: "$83.99", period: "ANNUAL" }],
      pppRecommendations: [],
      paywallStrategy: "Freemium Subscription",
      estimatedMonthlyArppu: 14.99,
    },
    techStack: {
      platform: "IOS",
      storeId: "570060128",
      framework: "Native Swift",
      sdks: [{ id: "adjust", name: "Adjust", category: "ATTRIBUTION", vendor: "Adjust", description: "Attribution SDK", confidence: "HIGH" }],
      permissions: [],
      privacyScore: 92,
      conversionFrictionScore: 15,
      sdkCountByCategory: {} as never,
      dataSafetyDisclosures: { dataCollected: [], dataShared: [], securityPractices: [] },
      recommendations: [],
    },
    creatives: analyzeCreatives(["https://example.com/1.png"], true, "https://example.com/icon.png"),
    crossLocale: getCrossLocaleRules("us"),
    overallHealthScore: 92,
  };

  it("generates comprehensive advertising report from dossier", () => {
    const report = generateAdvertisingReportFromDossier(mockDossier);

    expect(report.app.name).toBe("Duolingo: Language Lessons");
    expect(report.metrics.monthlyAdSpendUsd).toBe(1181250);
    expect(report.metrics.annualAdSpendUsd).toBe(1181250 * 12);
    expect(report.metrics.shareOfVoicePct).toBe(68);
    expect(report.networks.length).toBeGreaterThanOrEqual(3);
    expect(report.keywordBidding.length).toBeGreaterThan(0);
    expect(report.creativeFormats.length).toBe(4);
    expect(report.geoTargets.length).toBe(8);
  });

  it("simulates ad campaign budget ROI with positive ROAS", () => {
    const sim = simulateAdBudget(10000, "IOS", "Education");

    expect(sim.inputBudgetUsd).toBe(10000);
    expect(sim.estimatedPaidInstalls).toBeGreaterThan(1000);
    expect(sim.estimatedNewPayingSubscribers).toBeGreaterThan(50);
    expect(sim.projected12MonthLtvUsd).toBeGreaterThan(10000);
    expect(sim.roasMultiplier).toBeGreaterThan(1.0);
  });
});
