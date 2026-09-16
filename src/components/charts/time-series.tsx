"use client";

import { type MetricKey } from "@prisma/client";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { format } from "date-fns";

import { formatCompact, formatMetric, METRIC_META } from "@aso/shared";
import { ChartEmpty, ChartLegend, ChartTable, ChartTooltip } from "@/components/charts/chart-parts";
import { CHART_INK, seriesColor } from "@/components/charts/tokens";

export type SeriesPoint = Record<string, string | number>;

type Props = {
  data: SeriesPoint[];
  metrics: MetricKey[];
  /** Area reads as volume; line reads as rate. */
  variant?: "line" | "area";
  height?: number;
  currency?: string;
  emptyMessage?: string;
};

function tickDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : format(date, "MMM d");
}

/**
 * One y-axis, always. Two measures of different scale get two charts rather
 * than a second axis — a dual axis lets the author choose which series "wins".
 */
export function TimeSeriesChart({
  data,
  metrics,
  variant = "area",
  height = 260,
  currency = "USD",
  emptyMessage = "No data for this period yet.",
}: Props) {
  const hasData = data.some((point) =>
    metrics.some((metric) => typeof point[metric] === "number" && point[metric] !== 0),
  );

  const legendItems = metrics.map((metric, index) => ({
    key: metric,
    label: METRIC_META[metric].label,
    color: seriesColor(index),
  }));

  if (!hasData) return <ChartEmpty message={emptyMessage} />;

  const Chart = variant === "area" ? AreaChart : LineChart;

  return (
    <div>
      <ChartLegend items={legendItems} className="mb-3" />
      <ResponsiveContainer width="100%" height={height}>
        <Chart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
          <defs>
            {metrics.map((metric, index) => (
              <linearGradient key={metric} id={`fill-${metric}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={seriesColor(index)} stopOpacity={0.28} />
                <stop offset="100%" stopColor={seriesColor(index)} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>

          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_INK.grid} />
          <XAxis
            dataKey="date"
            tickFormatter={tickDate}
            tickLine={false}
            axisLine={{ stroke: CHART_INK.axis }}
            minTickGap={28}
          />
          <YAxis
            tickFormatter={(value: number) => formatCompact(value)}
            tickLine={false}
            axisLine={false}
            width={52}
          />
          <Tooltip
            cursor={{ stroke: CHART_INK.axis, strokeWidth: 1 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <ChartTooltip
                  label={tickDate(String(label))}
                  rows={payload.map((entry) => ({
                    key: String(entry.dataKey),
                    label: METRIC_META[entry.dataKey as MetricKey]?.label ?? String(entry.dataKey),
                    value: formatMetric(entry.dataKey as MetricKey, Number(entry.value), currency),
                    color: String(entry.color),
                  }))}
                />
              );
            }}
          />

          {metrics.map((metric, index) =>
            variant === "area" ? (
              <Area
                key={metric}
                type="monotone"
                dataKey={metric}
                stroke={seriesColor(index)}
                strokeWidth={2}
                fill={`url(#fill-${metric})`}
                activeDot={{ r: 4, strokeWidth: 2, stroke: CHART_INK.surface }}
                dot={false}
              />
            ) : (
              <Line
                key={metric}
                type="monotone"
                dataKey={metric}
                stroke={seriesColor(index)}
                strokeWidth={2}
                activeDot={{ r: 4, strokeWidth: 2, stroke: CHART_INK.surface }}
                dot={false}
              />
            ),
          )}
        </Chart>
      </ResponsiveContainer>

      <ChartTable
        columns={["Date", ...metrics.map((m) => METRIC_META[m].label)]}
        rows={data.map((point) => [
          String(point.date),
          ...metrics.map((metric) => formatMetric(metric, Number(point[metric] ?? 0), currency)),
        ])}
      />
    </div>
  );
}
