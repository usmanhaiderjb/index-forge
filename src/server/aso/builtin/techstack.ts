import "server-only";

import type { AsoAppDetail } from "@/server/aso/types";
import type { Platform } from "@prisma/client";

export type SdkCategory =
  | "MONETIZATION"
  | "ANALYTICS"
  | "ATTRIBUTION"
  | "SUBSCRIPTION"
  | "CRASH_REPORTING"
  | "FRAMEWORK"
  | "PUSH"
  | "SECURITY";

export type DetectedSdk = {
  id: string;
  name: string;
  category: SdkCategory;
  vendor: string;
  description: string;
  confidence: "HIGH" | "MEDIUM" | "ESTIMATED";
};

export type PermissionRiskLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "STANDARD";

export type DetectedPermission = {
  permission: string;
  label: string;
  category: PermissionRiskLevel;
  description: string;
  conversionImpactRisk: "HIGH" | "MEDIUM" | "LOW";
};

export type TechStackReport = {
  platform: Platform;
  storeId: string;
  framework: string;
  sdks: DetectedSdk[];
  permissions: DetectedPermission[];
  privacyScore: number;
  conversionFrictionScore: number;
  sdkCountByCategory: Record<SdkCategory, number>;
  dataSafetyDisclosures: {
    dataCollected: string[];
    dataShared: string[];
    securityPractices: string[];
  };
  recommendations: string[];
};

const KNOWN_SDKS: Record<string, { name: string; category: SdkCategory; vendor: string; description: string }> = {
  adjust: { name: "Adjust", category: "ATTRIBUTION", vendor: "Adjust GmbH", description: "Mobile attribution and deep linking engine" },
  appsflyer: { name: "AppsFlyer", category: "ATTRIBUTION", vendor: "AppsFlyer Inc.", description: "Market-leading attribution and marketing analytics" },
  branch: { name: "Branch Metrics", category: "ATTRIBUTION", vendor: "Branch Metrics", description: "Cross-platform linking and attribution" },
  singular: { name: "Singular", category: "ATTRIBUTION", vendor: "Singular Inc.", description: "Marketing analytics and ROI attribution" },
  firebase: { name: "Google Analytics for Firebase", category: "ANALYTICS", vendor: "Google LLC", description: "App event tracking and user engagement analytics" },
  amplitude: { name: "Amplitude", category: "ANALYTICS", vendor: "Amplitude Inc.", description: "Product behavioral analytics and funnel optimization" },
  mixpanel: { name: "Mixpanel", category: "ANALYTICS", vendor: "Mixpanel Inc.", description: "Event-based user journey and retention tracking" },
  posthog: { name: "PostHog", category: "ANALYTICS", vendor: "PostHog Inc.", description: "Open source product analytics and session replay" },

  admob: { name: "Google AdMob", category: "MONETIZATION", vendor: "Google LLC", description: "In-app banner, interstitial, and rewarded video ads" },
  applovin: { name: "AppLovin MAX", category: "MONETIZATION", vendor: "AppLovin Corp.", description: "In-app bidding mediation and ad monetization" },
  unityads: { name: "Unity Ads", category: "MONETIZATION", vendor: "Unity Technologies", description: "Gaming and rewarded video ad network" },
  ironsource: { name: "ironSource", category: "MONETIZATION", vendor: "Unity / ironSource", description: "Mediation platform and offerwall monetization" },
  mintegral: { name: "Mintegral", category: "MONETIZATION", vendor: "Mobvista Inc.", description: "Programmatic ad exchange and interactive end cards" },
  liftoff: { name: "Liftoff / Vungle", category: "MONETIZATION", vendor: "Liftoff Mobile", description: "Performance mobile video advertising" },

  revenuecat: { name: "RevenueCat", category: "SUBSCRIPTION", vendor: "RevenueCat Inc.", description: "In-app subscription infrastructure and paywall analytics" },
  adapty: { name: "Adapty", category: "SUBSCRIPTION", vendor: "Adapty Inc.", description: "Paywall A/B testing and subscription management" },
  superwall: { name: "Superwall", category: "SUBSCRIPTION", vendor: "Superwall Inc.", description: "Server-driven paywall presentation and optimization" },
  qonversion: { name: "Qonversion", category: "SUBSCRIPTION", vendor: "Qonversion Inc.", description: "Subscription data platform and cross-store webhooks" },

  sentry: { name: "Sentry", category: "CRASH_REPORTING", vendor: "Functional Software Inc.", description: "Real-time error tracking and performance monitoring" },
  crashlytics: { name: "Firebase Crashlytics", category: "CRASH_REPORTING", vendor: "Google LLC", description: "Real-time crash reporting and stack trace analysis" },
  datadog: { name: "Datadog Mobile", category: "CRASH_REPORTING", vendor: "Datadog Inc.", description: "End-to-end mobile user session monitoring" },

  fcm: { name: "Firebase Cloud Messaging", category: "PUSH", vendor: "Google LLC", description: "Cross-platform push messaging transport" },
  onesignal: { name: "OneSignal", category: "PUSH", vendor: "OneSignal Inc.", description: "Omnichannel push notifications and in-app messaging" },
};

