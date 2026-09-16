"use client";

import { MetricKey } from "@prisma/client";
import { AlertTriangle, ArrowRight, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { formatDelta, formatMetric, METRIC_META } from "@aso/shared";
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
import { StatTile, StatTileSkeleton } from "@/components/charts/stat-tile";
import { TimeSeriesChart } from "@/components/charts/time-series";
import { api } from "@/trpc/react";

const RANGES = [
  { value: 7, label: "Last 7 days" },
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" },
] as const;

const HEADLINE_METRICS: MetricKey[] = [
  "INSTALLS",
  "ACTIVE_USERS_DAILY",
  "TOTAL_REVENUE",
  "AD_REVENUE",
  "CONVERSION_RATE",
  "RATING_AVERAGE",
];

export function DashboardView() {
  const [days, setDays] = React.useState<number>(30);
  const [chartMetric, setChartMetric] = React.useState<MetricKey>("INSTALLS");

  const apps = api.apps.list.useQuery();
  const summary = api.metrics.summary.useQuery({ days, metrics: HEADLINE_METRICS });
  const series = api.metrics.series.useQuery({ days, metrics: [chartMetric] });
  const byApp = api.metrics.byApp.useQuery({ days, metric: chartMetric });
  const insights = api.ai.insights.useQuery({ limit: 5, unreadOnly: false });
  const alerts = api.alerts.events.useQuery({ status: "TRIGGERED", limit: 5 });

  if (apps.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <StatTileSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (!apps.data?.length) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Dashboard"
          description="Add an app to start tracking installs, revenue, keywords and reviews."
        />
        <EmptyState
          title="No apps yet"
          description="Search the App Store or Google Play for the app you want to track. Everything else — keywords, competitors, reviews — follows from there."
          action={
            <Link href="/apps/new">
              <Button variant="primary">
                <Plus /> Add your first app
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dashboard"
        description={`${apps.data.length} app${apps.data.length === 1 ? "" : "s"} tracked`}
        actions={
          <>
            <Select value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {RANGES.map((range) => (
                <option key={range.value} value={range.value}>
                  {range.label}
                </option>
              ))}
            </Select>
            <Link href="/apps/new">
              <Button variant="primary" size="md">
                <Plus /> Add app
              </Button>
            </Link>
          </>
        }
      />

      {/* Headline numbers. Clicking a tile drives the chart below it. */}
      <section aria-label="Key metrics" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {summary.isLoading
          ? Array.from({ length: 6 }).map((_, i) => <StatTileSkeleton key={i} />)
          : summary.data?.map((row) => (
              <StatTile
                key={row.metric}
                metric={row.metric}
                value={row.value}
                changePct={row.changePct}
                currency={row.currency}
                hasData={row.hasData}
                isActive={chartMetric === row.metric}
                onClick={() => setChartMetric(row.metric)}
              />
            ))}
      </section>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>{METRIC_META[chartMetric].label} over time</CardTitle>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              All apps combined. Select a tile above to change the metric.
            </p>
          </div>
        </CardHeader>
        <CardContent>
          {series.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <TimeSeriesChart
              data={series.data ?? []}
              metrics={[chartMetric]}
              variant={METRIC_META[chartMetric].unit === "percent" ? "line" : "area"}
            />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{METRIC_META[chartMetric].label} by app</CardTitle>
          </CardHeader>
          <CardContent>
            {byApp.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : byApp.data?.length ? (
              <ul className="flex flex-col divide-y divide-[var(--border)]">
                {byApp.data.map((app) => (
                  <li key={app.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    {app.iconUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={app.iconUrl} alt="" className="size-8 rounded-lg" />
                    ) : (
                      <div className="size-8 rounded-lg bg-[var(--page)]" />
                    )}
                    <Link href={`/apps/${app.id}`} className="min-w-0 flex-1 hover:underline">
                      <p className="truncate text-sm font-medium">{app.name}</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {app.platform === "IOS" ? "App Store" : "Google Play"}
                      </p>
                    </Link>
                    <div className="text-right">
                      <p className="tabular text-sm font-medium">
                        {formatMetric(chartMetric, app.value)}
                      </p>
                      <p className="tabular text-xs text-[var(--text-muted)]">
                        {formatDelta(app.changePct)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[var(--text-secondary)]">
                No data for this metric yet. Connect an integration to start syncing.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="size-4 text-[var(--status-critical)]" aria-hidden />
                Open alerts
              </CardTitle>
              <Link href="/alerts" className="text-xs text-[var(--text-secondary)] hover:underline">
                View all
              </Link>
            </CardHeader>
            <CardContent>
              {alerts.data?.length ? (
                <ul className="flex flex-col gap-2.5">
                  {alerts.data.map((event) => (
                    <li key={event.id} className="text-sm">
                      <p className="font-medium">{event.rule.name}</p>
                      <p className="text-xs text-[var(--text-secondary)]">{event.message}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[var(--text-secondary)]">Nothing is firing right now.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="size-4 text-[var(--accent)]" aria-hidden />
                Latest insights
              </CardTitle>
              <Link href="/insights" className="text-xs text-[var(--text-secondary)] hover:underline">
                View all
              </Link>
            </CardHeader>
            <CardContent>
              {insights.data?.length ? (
                <ul className="flex flex-col gap-3">
                  {insights.data.map((insight) => (
                    <li key={insight.id} className="text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium">{insight.title}</p>
                        <Badge
                          tone={
                            insight.severity === "CRITICAL" || insight.severity === "HIGH"
                              ? "critical"
                              : insight.severity === "MEDIUM"
                                ? "warning"
                                : "neutral"
                          }
                        >
                          {insight.severity}
                        </Badge>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-[var(--text-secondary)]">
                        {insight.summary}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex flex-col items-start gap-2">
                  <p className="text-sm text-[var(--text-secondary)]">
                    No insights yet. They are generated nightly once an app has data.
                  </p>
                  <Link href="/apps">
                    <Button variant="ghost" size="sm">
                      Go to apps <ArrowRight />
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
