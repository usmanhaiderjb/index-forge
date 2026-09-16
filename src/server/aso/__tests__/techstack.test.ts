import { describe, expect, it } from "vitest";

import { inspectTechStack } from "../builtin/techstack";
import type { AsoAppDetail } from "../types";

describe("SDK & Tech Stack Teardown Engine", () => {
  it("detects baseline analytics, crashlytics, and push notification SDKs", () => {
    const appDetail: AsoAppDetail = {
      platform: "IOS",
      storeId: "123456789",
      name: "Habit Tracker Pro",
      description: "Track your habits and daily routines with monthly subscription and in-app ads.",
      price: 0,
    };

    const report = inspectTechStack(appDetail);

    expect(report.platform).toBe("IOS");
    expect(report.sdks.length).toBeGreaterThan(0);

    const sdkIds = report.sdks.map((s) => s.id);
    expect(sdkIds).toContain("firebase");
    expect(sdkIds).toContain("crashlytics");
    expect(sdkIds).toContain("fcm");
    expect(sdkIds).toContain("revenuecat"); // triggered by 'subscription' in description

    expect(report.privacyScore).toBeGreaterThanOrEqual(40);
    expect(report.privacyScore).toBeLessThanOrEqual(100);
    expect(report.conversionFrictionScore).toBeGreaterThanOrEqual(0);
    expect(report.permissions.length).toBeGreaterThan(0);
  });

  it("identifies Flutter or React Native frameworks from app signatures", () => {
    const flutterApp: AsoAppDetail = {
      platform: "ANDROID",
      storeId: "com.example.flutterapp",
      name: "Flutter Fitness App",
      description: "Built with Flutter for high performance cross platform workouts.",
    };

    const report = inspectTechStack(flutterApp);
    expect(report.framework).toBe("Flutter");
  });
});
