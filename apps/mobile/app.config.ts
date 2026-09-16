import type { ExpoConfig } from "expo/config";

/**
 * Expo configuration.
 *
 * A .ts config rather than app.json so the API URL and bundle identifiers can
 * differ per build profile without maintaining three near-identical JSON files.
 */

const IS_DEV = process.env.APP_VARIANT === "development";
const IS_PREVIEW = process.env.APP_VARIANT === "preview";

/** Suffixed so dev, preview and production can be installed side by side. */
function bundleId(base: string): string {
  if (IS_DEV) return `${base}.dev`;
  if (IS_PREVIEW) return `${base}.preview`;
  return base;
}

const config: ExpoConfig = {
  name: IS_DEV ? "IndexForge (dev)" : IS_PREVIEW ? "IndexForge (preview)" : "IndexForge",
  slug: "indexforge",
  scheme: "indexforge",
  version: "1.0.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  icon: "./assets/icon.png",
  // The new architecture is the default from SDK 52 onward and the flag was
  // removed from the config type in 57 — enabling it explicitly is now an error.

  ios: {
    bundleIdentifier: bundleId("com.indexforge.app"),
    supportsTablet: true,
    // Universal Links. The web app must serve
    // /.well-known/apple-app-site-association for these to open in the app
    // rather than in Safari.
    associatedDomains: ["applinks:indexforge.com"],
    infoPlist: {
      // Alerts are transactional. Apple rejects push used for marketing, so
      // the copy the OS shows has to say what it is actually for.
      NSUserNotificationsUsageDescription:
        "Get notified when a ranking, rating or revenue alert you configured is triggered.",
    },
  },

  android: {
    package: bundleId("com.indexforge.app"),
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#0f172a",
    },
    // App Links. Needs /.well-known/assetlinks.json served by the web app.
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [{ scheme: "https", host: "indexforge.com" }],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },

  plugins: [
    "expo-router",
    "expo-secure-store",
    [
      "expo-notifications",
      {
        // Android tints this and ignores its colour, so the asset is a white
        // silhouette; the colour below is the tint applied to it.
        icon: "./assets/notification-icon.png",
        color: "#ff5722",
      },
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/splash-icon.png",
        imageWidth: 150,
        resizeMode: "contain",
        backgroundColor: "#f8fafc",
        dark: { backgroundColor: "#0f172a" },
      },
    ],
  ],

  experiments: { typedRoutes: true },

  extra: {
    /**
     * Read at runtime through expo-constants.
     *
     * EXPO_PUBLIC_ variables are inlined into the bundle, so nothing secret
     * belongs here — an API base URL is public by definition, an API key is not.
     */
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000",
    googleClientIdIos: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS,
    googleClientIdAndroid: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID,
    eas: { projectId: process.env.EAS_PROJECT_ID },
  },
};

export default config;
