import { Provider } from "@prisma/client";

import { admobConnector } from "@/server/integrations/google/admob";
import { appStoreConnectConnector } from "@/server/integrations/apple/app-store-connect";
import { appleSearchAdsConnector } from "@/server/integrations/apple/search-ads";
import { firebaseConnector } from "@/server/integrations/google/firebase";
import { googleAdsConnector } from "@/server/integrations/google/google-ads";
import { playConsoleConnector } from "@/server/integrations/google/play-console";
import type { Connector } from "@/server/integrations/types";

export const CONNECTORS: Record<Provider, Connector> = {
  FIREBASE: firebaseConnector,
  ADMOB: admobConnector,
  GOOGLE_ADS: googleAdsConnector,
  PLAY_CONSOLE: playConsoleConnector,
  APP_STORE_CONNECT: appStoreConnectConnector,
  APPLE_SEARCH_ADS: appleSearchAdsConnector,
};

export function getConnector(provider: Provider): Connector {
  return CONNECTORS[provider];
}

/** Presentation metadata for the integrations page. Server-safe and client-safe. */
export const PROVIDER_META: Record<
  Provider,
  {
    name: string;
    description: string;
    /** How the user authenticates. */
    authKind: "google-oauth" | "apple-key" | "apple-search-ads-key";
    /** Whether the connection needs extra setup after authorizing. */
    setupNote?: string;
    docsUrl: string;
    accent: string;
    provides: string[];
  }
> = {
  FIREBASE: {
    name: "Firebase",
    description: "Active users, sessions, retention, crash-free rate and revenue from Google Analytics for Firebase.",
    authKind: "google-oauth",
    setupNote:
      "Requires the Firebase project to be linked to a Google Analytics 4 property. Without that link there is no metrics source.",
    docsUrl: "https://firebase.google.com/docs/projects/api/reference/rest",
    accent: "#FFA000",
    provides: ["DAU / MAU", "Sessions", "Crash-free users", "In-app revenue"],
  },
  ADMOB: {
    name: "AdMob",
    description: "Ad revenue, impressions, clicks, eCPM and fill rate broken down by country.",
    authKind: "google-oauth",
    docsUrl: "https://developers.google.com/admob/api/v1",
    accent: "#4285F4",
    provides: ["Ad revenue", "eCPM", "Fill rate", "Ad impressions"],
  },
  GOOGLE_ADS: {
    name: "Google Ads",
    description: "App campaign spend, paid installs, CPI and ROAS per campaign.",
    authKind: "google-oauth",
    setupNote:
      "Needs a Google Ads developer token on the deployment (GOOGLE_ADS_DEVELOPER_TOKEN). Basic access is enough for reporting.",
    docsUrl: "https://developers.google.com/google-ads/api/docs/start",
    accent: "#34A853",
    provides: ["Spend", "Paid installs", "CPI", "ROAS"],
  },
  PLAY_CONSOLE: {
    name: "Google Play Console",
    description: "Installs, uninstalls, store listing conversion, ratings and reviews for Android.",
    authKind: "google-oauth",
    setupNote:
      "Install statistics are only published as CSV in your private Cloud Storage reports bucket. Paste the bucket id from Play Console > Download reports when linking each app.",
    docsUrl: "https://developers.google.com/android-publisher",
    accent: "#01875F",
    provides: ["Installs", "Uninstalls", "Store conversion", "Reviews"],
  },
  APP_STORE_CONNECT: {
    name: "App Store Connect",
    description: "iOS units, proceeds and customer reviews via the App Store Connect API.",
    authKind: "apple-key",
    setupNote:
      "Create an API key with at least the Sales role. Sales & Trends data also needs your vendor number.",
    docsUrl: "https://developer.apple.com/documentation/appstoreconnectapi",
    accent: "#0D96F6",
    provides: ["Units", "Proceeds", "Reviews", "Ratings"],
  },
  APPLE_SEARCH_ADS: {
    name: "Apple Search Ads",
    description: "iOS campaign spend, taps, paid installs, CPI and CPC per campaign.",
    authKind: "apple-search-ads-key",
    setupNote:
      "A separate API credential from App Store Connect: create it in Search Ads under Account Settings > API, which gives you a client id, team id and key id alongside a new .p8 key. The App Store Connect key will not work here.",
    docsUrl: "https://developer.apple.com/documentation/apple_search_ads",
    accent: "#1D1D1F",
    provides: ["Spend", "Paid installs", "CPI", "CPC"],
  },
};

export const ALL_PROVIDERS = Object.values(Provider);
