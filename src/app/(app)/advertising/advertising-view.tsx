"use client";

import {
  BarChart3,
  Check,
  CreditCard,
  DollarSign,
  ExternalLink,
  Flame,
  Globe,
  Layers,
  Megaphone,
  Percent,
  Play,
  Search,
  ShieldCheck,
  Sliders,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Video,
  Zap,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

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
import { detectStoreInput } from "@/lib/store-detect";

const BENCHMARKS = [
  { name: "Duolingo", platform: "IOS", urlOrId: "https://apps.apple.com/us/app/duolingo-language-lessons/id570060128" },
  { name: "Calm", platform: "IOS", urlOrId: "https://apps.apple.com/us/app/calm-sleep-meditation/id571800810" },
  { name: "Strava", platform: "ANDROID", urlOrId: "com.strava" },
  { name: "Spotify", platform: "IOS", urlOrId: "324684580" },
  { name: "TikTok", platform: "ANDROID", urlOrId: "com.zhiliaoapp.musically" },
  { name: "Temu", platform: "IOS", urlOrId: "1641486558" },
  { name: "Tinder", platform: "IOS", urlOrId: "547702041" },
  { name: "Headspace", platform: "ANDROID", urlOrId: "com.getsomeheadspace.android" },
] as const;

export function AdvertisingView() {
  const [platform, setPlatform] = React.useState<"IOS" | "ANDROID">("IOS");
  const [country, setCountry] = React.useState("us");
  const [urlOrIdInput, setUrlOrIdInput] = React.useState("https://apps.apple.com/us/app/duolingo-language-lessons/id570060128");

  const [activeInspectTarget, setActiveInspectTarget] = React.useState<{
    urlOrId: string;
    platform: "IOS" | "ANDROID";
  }>({
    urlOrId: "570060128",
    platform: "IOS",
  });

  // Budget simulator state
  const [customBudget, setCustomBudget] = React.useState(15000);

  const {
    data: report,
    isLoading,
    isError,
    error,
    refetch,
  } = api.advertising.inspect.useQuery(
    {
      platform: activeInspectTarget.platform,
      urlOrId: activeInspectTarget.urlOrId,
      country,
    },
    {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  );

  const { data: simulation } = api.advertising.simulate.useQuery(
    {
      monthlyBudgetUsd: customBudget,
      platform: activeInspectTarget.platform,
      category: report?.app.category ?? "Utilities",
    },
    {
      enabled: Boolean(report),
    },
  );

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!urlOrIdInput.trim()) {
      toast.error("Please enter an App Store / Google Play URL or App ID.");
      return;
    }
    setActiveInspectTarget({
      urlOrId: urlOrIdInput.trim(),
      platform,
    });
  }

  function handleSelectBenchmark(bm: (typeof BENCHMARKS)[number]) {
    setPlatform(bm.platform);
    setUrlOrIdInput(bm.urlOrId);
    setActiveInspectTarget({
      urlOrId: bm.urlOrId,
      platform: bm.platform,
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
              Advertising & Paid UA Intelligence
            </h1>
            <Badge tone="accent" className="text-xs">
              Paid UA Intelligence
            </Badge>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            Inspect ad spend estimates, active advertising networks, keyword bidding conquesting, and campaign ROAS for any app on iOS and Android.
          </p>
        </div>
      </div>

      {/* App Lookup Form */}
      <Card className="border-[var(--border)] bg-[var(--surface)]">
        <CardContent className="p-4 sm:p-5">
          <form onSubmit={handleSearch} className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="w-full lg:w-36">
              <Select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as "IOS" | "ANDROID")}
                aria-label="Platform"
              >
                <option value="IOS">Apple iOS</option>
                <option value="ANDROID">Google Play</option>
              </Select>
            </div>

            <div className="relative flex-1">
              <Input
                value={urlOrIdInput}
                onChange={(e) => {
                  const val = e.target.value;
                  setUrlOrIdInput(val);
                  const detected = detectStoreInput(val);
                  if (detected.platform && detected.platform !== platform) {
                    setPlatform(detected.platform);
                  }
                  if (detected.country && detected.country !== country) {
                    setCountry(detected.country);
                  }
                }}
                placeholder="Paste App Store URL, Google Play URL, Track ID, or Package Name (e.g. com.strava)..."
                className="pr-10"
              />
              <Megaphone className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-muted)]" />
            </div>

            <div className="w-full lg:w-28">
              <Select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
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
              Inspect Ad Campaign
            </Button>
          </form>

          {/* Presets */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5 pt-2 text-xs text-[var(--text-muted)] border-t border-[var(--border)]">
            <span className="font-medium text-[var(--text-secondary)]">Live Benchmarks:</span>
            {BENCHMARKS.map((bm) => (
              <button
                key={bm.name}
                type="button"
                onClick={() => handleSelectBenchmark(bm)}
                className="rounded bg-[var(--page)] px-2 py-0.5 text-xs text-[var(--text-primary)] hover:border-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors border border-[var(--border)]"
              >
                {bm.name} <span className="text-[10px] text-[var(--text-muted)]">({bm.platform})</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="p-5">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-8 w-32 mb-2" />
                <Skeleton className="h-3 w-40" />
              </Card>
            ))}
          </div>
          <Card className="p-6">
            <Skeleton className="h-6 w-48 mb-4" />
            <Skeleton className="h-48 w-full" />
          </Card>
        </div>
      )}

      {/* Error state */}
      {isError && (
        <Card className="border-red-500/30 bg-red-500/5 p-6 text-center">
          <p className="text-sm font-medium text-red-400">
            Failed to load Advertising report: {error?.message || "App not found or rate limited."}
          </p>
          <Button variant="secondary" size="sm" onClick={() => refetch()} className="mt-3">
            Retry
          </Button>
        </Card>
      )}

      {/* Report Content */}
      {report && !isLoading && (
        <div className="space-y-6">
          {/* App Header Banner */}
          <Card className="border-[var(--border)] bg-[var(--surface)]">
            <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                {report.app.iconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={report.app.iconUrl}
                    alt={report.app.name}
                    className="size-16 rounded-2xl border border-[var(--border)] shadow-sm"
                  />
                ) : (
                  <div className="flex size-16 items-center justify-center rounded-2xl bg-[var(--page)] border border-[var(--border)]">
                    <Megaphone className="size-8 text-[var(--text-muted)]" />
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-[var(--text-primary)]">{report.app.name}</h2>
                    <Badge tone="neutral" className="text-xs">
                      {report.app.platform}
                    </Badge>
                    <Badge tone="accent" className="text-xs">
                      {report.app.category}
                    </Badge>
                  </div>
                  <p className="text-sm text-[var(--text-secondary)]">
                    {report.app.developer} &bull; Rating: {report.app.storeScore.toFixed(1)} ★
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 self-end sm:self-auto">
                <div className="text-right">
                  <p className="text-xs text-[var(--text-muted)]">Ad Campaign Health</p>
                  <p className="text-lg font-bold text-[var(--accent)]">
                    {report.overallAdHealthScore}/100
                  </p>
                </div>
                <div className="h-10 w-px bg-[var(--border)]" />
                <div className="text-right">
                  <p className="text-xs text-[var(--text-muted)]">Category SOV</p>
                  <p className="text-lg font-bold text-emerald-400">
                    {report.metrics.shareOfVoicePct}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Top 4 KPI Metrics */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-[var(--border)] bg-[var(--surface)]">
              <CardContent className="p-4">
                <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                  <span>Estimated Monthly Ad Spend</span>
                  <DollarSign className="size-4 text-emerald-400" />
                </div>
                <div className="mt-2 text-2xl font-bold text-[var(--text-primary)]">
                  {report.metrics.monthlyAdSpendFormatted}
                  <span className="text-xs font-normal text-[var(--text-muted)]"> /mo</span>
                </div>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  Annual run-rate: <span className="font-medium text-emerald-400">{report.metrics.annualAdSpendFormatted}</span>
                </p>
              </CardContent>
            </Card>

            <Card className="border-[var(--border)] bg-[var(--surface)]">
              <CardContent className="p-4">
                <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                  <span>Paid UA vs Organic Split</span>
                  <Users className="size-4 text-blue-400" />
                </div>
                <div className="mt-2 text-2xl font-bold text-[var(--text-primary)]">
                  {report.metrics.paidSharePct}% <span className="text-sm font-normal text-[var(--text-muted)]">Paid</span>
                </div>
                <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    style={{ width: `${report.metrics.paidSharePct}%` }}
                    className="bg-blue-500 transition-all"
                  />
                  <div
                    style={{ width: `${report.metrics.organicSharePct}%` }}
                    className="bg-emerald-500 transition-all"
                  />
                </div>
                <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                  {report.metrics.paidMonthlyInstalls.toLocaleString()} paid / {report.metrics.organicMonthlyInstalls.toLocaleString()} organic
                </p>
              </CardContent>
            </Card>

            <Card className="border-[var(--border)] bg-[var(--surface)]">
              <CardContent className="p-4">
                <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                  <span>Blended Cost Per Install (CPI)</span>
                  <Target className="size-4 text-purple-400" />
                </div>
                <div className="mt-2 text-2xl font-bold text-[var(--text-primary)]">
                  ${report.metrics.blendedCpiUsd.toFixed(2)}
                  <span className="text-xs font-normal text-[var(--text-muted)]"> /install</span>
                </div>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  Industry benchmark for {report.app.category}
                </p>
              </CardContent>
            </Card>

            <Card className="border-[var(--border)] bg-[var(--surface)]">
              <CardContent className="p-4">
                <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                  <span>Active Ad Networks</span>
                  <Megaphone className="size-4 text-amber-400" />
                </div>
                <div className="mt-2 text-2xl font-bold text-[var(--text-primary)]">
                  {report.networks.length}{" "}
                  <span className="text-sm font-normal text-[var(--text-muted)]">Networks</span>
                </div>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  Multi-channel acquisition footprint
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Active Ad Networks Detailed Grid */}
          <Card className="border-[var(--border)] bg-[var(--surface)]">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-base font-semibold">
                <div className="flex items-center gap-2">
                  <Megaphone className="size-5 text-[var(--accent)]" />
                  <span>Active Ad Networks & Spend Distribution</span>
                </div>
                <Badge tone="accent">{report.networks.length} Active Channels</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {report.networks.map((net) => (
                <div
                  key={net.id}
                  className="flex flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--page)] p-4"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-[var(--text-primary)]">{net.name}</h3>
                      <Badge
                        tone={net.status === "ACTIVE_CAMPAIGN" ? "good" : "neutral"}
                        className="text-[10px] uppercase"
                      >
                        {net.status.replace("_", " ")}
                      </Badge>
                    </div>

                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-xl font-bold text-emerald-400">
                        ${net.monthlySpendUsd.toLocaleString()}
                      </span>
                      <span className="text-xs text-[var(--text-muted)]">
                        ({net.spendSharePct}% of total ad spend)
                      </span>
                    </div>

                    <p className="mt-2 text-xs text-[var(--text-secondary)]">
                      <span className="font-medium text-[var(--text-primary)]">Targeting:</span> {net.targetingSignals}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-1">
                      {net.adFormats.map((fmt) => (
                        <span
                          key={fmt}
                          className="rounded bg-[var(--surface)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)] border border-[var(--border)]"
                        >
                          {fmt}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 rounded-lg bg-[var(--surface)] p-2.5 text-[11px] text-[var(--text-muted)] border border-[var(--border)]">
                    <span className="font-medium text-[var(--text-primary)]">Optimization tip:</span> {net.recommendedOptimization}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Keyword Conquesting & Paid Search Bidding Matrix */}
          <Card className="border-[var(--border)] bg-[var(--surface)]">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-base font-semibold">
                <div className="flex items-center gap-2">
                  <Target className="size-5 text-blue-400" />
                  <span>Paid Search & Keyword Conquesting Bids</span>
                </div>
                <Badge tone="neutral">Apple Search Ads + Google UAC</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-[var(--border)] text-xs text-[var(--text-muted)]">
                    <tr>
                      <th className="py-2.5 font-medium">Keyword / Search Term</th>
                      <th className="py-2.5 font-medium">Campaign Strategy</th>
                      <th className="py-2.5 font-medium">Estimated CPC</th>
                      <th className="py-2.5 font-medium">Search Volume</th>
                      <th className="py-2.5 font-medium">Ad Position</th>
                      <th className="py-2.5 font-medium">Strategic Recommendation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {report.keywordBidding.map((kb) => (
                      <tr key={kb.keyword} className="hover:bg-[var(--page)]/50 transition-colors">
                        <td className="py-3 font-semibold text-[var(--text-primary)]">
                          {kb.keyword}
                        </td>
                        <td className="py-3">
                          <Badge
                            tone={
                              kb.type === "BRAND_DEFENSE"
                                ? "accent"
                                : kb.type === "COMPETITOR_CONQUESTING"
                                ? "critical"
                                : "good"
                            }
                            className="text-[11px]"
                          >
                            {kb.type.replace("_", " ")}
                          </Badge>
                        </td>
                        <td className="py-3 font-medium text-emerald-400">
                          ${kb.estimatedCpcUsd.toFixed(2)}
                        </td>
                        <td className="py-3 text-[var(--text-secondary)]">
                          {kb.monthlySearchVolume.toLocaleString()} /mo
                        </td>
                        <td className="py-3 text-xs text-[var(--text-muted)]">
                          {kb.adPosition}
                        </td>
                        <td className="py-3 text-xs text-[var(--text-secondary)] max-w-xs">
                          {kb.recommendation}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Ad Creative Formats & Geo Campaign Breakdown */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Ad Creative Format Distribution */}
            <Card className="border-[var(--border)] bg-[var(--surface)]">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <Video className="size-5 text-purple-400" />
                  <span>Creative Format Audit & CTR Benchmarks</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {report.creativeFormats.map((cf) => (
                  <div key={cf.format} className="space-y-1.5 rounded-lg border border-[var(--border)] bg-[var(--page)] p-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-[var(--text-primary)]">{cf.format}</span>
                      <span className="font-bold text-[var(--accent)]">{cf.sharePct}% share</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-[var(--text-muted)]">
                      <span>Avg CTR: <strong className="text-emerald-400">{cf.avgCtrPct}%</strong></span>
                      <span>Install CVR: <strong className="text-blue-400">{cf.avgConversionRatePct}%</strong></span>
                    </div>
                    <p className="text-[11px] text-[var(--text-secondary)] pt-1">
                      {cf.strengths}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Geographic Paid UA Target Markets */}
            <Card className="border-[var(--border)] bg-[var(--surface)]">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <Globe className="size-5 text-emerald-400" />
                  <span>Geographic Paid UA Allocation</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-[var(--border)] text-[var(--text-muted)]">
                      <tr>
                        <th className="py-2 font-medium">Country</th>
                        <th className="py-2 font-medium">Budget Share</th>
                        <th className="py-2 font-medium">Est. Spend</th>
                        <th className="py-2 font-medium">Avg CPI</th>
                        <th className="py-2 font-medium">Paid Installs</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {report.geoTargets.map((gt) => (
                        <tr key={gt.country} className="hover:bg-[var(--page)]/50 transition-colors">
                          <td className="py-2.5 font-medium text-[var(--text-primary)]">
                            {gt.countryName}
                          </td>
                          <td className="py-2.5 font-semibold text-[var(--accent)]">
                            {gt.spendSharePct}%
                          </td>
                          <td className="py-2.5 text-emerald-400 font-medium">
                            ${gt.monthlySpendUsd.toLocaleString()}
                          </td>
                          <td className="py-2.5 text-[var(--text-secondary)]">
                            ${gt.avgCpiUsd.toFixed(2)}
                          </td>
                          <td className="py-2.5 text-[var(--text-primary)] font-medium">
                            {gt.paidInstalls.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Interactive Ad Budget & ROAS Simulator */}
          <Card className="border-[var(--border)] bg-[var(--surface)]">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-base font-semibold">
                <div className="flex items-center gap-2">
                  <Sliders className="size-5 text-[var(--accent)]" />
                  <span>Interactive Ad Budget & ROAS Simulator</span>
                </div>
                <Badge tone="good">Live Projection Model</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="font-medium text-[var(--text-primary)]">
                    Simulate Monthly Ad Budget:
                  </span>
                  <span className="text-xl font-bold text-emerald-400">
                    ${customBudget.toLocaleString()} /mo
                  </span>
                </div>
                <input
                  type="range"
                  min="500"
                  max="100000"
                  step="500"
                  value={customBudget}
                  onChange={(e) => setCustomBudget(Number(e.target.value))}
                  className="w-full accent-[var(--accent)] cursor-pointer"
                />
                <div className="flex justify-between text-[11px] text-[var(--text-muted)] mt-1">
                  <span>$500</span>
                  <span>$25,000</span>
                  <span>$50,000</span>
                  <span>$100,000</span>
                </div>
              </div>

              {simulation && (
                <div className="grid grid-cols-2 gap-4 rounded-xl border border-[var(--border)] bg-[var(--page)] p-4 sm:grid-cols-4">
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">Projected Paid Installs</p>
                    <p className="mt-1 text-lg font-bold text-[var(--text-primary)]">
                      {simulation.estimatedPaidInstalls.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-[var(--text-muted)]">@ ${simulation.blendedCpiUsd.toFixed(2)} CPI</p>
                  </div>

                  <div>
                    <p className="text-xs text-[var(--text-muted)]">New Paying Subscribers</p>
                    <p className="mt-1 text-lg font-bold text-blue-400">
                      {simulation.estimatedNewPayingSubscribers.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-[var(--text-muted)]">~4.5% conversion</p>
                  </div>

                  <div>
                    <p className="text-xs text-[var(--text-muted)]">12-Month LTV Cohort</p>
                    <p className="mt-1 text-lg font-bold text-emerald-400">
                      ${simulation.projected12MonthLtvUsd.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-[var(--text-muted)]">After 15% store fee</p>
                  </div>

                  <div>
                    <p className="text-xs text-[var(--text-muted)]">Projected ROAS</p>
                    <p className="mt-1 text-lg font-bold text-[var(--accent)]">
                      {simulation.roasMultiplier.toFixed(2)}x
                    </p>
                    <p className="text-[10px] text-[var(--text-muted)]">12-mo return on spend</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
