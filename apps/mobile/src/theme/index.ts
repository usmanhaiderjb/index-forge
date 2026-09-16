import { Platform, useColorScheme } from "react-native";

import { BRAND, PALETTE, seriesColor, deltaColor, type ColorScheme } from "@aso/shared";

/**
 * Theme.
 *
 * Chart colours come from `packages/shared/src/tokens.ts` — the same values the
 * web reads out of CSS — so a series is the same colour on a phone as on a
 * laptop. The brand violet is separate from that palette on purpose: it carries
 * identity (splash, primary actions, active nav) while charts stay on the
 * validated blue series.
 */

/** 4pt grid. Every gap and inset in the app resolves to one of these. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 40,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
} as const;

/**
 * Type scale.
 *
 * Deliberately few steps. A dashboard reads as designed when numbers share one
 * size and labels share another; a scale with eleven steps reads as accidental.
 * Letter spacing tightens as size grows, which is what stops large numerals
 * looking loose.
 */
export const typeScale = {
  display: { fontSize: 34, fontWeight: "700", letterSpacing: -0.8 },
  title: { fontSize: 24, fontWeight: "700", letterSpacing: -0.5 },
  metric: { fontSize: 26, fontWeight: "700", letterSpacing: -0.6 },
  heading: { fontSize: 17, fontWeight: "600", letterSpacing: -0.2 },
  body: { fontSize: 15, fontWeight: "400" },
  label: { fontSize: 13, fontWeight: "500" },
  caption: { fontSize: 11, fontWeight: "500", letterSpacing: 0.3 },
} as const;

/**
 * Elevation.
 *
 * iOS and Android express depth differently — a shadow versus a material
 * elevation — and using one on both makes the app look ported. Each level
 * carries both.
 */
export const elevation = {
  none: {},
  low: Platform.select({
    ios: {
      shadowColor: "#0b0b0b",
      shadowOpacity: 0.06,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
    },
    android: { elevation: 1 },
    default: {},
  }),
  medium: Platform.select({
    ios: {
      shadowColor: "#0b0b0b",
      shadowOpacity: 0.1,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
    },
    android: { elevation: 3 },
    default: {},
  }),
} as const;

/**
 * `PALETTE` is declared `as const`, so each scheme carries literal string types
 * and the light and dark objects are not assignable to one another. Widening to
 * `string` is what lets one Theme type describe both.
 */
export type Palette = {
  [K in keyof (typeof PALETTE)["light"]]: (typeof PALETTE)["light"][K] extends readonly unknown[]
    ? readonly string[]
    : string;
};

export type Brand = {
  action: string;
  hover: string;
  obsidian: string;
  face: string;
  accent: string;
  base: string;
  soft: string;
  ink: string;
  contrast: string;
};

export type Theme = {
  scheme: ColorScheme;
  isDark: boolean;
  color: Palette;
  brand: Brand;
  spacing: typeof spacing;
  radius: typeof radius;
  type: typeof typeScale;
  elevation: typeof elevation;
};

export function useTheme(): Theme {
  // Follows the OS. An in-app override would need persisting and reading before
  // first paint, which is a later problem rather than a first-release one.
  const scheme: ColorScheme = useColorScheme() === "dark" ? "dark" : "light";
  const isDark = scheme === "dark";

  return {
    scheme,
    isDark,
    color: PALETTE[scheme],
    brand: {
      // Molten Orange proper. Used for marks, badges and accents — anything
      // that is not a background for text.
      base: isDark ? BRAND.onDark : BRAND.base,
      /**
       * Button fills. Deliberately not `base`: buttons carry white labels, and
       * white on #ff5722 is 3.16:1, below the 4.5:1 WCAG AA needs. `action` is
       * the same hue deepened until white clears the bar.
       */
      action: BRAND.action,
      hover: BRAND.hover,
      soft: isDark ? BRAND.softDark : BRAND.soft,
      ink: isDark ? BRAND.inkDark : BRAND.ink,
      contrast: BRAND.contrast,
      /* Fixed mark colours — a logo that changes with the OS theme is not a logo. */
      obsidian: BRAND.obsidian,
      face: BRAND.slate,
      accent: BRAND.accent,
    },
    spacing,
    radius,
    type: typeScale,
    elevation,
  };
}

export { seriesColor, deltaColor };
