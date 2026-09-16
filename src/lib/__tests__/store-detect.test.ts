import { describe, expect, it } from "vitest";
import { detectStoreInput } from "../store-detect";

describe("detectStoreInput", () => {
  it("detects Apple App Store URLs and extracts platform, store ID, and country", () => {
    const result = detectStoreInput(
      "https://apps.apple.com/us/app/duolingo-language-lessons/id570060128",
    );
    expect(result.platform).toBe("IOS");
    expect(result.storeId).toBe("570060128");
    expect(result.country).toBe("us");
  });

  it("detects Apple App Store URLs in other countries", () => {
    const result = detectStoreInput(
      "https://apps.apple.com/gb/app/calm-sleep-meditation/id571800810",
    );
    expect(result.platform).toBe("IOS");
    expect(result.storeId).toBe("571800810");
    expect(result.country).toBe("gb");
  });

  it("detects numeric Apple store IDs and id prefixes", () => {
    expect(detectStoreInput("570060128")).toEqual({
      platform: "IOS",
      storeId: "570060128",
    });
    expect(detectStoreInput("id570060128")).toEqual({
      platform: "IOS",
      storeId: "570060128",
    });
  });

  it("detects Google Play Store URLs and extracts platform, package ID, and country", () => {
    const result = detectStoreInput(
      "https://play.google.com/store/apps/details?id=com.duolingo&hl=en_US&gl=US",
    );
    expect(result.platform).toBe("ANDROID");
    expect(result.storeId).toBe("com.duolingo");
    expect(result.country).toBe("us");
  });

  it("detects Android package names", () => {
    expect(detectStoreInput("com.spotify.music")).toEqual({
      platform: "ANDROID",
      storeId: "com.spotify.music",
    });
    expect(detectStoreInput("org.telegram.messenger")).toEqual({
      platform: "ANDROID",
      storeId: "org.telegram.messenger",
    });
  });

  it("returns empty object for generic search keywords", () => {
    expect(detectStoreInput("language learning")).toEqual({});
    expect(detectStoreInput("workout tracker")).toEqual({});
    expect(detectStoreInput("")).toEqual({});
  });
});
