import { cn } from "@aso/shared";

/**
 * Building blocks for the product mockups on the marketing pages.
 *
 * These are real DOM and inline SVG rather than screenshots: they scale to any
 * width, follow the theme, stay crisp on any display, and cannot drift out of
 * date the way an exported PNG of last quarter's UI does.
 */

/** A browser-ish panel that stays dark in both themes, as in the reference. */
export function Panel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-[var(--panel-border)] bg-[var(--panel-raised)] text-[var(--panel-ink)] shadow-2xl shadow-black/20",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function StatTile({
  label,
  value,
  delta,
  positive = true,
}: {
  label: string;
  value: string;
  delta?: string;
  positive?: boolean;
}) {
  return (
    <div className="rounded-lg border border-[var(--panel-border)] bg-[var(--panel)] p-3">
      <p className="text-[10px] uppercase tracking-wider text-[var(--panel-ink-muted)]">{label}</p>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="tabular text-lg font-semibold leading-none">{value}</span>
        {delta ? (
          <span
            className="tabular text-[10px] font-medium"
            style={{ color: positive ? "#4ade80" : "#f87171" }}
          >
            {delta}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * A smooth line from normalized 0–1 values.
 *
 * Deterministic by construction — no randomness, so the same illustration
 * renders identically on the server and the client and never hydration-mismatches.
 */
export function Sparkline({
  points,
  color = "var(--accent)",
  fill = true,
  className,
  strokeWidth = 2,
}: {
  points: number[];
  color?: string;
  fill?: boolean;
  className?: string;
  strokeWidth?: number;
}) {
  const width = 100;
  const height = 32;
  const step = points.length > 1 ? width / (points.length - 1) : width;

  const coords = points.map((value, i) => {
    const x = i * step;
    // 2px inset top and bottom so the stroke is never clipped at the extremes.
    const y = height - 2 - value * (height - 4);
    return [x, y] as const;
  });

  const line = coords
    .map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`))
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn("w-full", className)}
      aria-hidden
    >
      {fill ? (
        <path
          d={`${line} L${width},${height} L0,${height} Z`}
          fill={color}
          opacity={0.14}
        />
      ) : null}
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function ProgressBar({
  value,
  color = "var(--accent)",
}: {
  value: number;
  color?: string;
}) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
      <div
        className="h-full rounded-full"
        style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }}
      />
    </div>
  );
}
