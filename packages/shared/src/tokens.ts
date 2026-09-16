
/**
 * Brand colour, distinct from the chart palette.
 *
 * The marketing site and the mobile app carry violet; charts stay on the
 * validated blue series. Same split as the web, for the same reason: --accent
 * doubles as a series colour in the product, and a violet there would collide
 * with the dataviz palette.
 */
/**
 * IndexForge brand.
 *
 * A dark-first identity: the palette is built for Forge Obsidian, where Slate
 * White reads at 17:1 and Molten Orange at 5.6:1. On light surfaces the same
 * accents need help — the raw brand hexes fail WCAG AA there, and every value
 * below was derived rather than picked.
 *
 * The decision worth knowing about: **the primary button is Molten Orange with
 * an obsidian label, not a white one.** White on #FF5722 is 3.16:1, which fails
 * AA for the single most-used piece of text in the product. Obsidian on the same
 * orange is 5.64:1 and passes in both themes, so the brand hex survives exactly
 * as specified instead of being quietly darkened into something duller. It also
 * reads more like industrial signage, which suits the name.
 *
 * Ratios are against Slate White (#F8FAFC) for `ink` and Forge Obsidian
 * (#0F172A) for `inkDark`, and are pinned by tests in tokens.test.ts.
 */
/**
 * IndexForge brand.
 *
 * A dark-first identity: the palette is built for Forge Obsidian, where Slate
 * White reads at 17:1 and Molten Orange at 5.6:1. On light surfaces the same
 * accents need help — the raw brand hexes fail WCAG AA there, and every value
 * below was derived rather than picked.
 *
 * ## Why there are two oranges
 *
 * `base` is Molten Orange exactly as specified. It is the brand's colour and it
 * is used for everything that does not carry text: the mark, badges, chart
 * accents, borders, fills behind icons.
 *
 * `action` is the same hue deepened until **white** text on it clears 4.5:1.
 * Buttons take white labels, and white on #ff5722 is 3.16:1 — a fail on the
 * most-clicked text in the product. Deepening the fill rather than darkening
 * the whole palette keeps Molten Orange itself untouched everywhere it is not
 * a background for words.
 *
 * Ratios are against Slate White (#f8fafc) for `ink` and Forge Obsidian
 * (#0f172a) for `inkDark`, and are pinned by brand-contrast.test.ts.
 */
export const BRAND = {
  /** Molten Orange, exactly as specified. Marks, badges, accents — never behind text. */
  base: "#ff5722",

  /** Interactive fills that carry a white label. 4.54:1 with white. */
  action: "#d1471c",
  /** Pressed and hover state for `action`. 5.99:1 with white. */
  hover: "#b03c17",
  /** What goes on `action`. */
  contrast: "#ffffff",

  /** Molten Orange as *text* on a light surface. 4.50:1. */
  ink: "#cc461b",
  /** Molten Orange as text on obsidian. 6.50:1. */
  inkDark: "#ff7043",
  /** Brand hue on a dark surface, for fills and icons rather than text. */
  onDark: "#ff5722",

  /** Tinted surfaces — badges, callouts, selected rows. */
  soft: "#fff1ec",
  softDark: "#2a1710",

  /** Steel Blue. The data accent: links, active states, secondary series. */
  accent: "#3b82f6",
  accentInk: "#3370d4",
  accentInkDark: "#60a5fa",

  /** The two neutrals the identity is named for. */
  obsidian: "#0f172a",
  slate: "#f8fafc",
} as const;

/**
 * The dataviz palette, in JavaScript.
 *
 * The web reads these from CSS custom properties in `globals.css`. React Native
 * has no CSS, so the same values live here and both surfaces reference one
 * source. The alternative — picking fresh colours for mobile — means the same
 * series is a different colour on a phone than on a laptop, which quietly
 * breaks the one thing a chart legend is for.
 *
 * The series colours are chosen to stay distinguishable for the common forms of
 * colour blindness and to hold contrast on both backgrounds. Reordering or
 * substituting them is not a cosmetic change.
 *
 * When these change, `src/app/globals.css` must change with them.
 */

export const SERIES_LIGHT = [
  "#2a78d6",
  "#eb6834",
  "#1baf7a",
  "#eda100",
  "#e87ba4",
  "#008300",
  "#4a3aa7",
  "#e34948",
] as const;

export const SERIES_DARK = [
  "#3987e5",
  "#d95926",
  "#199e70",
  "#c98500",
  "#d55181",
  "#008300",
  "#9085e9",
  "#e66767",
] as const;

export const PALETTE = {
  light: {
    page: "#f9f9f7",
    surface: "#fcfcfb",
    surfaceRaised: "#ffffff",
    textPrimary: "#0b0b0b",
    textSecondary: "#52514e",
    textMuted: "#898781",
    border: "rgba(11, 11, 11, 0.1)",
    accent: "#2a78d6",
    accentContrast: "#ffffff",
    statusGood: "#0ca30c",
    statusWarning: "#fab219",
    statusSerious: "#ec835a",
    statusCritical: "#d03b3b",
    deltaUp: "#006300",
    deltaDown: "#d03b3b",
    series: SERIES_LIGHT,
  },
  dark: {
    page: "#0d0d0d",
    surface: "#1a1a19",
    surfaceRaised: "#222220",
    textPrimary: "#ffffff",
    textSecondary: "#c3c2b7",
    textMuted: "#898781",
    border: "rgba(255, 255, 255, 0.1)",
    accent: "#3987e5",
    accentContrast: "#ffffff",
    statusGood: "#0ca30c",
    statusWarning: "#fab219",
    statusSerious: "#ec835a",
    statusCritical: "#d03b3b",
    deltaUp: "#0ca30c",
    deltaDown: "#d03b3b",
    series: SERIES_DARK,
  },
} as const;

export type ColorScheme = keyof typeof PALETTE;

/** Wraps around rather than running out, so any series count renders. */
export function seriesColor(index: number, scheme: ColorScheme = "light"): string {
  const series = PALETTE[scheme].series;
  return series[index % series.length]!;
}

/**
 * Colour for a change, given whether up is good for this metric.
 *
 * Takes the direction explicitly because it is not universal: installs rising
 * is good, crash rate rising is not, and a component that assumes green-for-up
 * will confidently colour a regression as a win.
 */
export function deltaColor(
  delta: number,
  higherIsBetter: boolean,
  scheme: ColorScheme = "light",
): string {
  if (delta === 0) return PALETTE[scheme].textMuted;
  const good = delta > 0 === higherIsBetter;
  return good ? PALETTE[scheme].deltaUp : PALETTE[scheme].deltaDown;
}
