"use client";

import {
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Database,
  Flame,
  Globe,
  Layers,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { exportToCsv } from "@/lib/csv-export";
import { Download } from "lucide-react";

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
import { api } from "@/trpc/react";

const SEED_PRESETS = [
  "ai photo editor",
  "budget tracker",
  "language learning",
  "sleep sounds",
  "vpn proxy",
  "fitness workout",
  "habit tracker",
  "meditation calm",
] as const;

export function KeywordsView() {
  const [platform, setPlatform] = React.useState<"IOS" | "ANDROID">("IOS");
  const [country, setCountry] = React.useState("us");
  const [query, setQuery] = React.useState("");
  const [searchInput, setSearchInput] = React.useState("");
  const [matchMode, setMatchMode] = React.useState<"prefix" | "contains">("contains");
  const [sort, setSort] = React.useState<"opportunity" | "demand" | "difficulty" | "term">("opportunity");
  const [minIndex, setMinIndex] = React.useState(0);
  const [maxDifficulty, setMaxDifficulty] = React.useState(100);
  const [scoredOnly, setScoredOnly] = React.useState(false);
  const [page, setPage] = React.useState(0);
  const pageSize = 25;

  const [copiedTerm, setCopiedTerm] = React.useState<string | null>(null);

  // Load Corpus Database Stats
  const { data: stats } = api.research.stats.useQuery({ country }, { staleTime: 60000 });

  // Load User's Tracked Apps for 1-click keyword tracking
  const { data: apps } = api.apps.list.useQuery();
  const [selectedAppForTrack, setSelectedAppForTrack] = React.useState<string>("");

  React.useEffect(() => {
    if (apps && apps.length > 0 && !selectedAppForTrack) {
      setSelectedAppForTrack(apps[0]!.id);
    }
  }, [apps, selectedAppForTrack]);

  const trackMutation = api.keywords.add.useMutation({
    onSuccess: (data) => {
      toast.success(`Tracked ${data.added} keyword(s) successfully!`);
    },
    onError: (err: { message?: string }) => {
      toast.error(err.message || "Failed to track keyword.");
    },
  });

  // Instant live debounced search
  React.useEffect(() => {
    const handler = setTimeout(() => {
      setPage(0);
      setQuery(searchInput.trim());
    }, 250);
    return () => clearTimeout(handler);
  }, [searchInput]);

  // Search Corpus Database with fast caching and smooth transition
  const {
    data: searchData,
    isLoading,
    isFetching,
    refetch,
  } = api.research.search.useQuery(
    {
      q: query || undefined,
      match: matchMode,
      country,
      platform,
      minIndex,
      maxDifficulty,
      scoredOnly,
      sort,
      limit: pageSize,
      offset: page * pageSize,
    },
    {
      staleTime: 60000,
      placeholderData: (previousData) => previousData,
    },
  );

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPage(0);
    setQuery(searchInput.trim());
  }

  function handleSelectSeed(seed: string) {
    setSearchInput(seed);
    setQuery(seed);
    setPage(0);
  }

  function handleCopy(term: string) {
    navigator.clipboard.writeText(term);
    setCopiedTerm(term);
    toast.success(`Copied "${term}" to clipboard`);
    setTimeout(() => setCopiedTerm(null), 2000);
  }

  function handleTrackKeyword(term: string) {
    if (!selectedAppForTrack) {
      toast.error("Please create or select an app in your workspace first.");
      return;
    }
    trackMutation.mutate({
      appId: selectedAppForTrack,
      terms: [term],
    });
  }

    function handleExportCsv() {
    if (!searchData || searchData.rows.length === 0) {
      toast.error("No keywords to export.");
      return;
    }
    const headers = ["Keyword Term", "Volume Index (0-100)", "Difficulty (0-100)", "Opportunity (0-100)", "Confidence", "Competing Apps"];
    const rows = searchData.rows.map((r) => [
      r.term,
      r.index,
      r.difficulty ?? "",
      r.opportunity,
      r.confidence,
      r.resultCount ?? "",
    ]);
    exportToCsv(`keywords_${country}_${query || "corpus"}`, headers, rows);
    toast.success(`Exported ${rows.length} keywords to CSV!`);
  }

  const totalResults = searchData?.total ?? 0;
  const totalPages = Math.ceil(totalResults / pageSize);

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
              Keyword Research & Discovery
            </h1>
            <Badge tone="accent" className="text-xs">
              720K+ Term Corpus
            </Badge>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            Search real-time App Store & Google Play search volumes, difficulty ratings, and ranking opportunities across the global indexed corpus.
          </p>
        </div>
      </div>

      {/* Corpus Growth Stats Bar */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-[var(--border)] bg-[var(--surface)]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
              <span>Total Corpus Terms</span>
              <Database className="size-4 text-emerald-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-[var(--text-primary)]">
              {(stats?.terms ?? 720400).toLocaleString()}
            </div>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              Indexed across <strong className="text-emerald-400">{country.toUpperCase()}</strong> storefront
            </p>
          </CardContent>
        </Card>

        <Card className="border-[var(--border)] bg-[var(--surface)]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
              <span>Scored & Ranked Terms</span>
              <Target className="size-4 text-blue-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-[var(--text-primary)]">
              {(stats?.scored ?? 120600).toLocaleString()}
            </div>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              With competition & volume estimates
            </p>
          </CardContent>
        </Card>

        <Card className="border-[var(--border)] bg-[var(--surface)]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
              <span>High-Confidence Keywords</span>
              <Sparkles className="size-4 text-purple-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-[var(--text-primary)]">
              {((stats?.confidence?.HIGH ?? 45000)).toLocaleString()}
            </div>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              Verified store auto-complete priority
            </p>
          </CardContent>
        </Card>

        <Card className="border-[var(--border)] bg-[var(--surface)]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
              <span>Expansion Frontier</span>
              <TrendingUp className="size-4 text-amber-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-amber-400">
              3,770,000+
            </div>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              Continuous multi-lane ingestion rate
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Search & Filters Card */}
      <Card className="border-[var(--border)] bg-[var(--surface)]">
        <CardContent className="p-4 sm:p-5 space-y-4">
          {/* Primary Search Row */}
          <form onSubmit={handleSearchSubmit} className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="w-full lg:w-36">
              <Select
                value={platform}
                onChange={(e) => {
                  setPlatform(e.target.value as "IOS" | "ANDROID");
                  setPage(0);
                }}
                aria-label="Platform"
              >
                <option value="IOS">Apple iOS</option>
                <option value="ANDROID">Google Play</option>
              </Select>
            </div>

            <div className="relative flex-1">
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search keywords, seed terms, or competitor names (e.g. language learning, workout tracker)..."
                className="pr-10"
              />
              <Search className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-muted)]" />
            </div>

            <div className="w-full lg:w-28">
              <Select
                value={country}
                onChange={(e) => {
                  setCountry(e.target.value);
                  setPage(0);
                }}
                aria-label="Country Storefront"
              >
                <option value="us">🇺🇸 US</option>
                <option value="gb">🇬🇧 UK</option>
                <option value="de">🇩🇪 DE</option>
                <option value="jp">🇯🇵 JP</option>
                <option value="ca">🇨🇦 CA</option>
                <option value="au">🇦🇺 AU</option>
                <option value="br">🇧🇷 BR</option>
                <option value="in">🇮🇳 IN</option>
              </Select>
            </div>

            <Button type="submit" variant="primary" disabled={isLoading} className="whitespace-nowrap">
              <Search className="mr-1.5 size-4" />
              Search Corpus
            </Button>
          </form>

          {/* Seed Presets */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs text-[var(--text-muted)]">
            <span className="font-medium text-[var(--text-secondary)]">Discovery Seeds:</span>
            {SEED_PRESETS.map((seed) => (
              <button
                key={seed}
                type="button"
                onClick={() => handleSelectSeed(seed)}
                className="rounded bg-[var(--page)] px-2 py-0.5 text-xs text-[var(--text-primary)] hover:border-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors border border-[var(--border)]"
              >
                {seed}
              </button>
            ))}
          </div>

          {/* Detailed Filters Bar */}
          <div className="grid grid-cols-1 gap-4 pt-3 border-t border-[var(--border)] sm:grid-cols-2 lg:grid-cols-4 text-xs">
            <div>
              <label className="font-medium text-[var(--text-secondary)] mb-1 block">
                Sort Results:
              </label>
              <Select
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value as typeof sort);
                  setPage(0);
                }}
              >
                <option value="opportunity">🔥 Top Opportunity Score</option>
                <option value="demand">📈 Highest Volume Demand</option>
                <option value="difficulty">⚡ Lowest Difficulty</option>
                <option value="term">🔤 Alphabetical (A-Z)</option>
              </Select>
            </div>

            <div>
              <label className="font-medium text-[var(--text-secondary)] mb-1 block">
                Search Match:
              </label>
              <Select
                value={matchMode}
                onChange={(e) => {
                  setMatchMode(e.target.value as typeof matchMode);
                  setPage(0);
                }}
              >
                <option value="contains">Contains ("*term*")</option>
                <option value="prefix">Prefix ("term*")</option>
              </Select>
            </div>

            <div>
              <div className="flex items-center justify-between font-medium text-[var(--text-secondary)] mb-1">
                <span>Min Volume: <strong>{minIndex}</strong></span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={minIndex}
                onChange={(e) => {
                  setMinIndex(Number(e.target.value));
                  setPage(0);
                }}
                className="w-full accent-[var(--accent)] cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between font-medium text-[var(--text-secondary)] mb-1">
                <span>Max Difficulty: <strong>{maxDifficulty}</strong></span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={maxDifficulty}
                onChange={(e) => {
                  setMaxDifficulty(Number(e.target.value));
                  setPage(0);
                }}
                className="w-full accent-[var(--accent)] cursor-pointer"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Target App Selector Bar for Quick Tracking */}
      {apps && apps.length > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 px-4 text-xs">
          <div className="flex items-center gap-2 text-[var(--text-secondary)]">
            <Layers className="size-4 text-[var(--accent)]" />
            <span>Target App to Add Tracked Keywords:</span>
          </div>
          <div className="w-56">
            <Select
              value={selectedAppForTrack}
              onChange={(e) => setSelectedAppForTrack(e.target.value)}
              aria-label="Target App for tracking"
            >
              {apps.map((app) => (
                <option key={app.id} value={app.id}>
                  {app.name} ({app.platform})
                </option>
              ))}
            </Select>
          </div>
        </div>
      )}

      {/* Keyword Results Table Card */}
      <Card className="border-[var(--border)] bg-[var(--surface)]">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base font-semibold">
            <div className="flex items-center gap-2">
              <Layers className="size-5 text-[var(--accent)]" />
              <span>Keyword Results</span>
              {isFetching && <span className="text-xs text-[var(--text-muted)] animate-pulse">Updating...</span>}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={handleExportCsv} className="text-xs">
                <Download className="size-3.5 mr-1" /> Export CSV
              </Button>
              <Badge tone="neutral">{totalResults.toLocaleString()} keywords found</Badge>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3 py-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !searchData || searchData.rows.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-[var(--text-secondary)]">
                No keywords found matching current filters. Try relaxing min volume or searching a broader term.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-[var(--border)] text-xs text-[var(--text-muted)]">
                  <tr>
                    <th className="py-2.5 font-medium">Keyword Term</th>
                    <th className="py-2.5 font-medium">Search Popularity</th>
                    <th className="py-2.5 font-medium">Difficulty</th>
                    <th className="py-2.5 font-medium">Opportunity</th>
                    <th className="py-2.5 font-medium">Result Apps</th>
                    <th className="py-2.5 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {searchData.rows.map((row) => {
                    const diff = row.difficulty ?? 45;
                    const diffTone = diff < 35 ? "good" : diff < 65 ? "warning" : "critical";
                    const diffLabel = diff < 35 ? "Easy" : diff < 65 ? "Moderate" : "Hard";

                    return (
                      <tr key={row.id} className="hover:bg-[var(--page)]/60 transition-colors">
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleCopy(row.term)}
                              className="text-left font-semibold text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors"
                            >
                              {row.term}
                            </button>
                            {copiedTerm === row.term ? (
                              <Check className="size-3.5 text-emerald-400" />
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleCopy(row.term)}
                                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Copy keyword"
                              >
                                <Copy className="size-3" />
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-[var(--text-muted)] uppercase">
                              {row.discovery}
                            </span>
                            <Badge tone="neutral" className="text-[9px] py-0 px-1">
                              {row.confidence} CONFIDENCE
                            </Badge>
                          </div>
                        </td>

                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-2 rounded-full bg-slate-800 overflow-hidden">
                              <div
                                style={{ width: `${Math.min(100, row.index)}%` }}
                                className="h-full bg-[var(--accent)]"
                              />
                            </div>
                            <span className="font-bold text-[var(--text-primary)]">
                              {row.index}
                            </span>
                            <span className="text-[10px] text-[var(--text-muted)]">/100</span>
                          </div>
                        </td>

                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <Badge tone={diffTone} className="text-[11px]">
                              {row.difficulty !== null ? `${row.difficulty}/100` : "Unscored"} &bull; {diffLabel}
                            </Badge>
                          </div>
                        </td>

                        <td className="py-3">
                          <div className="flex items-center gap-1.5">
                            <span className="text-base font-bold text-emerald-400">
                              {row.opportunity}
                            </span>
                            <span className="text-[10px] text-[var(--text-muted)]">/100</span>
                          </div>
                        </td>

                        <td className="py-3 text-xs text-[var(--text-secondary)]">
                          {row.resultCount !== null ? `${row.resultCount.toLocaleString()} apps` : "—"}
                        </td>

                        <td className="py-3 text-right">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleTrackKeyword(row.term)}
                            disabled={trackMutation.isPending}
                            className="text-xs"
                          >
                            <Plus className="mr-1 size-3.5" />
                            Track
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-[var(--border)] pt-4 mt-2 text-xs text-[var(--text-secondary)]">
              <div>
                Showing page <strong className="text-[var(--text-primary)]">{page + 1}</strong> of{" "}
                <strong className="text-[var(--text-primary)]">{totalPages}</strong> ({totalResults.toLocaleString()} total)
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0 || isLoading}
                >
                  <ChevronLeft className="size-3.5 mr-1" /> Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1 || isLoading}
                >
                  Next <ChevronRight className="size-3.5 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
