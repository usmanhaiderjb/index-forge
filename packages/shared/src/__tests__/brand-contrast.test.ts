import { describe, expect, it } from "vitest";

import { BRAND } from "../tokens";

/**
 * WCAG contrast on the brand palette.
 *
 * These exist because the IndexForge palette is dark-first and its raw hexes do
 * not survive a light background: Molten Orange on Slate White is 3.02:1 and
 * white on Molten Orange is 3.16:1, both below the 4.5:1 needed for body text.
 * Every `ink` value in `BRAND` is a derived variant that clears the bar.
 *
 * A palette is exactly the kind of thing someone adjusts by eye later. Failing
 * loudly is cheaper than shipping a button nobody with low vision can read.
 */

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

export function contrast(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

/** WCAG 2.1 AA: 4.5:1 for body text, 3:1 for large text and UI boundaries. */
const AA_TEXT = 4.5;
const AA_LARGE = 3;

describe("brand contrast", () => {
  it("puts a legible white label on the primary button", () => {
    // The single most-used text in the product.
    expect(BRAND.contrast).toBe("#ffffff");
    expect(contrast(BRAND.contrast, BRAND.action)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("keeps the label legible while the button is pressed", () => {
    expect(contrast(BRAND.contrast, BRAND.hover)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("never puts white text on raw Molten Orange", () => {
    // The reason `action` exists as a separate token. #ff5722 is the brand
    // colour and is fine behind icons and marks; it is 3.16:1 behind white
    // text, so a button must never use it as a fill.
    expect(contrast("#ffffff", BRAND.base)).toBeLessThan(AA_TEXT);
    expect(BRAND.action).not.toBe(BRAND.base);
  });

  it("reads as text on both surfaces", () => {
    expect(contrast(BRAND.ink, BRAND.slate)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrast(BRAND.inkDark, BRAND.obsidian)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrast(BRAND.accentInk, BRAND.slate)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrast(BRAND.accentInkDark, BRAND.obsidian)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("carries body text on tinted surfaces", () => {
    expect(contrast(BRAND.obsidian, BRAND.soft)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrast(BRAND.slate, BRAND.softDark)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("holds the two named neutrals far apart", () => {
    expect(contrast(BRAND.slate, BRAND.obsidian)).toBeGreaterThan(15);
  });

  it("keeps brand fills visible against their own page background", () => {
    // Not text, so the 3:1 UI-component threshold applies.
    expect(contrast(BRAND.base, BRAND.slate)).toBeGreaterThanOrEqual(AA_LARGE);
    expect(contrast(BRAND.onDark, BRAND.obsidian)).toBeGreaterThanOrEqual(AA_LARGE);
  });

  it("uses lowercase six-digit hex throughout, so comparisons are literal", () => {
    for (const [name, value] of Object.entries(BRAND)) {
      expect(value, name).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
