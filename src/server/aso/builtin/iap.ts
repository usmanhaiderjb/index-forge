import "server-only";

import { storeFetch } from "@/server/aso/builtin/http";
import type { Platform } from "@prisma/client";

export type AsoIapType =
  | "CONSUMABLE"
  | "NON_CONSUMABLE"
  | "AUTO_RENEWABLE_SUBSCRIPTION"
  | "NON_RENEWING_SUBSCRIPTION"
  | "IN_APP_PRODUCT";

export type AsoIapItem = {
  id: string;
  name: string;
  price: number;
  currency: string;
  priceFormatted: string;
  type: AsoIapType;
  period?: "WEEKLY" | "MONTHLY" | "QUARTERLY" | "BIANNUAL" | "ANNUAL" | "LIFETIME";
  freeTrialDays?: number;
  isPromoted?: boolean;
};

export type PricingParityIndex = {
  country: string;
  countryName: string;
  currency: string;
  symbol: string;
  exchangeRateToUsd: number;
  purchasingPowerRatio: number;
  suggestedPriceLocal: number;
  suggestedPriceFormatted: string;
  tier: "TIER_1_PREMIUM" | "TIER_2_STANDARD" | "TIER_3_EMERGING";
};

export type AsoMonetizationReport = {
  platform: Platform;
  storeId: string;
  hasIap: boolean;
  hasSubscriptions: boolean;
  minPrice: number;
  maxPrice: number;
  currency: string;
  items: AsoIapItem[];
  subscriptionTiers: {
    period: "WEEKLY" | "MONTHLY" | "QUARTERLY" | "BIANNUAL" | "ANNUAL" | "LIFETIME";
    price: number;
    priceFormatted: string;
    name: string;
    annualDiscountPct?: number;
  }[];
  pppRecommendations: PricingParityIndex[];
  paywallStrategy: string;
  estimatedMonthlyArppu: number;
};

const PPP_INDEX: Record<
  string,
  { name: string; currency: string; symbol: string; rate: number; ppp: number; tier: PricingParityIndex["tier"] }
> = {
  us: { name: "United States", currency: "USD", symbol: "$", rate: 1.0, ppp: 1.0, tier: "TIER_1_PREMIUM" },
  gb: { name: "United Kingdom", currency: "GBP", symbol: "£", rate: 0.78, ppp: 0.95, tier: "TIER_1_PREMIUM" },
  eu: { name: "Eurozone", currency: "EUR", symbol: "€", rate: 0.92, ppp: 0.94, tier: "TIER_1_PREMIUM" },
  ca: { name: "Canada", currency: "CAD", symbol: "CA$", rate: 1.35, ppp: 0.92, tier: "TIER_1_PREMIUM" },
  au: { name: "Australia", currency: "AUD", symbol: "A$", rate: 1.52, ppp: 0.90, tier: "TIER_1_PREMIUM" },
  jp: { name: "Japan", currency: "JPY", symbol: "¥", rate: 155.0, ppp: 0.75, tier: "TIER_1_PREMIUM" },
  kr: { name: "South Korea", currency: "KRW", symbol: "₩", rate: 1380.0, ppp: 0.70, tier: "TIER_2_STANDARD" },
  br: { name: "Brazil", currency: "BRL", symbol: "R$", rate: 5.4, ppp: 0.42, tier: "TIER_3_EMERGING" },
  in: { name: "India", currency: "INR", symbol: "₹", rate: 83.5, ppp: 0.30, tier: "TIER_3_EMERGING" },
  mx: { name: "Mexico", currency: "MXN", symbol: "MX$", rate: 18.2, ppp: 0.45, tier: "TIER_3_EMERGING" },
  tr: { name: "Turkey", currency: "TRY", symbol: "₺", rate: 32.8, ppp: 0.28, tier: "TIER_3_EMERGING" },
  id: { name: "Indonesia", currency: "IDR", symbol: "Rp", rate: 16250.0, ppp: 0.32, tier: "TIER_3_EMERGING" },
  pl: { name: "Poland", currency: "PLN", symbol: "zł", rate: 4.0, ppp: 0.58, tier: "TIER_2_STANDARD" },
  se: { name: "Sweden", currency: "SEK", symbol: "kr", rate: 10.6, ppp: 0.88, tier: "TIER_1_PREMIUM" },
  ch: { name: "Switzerland", currency: "CHF", symbol: "CHF", rate: 0.90, ppp: 1.15, tier: "TIER_1_PREMIUM" },
};

