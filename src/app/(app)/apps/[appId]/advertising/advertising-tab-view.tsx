"use client";

import {
  DollarSign,
  Globe,
  Megaphone,
  Sliders,
  Target,
  Users,
  Video,
} from "lucide-react";
import * as React from "react";

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from "@/components/ui/primitives";
import { api } from "@/trpc/react";

export function AdvertisingTabView({ appId }: { appId: string }) {
  const [customBudget, setCustomBudget] = React.useState(10000);

  const {
    data: report,
    isLoading,
    isError,
    error,
  } = api.advertising.app.useQuery(
    { appId },
    { staleTime: 5 * 60 * 1000 },
  );

  const { data: simulation } = api.advertising.simulate.useQuery(
    {
      monthlyBudgetUsd: customBudget,
      platform: report?.app.platform ?? "IOS",
      category: report?.app.category ?? "Utilities",
    },
    {
      enabled: Boolean(report),
    },
  );

  if (isLoading) {
    return (
      <div className="space-y-4 py-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="p-5">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-8 w-32 mb-2" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (isError || !report) {
    return (
      <Card className="border-red-500/30 bg-red-500/5 p-6 text-center my-4">
        <p className="text-sm font-medium text-red-400">
          Could not load advertising profile: {error?.message || "App not tracked or missing metadata."}
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6 py-4">
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
              Annualized: <span className="font-medium text-emerald-400">{report.metrics.annualAdSpendFormatted}</span>
            </p>
          </CardContent>
        </Card>

        <Card className="border-[var(--border)] bg-[var(--surface)]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
              <span>Paid vs Organic Install Split</span>
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
              <span>Blended Acquisition Cost (CPI)</span>
              <Target className="size-4 text-purple-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-[var(--text-primary)]">
              ${report.metrics.blendedCpiUsd.toFixed(2)}
              <span className="text-xs font-normal text-[var(--text-muted)]"> /install</span>
            </div>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              Category Share of Voice: <strong className="text-emerald-400">{report.metrics.shareOfVoicePct}%</strong>
            </p>
          </CardContent>
        </Card>

        <Card className="border-[var(--border)] bg-[var(--surface)]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
              <span>Ad Campaign Health Score</span>
              <Megaphone className="size-4 text-amber-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-[var(--accent)]">
              {report.overallAdHealthScore}/100
            </div>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              {report.networks.length} Active Ad Networks
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Ad Networks Grid */}
      <Card className="border-[var(--border)] bg-[var(--surface)]">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base font-semibold">
            <div className="flex items-center gap-2">
              <Megaphone className="size-5 text-[var(--accent)]" />
              <span>Active Ad Networks & Channel Allocation</span>
            </div>
            <Badge tone="accent">{report.networks.length} Active</Badge>
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
                    ({net.spendSharePct}% of total budget)
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
                <span className="font-medium text-[var(--text-primary)]">Strategy:</span> {net.recommendedOptimization}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Keyword Conquesting Table */}
      <Card className="border-[var(--border)] bg-[var(--surface)]">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base font-semibold">
            <div className="flex items-center gap-2">
              <Target className="size-5 text-blue-400" />
              <span>Paid Keyword Bidding & Conquesting Matrix</span>
            </div>
            <Badge tone="neutral">Sponsored Bidding</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[var(--border)] text-xs text-[var(--text-muted)]">
                <tr>
                  <th className="py-2.5 font-medium">Keyword / Search Query</th>
                  <th className="py-2.5 font-medium">Strategy Type</th>
                  <th className="py-2.5 font-medium">Est. CPC</th>
                  <th className="py-2.5 font-medium">Search Volume</th>
                  <th className="py-2.5 font-medium">Target Recommendation</th>
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

      {/* Campaign Budget Simulator */}
      <Card className="border-[var(--border)] bg-[var(--surface)]">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base font-semibold">
            <div className="flex items-center gap-2">
              <Sliders className="size-5 text-[var(--accent)]" />
              <span>Simulate Campaign Budget & ROAS</span>
            </div>
            <Badge tone="good">ROI Calculator</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="font-medium text-[var(--text-primary)]">
                Adjust Monthly Ad Budget:
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
          </div>

          {simulation && (
            <div className="grid grid-cols-2 gap-4 rounded-xl border border-[var(--border)] bg-[var(--page)] p-4 sm:grid-cols-4">
              <div>
                <p className="text-xs text-[var(--text-muted)]">Projected Installs</p>
                <p className="mt-1 text-lg font-bold text-[var(--text-primary)]">
                  {simulation.estimatedPaidInstalls.toLocaleString()}
                </p>
              </div>

              <div>
                <p className="text-xs text-[var(--text-muted)]">New Subscribers</p>
                <p className="mt-1 text-lg font-bold text-blue-400">
                  {simulation.estimatedNewPayingSubscribers.toLocaleString()}
                </p>
              </div>

              <div>
                <p className="text-xs text-[var(--text-muted)]">12-Mo LTV Cohort</p>
                <p className="mt-1 text-lg font-bold text-emerald-400">
                  ${simulation.projected12MonthLtvUsd.toLocaleString()}
                </p>
              </div>

              <div>
                <p className="text-xs text-[var(--text-muted)]">Projected ROAS</p>
                <p className="mt-1 text-lg font-bold text-[var(--accent)]">
                  {simulation.roasMultiplier.toFixed(2)}x
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
