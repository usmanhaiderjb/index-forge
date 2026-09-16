"use client";

import { type MetricKey } from "@prisma/client";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatCompact, formatMetric, METRIC_META } from "@aso/shared";
import { ChartEmpty, ChartTable, ChartTooltip } from "@/components/charts/chart-parts";
import { CHART_INK, seriesColor } from "@/components/charts/tokens";

type Row = { key: string; label: string; value: number };

/**
 * Horizontal magnitude comparison. A single measure across categories is one
 * series, so every bar wears slot 1 — colour here would encode nothing.
 */
export function BreakdownBar({
  rows,
  metric,
  currency = "USD",
  height,
  highlightTop,
  emptyMessage = "Nothing to break down yet.",
}: {
  rows: Row[];
  metric: MetricKey;
  currency?: string;
  height?: number;
  /** Tints the leading bar when the top item is the point being made. */
  highlightTop?: boolean;
  emptyMessage?: string;
}) {
  if (rows.length === 0) return <ChartEmpty message={emptyMessage} />;

  const chartHeight = height ?? Math.max(180, rows.length * 32 + 24);

  return (
    <div>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={CHART_INK.grid} />
          <XAxis
            type="number"
            tickFormatter={(value: number) => formatCompact(value)}
            tickLine={false}
            axisLine={{ stroke: CHART_INK.axis }}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={120}
            tickLine={false}
            axisLine={false}
            interval={0}
          />
          <Tooltip
            cursor={{ fill: "color-mix(in oklab, var(--text-muted) 10%, transparent)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0]!.payload as Row;
              return (
                <ChartTooltip
                  rows={[
                    {
                      key: row.key,
                      label: row.label,
                      value: formatMetric(metric, row.value, currency),
                      color: seriesColor(0),
                    },
                  ]}
                />
              );
            }}
          />
          {/* 4px rounded ends on the data side, square against the baseline. */}
          <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={16}>
            {rows.map((row, index) => (
              <Cell
                key={row.key}
                fill={highlightTop && index === 0 ? seriesColor(1) : seriesColor(0)}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <ChartTable
        columns={["Item", METRIC_META[metric].label]}
        rows={rows.map((row) => [row.label, formatMetric(metric, row.value, currency)])}
      />
    </div>
  );
}

/** Rating histogram — an ordered scale, so it uses one hue and reads left to right. */
export function RatingDistribution({ rows }: { rows: { rating: number; count: number }[] }) {
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  if (total === 0) return <ChartEmpty message="No reviews in this period." />;

  const max = Math.max(...rows.map((r) => r.count));

  return (
    <div className="flex flex-col gap-2">
      {[...rows].reverse().map((row) => (
        <div key={row.rating} className="flex items-center gap-3">
          <span className="tabular w-8 text-xs text-[var(--text-secondary)]">{row.rating}★</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--text-muted)_14%,transparent)]">
            <div
              className="h-full rounded-full"
              style={{
                width: `${max ? (row.count / max) * 100 : 0}%`,
                background: seriesColor(0),
              }}
            />
          </div>
          <span className="tabular w-16 text-right text-xs text-[var(--text-secondary)]">
            {row.count} ({total ? Math.round((row.count / total) * 100) : 0}%)
          </span>
        </div>
      ))}
    </div>
  );
}