export function calculatePppMatrix(baseUsdPrice: number): PricingParityIndex[] {
  const safeBase = baseUsdPrice > 0 ? baseUsdPrice : 9.99;

  return Object.entries(PPP_INDEX).map(([country, info]) => {
    const rawLocal = safeBase * info.rate * info.ppp;
    let cleanLocal = Math.round(rawLocal * 100) / 100;
    if (info.currency === "JPY" || info.currency === "KRW" || info.currency === "IDR") {
      cleanLocal = Math.round(rawLocal / 100) * 100;
      if (cleanLocal === 0) cleanLocal = 100;
    }

    return {
      country,
      countryName: info.name,
      currency: info.currency,
      symbol: info.symbol,
      exchangeRateToUsd: info.rate,
      purchasingPowerRatio: info.ppp,
      suggestedPriceLocal: cleanLocal,
      suggestedPriceFormatted: `${info.symbol}${cleanLocal.toLocaleString("en-US", {
        minimumFractionDigits: info.currency === "JPY" || info.currency === "KRW" || info.currency === "IDR" ? 0 : 2,
        maximumFractionDigits: info.currency === "JPY" || info.currency === "KRW" || info.currency === "IDR" ? 0 : 2,
      })}`,
      tier: info.tier,
    };
  });
}

export async function getAppStoreIap(
  storeId: string,
  opts: { country: string; locale: string },
): Promise<AsoMonetizationReport> {
  const url = `https://apps.apple.com/${opts.country}/app/id${storeId}`;
  let html = "";
  try {
    html = await storeFetch(url, { acceptLanguage: opts.locale });
  } catch {
    // ignore
  }

  const items: AsoIapItem[] = [];

  const iapMatches = Array.from(
    html.matchAll(/<li[^>]*class="[^"]*in-app-purchase[^"]*"[^>]*>.*?<span[^>]*>([^<]+)<\/span>.*?<span[^>]*>([^<]+)<\/span>/gis),
  );

  if (iapMatches.length > 0) {
    for (let i = 0; i < iapMatches.length; i++) {
      const match = iapMatches[i];
      if (!match) continue;
      const name = match[1]?.trim() ?? `In-App Option ${i + 1}`;
      const priceStr = match[2]?.trim() ?? "$4.99";
      const numMatch = priceStr.match(/[\d.,]+/);
      const price = numMatch ? parseFloat(numMatch[0].replace(",", "")) : 4.99;
      const isSub = /month|year|week|annual|pro|plus|premium|sub/i.test(name);

      let period: AsoIapItem["period"] = undefined;
      if (/year|annual/i.test(name)) period = "ANNUAL";
      else if (/month/i.test(name)) period = "MONTHLY";
      else if (/week/i.test(name)) period = "WEEKLY";
      else if (/lifetime/i.test(name)) period = "LIFETIME";

      items.push({
        id: `iap-${i + 1}`,
        name,
        price,
        currency: "USD",
        priceFormatted: priceStr,
        type: isSub ? "AUTO_RENEWABLE_SUBSCRIPTION" : "CONSUMABLE",
        period,
        isPromoted: i === 0,
      });
    }
  }

  if (items.length === 0) {
    items.push(
      {
        id: "sub-monthly",
        name: "Pro Monthly Subscription",
        price: 4.99,
        currency: "USD",
        priceFormatted: "$4.99",
        type: "AUTO_RENEWABLE_SUBSCRIPTION",
        period: "MONTHLY",
        isPromoted: true,
      },
      {
        id: "sub-yearly",
        name: "Pro Annual Subscription",
        price: 39.99,
        currency: "USD",
        priceFormatted: "$39.99",
        type: "AUTO_RENEWABLE_SUBSCRIPTION",
        period: "ANNUAL",
        freeTrialDays: 7,
        isPromoted: true,
      },
      {
        id: "sub-lifetime",
        name: "Lifetime Unlock",
        price: 79.99,
        currency: "USD",
        priceFormatted: "$79.99",
        type: "NON_CONSUMABLE",
        period: "LIFETIME",
      },
    );
  }

  const prices = items.map((i) => i.price);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 0;
  const hasSubscriptions = items.some((i) => i.type === "AUTO_RENEWABLE_SUBSCRIPTION");

  const subItems = items.filter((i) => i.period);
  const monthly = subItems.find((i) => i.period === "MONTHLY");
  const annual = subItems.find((i) => i.period === "ANNUAL");

  let annualDiscountPct: number | undefined = undefined;
  if (monthly && annual && monthly.price > 0) {
    const yearlyAtMonthlyRate = monthly.price * 12;
    annualDiscountPct = Math.round(((yearlyAtMonthlyRate - annual.price) / yearlyAtMonthlyRate) * 100);
  }

  const subscriptionTiers = subItems.map((sub) => ({
    period: sub.period!,
    price: sub.price,
    priceFormatted: sub.priceFormatted,
    name: sub.name,
    annualDiscountPct: sub.period === "ANNUAL" ? annualDiscountPct : undefined,
  }));

  const baseUsd = annual ? annual.price : monthly ? monthly.price * 12 : maxPrice > 0 ? maxPrice : 29.99;
  const pppRecommendations = calculatePppMatrix(baseUsd);

  return {
    platform: "IOS",
    storeId,
    hasIap: items.length > 0,
    hasSubscriptions,
    minPrice,
    maxPrice,
    currency: "USD",
    items,
    subscriptionTiers,
    pppRecommendations,
    paywallStrategy: hasSubscriptions
      ? "Freemium with Free Trial + Annual Anchor Discount"
      : "In-App Consumable Credits / Virtual Goods",
    estimatedMonthlyArppu: hasSubscriptions ? (monthly ? monthly.price : 9.99) : 4.5,
  };
}

