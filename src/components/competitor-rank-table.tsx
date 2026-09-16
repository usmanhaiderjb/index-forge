"use client";

import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import * as React from "react";

import { cn } from "@aso/shared";
import { Card, CardContent, CardHeader, CardTitle, Select, Skeleton } from "@/components/ui/primitives";
import { api } from "@/trpc/react";

/**
 * Our rank against tracked competitors for one keyword.
 *
 * Reads stored positions from the daily scan rather than searching live: a
 * fresh search would show today's result page, which is not the page the
 * historical ranks were measured on, so the two would not be comparable.
 */
export function CompetitorRankTable({ appId }: { appId: string }) {
  const [keywordId, setKeywordId] = React.useState<string | null>(null);

  const data = api.keywords.competitorRanks.useQuery({ appId });
  const rows = data.data ?? [];

  // Default to the keyword with the most competitors on the board — the one
  // where the comparison actually says something.
  const active =
    rows.find((row) => row.keywordId === keywordId) ??
    [...rows].sort((a, b) => b.competitorsRanked - a.competitorsRanked)[0];

  if (data.isLoading || data.isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Competitive position</CardTitle>
        </CardHeader>
        <CardContent>
          {data.isError ? (
            // Never fall through to the empty state here. "No competitors are
            // tracked" is a claim about the data; a failed query knows nothing
            // about the data and must not make that claim.
            <p className="text-sm text-[var(--status-critical)]">
              Could not load competitive position: {data.error.message}
            </p>
          ) : (
            <Skeleton className="h-40 w-full" />
          )}
        </CardContent>
      </Card>
    );
  }

  const noRivals = rows.every((row) => row.rivals.length === 0);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Competitive position</CardTitle>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            Where you sit against tracked competitors on the same result page, captured by the
            daily scan.
          </p>
        </div>
        {rows.length > 0 && !noRivals ? (
          <Select
            value={active?.keywordId ?? ""}
            onChange={(e) => setKeywordId(e.target.value)}
            aria-label="Keyword"
          >
            {rows.map((row) => (
              <option key={row.keywordId} value={row.keywordId}>
                {row.term}
              </option>
            ))}
          </Select>
        ) : null}
      </CardHeader>

      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">
            No tracked keywords yet. Add some below and the daily scan will fill this in.
          </p>
        ) : noRivals ? (
          <p className="text-sm text-[var(--text-secondary)]">
            No competitors are being tracked for this app, so there is nothing to compare against.
            Add them on the Competitors tab — the rank scan then records their positions on the
            same result pages it already fetches.
          </p>
        ) : !active ? null : (
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              {active.us.rank === null ? (
                <>
                  You are not in the top {active.scanDepth ?? 100} for{" "}
                  <span className="font-medium">{active.term}</span>, while{" "}
                  {active.competitorsRanked} tracked competitor
                  {active.competitorsRanked === 1 ? "" : "s"} rank.
                </>
              ) : (
                <>
                  You rank <span className="font-medium">#{active.us.rank}</span> for{" "}
                  <span className="font-medium">{active.term}</span>
                  {active.competitorsAhead === 0
                    ? ", ahead of every tracked competitor."
                    : `, behind ${active.competitorsAhead} tracked competitor${
                        active.competitorsAhead === 1 ? "" : "s"
                      }.`}
                </>
              )}
            </p>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-muted)]">
                  <th className="pb-2 font-medium">App</th>
                  <th className="pb-2 text-right font-medium">Rank</th>
                  <th className="pb-2 text-right font-medium">Change</th>
                </tr>
              </thead>
              <tbody>
                <Row
                  name={active.us.name}
                  rank={active.us.rank}
                  delta={active.us.delta}
                  scanDepth={active.scanDepth}
                  isUs
                />
                {active.rivals.map((rival) => (
                  <Row
                    key={rival.competitorId}
                    name={rival.name}
                    rank={rival.rank}
                    delta={rival.delta}
                    scanDepth={active.scanDepth}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Row({
  name,
  rank,
  delta,
  scanDepth,
  isUs = false,
}: {
  name: string;
  rank: number | null;
  delta: number | null;
  scanDepth: number | null;
  isUs?: boolean;
}) {
  return (
    <tr
      className={cn(
        "border-b border-[var(--border)] last:border-0",
        isUs && "bg-[var(--surface-raised)]",
      )}
    >
      <td className="py-2">
        <span className={cn(isUs && "font-medium")}>{name}</span>
        {isUs ? (
          <span className="ml-2 text-xs text-[var(--text-muted)]">you</span>
        ) : null}
      </td>
      <td className="tabular py-2 text-right">
        {rank === null ? (
          <span className="text-[var(--text-muted)]" title={`Outside the top ${scanDepth ?? 100}`}>
            &gt;{scanDepth ?? 100}
          </span>
        ) : (
          `#${rank}`
        )}
      </td>
      <td className="py-2 text-right">
        <RankDelta delta={delta} />
      </td>
    </tr>
  );
}

/** Positive delta means the app moved up the results. */
function RankDelta({ delta }: { delta: number | null }) {
  if (delta === null || delta === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)]">
        <Minus className="size-3" aria-hidden /> —
      </span>
    );
  }

  const up = delta > 0;
  const Icon = up ? ArrowUp : ArrowDown;

  return (
    <span
      className={cn(
        "tabular inline-flex items-center gap-1 text-xs",
        up ? "text-[var(--status-good)]" : "text-[var(--status-critical)]",
      )}
    >
      <Icon className="size-3" aria-hidden />
      {Math.abs(delta)}
    </span>
  );
}
