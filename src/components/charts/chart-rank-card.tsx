"use client";

import { ArrowDown, ArrowUp, Minus, Trophy } from "lucide-react";

import { cn } from "@aso/shared";
import { Badge, Card, CardContent, CardHeader, CardTitle, Skeleton } from "@/components/ui/primitives";
import { api } from "@/trpc/react";

const CHART_LABEL: Record<string, string> = {
  TOP_FREE: "Top Free",
  TOP_PAID: "Top Paid",
  TOP_GROSSING: "Top Grossing",
};

/**
 * Store chart position.
 *
 * Kept separate from keyword rank because the two move for different reasons:
 * chart position tracks download velocity, keyword rank tracks relevance. A
 * listing edit shows up in one, a feature or campaign in the other.
 */
export function ChartRankCard({ appId }: { appId: string }) {
  const charts = api.apps.chartRanks.useQuery({ appId, days: 30 });

  const charted = charts.data?.filter((c) => c.current !== null) ?? [];
  const uncharted = charts.data?.filter((c) => c.current === null) ?? [];

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="size-4" aria-hidden /> Store charts
          </CardTitle>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            Chart position reflects download velocity, not relevance — it moves for different
            reasons than keyword rank.
          </p>
        </div>
      </CardHeader>

      <CardContent>
        {charts.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : charted.length === 0 && uncharted.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">
            No chart scans yet. Charts are checked once a day, or immediately after a refresh.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {charted.map((entry) => (
              <div
                key={`${entry.chart}:${entry.country}:${entry.category}`}
                className="flex flex-wrap items-center gap-2"
              >
                <span className="text-sm font-medium">{CHART_LABEL[entry.chart] ?? entry.chart}</span>
                <Badge>{entry.country.toUpperCase()}</Badge>
                <Badge tone={entry.category === "overall" ? "neutral" : "accent"}>
                  {entry.category === "overall" ? "Overall" : entry.category}
                </Badge>

                <span className="tabular ml-auto text-lg font-semibold">#{entry.current}</span>
                <Delta delta={entry.delta} />

                {entry.best !== null && entry.best < (entry.current ?? Infinity) ? (
                  <span className="tabular text-xs text-[var(--text-muted)]">
                    best #{entry.best}
                  </span>
                ) : null}
              </div>
            ))}

            {uncharted.length > 0 ? (
              <p className="border-t border-[var(--border)] pt-2 text-xs text-[var(--text-muted)]">
                Outside the scanned depth in{" "}
                {uncharted
                  .map(
                    (e) =>
                      `${CHART_LABEL[e.chart] ?? e.chart} ${e.country.toUpperCase()}${
                        e.category ? ` (${e.category})` : ""
                      }`,
                  )
                  .join(", ")}
                . Scanned to #{uncharted[0]?.scanDepth ?? 0} — that is not the same as unranked.
              </p>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Positive delta means the app climbed, since #1 is the top of the chart. */
function Delta({ delta }: { delta: number | null }) {
  if (delta === null || delta === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-[var(--text-muted)]">
        <Minus className="size-3" aria-hidden /> 0
      </span>
    );
  }

  const up = delta > 0;
  return (
    <span
      className={cn(
        "tabular inline-flex items-center gap-0.5 text-xs font-medium",
        up ? "text-[var(--delta-up)]" : "text-[var(--delta-down)]",
      )}
    >
      {up ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />}
      {Math.abs(delta)}
    </span>
  );
}