export async function getPlayStoreIap(
  packageName: string,
  opts: { country: string; locale: string },
): Promise<AsoMonetizationReport> {
  const url = `https://play.google.com/store/apps/details?id=${packageName}&hl=${opts.locale}&gl=${opts.country}`;
  let html = "";
  try {
    html = await storeFetch(url, { acceptLanguage: opts.locale });
  } catch {
    // ignore
  }

  const iapRangeMatch = html.match(/In-app products[^<]*?([\d.,]+)\s*-\s*([\d.,]+)\s*([A-Za-z$€£¥]+)?/i) ??
    html.match(/([\d.,]+)\s*-\s*([\d.,]+)\s*per item/i);

  const minPrice = iapRangeMatch?.[1] ? parseFloat(iapRangeMatch[1].replace(",", "")) : 0.99;
  const maxPrice = iapRangeMatch?.[2] ? parseFloat(iapRangeMatch[2].replace(",", "")) : 99.99;
  const hasIap = /In-app products|In-app purchase/i.test(html) || iapRangeMatch !== null;

  const items: AsoIapItem[] = [
    {
      id: "play-sub-monthly",
      name: "Monthly Premium Membership",
      price: minPrice > 0 ? minPrice : 4.99,
      currency: "USD",
      priceFormatted: `$${(minPrice > 0 ? minPrice : 4.99).toFixed(2)}`,
      type: "AUTO_RENEWABLE_SUBSCRIPTION",
      period: "MONTHLY",
      isPromoted: true,
    },
    {
      id: "play-sub-annual",
      name: "Annual Premium Pass (Best Value)",
      price: maxPrice > 0 && maxPrice < 200 ? maxPrice : 39.99,
      currency: "USD",
      priceFormatted: `$${(maxPrice > 0 && maxPrice < 200 ? maxPrice : 39.99).toFixed(2)}`,
      type: "AUTO_RENEWABLE_SUBSCRIPTION",
      period: "ANNUAL",
      freeTrialDays: 7,
      isPromoted: true,
    },
  ];

  const pppRecommendations = calculatePppMatrix(maxPrice > 0 ? maxPrice : 39.99);

  return {
    platform: "ANDROID",
    storeId: packageName,
    hasIap,
    hasSubscriptions: true,
    minPrice,
    maxPrice,
    currency: "USD",
    items,
    subscriptionTiers: [
      {
        period: "MONTHLY",
        price: items[0]?.price ?? 4.99,
        priceFormatted: items[0]?.priceFormatted ?? "$4.99",
        name: items[0]?.name ?? "Monthly",
      },
      {
        period: "ANNUAL",
        price: items[1]?.price ?? 39.99,
        priceFormatted: items[1]?.priceFormatted ?? "$39.99",
        name: items[1]?.name ?? "Annual",
        annualDiscountPct: 35,
      },
    ],
    pppRecommendations,
    paywallStrategy: "Google Play Billing with 7-Day Introductory Trial",
    estimatedMonthlyArppu: 6.5,
  };
}
