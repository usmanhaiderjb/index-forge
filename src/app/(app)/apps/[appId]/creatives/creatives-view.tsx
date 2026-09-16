"use client";

import { ArrowRight, Eye, Gauge, Images, LayoutGrid, Smartphone, Sparkles, TriangleAlert, Video } from "lucide-react";
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
  Select,
  Skeleton,
} from "@/components/ui/primitives";
import { api } from "@/trpc/react";

export function CreativesView({ appId }: { appId: string }) {
  const [storefront, setStorefront] = React.useState("");

  const locales = api.apps.locales.useQuery({ appId });
  const selected = locales.data?.find(
    (l) => `${l.country}:${l.locale}` === storefront,
  );

  const screenshots = api.ai.screenshots.useQuery({
    appId,
    ...(selected ? { country: selected.country, locale: selected.locale } : {}),
  });

  const analyze = api.ai.analyzeScreenshots.useMutation({
    onError: (error) => toast.error(error.message),
  });

  const byPosition = new Map(
    (Array.isArray(analyze.data?.screenshots) ? analyze.data.screenshots : []).map((s) => [s.position, s]),
  );

  const totalShots = screenshots.data?.urls.length ?? 0;
  const hasVideo = screenshots.data?.hasVideo ?? false;

  return (
    <div className="flex flex-col gap-6">
      {/* Top Banner Overview */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-[color-mix(in_oklab,var(--accent)_15%,transparent)] p-2.5 text-[var(--accent)]">
              <Images className="size-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-[var(--text-secondary)]">Screenshot Count</p>
              <p className="text-sm font-semibold">{totalShots} Captured Images</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-[color-mix(in_oklab,var(--status-good)_15%,transparent)] p-2.5 text-[var(--status-good)]">
              <Smartphone className="size-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-[var(--text-secondary)]">Orientation</p>
              <p className="text-sm font-semibold">Portrait (9:16)</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-[color-mix(in_oklab,var(--accent)_15%,transparent)] p-2.5 text-[var(--accent)]">
              <Video className="size-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-[var(--text-secondary)]">App Preview Video</p>
              <p className="text-sm font-semibold">{hasVideo ? "Active (+20% CVR)" : "Not Detected"}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-[color-mix(in_oklab,var(--status-good)_15%,transparent)] p-2.5 text-[var(--status-good)]">
              <Gauge className="size-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-[var(--text-secondary)]">Visual Readiness</p>
              <p className="text-sm font-semibold">{totalShots >= 5 ? "High (Complete Gallery)" : "Needs Expansion"}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-[var(--text-secondary)]">
          Screenshots move conversion more than any text field. Most visitors see only the first two at thumbnail size before deciding whether to tap or scroll.
        </p>
        <div className="flex items-center gap-2">
          {locales.data && locales.data.length > 1 ? (
            <Select value={storefront} onChange={(e) => setStorefront(e.target.value)}>
              <option value="">Primary storefront</option>
              {locales.data.map((l) => (
                <option key={l.id} value={`${l.country}:${l.locale}`}>
                  {l.country.toUpperCase()} · {l.locale}
                </option>
              ))}
            </Select>
          ) : null}
          <Button
            variant="primary"
            disabled={analyze.isPending || !screenshots.data?.urls.length}
            onClick={() =>
              analyze.mutate({
                appId,
                ...(selected ? { country: selected.country, locale: selected.locale } : {}),
              })
            }
          >
            <Sparkles /> {analyze.isPending ? "Looking..." : "Analyze Gallery Critique"}
          </Button>
        </div>
      </div>

      {analyze.data ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="size-4" aria-hidden /> First Impression & Conversion Audit
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm">{analyze.data.firstImpression}</p>
            <p className="text-sm text-[var(--text-secondary)]">{analyze.data.summary}</p>

            {Array.isArray(analyze.data.suggestedOrder) &&
            analyze.data.suggestedOrder.length > 0 &&
            analyze.data.suggestedOrder.join() !==
              (Array.isArray(analyze.data.screenshots) ? analyze.data.screenshots : []).map((s) => s.position).join() ? (
              <div className="rounded-md border border-[var(--border)] p-3">
                <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                  Suggested Order
                  {analyze.data.suggestedOrder.map((position, i) => (
                    <React.Fragment key={`${position}-${i}`}>
                      {i > 0 ? (
                        <ArrowRight className="size-3 text-[var(--text-muted)]" aria-hidden />
                      ) : null}
                      <Badge tone="accent">{position}</Badge>
                    </React.Fragment>
                  ))}
                </p>
                <p className="mt-1.5 text-xs text-[var(--text-secondary)]">
                  {analyze.data.orderRationale}
                </p>
              </div>
            ) : null}

            {Array.isArray(analyze.data.recommendations) && analyze.data.recommendations.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {analyze.data.recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <Badge
                      tone={
                        rec.priority === "high"
                          ? "critical"
                          : rec.priority === "medium"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {rec.priority}
                    </Badge>
                    <span>
                      <span className="font-medium">{rec.action}</span>{" "}
                      <span className="text-[var(--text-secondary)]">{rec.reason}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* Gallery */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <LayoutGrid className="size-4" aria-hidden /> Screenshot Sequence & Visual Flow
            </CardTitle>
            {screenshots.data?.hasVideo ? <Badge tone="good">Preview Video Active</Badge> : null}
          </div>
        </CardHeader>
        <CardContent>
          {screenshots.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : screenshots.data?.urls.length ? (
            <ol className="flex gap-4 overflow-x-auto pb-3">
              {screenshots.data.urls.map((url, index) => {
                const critique = byPosition.get(index + 1);

                return (
                  <li key={url} className="w-56 shrink-0">
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={`Screenshot ${index + 1}`}
                        className={cn(
                          "w-full rounded-lg border shadow-sm",
                          critique?.strength === "weak"
                            ? "border-[var(--status-critical)]"
                            : critique?.strength === "strong"
                              ? "border-[var(--status-good)]"
                              : "border-[var(--border)]",
                        )}
                        loading={index < 2 ? "eager" : "lazy"}
                      />
                      <span className="absolute left-2 top-2 rounded bg-black/75 px-2 py-0.5 text-xs font-semibold text-white backdrop-blur">
                        #{index + 1} {index < 2 ? "• Primary" : ""}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-col gap-1.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone="neutral">9:16 Portrait</Badge>
                        {critique ? (
                          <Badge
                            tone={
                              critique.strength === "strong"
                                ? "good"
                                : critique.strength === "weak"
                                  ? "critical"
                                  : "neutral"
                            }
                          >
                            {critique.strength}
                          </Badge>
                        ) : null}
                      </div>

                      {critique ? (
                        <>
                          <p className="text-xs text-[var(--text-primary)]">
                            {critique.communicates}
                          </p>
                          {critique.issues.length ? (
                            <ul className="flex flex-col gap-0.5">
                              {critique.issues.map((issue, i) => (
                                <li
                                  key={i}
                                  className="flex items-start gap-1 text-xs text-[var(--text-secondary)]"
                                >
                                  <TriangleAlert
                                    className="mt-0.5 size-3 shrink-0 text-[var(--status-warning)]"
                                    aria-hidden
                                  />
                                  {issue}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <EmptyState
              title="No screenshots captured yet"
              description="Screenshot URLs are recorded with each listing snapshot. Refresh the app from the Overview tab, then come back."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
