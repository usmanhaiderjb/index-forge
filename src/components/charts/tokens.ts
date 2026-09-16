/**
 * Chart color slots.
 *
 * Series are assigned in this fixed order and never cycled — the ordering is
 * what makes adjacent series distinguishable under colour-vision deficiency,
 * so a ninth series folds into "Other" rather than getting a generated hue.
 */
export const SERIES_SLOTS = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
  "var(--series-7)",
  "var(--series-8)",
] as const;

export const MAX_SERIES = SERIES_SLOTS.length;

export function seriesColor(index: number): string {
  return SERIES_SLOTS[index % SERIES_SLOTS.length]!;
}

/**
 * Charts that put every pair on screen at once (scatter, small multiples) only
 * validate for the first three slots — past that, fold or facet.
 */
export const MAX_SERIES_ALL_PAIRS = 3;

export const CHART_INK = {
  grid: "var(--grid)",
  axis: "var(--axis)",
  muted: "var(--text-muted)",
  secondary: "var(--text-secondary)",
  primary: "var(--text-primary)",
  surface: "var(--surface)",
} as const;
