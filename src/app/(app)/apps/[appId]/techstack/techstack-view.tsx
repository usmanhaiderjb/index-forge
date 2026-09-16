"use client";

import { Cpu, Lock, Shield, ShieldAlert, Sparkles, Terminal, TriangleAlert } from "lucide-react";
import * as React from "react";

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
} from "@/components/ui/primitives";
import { api } from "@/trpc/react";

export function TechStackView({ appId }: { appId: string }) {
  const techStack = api.techStack.inspect.useQuery({ appId });

  if (techStack.isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const report = techStack.data;

  if (!report) {
    return (
      <EmptyState
        title="Tech stack inspection unavailable"
        description="Could not inspect the framework and SDKs for this app."
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
              <Cpu className="size-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-[var(--text-secondary)]">Core Framework</p>
              <p className="text-sm font-semibold">{report.framework}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-[color-mix(in_oklab,var(--status-good)_15%,transparent)] p-2.5 text-[var(--status-good)]">
              <Terminal className="size-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-[var(--text-secondary)]">Detected SDKs</p>
              <p className="text-sm font-semibold">{report.sdks.length} Third-Party Libraries</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-[color-mix(in_oklab,var(--status-good)_15%,transparent)] p-2.5 text-[var(--status-good)]">
              <Shield className="size-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-[var(--text-secondary)]">Privacy Score</p>
              <p className="text-sm font-semibold">{report.privacyScore} / 100</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-[color-mix(in_oklab,var(--status-warning)_15%,transparent)] p-2.5 text-[var(--status-warning)]">
              <Lock className="size-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-[var(--text-secondary)]">Conversion Friction</p>
              <p className="text-sm font-semibold">{report.conversionFrictionScore}% Permission Friction</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actionable Recommendations */}
      {report.recommendations.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-[var(--accent)]" /> Technical ASO & Permission Optimization
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {report.recommendations.map((rec, i) => (
              <p key={i} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                <span className="text-[var(--accent)] font-bold">*</span>
                <span>{rec}</span>
              </p>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {/* Detected SDKs Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Terminal className="size-4" /> Detected SDKs & Infrastructure
            </CardTitle>
            <Badge tone="accent">{report.sdks.length} SDKs</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-secondary)]">
                  <th className="px-4 py-2 font-medium">SDK / Service</th>
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 font-medium">Vendor</th>
                  <th className="px-3 py-2 font-medium">Description</th>
                  <th className="px-4 py-2 text-right font-medium">Detection Confidence</th>
                </tr>
              </thead>
              <tbody>
                {report.sdks.map((sdk) => (
                  <tr key={sdk.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-4 py-3 font-semibold">{sdk.name}</td>
                    <td className="px-3 py-3 text-xs">
                      <Badge tone={sdk.category === "MONETIZATION" ? "good" : sdk.category === "ATTRIBUTION" ? "accent" : "neutral"}>
                        {sdk.category}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-xs text-[var(--text-secondary)]">{sdk.vendor}</td>
                    <td className="px-3 py-3 text-xs text-[var(--text-secondary)]">{sdk.description}</td>
                    <td className="px-4 py-3 text-right text-xs">
                      <Badge tone={sdk.confidence === "HIGH" ? "good" : "neutral"}>{sdk.confidence}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Permissions & Security Declarations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="size-4" /> Declared Permissions & Conversion Impact
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-secondary)]">
                  <th className="px-4 py-2 font-medium">Permission</th>
                  <th className="px-3 py-2 font-medium">Scope</th>
                  <th className="px-3 py-2 font-medium">Risk Level</th>
                  <th className="px-4 py-2 text-right font-medium">Conversion Friction</th>
                </tr>
              </thead>
              <tbody>
                {report.permissions.map((perm) => (
                  <tr key={perm.permission} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-4 py-2.5 font-mono text-xs font-medium">{perm.permission}</td>
                    <td className="px-3 py-2.5 text-xs text-[var(--text-secondary)]">{perm.label}</td>
                    <td className="px-3 py-2.5 text-xs">
                      <Badge tone={perm.category === "HIGH" || perm.category === "CRITICAL" ? "critical" : perm.category === "MEDIUM" ? "warning" : "good"}>
                        {perm.category}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs">
                      <Badge tone={perm.conversionImpactRisk === "HIGH" ? "critical" : perm.conversionImpactRisk === "MEDIUM" ? "warning" : "good"}>
                        {perm.conversionImpactRisk} Friction
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Data Safety Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="size-4" /> App Store Data Safety & Privacy Disclosures
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          <div>
            <p className="font-semibold text-xs text-[var(--text-secondary)] uppercase tracking-wider">Data Collected</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {report.dataSafetyDisclosures.dataCollected.map((d, i) => (
                <Badge key={i} tone="neutral">{d}</Badge>
              ))}
            </div>
          </div>
          <div>
            <p className="font-semibold text-xs text-[var(--text-secondary)] uppercase tracking-wider">Data Shared with 3rd Parties</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {report.dataSafetyDisclosures.dataShared.map((d, i) => (
                <Badge key={i} tone="warning">{d}</Badge>
              ))}
            </div>
          </div>
          <div>
            <p className="font-semibold text-xs text-[var(--text-secondary)] uppercase tracking-wider">Security Practices</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {report.dataSafetyDisclosures.securityPractices.map((d, i) => (
                <Badge key={i} tone="good">{d}</Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
