"use client";

import { MetricKey } from "@prisma/client";
import { CheckCircle2, CircleAlert, CircleX, RefreshCw } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { cn, METRIC_META } from "@aso/shared";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Select,
  Skeleton,
} from "@/components/ui/primitives";
import { AcquisitionSplit } from "@/components/charts/acquisition-split";
import { BreakdownBar } from "@/components/charts/breakdown-bar";
import { ChartRankCard } from "@/components/charts/chart-rank-card";
import { ExportMenu } from "@/components/export-menu";
import { StatTile, StatTileSkeleton } from "@/components/charts/stat-tile";
import { TimeSeriesChart } from "@/components/charts/time-series";
import { TrafficFunnel } from "@/components/charts/traffic-funnel";
import { api } from "@/trpc/react";

const TILE_METRICS: MetricKey[] = [
  "INSTALLS",
  "ORGANIC_INSTALLS",
  "ACTIVE_USERS_DAILY",
  "TOTAL_REVENUE",
  "AD_REVENUE",
  "CONVERSION_RATE",
];

export function AppOverview({ appId }: { appId: string }) {
  const [days, setDays] = React.useState(30);
  const [chartMetric, setChartMetric] = React.useState<MetricKey>("INSTALLS");

  const utils = api.useUtils();
  const summary = api.metrics.summary.useQuery({ appId, days, metrics: TILE_METRICS });
  const series = api.metrics.series.useQuery({ appId, days, metrics: [chartMetric] });
  const breakdown = api.metrics.breakdown.useQuery({
    appId,
    days,
    metric: chartMetric,
    dimensionKey: "country",
  });
  const audit = api.apps.audit.useQuery({ appId });
  const app = api.apps.byId.useQuery({ appId });

  const refresh = api.apps.refresh.useMutation({
    onSuccess: async () => {
      toast.success("Refresh queued");
      await utils.apps.byId.invalidate({ appId });
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Select value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </Select>
        <div className="flex flex-wrap items-center gap-2">
          <ExportMenu appId={appId} />
          <Button
            variant="secondary"
            size="sm"
            disabled={refresh.isPending}
            onClick={() => refresh.mutate({ appId })}
          >
            <RefreshCw className={cn(refresh.isPending && "animate-spin")} /> Refresh now
          </Button>
        </div>
      </div>

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
          <CardTitle>{METRIC_META[chartMetric].label} over time</CardTitle>
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
        <AcquisitionSplit appId={appId} days={days} />
        <TrafficFunnel appId={appId} days={days} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartRankCard appId={appId} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{METRIC_META[chartMetric].label} by country</CardTitle>
          </CardHeader>
          <CardContent>
            {breakdown.isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <BreakdownBar
                rows={
                  breakdown.data?.map((row) => ({
                    key: row.key,
                    label: row.key.toUpperCase(),
                    value: row.value,
                  })) ?? []
                }
                metric={chartMetric}
                emptyMessage="No country breakdown for this metric. Not every source reports one."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Listing audit</CardTitle>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                Deterministic checks — same inputs, same score.
              </p>
            </div>
            {audit.data ? (
              <span className="tabular text-2xl font-semibold">{audit.data.score}/100</span>
            ) : null}
          </CardHeader>
          <CardContent>
            {audit.isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : audit.data?.checks.length ? (
              <ul className="flex flex-col gap-3">
                {audit.data.checks.map((check) => {
                  const Icon =
                    check.status === "pass"
                      ? CheckCircle2
                      : check.status === "warn"
                        ? CircleAlert
                        : CircleX;
                  const color =
                    check.status === "pass"
                      ? "text-[var(--status-good)]"
                      : check.status === "warn"
                        ? "text-[var(--status-warning)]"
                        : "text-[var(--status-critical)]";

                  return (
                    <li key={check.id} className="flex gap-2.5">
                      <Icon className={cn("mt-0.5 size-4 shrink-0", color)} aria-hidden />
                      <div>
                        <p className="text-sm font-medium">
                          {check.label}{" "}
                          <span className="font-normal text-[var(--text-muted)]">
                            ({check.status})
                          </span>
                        </p>
                        <p className="text-xs text-[var(--text-secondary)]">{check.detail}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-[var(--text-secondary)]">
                No listing snapshot captured yet. Hit refresh above.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Connected sources</CardTitle>
        </CardHeader>
        <CardContent>
          {app.data?.resourceLinks.length ? (
            <ul className="flex flex-wrap gap-2">
              {app.data.resourceLinks.map((link) => (
                <li key={link.id}>
                  <Badge tone={link.connection.status === "ACTIVE" ? "good" : "warning"}>
                    {link.connection.provider.replace(/_/g, " ")} · {link.displayName ?? link.externalId}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--text-secondary)]">
              No integration is linked to this app yet, so installs and revenue will stay empty.
              Connect one on the Integrations page, then link it to this app.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
