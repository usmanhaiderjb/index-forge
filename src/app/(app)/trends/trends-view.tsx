"use client";

import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  DollarSign,
  Download,
  ExternalLink,
  Flame,
  Globe,
  Info,
  Layers,
  Loader2,
  Minus,
  RefreshCw,
  Search,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
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
  EmptyState,
  PageHeader,
  Select,
  Skeleton,
} from "@/components/ui/primitives";
import { exportToCsv } from "@/lib/csv-export";
import type { RouterOutputs } from "@/server/api/root";
import { api } from "@/trpc/react";

const STOREFRONTS = [
  { code: "us", label: "United States (US)" },
  { code: "gb", label: "United Kingdom (GB)" },
  { code: "de", label: "Germany (DE)" },
  { code: "jp", label: "Japan (JP)" },
  { code: "fr", label: "France (FR)" },
  { code: "ca", label: "Canada (CA)" },
  { code: "au", label: "Australia (AU)" },
  { code: "br", label: "Brazil (BR)" },
];

export function TrendsView() {
  const [mode, setMode] = React.useState<"leaderboard" | "rising">("leaderboard");
  const [platform, setPlatform] = React.useState<"IOS" | "ANDROID">("IOS");
  const [chart, setChart] = React.useState<"TOP_FREE" | "TOP_PAID" | "TOP_GROSSING">("TOP_FREE");
  const [country, setCountry] = React.useState("us");
  const [category, setCategory] = React.useState("6013"); // Health & Fitness default for iOS
  const [risingCategory, setRisingCategory] = React.useState("");

  // Leaderboard Query
  const leaderboard = api.trends.leaderboard.useQuery({
    platform,
    category,
    chart,
    country,
    limit: 50,
  });

  // Rising Velocity Queries
  const coverage = api.trends.coverage.useQuery();
  const rising = api.trends.rising.useQuery({ category: risingCategory || undefined });

  // Update category default when platform toggles
  const handlePlatformChange = (p: "IOS" | "ANDROID") => {
    setPlatform(p);
    setCategory(p === "IOS" ? "6013" : "HEALTH_AND_FITNESS");
  };

  const handleExportCsv = () => {
    const rows = leaderboard.data?.rows ?? [];
    if (!rows.length) {
      toast.error("No leaderboard data to export");
      return;
    }
    const filename = `${platform.toLowerCase()}-${country}-chart-${category}-${new Date().toISOString().split("T")[0]}.csv`;
    exportToCsv(
      filename,
      ["Rank", "App Name", "Store ID", "Platform", "Daily Downloads", "Monthly Downloads", "Est Monthly Gross Revenue ($)", "Est Ad Spend ($/mo)", "Monetization"],
      rows.map((r) => [
        r.rank,
        r.name,
        r.storeId,
        r.platform,
        r.dailyDownloads,
        r.monthlyDownloads,
        r.estimatedMonthlyGrossRevenue,
        r.estimatedMonthlyAdSpend,
        r.monetization,
      ]),
    );
    toast.success(`Exported ${rows.length} leaderboard apps to CSV`);
  };

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Market Trends & Category Leaderboards"
        description="Live top charts, estimated downloads velocity, revenue ARR, and breakthrough rising apps across iOS & Android."
      />

      {/* Mode Segmented Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
        <div className="flex items-center gap-1 rounded-xl bg-[var(--surface)] p-1 border border-[var(--border)]">
          <button
            type="button"
            onClick={() => setMode("leaderboard")}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all",
              mode === "leaderboard"
                ? "bg-[var(--accent)] text-[var(--accent-fg)] shadow-sm"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
            )}
          >
            <BarChart3 className="size-3.5" /> Category Leaderboards (Top 50)
          </button>
          <button
            type="button"
            onClick={() => setMode("rising")}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all",
              mode === "rising"
                ? "bg-[var(--accent)] text-[var(--accent-fg)] shadow-sm"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
            )}
          >
            <TrendingUp className="size-3.5" /> Rising Momentum & Climbers
          </button>
        </div>

        {mode === "leaderboard" && (
          <Button variant="secondary" size="sm" onClick={handleExportCsv} className="gap-1.5">
            <Download className="size-3.5" /> Export Leaderboard (CSV)
          </Button>
        )}
      </div>

      {mode === "leaderboard" ? (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-[var(--surface)] p-4 rounded-xl border border-[var(--border)]">
            <div>
              <label className="text-xs font-medium text-[var(--text-secondary)]">Platform</label>
              <div className="mt-1 flex rounded-lg border border-[var(--border)] bg-[var(--page)] p-0.5">
                <button
                  type="button"
                  onClick={() => handlePlatformChange("IOS")}
                  className={cn(
                    "flex-1 rounded-md py-1 text-xs font-medium transition-colors",
                    platform === "IOS"
                      ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                      : "text-[var(--text-secondary)]",
                  )}
                >
                  iOS App Store
                </button>
                <button
                  type="button"
                  onClick={() => handlePlatformChange("ANDROID")}
                  className={cn(
                    "flex-1 rounded-md py-1 text-xs font-medium transition-colors",
                    platform === "ANDROID"
                      ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                      : "text-[var(--text-secondary)]",
                  )}
                >
                  Google Play
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="country-select" className="text-xs font-medium text-[var(--text-secondary)]">
                Country
              </label>
              <Select
                id="country-select"
                className="mt-1 w-full"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              >
                {STOREFRONTS.map((sf) => (
                  <option key={sf.code} value={sf.code}>
                    {sf.label}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label htmlFor="category-select" className="text-xs font-medium text-[var(--text-secondary)]">
                Category
              </label>
              <Select
                id="category-select"
                className="mt-1 w-full"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {(leaderboard.data?.categories ?? []).map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.label}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label htmlFor="chart-select" className="text-xs font-medium text-[var(--text-secondary)]">
                Chart Type
              </label>
              <Select
                id="chart-select"
                className="mt-1 w-full"
                value={chart}
                onChange={(e) => setChart(e.target.value as typeof chart)}
              >
                <option value="TOP_FREE">Top Free</option>
                <option value="TOP_PAID">Top Paid</option>
                <option value="TOP_GROSSING">Top Grossing</option>
              </Select>
            </div>
          </div>

          {/* Leaderboard Table Card */}
          <Card>
            <CardHeader className="py-4 px-6 border-b border-[var(--border)] flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="size-4 text-[var(--accent)]" /> Top Category Leaderboard
                </CardTitle>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Ranked #1 to #50 in {country.toUpperCase()} · Live store volume and revenue estimations
                </p>
              </div>
              <Badge tone="accent">
                {leaderboard.data?.rows?.length ?? 0} Apps Charting
              </Badge>
            </CardHeader>
            <CardContent className="p-0">
              {leaderboard.isLoading ? (
                <div className="space-y-2 p-6">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : leaderboard.error ? (
                <EmptyState
                  title="Could not load leaderboard"
                  description={leaderboard.error.message}
                  action={
                    <Button variant="secondary" onClick={() => void leaderboard.refetch()}>
                      Try Again
                    </Button>
                  }
                />
              ) : leaderboard.data?.rows.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-[var(--page)] border-b border-[var(--border)] text-[var(--text-secondary)] font-semibold">
                      <tr>
                        <th className="px-4 py-3 w-12 text-center">#</th>
                        <th className="px-4 py-3">App Name & ID</th>
                        <th className="px-3 py-3 text-right">Est. Daily Downloads</th>
                        <th className="px-3 py-3 text-right">Est. Monthly Volume</th>
                        <th className="px-3 py-3 text-right">Est. Gross Revenue</th>
                        <th className="px-3 py-3 text-right">Est. Paid UA Spend</th>
                        <th className="px-3 py-3 text-center">Monetization</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                      {leaderboard.data.rows.map((row) => (
                        <tr key={row.storeId} className="hover:bg-[var(--page)] transition-colors">
                          <td className="px-4 py-3 text-center tabular font-bold">
                            <span
                              className={cn(
                                "inline-flex size-6 items-center justify-center rounded-full text-xs font-bold",
                                row.rank === 1
                                  ? "bg-amber-400/20 text-amber-500 font-extrabold border border-amber-400/40"
                                  : row.rank === 2
                                    ? "bg-zinc-300/20 text-zinc-400 font-extrabold border border-zinc-300/40"
                                    : row.rank === 3
                                      ? "bg-amber-700/20 text-amber-600 font-extrabold border border-amber-700/40"
                                      : "text-[var(--text-secondary)]",
                              )}
                            >
                              {row.rank}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-medium text-[var(--text-primary)]">
                            <div className="max-w-xs">
                              <p className="font-semibold truncate text-sm">{row.name}</p>
                              <p className="text-[11px] text-[var(--text-muted)] font-mono truncate">
                                {row.storeId}
                              </p>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-right tabular font-semibold text-[var(--text-primary)]">
                            ~{row.dailyDownloads.toLocaleString()}
                          </td>
                          <td className="px-3 py-3 text-right tabular text-[var(--text-secondary)]">
                            ~{row.monthlyDownloads.toLocaleString()}
                          </td>
                          <td className="px-3 py-3 text-right tabular font-semibold text-emerald-600 dark:text-emerald-400">
                            ${row.estimatedMonthlyGrossRevenue.toLocaleString()} /mo
                          </td>
                          <td className="px-3 py-3 text-right tabular text-rose-500 font-medium">
                            ${row.estimatedMonthlyAdSpend.toLocaleString()} /mo
                          </td>
                          <td className="px-3 py-3 text-center">
                            <Badge
                              tone={
                                row.monetization.includes("Subscription")
                                  ? "good"
                                  : row.monetization.includes("Paid")
                                    ? "accent"
                                    : "neutral"
                              }
                              className="text-[10px]"
                            >
                              {row.monetization}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link href={`/research?url=${encodeURIComponent(row.storeId)}`}>
                              <Button variant="secondary" size="sm" className="gap-1 text-xs">
                                <Search className="size-3" /> Inspect Dossier
                              </Button>
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  title="No apps found"
                  description="No apps returned for this category and chart combination. Try selecting a different category or store."
                />
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        /* Rising Momentum Mode */
        <div className="space-y-6">
          <Collection coverage={coverage.data} onDone={() => void rising.refetch()} />

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label
                htmlFor="trends-cat"
                className="text-xs font-medium text-[var(--text-secondary)]"
              >
                Category
              </label>
              <Select
                id="trends-cat"
                className="mt-1 min-w-[14rem]"
                value={risingCategory}
                onChange={(event) => setRisingCategory(event.target.value)}
              >
                <option value="">All categories</option>
                {(rising.data?.categories ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <Rising
            data={rising.data}
            loading={rising.isLoading}
            error={rising.error?.message ?? null}
            onRetry={() => void rising.refetch()}
          />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ collection */

type Coverage = RouterOutputs["trends"]["coverage"];

function Collection({ coverage, onDone }: { coverage?: Coverage; onDone: () => void }) {
  const scan = api.trends.scan.useMutation({
    onSuccess: (result) => {
      toast.success(
        result.queued
          ? `Sweeping ${result.categories} categories. Results appear as the worker finishes.`
          : `Swept ${result.categories} categories — ${result.created} new apps, ${result.snapshots} snapshots.`,
      );
      onDone();
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
          <Figure label="Apps tracked" value={(coverage?.apps ?? 0).toLocaleString()} />
          <Figure label="Snapshots" value={(coverage?.snapshots ?? 0).toLocaleString()} />
          <Figure
            label="Ready for movement"
            value={(coverage?.readyForMovement ?? 0).toLocaleString()}
          />
        </div>

        <Button
          variant="secondary"
          disabled={scan.isPending}
          onClick={() => scan.mutate({ depth: 20 })}
        >
          {scan.isPending ? (
            <>
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              Sweeping…
            </>
          ) : (
            <>
              <RefreshCw className="mr-1 h-4 w-4" />
              Sweep charts
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-[var(--text-secondary)]">{label}</p>
      <p className="text-lg font-semibold text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

/* ---------------------------------------------------------------- rising */

type RisingData = RouterOutputs["trends"]["rising"];

function Rising({
  data,
  loading,
  error,
  onRetry,
}: {
  data?: RisingData;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        title="Could not load trends"
        description={error}
        action={
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        }
      />
    );
  }

  if (!data || data.rows.length === 0) {
    return (
      <EmptyState
        title="Nothing tracked yet"
        description="Sweep the charts to record what is currently ranking. One sweep gives you standings; a second gives you movement."
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--text-muted)]">
        {data.measured > 0
          ? `${data.measured} of ${data.rows.length} rows have two chart readings to compare, so their climb is measured. The rest are ranked by chart standing alone.`
          : "No app here has two chart readings yet, so nothing below is movement — rows are ranked by where they sit in their category chart. Sweep again in a few days and climbs appear."}
      </p>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] text-left text-xs text-[var(--text-secondary)]">
                <th className="px-4 py-3 font-medium">App</th>
                <th className="px-4 py-3 font-medium">Chart</th>
                <th className="px-4 py-3 font-medium">Climb</th>
                <th className="px-4 py-3 font-medium">Ratings/day</th>
                <th className="px-4 py-3 font-medium">Total ratings</th>
                <th className="px-4 py-3 text-right font-medium">Dossier</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.id} className="border-b border-[var(--border-subtle)] last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium text-[var(--text-primary)]">{row.name}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {row.developer ?? "Unknown developer"}
                    </p>
                  </td>

                  <td className="px-4 py-3">
                    {row.chartRank ? (
                      <>
                        <span className="tabular-nums text-[var(--text-primary)]">
                          #{row.chartRank}
                        </span>
                        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                          {row.categoryLabel ?? "uncategorised"}
                        </p>
                      </>
                    ) : (
                      <span className="text-xs text-[var(--text-muted)]">not charting</span>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    {row.climb === null ? (
                      <span className="text-xs text-[var(--text-muted)]">
                        {row.hasPrevious ? "no earlier rank" : "first reading"}
                      </span>
                    ) : row.climb > 0 ? (
                      <span className="flex items-center gap-1 font-medium text-[var(--status-good)]">
                        <TrendingUp className="h-3.5 w-3.5" aria-hidden />
                        <span className="tabular-nums">+{row.climb}</span>
                      </span>
                    ) : (
                      <span className="tabular-nums text-[var(--text-secondary)]">{row.climb}</span>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    {row.ratingsPerDay === null ? (
                      <span className="text-xs text-[var(--text-muted)]">not yet measured</span>
                    ) : (
                      <>
                        <span className="font-medium tabular-nums">
                          {row.ratingsPerDay.toLocaleString()}
                        </span>
                        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                          over {row.velocityDays} day{row.velocityDays === 1 ? "" : "s"}
                        </p>
                      </>
                    )}
                  </td>

                  <td className="px-4 py-3 tabular-nums text-[var(--text-secondary)]">
                    {row.ratingCount.toLocaleString()}
                    {row.ratingAverage ? (
                      <span className="ml-1 text-xs text-[var(--text-muted)]">
                        ({row.ratingAverage.toFixed(1)})
                      </span>
                    ) : null}
                  </td>

                  <td className="px-4 py-3 text-right">
                    <Link href={`/research?url=${encodeURIComponent(row.storeId)}`}>
                      <Button variant="ghost" size="sm" className="gap-1 text-xs">
                        <Search className="size-3" /> Inspect
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="inline-flex items-start gap-2 rounded-lg border border-dashed border-[var(--border-strong)] px-3 py-2 text-xs text-[var(--text-muted)]">
        <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          Ranked on <strong className="font-medium">chart movement</strong>, not launch date —
          Play publishes no reliable release date, and inferring one was wrong by up to six years
          when tested against apps with known launches. Ratings per day is a proxy for install
          velocity, never an install count: neither store publishes installs for apps you do not
          own, and how often users rate varies hugely by category.
        </span>
      </p>
    </div>
  );
}
