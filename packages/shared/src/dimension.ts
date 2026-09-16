/**
 * The metric dimension format: `key=value|key=value`.
 *
 * An empty string means app-wide. Anything else slices the same metric by
 * country, campaign, ad unit or traffic source. Keys are sorted when built so
 * that the same slice always produces the same string — `MetricPoint` is unique
 * on `(appId, date, source, metric, dimension)`, and two spellings of one slice
 * would become two rows that then both get counted.
 *
 * This lives in the shared package rather than in the server's integration
 * types because connectors write it, the API reads it, and the mobile app
 * displays it. One definition, or they drift.
 */

export function buildDimension(
  parts: Record<string, string | number | undefined>,
): string {
  return Object.entries(parts)
    .filter(([, v]) => v !== undefined && v !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("|");
}

export function parseDimension(dimension: string): Record<string, string> {
  if (!dimension) return {};
  return Object.fromEntries(
    dimension.split("|").map((part) => {
      const idx = part.indexOf("=");
      return idx === -1 ? [part, ""] : [part.slice(0, idx), part.slice(idx + 1)];
    }),
  );
}
