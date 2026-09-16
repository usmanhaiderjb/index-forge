"use client";

import { CreditCard, DollarSign, Globe, Layers, ShieldCheck, Sparkles, TrendingUp, Users } from "lucide-react";
import * as React from "react";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Select,
  Skeleton,
} from "@/components/ui/primitives";
import { api } from "@/trpc/react";

export function MonetizationView({ appId }: { appId: string }) {
  const [selectedCountry, setSelectedCountry] = React.useState("us");
  const monetization = api.monetization.summary.useQuery({ appId, country: selectedCountry });
  const competitors = api.monetization.competitors.useQuery({ appId });

  if (monetization.isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const report = monetization.data;

  if (!report) {
    return (
      <EmptyState
        title="No monetization data available"
        description="Could not extract in-app purchase data for this app."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Top Banner Overview */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-[color-mix(in_oklab,var(--accent)_15%,transparent)] p-2.5 text-[var(--accent)]">
              <DollarSign className="size-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-[var(--text-secondary)]">Monetization Model</p>
              <p className="text-sm font-semibold">{report.hasSubscriptions ? "Auto-Renewing Subscription" : report.hasIap ? "In-App Purchases" : "Free / Ad-Supported"}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-[color-mix(in_oklab,var(--status-good)_15%,transparent)] p-2.5 text-[var(--status-good)]">
              <TrendingUp className="size-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-[var(--text-secondary)]">Price Range</p>
              <p className="text-sm font-semibold">${report.minPrice.toFixed(2)} - ${report.maxPrice.toFixed(2)}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-[color-mix(in_oklab,var(--accent)_15%,transparent)] p-2.5 text-[var(--accent)]">
              <Layers className="size-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-[var(--text-secondary)]">Active Products</p>
              <p className="text-sm font-semibold">{report.items.length} In-App Items</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-[color-mix(in_oklab,var(--status-good)_15%,transparent)] p-2.5 text-[var(--status-good)]">
              <CreditCard className="size-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-[var(--text-secondary)]">Estimated Monthly ARPPU</p>
              <p className="text-sm font-semibold">${report.estimatedMonthlyArppu.toFixed(2)} / paying user</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Paywall Strategy */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-[var(--accent)]" /> Paywall & Revenue Architecture
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm font-medium">{report.paywallStrategy}</p>
          <p className="text-xs text-[var(--text-secondary)]">
            Analyzing subscription terms, trial length, pricing anchors, and auto-renewable tiers.
            Apps offering annual plans at a 30-50% discount compared to 12x monthly yield +38% higher LTV on average.
          </p>
        </CardContent>
      </Card>

      {/* In-App Purchases Catalog */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="size-4" /> In-App Purchases & Subscription Tiers
            </CardTitle>
            <Badge tone="accent">{report.items.length} SKUs</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-secondary)]">
                  <th className="px-4 py-2 font-medium">Item Name</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Billing Period</th>
                  <th className="px-3 py-2 font-medium">Free Trial</th>
                  <th className="px-4 py-2 text-right font-medium">Price (USD)</th>
                </tr>
              </thead>
              <tbody>
                {report.items.map((item) => (
                  <tr key={item.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-4 py-3 font-medium">
                      <div className="flex items-center gap-2">
                        <span>{item.name}</span>
                        {item.isPromoted ? <Badge tone="good">Promoted IAP</Badge> : null}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs">
                      <Badge tone={item.type === "AUTO_RENEWABLE_SUBSCRIPTION" ? "accent" : "neutral"}>
                        {item.type.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-xs text-[var(--text-secondary)]">
                      {item.period ?? "One-Time Purchase"}
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {item.freeTrialDays ? (
                        <Badge tone="good">{item.freeTrialDays}-Day Free Trial</Badge>
                      ) : (
                        <span className="text-[var(--text-muted)]">-</span>
                      )}
                    </td>
                    <td className="tabular px-4 py-3 text-right font-semibold">
                      {item.priceFormatted}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Purchasing Power Parity (PPP) Global Matrix */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Globe className="size-4" /> Global Pricing & Purchasing Power Parity (PPP)
              </CardTitle>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Standard USD pricing in emerging markets (India, Brazil, Turkey) reduces conversion by up to 70%.
                Recommended local prices below are indexed against purchasing power parity benchmarks.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-secondary)]">
                  <th className="px-4 py-2 font-medium">Country / Market</th>
                  <th className="px-3 py-2 font-medium">Tier</th>
                  <th className="px-3 py-2 font-medium">Currency</th>
                  <th className="px-3 py-2 text-right font-medium">PPP Factor</th>
                  <th className="px-4 py-2 text-right font-medium">Suggested Local Price</th>
                </tr>
              </thead>
              <tbody>
                {report.pppRecommendations.map((row) => (
                  <tr key={row.country} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-4 py-2.5 font-medium">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[var(--text-muted)] uppercase">{row.country}</span>
                        <span>{row.countryName}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge
                        tone={
                          row.tier === "TIER_1_PREMIUM"
                            ? "accent"
                            : row.tier === "TIER_2_STANDARD"
                              ? "neutral"
                              : "warning"
                        }
                      >
                        {row.tier.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="tabular px-3 py-2.5 text-xs text-[var(--text-secondary)]">{row.currency}</td>
                    <td className="tabular px-3 py-2.5 text-right font-mono text-xs">
                      {(row.purchasingPowerRatio * 100).toFixed(0)}%
                    </td>
                    <td className="tabular px-4 py-2.5 text-right font-semibold">
                      {row.suggestedPriceFormatted}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Competitor Pricing Comparison */}
      {competitors.data && competitors.data.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-4" /> Competitor Pricing Benchmarks
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-secondary)]">
                    <th className="px-4 py-2 font-medium">Competitor</th>
                    <th className="px-3 py-2 font-medium">Platform</th>
                    <th className="px-3 py-2 font-medium">Monetization</th>
                    <th className="px-3 py-2 font-medium">Price Range</th>
                    <th className="px-4 py-2 font-medium">Paywall Strategy</th>
                  </tr>
                </thead>
                <tbody>
                  {competitors.data.map((c) => (
                    <tr key={c.competitorId} className="border-b border-[var(--border)] last:border-0">
                      <td className="px-4 py-3 font-medium">
                        <div className="flex items-center gap-2">
                          {c.iconUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={c.iconUrl} alt={c.name} className="size-6 rounded" />
                          ) : null}
                          <span>{c.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <Badge tone="neutral">{c.platform}</Badge>
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <Badge tone={c.hasSubscriptions ? "accent" : "good"}>
                          {c.hasSubscriptions ? "Subscription" : "Free / IAP"}
                        </Badge>
                      </td>
                      <td className="tabular px-3 py-3 font-mono text-xs">
                        ${c.minPrice.toFixed(2)} - ${c.maxPrice.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--text-secondary)]">
                        {c.paywallStrategy}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
