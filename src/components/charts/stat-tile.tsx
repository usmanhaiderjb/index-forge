"use client";

import { type MetricKey } from "@prisma/client";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";

import { cn, deltaTone, formatDelta, formatMetric, METRIC_META } from "@aso/shared";
import { Skeleton } from "@/components/ui/primitives";

type Props = {
  metric: MetricKey;
  value: number;
  changePct: number | null;
  currency?: string;
  hasData?: boolean;
  onClick?: () => void;
  isActive?: boolean;
};

/**
 * A single number with its period-over-period move. Direction is carried by an
 * icon and a sign as well as colour — a drop in uninstalls or CPI is good news,
 * so the tone consults the metric's direction rather than the sign alone.
 */
export function StatTile({
  metric,
  value,
  changePct,
  currency = "USD",
  hasData = true,
  onClick,
  isActive,
}: Props) {
  const meta = METRIC_META[metric];
  const tone = deltaTone(metric, changePct);

  const Icon = tone === "flat" ? ArrowRight : changePct !== null && changePct > 0 ? ArrowUpRight : ArrowDownRight;

  const toneClass =
    tone === "up"
      ? "text-[var(--delta-up)]"
      : tone === "down"
        ? "text-[var(--delta-down)]"
        : "text-[var(--text-muted)]";

  const Wrapper = onClick ? "button" : "div";

  return (
    <Wrapper
      {...(onClick ? { onClick, type: "button" as const } : {})}
      className={cn(
        "flex w-full flex-col gap-1 rounded-[var(--radius-card)] border bg-[var(--surface)] p-4 text-left transition-colors",
        isActive ? "border-[var(--accent)]" : "border-[var(--border)]",
        onClick && "hover:border-[var(--border-strong)]",
      )}
    >
      <span className="text-xs font-medium text-[var(--text-secondary)]">{meta.label}</span>

      {hasData ? (
        <span className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
          {formatMetric(metric, value, currency)}
        </span>
      ) : (
        <span className="text-2xl font-semibold tracking-tight text-[var(--text-muted)]">—</span>
      )}

      <span className={cn("flex items-center gap-1 text-xs font-medium", toneClass)}>
        <Icon aria-hidden className="size-3.5" />
        {formatDelta(changePct)}
        <span className="font-normal text-[var(--text-muted)]">vs previous period</span>
      </span>
    </Wrapper>
  );
}

export function StatTileSkeleton() {
  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-7 w-24" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}
