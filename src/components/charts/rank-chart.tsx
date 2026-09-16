"use client";

import { format } from "date-fns";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ChartEmpty, ChartLegend, ChartTable, ChartTooltip } from "@/components/charts/chart-parts";
import { CHART_INK, MAX_SERIES, seriesColor } from "@/components/charts/tokens";

type Props = {
  terms: { id: string; term: string }[];
  series: Record<string, number | string | null>[];
  height?: number;
};

function tickDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : format(date, "MMM d");
}

/**
 * Rank tracking. Rank 1 is the best result, so the axis is reversed — up on
 * the chart means up in the store. Days where the app was outside the scanned
 * window stay null and break the line rather than dropping to zero, because
 * "not in the top 100" and "rank 0" are different facts.
 */
export function RankChart({ terms, series, height = 280 }: Props) {
  const shown = terms.slice(0, MAX_SERIES);

  const ranked = series.filter((point) =>
    shown.some((term) => typeof point[term.term] === "number"),
  );

  if (shown.length === 0 || ranked.length === 0) {
    return <ChartEmpty message="No rank history yet. Ranks are checked once a day." />;
  }

  const values = ranked.flatMap((point) =>
    shown.map((term) => point[term.term]).filter((v): v is number => typeof v === "number"),
  );
  const worst = Math.min(100, Math.max(10, Math.ceil(Math.max(...values) / 10) * 10));

  const legendItems = shown.map((term, index) => ({
    key: term.id,
    label: term.term,
    color: seriesColor(index),
  }));

  return (
    <div>
      <ChartLegend items={legendItems} className="mb-3" />
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={series} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_INK.grid} />
          <XAxis
            dataKey="date"
            tickFormatter={tickDate}
            tickLine={false}
            axisLine={{ stroke: CHART_INK.axis }}
            minTickGap={28}
          />
          <YAxis
            reversed
            domain={[1, worst]}
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            width={40}
            tickFormatter={(value: number) => `#${value}`}
          />
          <Tooltip
            cursor={{ stroke: CHART_INK.axis, strokeWidth: 1 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <ChartTooltip
                  label={tickDate(String(label))}
                  rows={payload
                    .filter((entry) => entry.value !== null && entry.value !== undefined)
                    .map((entry) => ({
                      key: String(entry.dataKey),
                      label: String(entry.dataKey),
                      value: `#${entry.value}`,
                      color: String(entry.color),
                    }))}
                />
              );
            }}
          />
          {shown.map((term, index) => (
            <Line
              key={term.id}
              type="monotone"
              dataKey={term.term}
              stroke={seriesColor(index)}
              strokeWidth={2}
              dot={false}
              connectNulls={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: CHART_INK.surface }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {terms.length > MAX_SERIES ? (
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          Showing the first {MAX_SERIES} keywords. Deselect some to compare others.
        </p>
      ) : null}

      <ChartTable
        columns={["Date", ...shown.map((t) => t.term)]}
        rows={series.map((point) => [
          String(point.date),
          ...shown.map((term) => {
            const value = point[term.term];
            return typeof value === "number" ? `#${value}` : "—";
          }),
        ])}
      />
    </div>
  );
}