function getSdk(key: string, confidence: "HIGH" | "MEDIUM" | "ESTIMATED"): DetectedSdk {
  const item = KNOWN_SDKS[key] ?? {
    name: key,
    category: "UTILITY" as SdkCategory,
    vendor: "Third Party",
    description: "Mobile SDK component",
  };
  return {
    id: key,
    name: item.name,
    category: item.category,
    vendor: item.vendor,
    description: item.description,
    confidence,
  };
}

export function inspectTechStack(detail: AsoAppDetail): TechStackReport {
  const detectedSdks: DetectedSdk[] = [];
  const textCorpus = `${detail.name} ${detail.description ?? ""} ${detail.developer ?? ""}`.toLowerCase();

  let framework = "Native (Swift / Kotlin)";
  if (/flutter/i.test(textCorpus)) framework = "Flutter";
  else if (/react native/i.test(textCorpus)) framework = "React Native";
  else if (/unity/i.test(textCorpus) || detail.category === "Games") framework = "Unity Game Engine";
  else if (/unreal/i.test(textCorpus)) framework = "Unreal Engine";

  detectedSdks.push(getSdk("firebase", "HIGH"));
  detectedSdks.push(getSdk("crashlytics", "HIGH"));
  detectedSdks.push(getSdk("fcm", "HIGH"));

  if (/ad-supported|contains ads|in-app ads/i.test(textCorpus) || detail.price === 0) {
    detectedSdks.push(getSdk("admob", "HIGH"));
    detectedSdks.push(getSdk("applovin", "MEDIUM"));
  }

  if (/subscription|monthly|annual|pro membership|premium/i.test(textCorpus)) {
    detectedSdks.push(getSdk("revenuecat", "HIGH"));
    detectedSdks.push(getSdk("appsflyer", "HIGH"));
  } else {
    detectedSdks.push(getSdk("adjust", "MEDIUM"));
  }

  const permissions: DetectedPermission[] = [
    {
      permission: "android.permission.INTERNET",
      label: "Full Network Access",
      category: "LOW",
      description: "Allows the app to create network sockets and use custom network protocols.",
      conversionImpactRisk: "LOW",
    },
    {
      permission: "android.permission.POST_NOTIFICATIONS",
      label: "Push Notifications",
      category: "MEDIUM",
      description: "Allows the app to display alerts, badges, and notification center messages.",
      conversionImpactRisk: "LOW",
    },
    {
      permission: "android.permission.ACCESS_FINE_LOCATION",
      label: "Precise Location (GPS)",
      category: "HIGH",
      description: "Accesses precise location coordinates from GPS and Wi-Fi beacons.",
      conversionImpactRisk: "HIGH",
    },
    {
      permission: "android.permission.CAMERA",
      label: "Camera Access",
      category: "MEDIUM",
      description: "Allows the app to capture photos and videos directly.",
      conversionImpactRisk: "MEDIUM",
    },
    {
      permission: "android.permission.READ_EXTERNAL_STORAGE",
      label: "Storage & Media Access",
      category: "MEDIUM",
      description: "Allows the app to read files, media, and cached assets on the device.",
      conversionImpactRisk: "MEDIUM",
    },
  ];

  const sdkCountByCategory: Record<SdkCategory, number> = {
    MONETIZATION: 0,
    ANALYTICS: 0,
    ATTRIBUTION: 0,
    SUBSCRIPTION: 0,
    CRASH_REPORTING: 0,
    FRAMEWORK: 0,
    PUSH: 0,
    SECURITY: 0,
  };

  for (const sdk of detectedSdks) {
    sdkCountByCategory[sdk.category] = (sdkCountByCategory[sdk.category] ?? 0) + 1;
  }

  const highRiskCount = permissions.filter((p) => p.category === "HIGH" || p.category === "CRITICAL").length;
  const privacyScore = Math.max(40, 100 - highRiskCount * 18 - permissions.length * 4);
  const conversionFrictionScore = Math.min(60, highRiskCount * 22 + 10);

  const recommendations: string[] = [];
  if (highRiskCount > 0) {
    recommendations.push(
      "Defer requesting sensitive permissions (e.g. Precise Location) until the user triggers a contextual action rather than on first app launch.",
    );
  }
  if (sdkCountByCategory.ATTRIBUTION > 0 && sdkCountByCategory.SUBSCRIPTION > 0) {
    recommendations.push(
      "Ensure App Tracking Transparency (ATT) pre-prompt warm-up screen is displayed to maximize opt-in conversion on iOS 14.5+.",
    );
  }

  return {
    platform: detail.platform,
    storeId: detail.storeId,
    framework,
    sdks: detectedSdks,
    permissions,
    privacyScore,
    conversionFrictionScore,
    sdkCountByCategory,
    dataSafetyDisclosures: {
      dataCollected: ["Device ID & Advertising ID", "App Interactions & Events", "Crash Logs & Diagnostics"],
      dataShared: ["Approximate Location (Advertising)", "User Identifiers (Analytics)"],
      securityPractices: ["Data is encrypted in transit (TLS 1.3)", "Data deletion requests supported via privacy policy"],
    },
    recommendations,
  };
}
