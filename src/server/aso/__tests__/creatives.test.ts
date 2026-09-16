import { describe, expect, it } from "vitest";

import { analyzeCreatives } from "../builtin/creatives";

describe("Creative Gallery & Screenshot Analyzer", () => {
  it("evaluates screenshot gallery depth, orientation, and readability scores", () => {
    const urls = [
      "https://is1-ssl.mzstatic.com/image/thumb/1.png",
      "https://is1-ssl.mzstatic.com/image/thumb/2.png",
      "https://is1-ssl.mzstatic.com/image/thumb/3.png",
      "https://is1-ssl.mzstatic.com/image/thumb/4.png",
      "https://is1-ssl.mzstatic.com/image/thumb/5.png",
    ];

    const report = analyzeCreatives(urls, true, "https://is1-ssl.mzstatic.com/icon.png");

    expect(report.totalCount).toBe(5);
    expect(report.hasVideoPreview).toBe(true);
    expect(report.hasIcon).toBe(true);
    expect(report.dominantOrientation).toBe("PORTRAIT");
    expect(report.visualConversionScore).toBeGreaterThanOrEqual(75);

    expect(report.screenshots.length).toBe(5);
    expect(report.screenshots[0]?.isFirstImpression).toBe(true);
    expect(report.screenshots[1]?.isFirstImpression).toBe(true);
    expect(report.screenshots[2]?.isFirstImpression).toBe(false);

    expect(report.actionableAudit.every((a) => a.passed)).toBe(true);
  });

  it("flags incomplete gallery when fewer than 5 screenshots are provided", () => {
    const urls = ["https://is1-ssl.mzstatic.com/1.png", "https://is1-ssl.mzstatic.com/2.png"];
    const report = analyzeCreatives(urls, false);

    expect(report.totalCount).toBe(2);
    expect(report.weaknesses.length).toBeGreaterThan(0);
    const galleryRule = report.actionableAudit.find((a) => a.rule.includes("Gallery Length"));
    expect(galleryRule?.passed).toBe(false);
  });
});
