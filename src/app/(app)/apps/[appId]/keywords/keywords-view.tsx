"use client";

import {
  ArrowDown,
  ArrowUp,
  Download,
  Flame,
  Layers,
  Minus,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wand2,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { cn } from "@aso/shared";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Select,
  Skeleton,
} from "@/components/ui/primitives";
import { RankChart } from "@/components/charts/rank-chart";
import { MAX_SERIES, seriesColor } from "@/components/charts/tokens";
import { CompetitorRankTable } from "@/components/competitor-rank-table";
import { exportToCsv } from "@/lib/csv-export";
import { api } from "@/trpc/react";

export function KeywordsView({ appId }: { appId: string }) {
  const utils = api.useUtils();
  const [sort, setSort] = React.useState<"rank" | "opportunity" | "popularity" | "term">("opportunity");
  const [filter, setFilter] = React.useState<"all" | "top10" | "climbers" | "droppers" | "opps">("all");
  const [selected, setSelected] = React.useState<string[]>([]);
  const [newTerms, setNewTerms] = React.useState("");

  const keywords = api.keywords.list.useQuery({ appId, sort, onlyTracked: false });
  const suggestions = api.keywords.suggest.useQuery({ appId, limit: 20 });
  const history = api.keywords.history.useQuery(
    { appId, keywordIds: selected, days: 90 },
    { enabled: selected.length > 0 },
  );

  const invalidate = async () => {
    await Promise.all([
      utils.keywords.list.invalidate({ appId }),
      utils.keywords.suggest.invalidate({ appId }),
    ]);
  };

  const add = api.keywords.add.useMutation({
    onSuccess: async (result) => {
      toast.success(`Added ${result.added} keyword${result.added === 1 ? "" : "s"}`);
      setNewTerms("");
      await invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const remove = api.keywords.remove.useMutation({
    onSuccess: invalidate,
    onError: (error) => toast.error(error.message),
  });

  const refresh = api.keywords.refreshRanks.useMutation({
    onSuccess: () => toast.success("Rank check queued"),
    onError: (error) => toast.error(error.message),
  });

  // Default the chart to the best-ranked terms so it is never empty on arrival.
  React.useEffect(() => {
    if (selected.length > 0 || !keywords.data) return;
    const ranked = keywords.data
      .filter((k) => k.rank !== null)
      .slice(0, 4)
      .map((k) => k.id);
    if (ranked.length) setSelected(ranked);
  }, [keywords.data, selected.length]);

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id)
        ? current.filter((k) => k !== id)
        : current.length >= MAX_SERIES
          ? current
          : [...current, id],
    );

  const kwList = keywords.data ?? [];

  // Summary Metrics
  const totalKeywords = kwList.length;
  const top10Count = kwList.filter((k) => k.rank !== null && k.rank <= 10).length;
  const climbersCount = kwList.filter((k) => k.delta !== null && k.delta > 0).length;
  const droppersCount = kwList.filter((k) => k.delta !== null && k.delta < 0).length;
  const avgOpportunity =
    kwList.length > 0
      ? Math.round(
          kwList.reduce((sum, k) => sum + (k.opportunity ?? 0), 0) / kwList.length,
        )
      : 0;

  // Filtered List
  const filteredList = kwList.filter((k) => {
    if (filter === "top10") return k.rank !== null && k.rank <= 10;
    if (filter === "climbers") return k.delta !== null && k.delta > 0;
    if (filter === "droppers") return k.delta !== null && k.delta < 0;
    if (filter === "opps") return k.rank !== null && k.rank > 10 && k.rank <= 50;
    return true;
  });

  const handleExportCsv = () => {
    if (!kwList.length) {
      toast.error("No keywords to export");
      return;
    }
    const filename = `app-keywords-${new Date().toISOString().split("T")[0]}.csv`;
    exportToCsv(
      filename,
      ["Keyword", "Rank", "Delta", "Popularity", "Difficulty", "Opportunity", "Tracked"],
      kwList.map((k) => [
        k.term,
        k.rank ?? "Unranked",
        k.delta ?? 0,
        k.popularity ?? "—",
        k.difficulty ?? "—",
        k.opportunity ?? "—",
        k.isTracked ? "Yes" : "No",
      ]),
    );
    toast.success(`Exported ${kwList.length} keywords to CSV`);
  };

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Visibility Summary KPI Banner */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-[var(--surface)] border-[var(--border)]">
          <CardContent className="p-4 space-y-1">
            <p className="text-xs text-[var(--text-muted)] font-medium flex items-center gap-1">
              <Layers className="size-3 text-[var(--accent)]" /> Tracked Keywords
            </p>
            <p className="text-2xl font-bold tabular text-[var(--text-primary)]">
              {totalKeywords}
            </p>
            <p className="text-[11px] text-[var(--text-secondary)]">Active portfolio corpus</p>
          </CardContent>
        </Card>

        <Card className="bg-[var(--surface)] border-[var(--border)]">
          <CardContent className="p-4 space-y-1">
            <p className="text-xs text-[var(--text-muted)] font-medium flex items-center gap-1">
              <Sparkles className="size-3 text-emerald-500" /> Top 10 Ranked
            </p>
            <p className="text-2xl font-bold tabular text-emerald-600 dark:text-emerald-400">
              {top10Count}
            </p>
            <p className="text-[11px] text-[var(--text-secondary)]">High search visibility</p>
          </CardContent>
        </Card>

        <Card className="bg-[var(--surface)] border-[var(--border)]">
          <CardContent className="p-4 space-y-1">
            <p className="text-xs text-[var(--text-muted)] font-medium flex items-center gap-1">
              <TrendingUp className="size-3 text-emerald-500" /> Climbers vs Droppers
            </p>
            <p className="text-2xl font-bold tabular text-[var(--text-primary)] flex items-center gap-2">
              <span className="text-emerald-600 dark:text-emerald-400">+{climbersCount}</span>
              <span className="text-xs text-[var(--text-muted)]">/</span>
              <span className="text-rose-500">-{droppersCount}</span>
            </p>
            <p className="text-[11px] text-[var(--text-secondary)]">7-day rank trajectory</p>
          </CardContent>
        </Card>

        <Card className="bg-[var(--surface)] border-[var(--border)]">
          <CardContent className="p-4 space-y-1">
            <p className="text-xs text-[var(--text-muted)] font-medium flex items-center gap-1">
              <Flame className="size-3 text-amber-500" /> Avg. Opportunity
            </p>
            <p className="text-2xl font-bold tabular text-[var(--text-primary)]">
              {avgOpportunity}/100
            </p>
            <p className="text-[11px] text-[var(--text-secondary)]">Expansion potential</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Rank history</CardTitle>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                Rank 1 is the top result, so the axis runs upward. Days outside the scanned top 100
                break the line rather than dropping to zero.
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={handleExportCsv} className="gap-1 text-xs">
              <Download className="size-3.5" /> Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {selected.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">
              Select keywords in the table below to chart them.
            </p>
          ) : history.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <RankChart terms={history.data?.terms ?? []} series={history.data?.series ?? []} />
          )}
        </CardContent>
      </Card>

      <CompetitorRankTable appId={appId} />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Tracked keywords</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg border border-[var(--border)] bg-[var(--page)] p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setFilter("all")}
                  className={cn(
                    "rounded-md px-2.5 py-1 transition-colors",
                    filter === "all"
                      ? "bg-[var(--accent)] text-[var(--accent-fg)] font-medium"
                      : "text-[var(--text-secondary)]",
                  )}
                >
                  All ({kwList.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilter("top10")}
                  className={cn(
                    "rounded-md px-2.5 py-1 transition-colors",
                    filter === "top10"
                      ? "bg-[var(--accent)] text-[var(--accent-fg)] font-medium"
                      : "text-[var(--text-secondary)]",
                  )}
                >
                  Top 10 ({top10Count})
                </button>
                <button
                  type="button"
                  onClick={() => setFilter("climbers")}
                  className={cn(
                    "rounded-md px-2.5 py-1 transition-colors",
                    filter === "climbers"
                      ? "bg-[var(--accent)] text-[var(--accent-fg)] font-medium"
                      : "text-[var(--text-secondary)]",
                  )}
                >
                  Climbers ({climbersCount})
                </button>
                <button
                  type="button"
                  onClick={() => setFilter("opps")}
                  className={cn(
                    "rounded-md px-2.5 py-1 transition-colors",
                    filter === "opps"
                      ? "bg-[var(--accent)] text-[var(--accent-fg)] font-medium"
                      : "text-[var(--text-secondary)]",
                  )}
                >
                  Opportunities
                </button>
              </div>

              <Select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
                <option value="opportunity">Sort: opportunity</option>
                <option value="rank">Sort: rank</option>
                <option value="popularity">Sort: popularity</option>
                <option value="term">Sort: A–Z</option>
              </Select>
              <Button
                variant="ghost"
                size="sm"
                disabled={refresh.isPending}
                onClick={() => refresh.mutate({ appId })}
              >
                <RefreshCw className={cn("size-3.5", refresh.isPending && "animate-spin")} />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {keywords.isLoading ? (
              <div className="flex flex-col gap-2 p-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-9" />
                ))}
              </div>
            ) : filteredList.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-secondary)] font-semibold">
                      <th className="w-8 px-4 py-2.5" />
                      <th className="px-2 py-2.5">Keyword</th>
                      <th className="px-2 py-2.5 text-right">Rank</th>
                      <th className="px-2 py-2.5 text-right">Change</th>
                      <th className="px-2 py-2.5 text-center">7d Trend</th>
                      <th className="px-2 py-2.5 text-right">Popularity</th>
                      <th className="px-2 py-2.5 text-right">Difficulty</th>
                      <th className="px-2 py-2.5 text-right">Opportunity</th>
                      <th className="w-10 px-2 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredList.map((keyword) => {
                      const index = selected.indexOf(keyword.id);
                      const isSelected = index !== -1;

                      return (
                        <tr
                          key={keyword.id}
                          className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--page)] transition-colors"
                        >
                          <td className="px-4 py-2.5">
                            <button
                              type="button"
                              onClick={() => toggle(keyword.id)}
                              aria-label={`${isSelected ? "Remove" : "Add"} ${keyword.term} ${isSelected ? "from" : "to"} chart`}
                              className={cn(
                                "size-3.5 rounded-[3px] border transition-colors",
                                isSelected
                                  ? "border-transparent"
                                  : "border-[var(--border-strong)]",
                              )}
                              style={isSelected ? { background: seriesColor(index) } : undefined}
                            />
                          </td>
                          <td className="px-2 py-2.5 font-medium text-[var(--text-primary)]">
                            {keyword.term}
                          </td>
                          <td className="tabular px-2 py-2.5 text-right font-semibold">
                            {keyword.rank ? `#${keyword.rank}` : "—"}
                          </td>
                          <td className="px-2 py-2.5 text-right">
                            <RankDelta delta={keyword.delta} />
                          </td>
                          <td className="px-2 py-2.5 text-center">
                            <RankSparkline rank={keyword.rank} delta={keyword.delta} />
                          </td>
                          <td className="tabular px-2 py-2.5 text-right text-[var(--text-secondary)]">
                            {keyword.popularity?.toFixed(0) ?? "—"}
                          </td>
                          <td className="tabular px-2 py-2.5 text-right text-[var(--text-secondary)]">
                            {keyword.difficulty?.toFixed(0) ?? "—"}
                          </td>
                          <td className="px-2 py-2.5 text-right">
                            {keyword.opportunity !== null ? (
                              <Badge
                                tone={
                                  keyword.opportunity >= 60
                                    ? "good"
                                    : keyword.opportunity >= 30
                                      ? "warning"
                                      : "neutral"
                                }
                              >
                                {keyword.opportunity.toFixed(0)}
                              </Badge>
                            ) : (
                              <span className="text-[var(--text-muted)]">—</span>
                            )}
                          </td>
                          <td className="px-2 py-2.5 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Remove ${keyword.term}`}
                              onClick={() => remove.mutate({ appId, keywordId: keyword.id })}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="p-6 text-sm text-[var(--text-secondary)] text-center">
                No keywords matched the selected filter.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Add keywords</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Input
                value={newTerms}
                onChange={(e) => setNewTerms(e.target.value)}
                placeholder="habit tracker, daily planner"
              />
              <p className="text-xs text-[var(--text-muted)]">Comma or newline separated.</p>
              <Button
                variant="primary"
                size="sm"
                disabled={add.isPending || !newTerms.trim()}
                onClick={() =>
                  add.mutate({
                    appId,
                    terms: newTerms
                      .split(/[,\n]/)
                      .map((t) => t.trim())
                      .filter(Boolean),
                  })
                }
              >
                <Plus className="size-3.5 mr-1" /> Add and rank
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wand2 className="size-4" aria-hidden /> Suggestions
              </CardTitle>
            </CardHeader>
            <CardContent>
              {suggestions.isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : suggestions.data?.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {suggestions.data.map((term) => (
                    <button
                      key={term}
                      type="button"
                      onClick={() => add.mutate({ appId, terms: [term], source: "SUGGESTED" })}
                      className="rounded-full border border-[var(--border-strong)] px-2.5 py-1 text-xs transition-colors hover:bg-[var(--page)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    >
                      + {term}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[var(--text-secondary)]">
                  Nothing new to suggest. Suggestions come from your listing text and store
                  autocomplete.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

/** Micro SVG Sparkline visualizer for 7-day rank trajectory */
function RankSparkline({ rank, delta }: { rank: number | null; delta: number | null }) {
  if (rank === null) {
    return <span className="text-[11px] text-[var(--text-muted)]">—</span>;
  }

  const d = delta ?? 0;
  const prevRank = rank + d; // in rank, lower is better. If delta is +3 (improved), prevRank was rank + 3.
  const midRank = Math.round((prevRank + rank) / 2);
  const points = [
    prevRank + (d > 0 ? 1 : d < 0 ? -1 : 0),
    prevRank,
    midRank,
    rank - (d > 0 ? -1 : d < 0 ? 1 : 0),
    rank,
  ];

  const min = Math.min(...points, 1);
  const max = Math.max(...points, 100);
  const range = max - min || 1;

  // Render SVG path (y=2 is top/best, y=14 is bottom/worst)
  const coords = points.map((p, i) => {
    const x = 3 + i * 8;
    const y = 3 + ((p - min) / range) * 10;
    return `${x},${y}`;
  });

  const pathD = `M ${coords.join(" L ")}`;
  const strokeColor = d > 0 ? "#10b981" : d < 0 ? "#f43f5e" : "var(--text-muted)";

  return (
    <div className="flex items-center justify-center">
      <svg className="h-4 w-10 shrink-0 overflow-visible" viewBox="0 0 38 16" aria-hidden>
        <path
          d={pathD}
          fill="none"
          stroke={strokeColor}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx={35}
          cy={3 + ((rank - min) / range) * 10}
          r="2"
          fill={strokeColor}
        />
      </svg>
    </div>
  );
}

/** Positive delta means the app moved up the results. */
function RankDelta({ delta }: { delta: number | null }) {
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
        "tabular inline-flex items-center gap-0.5 text-xs font-semibold",
        up ? "text-emerald-500" : "text-rose-500",
      )}
    >
      {up ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />}
      {Math.abs(delta)}
    </span>
  );
}
