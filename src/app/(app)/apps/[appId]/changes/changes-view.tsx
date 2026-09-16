"use client";

import { MetricKey } from "@prisma/client";
import { format } from "date-fns";
import { ArrowDown, ArrowRight, ArrowUp, GitCommitHorizontal } from "lucide-react";
import * as React from "react";

import { cn, deltaTone, formatDelta, formatMetric, METRIC_META } from "@aso/shared";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Select,
  Skeleton,
} from "@/components/ui/primitives";
import { api } from "@/trpc/react";

export function ChangesView({ appId }: { appId: string }) {
  const [windowDays, setWindowDays] = React.useState(14);

  const changes = api.apps.changes.useQuery({ appId, windowDays, limit: 20 });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-[var(--text-secondary)]">
          Every time the store listing text changes, a snapshot is recorded. Each change is
          compared against the same number of days before and after, so a steady upward trend does
          not read as the effect of every edit.
        </p>
        <Select value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))}>
          <option value={7}>±7 day window</option>
          <option value={14}>±14 day window</option>
          <option value={30}>±30 day window</option>
        </Select>
      </div>

      {changes.isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      ) : changes.data?.length ? (
        <ol className="flex flex-col gap-4">
          {changes.data.map((change) => (
            <li key={change.id}>
              <Card>
                <CardHeader>
                  <div className="min-w-0">
                    <CardTitle className="flex flex-wrap items-center gap-2">
                      <GitCommitHorizontal className="size-4 text-[var(--accent)]" aria-hidden />
                      {format(change.changedAt, "d MMM yyyy, HH:mm")}
                      {change.isReleaseOnly ? (
                        <Badge>Release only</Badge>
                      ) : (
                        <Badge tone="accent">{change.diffs.length} field(s) changed</Badge>
                      )}
                      {!change.window.isConclusive ? (
                        <Badge tone="warning">
                          Too early — {change.window.daysObserved}/{change.window.days} days
                        </Badge>
                      ) : null}
                    </CardTitle>
                  </div>
                </CardHeader>

                <CardContent className="flex flex-col gap-4">
                  <ul className="flex flex-col gap-2.5">
                    {change.diffs.map((diff) => (
                      <li key={diff.field} className="rounded-md border border-[var(--border)] p-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{diff.label}</span>
                          {diff.delta !== null && diff.delta !== 0 ? (
                            <Badge>
                              {diff.delta > 0 ? "+" : ""}
                              {diff.delta}
                              {diff.field === "screenshotCount" ? "" : " chars"}
                            </Badge>
                          ) : null}
                          {diff.isCosmetic ? <Badge>cosmetic</Badge> : null}
                        </div>

                        <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                          <div className="min-w-0">
                            <p className="text-xs text-[var(--text-muted)]">Before</p>
                            <p className="break-words text-xs text-[var(--text-secondary)] line-through decoration-[var(--text-muted)]">
                              {diff.before ? truncate(diff.before) : "—"}
                            </p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs text-[var(--text-muted)]">After</p>
                            <p className="break-words text-xs text-[var(--text-primary)]">
                              {diff.after ? truncate(diff.after) : "—"}
                            </p>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>

                  <div className="grid gap-3 border-t border-[var(--border)] pt-3 sm:grid-cols-2 lg:grid-cols-4">
                    {change.metrics.map((impact) => (
                      <ImpactCell key={impact.metric} impact={impact} />
                    ))}
                    <RankCell rank={change.rank} />
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState
          title="No listing changes recorded yet"
          description="A snapshot is written only when the store text actually changes, so this timeline stays empty until you ship an edit — or until the first two snapshots differ."
        />
      )}
    </div>
  );
}

function truncate(value: string, max = 220) {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function ImpactCell({
  impact,
}: {
  impact: { metric: MetricKey; before: number | null; after: number | null; changePct: number | null };
}) {
  const meta = METRIC_META[impact.metric];
  const tone = deltaTone(impact.metric, impact.changePct);

  const Icon =
    tone === "flat" ? ArrowRight : (impact.changePct ?? 0) > 0 ? ArrowUp : ArrowDown;

  return (
    <div>
      <p className="text-xs text-[var(--text-muted)]">{meta.label}</p>
      {impact.before === null || impact.after === null ? (
        <p className="text-sm text-[var(--text-muted)]">Not enough data</p>
      ) : (
        <>
          <p
            className={cn(
              "flex items-center gap-1 text-sm font-medium",
              tone === "up"
                ? "text-[var(--delta-up)]"
                : tone === "down"
                  ? "text-[var(--delta-down)]"
                  : "text-[var(--text-secondary)]",
            )}
          >
            <Icon aria-hidden className="size-3.5" />
            {formatDelta(impact.changePct)}
          </p>
          <p className="tabular text-xs text-[var(--text-muted)]">
            {formatMetric(impact.metric, impact.before)} →{" "}
            {formatMetric(impact.metric, impact.after)}
          </p>
        </>
      )}
    </div>
  );
}

/** Rank 1 is best, so a fall in the number is an improvement. */
function RankCell({
  rank,
}: {
  rank: { before: number | null; after: number | null; improvement: number | null; keywordsCompared: number };
}) {
  return (
    <div>
      <p className="text-xs text-[var(--text-muted)]">Mean keyword rank</p>
      {rank.before === null || rank.after === null ? (
        <p className="text-sm text-[var(--text-muted)]">No comparable keywords</p>
      ) : (
        <>
          <p
            className={cn(
              "flex items-center gap-1 text-sm font-medium",
              (rank.improvement ?? 0) > 0.5
                ? "text-[var(--delta-up)]"
                : (rank.improvement ?? 0) < -0.5
                  ? "text-[var(--delta-down)]"
                  : "text-[var(--text-secondary)]",
            )}
          >
            {(rank.improvement ?? 0) > 0.5 ? (
              <ArrowUp aria-hidden className="size-3.5" />
            ) : (rank.improvement ?? 0) < -0.5 ? (
              <ArrowDown aria-hidden className="size-3.5" />
            ) : (
              <ArrowRight aria-hidden className="size-3.5" />
            )}
            {rank.improvement === null
              ? "—"
              : `${rank.improvement > 0 ? "+" : ""}${rank.improvement.toFixed(1)} places`}
          </p>
          <p className="tabular text-xs text-[var(--text-muted)]">
            #{rank.before.toFixed(1)} → #{rank.after.toFixed(1)} · {rank.keywordsCompared} keywords
          </p>
        </>
      )}
    </div>
  );
}
