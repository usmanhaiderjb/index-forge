import "server-only";

import { buildFullAppIntelligence, type FullAppDossier } from "@/server/aso/builtin/intelligence";
import { db } from "@/server/db";
import type { Platform } from "@prisma/client";

export type AdNetworkDetail = {
  id: string;
  name: string;
  category: "Search Ads" | "Social Video" | "In-App Interstitial & Rewarded" | "Display & Banners";
  status: "ACTIVE_CAMPAIGN" | "DETECTED_SDK" | "ESTIMATED";
  spendSharePct: number;
  monthlySpendUsd: number;
  adFormats: string[];
  targetingSignals: string;
  recommendedOptimization: string;
};

export type KeywordBiddingTarget = {
  keyword: string;
  type: "BRAND_DEFENSE" | "COMPETITOR_CONQUESTING" | "GENERIC_DISCOVERY";
  estimatedCpcUsd: number;
  monthlySearchVolume: number;
  competitionLevel: "LOW" | "MEDIUM" | "HIGH";
  adPosition: string;
  recommendation: string;
};

export type AdCreativeFormatAudit = {
  format: string;
  sharePct: number;
  avgCtrPct: number;
  avgConversionRatePct: number;
  strengths: string;
};

export type GeoAdSpendTarget = {
  country: string;
  countryName: string;
  spendSharePct: number;
  monthlySpendUsd: number;
  avgCpiUsd: number;
  paidInstalls: number;
};

export type AdCampaignSimulationResult = {
  inputBudgetUsd: number;
  estimatedPaidInstalls: number;
  blendedCpiUsd: number;
  estimatedNewPayingSubscribers: number;
  projectedFirstMonthRevenueUsd: number;
  projected12MonthLtvUsd: number;
  roasMultiplier: number;
};

export type AdvertisingReport = {
  app: {
    id: string;
    name: string;
    developer: string;
    iconUrl: string | null;
    platform: Platform;
    category: string;
    storeScore: number;
  };
  metrics: {
    monthlyAdSpendUsd: number;
    monthlyAdSpendFormatted: string;
    annualAdSpendUsd: number;
    annualAdSpendFormatted: string;
    shareOfVoicePct: number;
    blendedCpiUsd: number;
    paidMonthlyInstalls: number;
    organicMonthlyInstalls: number;
    totalMonthlyInstalls: number;
    paidSharePct: number;
    organicSharePct: number;
  };
  channelSpend: {
    searchAdsUsd: number;
    socialAdsUsd: number;
    videoMediationUsd: number;
    displayAdsUsd: number;
  };
  networks: AdNetworkDetail[];
  keywordBidding: KeywordBiddingTarget[];
  creativeFormats: AdCreativeFormatAudit[];
  geoTargets: GeoAdSpendTarget[];
  campaignHooks: string[];
  overallAdHealthScore: number;
};

