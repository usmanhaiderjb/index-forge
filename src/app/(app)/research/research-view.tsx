"use client";

import {
  ArrowRight,
  BarChart3,
  Check,
  Cpu,
  CreditCard,
  DollarSign,
  Download,
  Eye,
  Flame,
  Globe,
  Layers,
  Megaphone,
  Percent,
  Play,
  Search,
  Shield,
  Sparkles,
  Swords,
  Target,
  Terminal,
  TrendingUp,
  Trophy,
  Users,
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
import { exportToCsv } from "@/lib/csv-export";
import { api } from "@/trpc/react";
import { detectStoreInput } from "@/lib/store-detect";

const PRESET_APPS = [
  { name: "Duolingo", platform: "IOS", id: "570060128", url: "https://apps.apple.com/us/app/duolingo-language-lessons/id570060128" },
  { name: "Calm", platform: "IOS", id: "571800810", url: "https://apps.apple.com/us/app/calm-sleep-meditation/id571800810" },
  { name: "Strava", platform: "ANDROID", id: "com.strava", url: "com.strava" },
  { name: "Spotify", platform: "IOS", id: "324684580", url: "324684580" },
  { name: "TikTok", platform: "ANDROID", id: "com.zhiliaoapp.musically", url: "com.zhiliaoapp.musically" },
  { name: "Temu", platform: "IOS", id: "1641486558", url: "1641486558" },
  { name: "Headspace", platform: "ANDROID", id: "com.getsomeheadspace.android", url: "com.getsomeheadspace.android" },
] as const;

const BATTLECARD_MATCHUPS = [
  { label: "Duolingo vs. Babbel", a: { name: "Duolingo", platform: "IOS" as const, url: "570060128" }, b: { name: "Babbel", platform: "IOS" as const, url: "829587759" } },
  { label: "Calm vs. Headspace", a: { name: "Calm", platform: "IOS" as const, url: "571800810" }, b: { name: "Headspace", platform: "IOS" as const, url: "493145008" } },
  { label: "Strava vs. Nike Run", a: { name: "Strava", platform: "ANDROID" as const, url: "com.strava" }, b: { name: "Nike Run Club", platform: "ANDROID" as const, url: "com.nike.plusgps" } },
  { label: "Tinder vs. Bumble", a: { name: "Tinder", platform: "IOS" as const, url: "547702041" }, b: { name: "Bumble", platform: "IOS" as const, url: "930441707" } },
];

export function ResearchView() {
  const [viewMode, setViewMode] = React.useState<"single" | "battlecard">("single");
  const [country, setCountry] = React.useState("us");

  // Single Dossier state
  const [platform, setPlatform] = React.useState<"IOS" | "ANDROID">("IOS");
  const [urlOrIdInput, setUrlOrIdInput] = React.useState("https://apps.apple.com/us/app/duolingo-language-lessons/id570060128");
  const [activeInspectTarget, setActiveInspectTarget] = React.useState<{ urlOrId: string; platform: "IOS" | "ANDROID" }>({
    urlOrId: "570060128",
    platform: "IOS",
  });

  // Battlecard state
  const [battleA, setBattleA] = React.useState<{ platform: "IOS" | "ANDROID"; urlOrId: string }>({
    platform: "IOS",
    urlOrId: "570060128", // Duolingo
  });
  const [battleB, setBattleB] = React.useState<{ platform: "IOS" | "ANDROID"; urlOrId: string }>({
    platform: "IOS",
    urlOrId: "829587759", // Babbel
  });

  const dossier = api.intelligence.inspectApp.useQuery(
    {
      urlOrId: activeInspectTarget.urlOrId,
      platform: activeInspectTarget.platform,
      country,
    },
    { enabled: viewMode === "single" && Boolean(activeInspectTarget.urlOrId) },
  );

  const battlecard = api.intelligence.compareApps.useQuery(
    {
      appA: battleA,
      appB: battleB,
      country,
    },
    { enabled: viewMode === "battlecard" && Boolean(battleA.urlOrId) && Boolean(battleB.urlOrId) },
  );

  function handleSingleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (urlOrIdInput.trim()) {
      setActiveInspectTarget({
        urlOrId: urlOrIdInput.trim(),
        platform,
      });
    }
  }

  function handleExportDossierCsv() {
    if (!dossier.data) return;
    const d = dossier.data;
    const headers = ["Metric / Dimension", "Value", "Notes"];
    const rows = [
      ["App Name", d.detail.name, d.detail.developer ?? ""],
      ["Platform", d.platform, d.storeId],
      ["Rating Score", d.detail.ratingAverage ?? 0, `${d.detail.ratingCount?.toLocaleString() ?? 0} reviews`],
      ["Monthly Downloads (Est)", d.downloads.monthlyDownloads, `${d.downloads.dailyAverage} daily avg`],
      ["Monthly Gross Revenue (Est)", `$${d.revenue.monthlyGrossRevenueUsd.toLocaleString()}`, `$${d.revenue.annualRunRateUsd.toLocaleString()} ARR`],
      ["Monthly Net Revenue (Est)", `$${d.revenue.monthlyNetRevenueUsd.toLocaleString()}`, "After 15-30% store fees"],
      ["Estimated Ad Spend", `$${d.adIntelligence.estimatedMonthlyAdSpendUsd.toLocaleString()}`, `${d.adIntelligence.shareOfVoicePct}% SOV`],
      ["Paid vs Organic Split", `${d.downloads.paidUaPct}% Paid / ${d.downloads.organicPct}% Organic`, `$${d.adIntelligence.paidCpiEstimateUsd} CPI`],
      ["Tech Stack Framework", d.techStack.framework, d.techStack.sdks.map((s) => s.name).join(", ")],
      ["Top Geo Market", d.geographicBreakdown[0]?.countryName ?? "US", `${d.geographicBreakdown[0]?.downloadsPct}% DLs / ${d.geographicBreakdown[0]?.revenuePct}% Rev`],
    ];
    exportToCsv(`${d.detail.name.replace(/[^a-zA-Z0-9]/g, "_")}_App_Intelligence_Dossier`, headers, rows);
    toast.success("Exported Dossier to CSV!");
  }

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* View Mode Toggle Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
              App Store & Google Play Market Intelligence
            </h1>
            <Badge tone="accent" className="text-xs">Market Intelligence</Badge>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            Reverse-engineer any app's download volume, publisher gross/net revenue, paid UA ad spend, IAP catalog, and SDK tech stack.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1">
            <button
              type="button"
              onClick={() => setViewMode("single")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === "single"
                  ? "bg-[var(--accent)] text-[var(--accent-contrast)] shadow-sm"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <Search className="size-3.5" /> Single App Dossier
            </button>
            <button
              type="button"
              onClick={() => setViewMode("battlecard")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === "battlecard"
                  ? "bg-[var(--accent)] text-[var(--accent-contrast)] shadow-sm"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <Swords className="size-3.5" /> Competitor Battlecard
            </button>
          </div>
        </div>
      </div>

      {/* SINGLE APP DOSSIER MODE */}
      {viewMode === "single" && (
        <>
          {/* Search Card */}
          <Card className="border-[var(--border)] bg-[var(--surface)]">
            <CardContent className="p-4 sm:p-5 space-y-3">
              <form onSubmit={handleSingleSearch} className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="w-full lg:w-36">
                  <Select value={platform} onChange={(e) => setPlatform(e.target.value as "IOS" | "ANDROID")}>
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
                    placeholder="Paste App Store URL, Google Play URL, Track ID, or Package Name..."
                    className="pr-10"
                  />
                  <Search className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-muted)]" />
                </div>

                <div className="w-full lg:w-28">
                  <Select value={country} onChange={(e) => setCountry(e.target.value)}>
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

                <Button type="submit" variant="primary" disabled={dossier.isLoading}>
                  <Sparkles className="mr-1.5 size-4" /> Generate Dossier
                </Button>
              </form>

              {/* Presets */}
              <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-[var(--border)] text-xs text-[var(--text-muted)]">
                <span className="font-medium text-[var(--text-secondary)]">Live Benchmarks:</span>
                {PRESET_APPS.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => {
                      setPlatform(p.platform);
                      setUrlOrIdInput(p.url);
                      setActiveInspectTarget({ urlOrId: p.url, platform: p.platform });
                    }}
                    className="rounded border border-[var(--border)] bg-[var(--page)] px-2 py-0.5 text-xs text-[var(--text-primary)] hover:border-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors"
                  >
                    {p.name} <span className="text-[10px] text-[var(--text-muted)]">({p.platform})</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Dossier Loading */}
          {dossier.isLoading && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4].map((i) => (
                  <Card key={i} className="p-5"><Skeleton className="h-4 w-24 mb-2" /><Skeleton className="h-8 w-32 mb-2" /></Card>
                ))}
              </div>
            </div>
          )}

          {/* Dossier Loaded Result */}
          {dossier.data && (
            <div className="space-y-6">
              {/* App Dossier Header */}
              <Card className="border-[var(--border)] bg-[var(--surface)]">
                <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-4">
                    {dossier.data.detail.iconUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={dossier.data.detail.iconUrl} alt="" className="size-16 rounded-2xl border border-[var(--border)] shadow-sm" />
                    ) : (
                      <div className="flex size-16 items-center justify-center rounded-2xl bg-[var(--page)] border border-[var(--border)] font-bold text-xl">
                        {dossier.data.detail.name[0]}
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-xl font-bold text-[var(--text-primary)]">{dossier.data.detail.name}</h2>
                        <Badge tone="neutral" className="text-xs">{dossier.data.platform}</Badge>
                        <Badge tone="accent" className="text-xs">{dossier.data.detail.category ?? "App"}</Badge>
                      </div>
                      <p className="text-sm text-[var(--text-secondary)]">
                        {dossier.data.detail.developer} &bull; Rating: {dossier.data.detail.ratingAverage?.toFixed(1) ?? 4.5} ★ ({dossier.data.detail.ratingCount?.toLocaleString() ?? 0} ratings)
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-auto">
                    <Button variant="secondary" size="sm" onClick={handleExportDossierCsv}>
                      <Download className="size-3.5 mr-1" /> Export CSV
                    </Button>
                    <div className="text-right pl-3 border-l border-[var(--border)]">
                      <p className="text-xs text-[var(--text-muted)]">Overall Health</p>
                      <p className="text-lg font-bold text-[var(--accent)]">{dossier.data.overallHealthScore}/100</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 4-KPI Row */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card className="border-[var(--border)] bg-[var(--surface)] p-4">
                  <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                    <span>Monthly Downloads (Est)</span>
                    <Download className="size-4 text-emerald-400" />
                  </div>
                  <div className="mt-2 text-2xl font-bold text-[var(--text-primary)]">
                    {dossier.data.downloads.monthlyDownloadsFormatted}
                    <span className="text-xs font-normal text-[var(--text-muted)]"> /mo</span>
                  </div>
                  <p className="mt-1 text-xs text-emerald-400 font-medium">
                    +{dossier.data.downloads.growthMomPct}% MoM &bull; {dossier.data.downloads.dailyAverage.toLocaleString()} daily
                  </p>
                </Card>

                <Card className="border-[var(--border)] bg-[var(--surface)] p-4">
                  <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                    <span>Monthly Revenue (Gross)</span>
                    <DollarSign className="size-4 text-emerald-400" />
                  </div>
                  <div className="mt-2 text-2xl font-bold text-emerald-400">
                    {dossier.data.revenue.monthlyGrossFormatted}
                    <span className="text-xs font-normal text-[var(--text-muted)]"> /mo</span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    Net: <strong className="text-[var(--text-primary)]">{dossier.data.revenue.monthlyNetFormatted}</strong> &bull; ARR: {dossier.data.revenue.annualRunRateFormatted}
                  </p>
                </Card>

                <Card className="border-[var(--border)] bg-[var(--surface)] p-4">
                  <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                    <span>Monthly Ad Spend (Est)</span>
                    <Megaphone className="size-4 text-blue-400" />
                  </div>
                  <div className="mt-2 text-2xl font-bold text-blue-400">
                    {dossier.data.adIntelligence.estimatedMonthlyAdSpendFormatted}
                    <span className="text-xs font-normal text-[var(--text-muted)]"> /mo</span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    Category SOV: <strong className="text-blue-400">{dossier.data.adIntelligence.shareOfVoicePct}%</strong>
                  </p>
                </Card>

                <Card className="border-[var(--border)] bg-[var(--surface)] p-4">
                  <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                    <span>Paid vs Organic Installs</span>
                    <Users className="size-4 text-purple-400" />
                  </div>
                  <div className="mt-2 text-2xl font-bold text-[var(--text-primary)]">
                    {dossier.data.downloads.paidUaPct}% <span className="text-xs font-normal text-[var(--text-muted)]">Paid</span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    Blended CPI: <strong className="text-purple-400">${dossier.data.adIntelligence.paidCpiEstimateUsd.toFixed(2)}</strong>
                  </p>
                </Card>
              </div>

              {/* Active Ad Networks & Geographic Breakdown */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* Active Ad Networks */}
                <Card className="border-[var(--border)] bg-[var(--surface)]">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold flex items-center justify-between">
                      <span className="flex items-center gap-2"><Megaphone className="size-4 text-blue-400" /> Active Ad Networks</span>
                      <Badge tone="accent">{dossier.data.adIntelligence.activeAdNetworks.length} Channels</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {dossier.data.adIntelligence.activeAdNetworks.map((net) => (
                      <div key={net.network} className="flex items-center justify-between p-2.5 rounded-lg border border-[var(--border)] bg-[var(--page)] text-xs">
                        <div>
                          <span className="font-semibold text-[var(--text-primary)]">{net.network}</span>
                          <p className="text-[10px] text-[var(--text-muted)] uppercase">{net.type.replace("_", " ")}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-emerald-400">{net.spendSharePct}% spend</span>
                          <Badge tone="good" className="text-[9px]">ACTIVE</Badge>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Tech Stack Detection */}
                <Card className="border-[var(--border)] bg-[var(--surface)]">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold flex items-center justify-between">
                      <span className="flex items-center gap-2"><Cpu className="size-4 text-emerald-400" /> SDK & Tech Stack Audit</span>
                      <Badge tone="neutral">{dossier.data.techStack.framework}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {dossier.data.techStack.sdks.map((sdk) => (
                        <div key={sdk.id} className="p-2 rounded-lg border border-[var(--border)] bg-[var(--page)] text-xs flex-1 min-w-[140px]">
                          <span className="font-bold text-[var(--text-primary)] block">{sdk.name}</span>
                          <span className="text-[10px] text-[var(--text-muted)] uppercase">{sdk.category}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </>
      )}

      {/* BATTLECARD COMPARISON MODE */}
      {viewMode === "battlecard" && (
        <div className="space-y-6">
          {/* Matchup Selector */}
          <Card className="border-[var(--border)] bg-[var(--surface)]">
            <CardContent className="p-4 sm:p-5 space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold text-[var(--text-primary)]">Presets:</span>
                {BATTLECARD_MATCHUPS.map((m) => (
                  <button
                    key={m.label}
                    type="button"
                    onClick={() => {
                      setBattleA({ platform: m.a.platform, urlOrId: m.a.url });
                      setBattleB({ platform: m.b.platform, urlOrId: m.b.url });
                    }}
                    className="rounded-md border border-[var(--border)] bg-[var(--page)] px-2.5 py-1 text-xs text-[var(--text-primary)] hover:border-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors"
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 pt-2 border-t border-[var(--border)]">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">App #1 (Contender A):</label>
                  <div className="flex gap-2">
                    <Select value={battleA.platform} onChange={(e) => setBattleA({ ...battleA, platform: e.target.value as "IOS" | "ANDROID" })} className="w-32">
                      <option value="IOS">iOS</option>
                      <option value="ANDROID">Android</option>
                    </Select>
                    <Input
                      value={battleA.urlOrId}
                      onChange={(e) => {
                        const val = e.target.value;
                        const detected = detectStoreInput(val);
                        setBattleA((prev) => ({
                          ...prev,
                          urlOrId: val,
                          platform: detected.platform ?? prev.platform,
                        }));
                      }}
                      placeholder="URL or ID A..."
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">App #2 (Contender B):</label>
                  <div className="flex gap-2">
                    <Select value={battleB.platform} onChange={(e) => setBattleB({ ...battleB, platform: e.target.value as "IOS" | "ANDROID" })} className="w-32">
                      <option value="IOS">iOS</option>
                      <option value="ANDROID">Android</option>
                    </Select>
                    <Input
                      value={battleB.urlOrId}
                      onChange={(e) => {
                        const val = e.target.value;
                        const detected = detectStoreInput(val);
                        setBattleB((prev) => ({
                          ...prev,
                          urlOrId: val,
                          platform: detected.platform ?? prev.platform,
                        }));
                      }}
                      placeholder="URL or ID B..."
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Battlecard Loading */}
          {battlecard.isLoading && (
            <div className="p-8 text-center"><Skeleton className="h-48 w-full" /></div>
          )}

          {/* Battlecard Results */}
          {battlecard.data && (
            <div className="space-y-6">
              {/* Head-to-Head Banner */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto_1fr] items-center">
                <Card className="border-[var(--border)] bg-[var(--surface)] p-5 text-center">
                  <h3 className="text-lg font-bold text-[var(--text-primary)]">{battlecard.data.appA.detail.name}</h3>
                  <p className="text-xs text-[var(--text-secondary)]">{battlecard.data.appA.detail.developer}</p>
                  <div className="mt-3 flex justify-center gap-2">
                    <Badge tone="accent">{battlecard.data.appA.downloads.monthlyDownloadsFormatted} DLs/mo</Badge>
                    <Badge tone="good">{battlecard.data.appA.revenue.monthlyGrossFormatted} Rev/mo</Badge>
                  </div>
                </Card>

                <div className="flex flex-col items-center justify-center p-2">
                  <div className="size-10 rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] flex items-center justify-center font-bold text-sm shadow-lg">
                    VS
                  </div>
                </div>

                <Card className="border-[var(--border)] bg-[var(--surface)] p-5 text-center">
                  <h3 className="text-lg font-bold text-[var(--text-primary)]">{battlecard.data.appB.detail.name}</h3>
                  <p className="text-xs text-[var(--text-secondary)]">{battlecard.data.appB.detail.developer}</p>
                  <div className="mt-3 flex justify-center gap-2">
                    <Badge tone="accent">{battlecard.data.appB.downloads.monthlyDownloadsFormatted} DLs/mo</Badge>
                    <Badge tone="good">{battlecard.data.appB.revenue.monthlyGrossFormatted} Rev/mo</Badge>
                  </div>
                </Card>
              </div>

              {/* Key Takeaways */}
              <Card className="border-[var(--border)] bg-[var(--surface)] p-5 space-y-3">
                <h4 className="font-bold text-sm text-[var(--text-primary)] flex items-center gap-2">
                  <Trophy className="size-4 text-amber-400" /> Battlecard Strategic Summary
                </h4>
                <ul className="space-y-2 text-xs text-[var(--text-secondary)]">
                  {battlecard.data.keyTakeaways.map((t, idx) => (
                    <li key={idx} className="flex items-center gap-2">
                      <Check className="size-4 text-emerald-400 shrink-0" />
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </Card>

              {/* Side-by-Side Comparison Table */}
              <Card className="border-[var(--border)] bg-[var(--surface)]">
                <CardContent className="p-0">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-[var(--border)] text-xs text-[var(--text-muted)]">
                      <tr>
                        <th className="py-3 px-4 font-semibold">Metric / Capability</th>
                        <th className="py-3 px-4 font-bold text-[var(--text-primary)]">{battlecard.data.appA.detail.name}</th>
                        <th className="py-3 px-4 font-bold text-[var(--text-primary)]">{battlecard.data.appB.detail.name}</th>
                        <th className="py-3 px-4 font-semibold text-right">Leader</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)] text-xs">
                      <tr className="hover:bg-[var(--page)]/50">
                        <td className="py-3 px-4 font-medium text-[var(--text-primary)]">Monthly Downloads</td>
                        <td className="py-3 px-4 font-bold text-emerald-400">{battlecard.data.appA.downloads.monthlyDownloadsFormatted}</td>
                        <td className="py-3 px-4 font-bold text-emerald-400">{battlecard.data.appB.downloads.monthlyDownloadsFormatted}</td>
                        <td className="py-3 px-4 text-right"><Badge tone="good">App {battlecard.data.downloadsWinner}</Badge></td>
                      </tr>
                      <tr className="hover:bg-[var(--page)]/50">
                        <td className="py-3 px-4 font-medium text-[var(--text-primary)]">Monthly Gross Revenue</td>
                        <td className="py-3 px-4 font-bold text-emerald-400">{battlecard.data.appA.revenue.monthlyGrossFormatted}</td>
                        <td className="py-3 px-4 font-bold text-emerald-400">{battlecard.data.appB.revenue.monthlyGrossFormatted}</td>
                        <td className="py-3 px-4 text-right"><Badge tone="good">App {battlecard.data.revenueWinner}</Badge></td>
                      </tr>
                      <tr className="hover:bg-[var(--page)]/50">
                        <td className="py-3 px-4 font-medium text-[var(--text-primary)]">Estimated Ad Spend</td>
                        <td className="py-3 px-4 font-bold text-blue-400">{battlecard.data.appA.adIntelligence.estimatedMonthlyAdSpendFormatted}</td>
                        <td className="py-3 px-4 font-bold text-blue-400">{battlecard.data.appB.adIntelligence.estimatedMonthlyAdSpendFormatted}</td>
                        <td className="py-3 px-4 text-right"><Badge tone="accent">App {battlecard.data.adSpendWinner}</Badge></td>
                      </tr>
                      <tr className="hover:bg-[var(--page)]/50">
                        <td className="py-3 px-4 font-medium text-[var(--text-primary)]">Tech Stack SDKs</td>
                        <td className="py-3 px-4 text-[var(--text-secondary)]">{battlecard.data.appA.techStack.sdks.map((s) => s.name).join(", ")}</td>
                        <td className="py-3 px-4 text-[var(--text-secondary)]">{battlecard.data.appB.techStack.sdks.map((s) => s.name).join(", ")}</td>
                        <td className="py-3 px-4 text-right"><Badge tone="neutral">Audited</Badge></td>
                      </tr>
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