function formatCompactUsd(amount: number): string {
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(1)}K`;
  return `$${Math.round(amount)}`;
}

export async function buildAdvertisingReport(
  platform: Platform,
  urlOrId: string,
  country = "us",
): Promise<AdvertisingReport> {
  const dossier = await buildFullAppIntelligence(platform, urlOrId, country);
  return generateAdvertisingReportFromDossier(dossier);
}

export async function getTrackedAppAdvertisingReport(appId: string): Promise<AdvertisingReport> {
  const trackedApp = await db.app.findUnique({
    where: { id: appId },
  });

  if (!trackedApp) {
    throw new Error(`Tracked app with ID "${appId}" not found in database.`);
  }

  const dossier = await buildFullAppIntelligence(
    trackedApp.platform,
    trackedApp.storeId,
    "us",
  );

  return generateAdvertisingReportFromDossier(dossier);
}

export function generateAdvertisingReportFromDossier(dossier: FullAppDossier): AdvertisingReport {
  const { detail, platform, downloads, adIntelligence, techStack } = dossier;
  const totalSpend = adIntelligence.estimatedMonthlyAdSpendUsd;

  const networks: AdNetworkDetail[] = [];
  const hasAppLovin = techStack.sdks.some((s) => s.id === "applovin");
  const hasAdjust = techStack.sdks.some((s) => s.id === "adjust");
  const hasAppsFlyer = techStack.sdks.some((s) => s.id === "appsflyer");

  if (platform === "IOS") {
    const asaSpendPct = 42;
    networks.push({
      id: "asa",
      name: "Apple Search Ads (ASA)",
      category: "Search Ads",
      status: "ACTIVE_CAMPAIGN",
      spendSharePct: asaSpendPct,
      monthlySpendUsd: Math.round(totalSpend * (asaSpendPct / 100)),
      adFormats: ["Search Results", "Today Tab", "Search Tab", "Product Pages (CPP)"],
      targetingSignals: "High-intent keyword search & brand conquesting defense",
      recommendedOptimization: "Scale Custom Product Pages (CPP) matching high-volume search intents.",
    });
  }

  const uacSpendPct = platform === "IOS" ? 28 : 55;
  networks.push({
    id: "uac",
    name: "Google App Campaigns (UAC)",
    category: "Search Ads",
    status: "ACTIVE_CAMPAIGN",
    spendSharePct: uacSpendPct,
    monthlySpendUsd: Math.round(totalSpend * (uacSpendPct / 100)),
    adFormats: ["Google Play Search", "YouTube Shorts & Pre-roll", "Google Display Network", "Discover"],
    targetingSignals: "Machine-learning smart bidding on Target CPA and ROAS",
    recommendedOptimization: "Add high-resolution landscape and 9:16 portrait video assets for YouTube Shorts.",
  });

  const metaSpendPct = platform === "IOS" ? 18 : 25;
  networks.push({
    id: "meta",
    name: "Meta / Instagram Ads",
    category: "Social Video",
    status: "ACTIVE_CAMPAIGN",
    spendSharePct: metaSpendPct,
    monthlySpendUsd: Math.round(totalSpend * (metaSpendPct / 100)),
    adFormats: ["Instagram Reels", "Stories", "Feed Carousel", "Audience Network"],
    targetingSignals: "Lookalike audiences based on highest-LTV subscriber cohorts",
    recommendedOptimization: "Refresh video UGC hooks every 14 days to beat ad fatigue.",
  });

  const tiktokSpendPct = 8;
  networks.push({
    id: "tiktok",
    name: "TikTok Ads",
    category: "Social Video",
    status: totalSpend > 25_000 ? "ACTIVE_CAMPAIGN" : "ESTIMATED",
    spendSharePct: tiktokSpendPct,
    monthlySpendUsd: Math.round(totalSpend * (tiktokSpendPct / 100)),
    adFormats: ["In-Feed Video", "TopView", "Spark Ads", "Interactive Add-ons"],
    targetingSignals: "Interest tags & creator native spark collaborations",
    recommendedOptimization: "Deploy fast-paced problem-solution UGC with sound-on captions.",
  });

  if (hasAppLovin || totalSpend > 50_000) {
    const applovinPct = 4;
    networks.push({
      id: "applovin",
      name: "AppLovin MAX / AXON",
      category: "In-App Interstitial & Rewarded",
      status: hasAppLovin ? "DETECTED_SDK" : "ESTIMATED",
      spendSharePct: applovinPct,
      monthlySpendUsd: Math.round(totalSpend * (applovinPct / 100)),
      adFormats: ["Playable Ads", "Rewarded Video", "Full-Screen Interstitials"],
      targetingSignals: "In-app gaming & utility contextual programmatic bidding",
      recommendedOptimization: "Test interactive mini-trial playable creatives.",
    });
  }

  const searchAdsUsd = networks.filter((n) => n.category === "Search Ads").reduce((sum, n) => sum + n.monthlySpendUsd, 0);
  const socialAdsUsd = networks.filter((n) => n.category === "Social Video").reduce((sum, n) => sum + n.monthlySpendUsd, 0);
  const videoMediationUsd = networks.filter((n) => n.category === "In-App Interstitial & Rewarded").reduce((sum, n) => sum + n.monthlySpendUsd, 0);
  const displayAdsUsd = Math.max(0, totalSpend - (searchAdsUsd + socialAdsUsd + videoMediationUsd));

  const appCategory = detail.category || "Utilities";
  const brandName = (detail.name || "App").split(" ")[0]?.toLowerCase() || "app";
  const keywordBidding: KeywordBiddingTarget[] = [
    {
      keyword: brandName,
      type: "BRAND_DEFENSE",
      estimatedCpcUsd: platform === "IOS" ? 0.95 : 0.65,
      monthlySearchVolume: Math.round(downloads.monthlyDownloads * 0.45),
      competitionLevel: "HIGH",
      adPosition: "Rank #1 Sponsored",
      recommendation: "Maintain 100% Share of Voice on exact match brand term to prevent competitor interception.",
    },
    {
      keyword: `${brandName} premium`,
      type: "BRAND_DEFENSE",
      estimatedCpcUsd: platform === "IOS" ? 1.40 : 0.90,
      monthlySearchVolume: Math.round(downloads.monthlyDownloads * 0.12),
      competitionLevel: "MEDIUM",
      adPosition: "Rank #1 Sponsored",
      recommendation: "Highlight discount offers and trial period in ad subtitle.",
    },
    {
      keyword: `best ${appCategory.toLowerCase()} app`,
      type: "GENERIC_DISCOVERY",
      estimatedCpcUsd: platform === "IOS" ? 2.80 : 1.95,
      monthlySearchVolume: Math.round(downloads.monthlyDownloads * 0.60),
      competitionLevel: "HIGH",
      adPosition: "Rank #1-2 Sponsored",
      recommendation: "Bid with broad match + custom CPP showing social proof and ratings.",
    },
    {
      keyword: `${appCategory.toLowerCase()} tracker free`,
      type: "GENERIC_DISCOVERY",
      estimatedCpcUsd: platform === "IOS" ? 1.90 : 1.25,
      monthlySearchVolume: Math.round(downloads.monthlyDownloads * 0.35),
      competitionLevel: "MEDIUM",
      adPosition: "Rank #1 Sponsored",
      recommendation: "Emphasize freemium tier and instantaneous onboarding.",
    },
    {
      keyword: `alternative to ${brandName}`,
      type: "COMPETITOR_CONQUESTING",
      estimatedCpcUsd: platform === "IOS" ? 3.40 : 2.40,
      monthlySearchVolume: Math.round(downloads.monthlyDownloads * 0.18),
      competitionLevel: "HIGH",
      adPosition: "Rank #1 Sponsored",
      recommendation: "Conquesting defensive bids — capture churn-intent searchers.",
    },
  ];

  const creativeFormats: AdCreativeFormatAudit[] = [
    {
      format: "9:16 Vertical UGC Video",
      sharePct: 45,
      avgCtrPct: 4.2,
      avgConversionRatePct: 32.4,
      strengths: "Highest organic authenticity and lowest CPI on TikTok & Reels.",
    },
    {
      format: "Product Walkthrough / Screen Recording",
      sharePct: 25,
      avgCtrPct: 3.1,
      avgConversionRatePct: 28.0,
      strengths: "Educates users before install; drives higher 30-day retention.",
    },
    {
      format: "Interactive / Playable Mini-Experience",
      sharePct: 15,
      avgCtrPct: 5.8,
      avgConversionRatePct: 36.5,
      strengths: "Pre-qualifies user engagement before entering the app store.",
    },
    {
      format: "Static High-Contrast Value Proposition Card",
      sharePct: 15,
      avgCtrPct: 2.2,
      avgConversionRatePct: 21.0,
      strengths: "Cost-effective baseline for Google Display and Meta Feed.",
    },
  ];

  const geoRatios = [
    { country: "us", countryName: "United States", share: 0.52, cpi: platform === "IOS" ? 3.80 : 2.60 },
    { country: "gb", countryName: "United Kingdom", share: 0.14, cpi: platform === "IOS" ? 2.90 : 1.95 },
    { country: "de", countryName: "Germany", share: 0.10, cpi: platform === "IOS" ? 2.70 : 1.80 },
    { country: "jp", countryName: "Japan", share: 0.08, cpi: platform === "IOS" ? 4.20 : 3.10 },
    { country: "ca", countryName: "Canada", share: 0.06, cpi: platform === "IOS" ? 2.80 : 1.90 },
    { country: "au", countryName: "Australia", share: 0.05, cpi: platform === "IOS" ? 3.10 : 2.10 },
    { country: "br", countryName: "Brazil", share: 0.03, cpi: platform === "IOS" ? 0.75 : 0.45 },
    { country: "in", countryName: "India", share: 0.02, cpi: platform === "IOS" ? 0.60 : 0.35 },
  ];

  const geoTargets: GeoAdSpendTarget[] = geoRatios.map((g) => {
    const geoSpend = Math.round(totalSpend * g.share);
    const paidInstalls = Math.round(geoSpend / g.cpi);
    return {
      country: g.country,
      countryName: g.countryName,
      spendSharePct: Math.round(g.share * 100),
      monthlySpendUsd: geoSpend,
      avgCpiUsd: g.cpi,
      paidInstalls,
    };
  });

  const campaignHooks = [
    `"The #1 rated ${appCategory} solution used by millions."`,
    `"Start in under 60 seconds — no credit card needed."`,
    `"Why users are switching from alternatives in 2026."`,
    `"Unlock personalized ${appCategory} insights every day."`,
  ];

  const overallAdHealthScore = Math.min(
    96,
    Math.round(
      (adIntelligence.shareOfVoicePct > 30 ? 30 : 15) +
        (adIntelligence.activeAdNetworks.length >= 3 ? 25 : 15) +
        (downloads.paidUaPct >= 20 ? 25 : 15) +
        (hasAdjust || hasAppsFlyer ? 20 : 10),
    ),
  );

  return {
    app: {
      id: dossier.storeId,
      name: detail.name || "App",
      developer: detail.developer || "Unknown Developer",
      iconUrl: detail.iconUrl ?? null,
      platform,
      category: appCategory,
      storeScore: detail.ratingAverage ?? 4.5,
    },
    metrics: {
      monthlyAdSpendUsd: totalSpend,
      monthlyAdSpendFormatted: formatCompactUsd(totalSpend),
      annualAdSpendUsd: totalSpend * 12,
      annualAdSpendFormatted: formatCompactUsd(totalSpend * 12),
      shareOfVoicePct: adIntelligence.shareOfVoicePct,
      blendedCpiUsd: adIntelligence.paidCpiEstimateUsd,
      paidMonthlyInstalls: adIntelligence.paidMonthlyInstalls,
      organicMonthlyInstalls: adIntelligence.organicMonthlyInstalls,
      totalMonthlyInstalls: downloads.monthlyDownloads,
      paidSharePct: downloads.paidUaPct,
      organicSharePct: downloads.organicPct,
    },
    channelSpend: {
      searchAdsUsd,
      socialAdsUsd,
      videoMediationUsd,
      displayAdsUsd,
    },
    networks,
    keywordBidding,
    creativeFormats,
    geoTargets,
    campaignHooks,
    overallAdHealthScore,
  };
}

export function simulateAdBudget(
  monthlyBudgetUsd: number,
  platform: Platform,
  category = "Utilities",
): AdCampaignSimulationResult {
  const isIos = platform === "IOS";
  const baseCpi = isIos ? 3.20 : 2.10;
  const directPaidInstalls = Math.max(1, Math.round(monthlyBudgetUsd / baseCpi));
  const totalAttributedInstalls = Math.round(directPaidInstalls * 1.25);

  const payingConversionRate = isIos ? 0.048 : 0.035;
  const estimatedNewPayingSubscribers = Math.max(1, Math.round(totalAttributedInstalls * payingConversionRate));

  const avgMonthlySubscriptionPrice = 9.99;
  const projectedFirstMonthRevenue = Math.round(estimatedNewPayingSubscribers * avgMonthlySubscriptionPrice * 0.85);
  const projected12MonthLtv = Math.round(estimatedNewPayingSubscribers * (avgMonthlySubscriptionPrice * 9.5) * 0.85);

  const roasMultiplier = Math.round((projected12MonthLtv / Math.max(1, monthlyBudgetUsd)) * 100) / 100;

  return {
    inputBudgetUsd: monthlyBudgetUsd,
    estimatedPaidInstalls: directPaidInstalls,
    blendedCpiUsd: baseCpi,
    estimatedNewPayingSubscribers,
    projectedFirstMonthRevenueUsd: projectedFirstMonthRevenue,
    projected12MonthLtvUsd: projected12MonthLtv,
    roasMultiplier,
  };
}
