"use client";

import { formatCompact, formatPercent } from "@aso/shared";
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from "@/components/ui/primitives";
import { seriesColor } from "@/components/charts/tokens";
import { api } from "@/trpc/react";

/**
 * Organic against paid.
 *
 * The ratio is what ASO work moves — spend can lift total installs without any
 * listing improvement at all, so a total-installs number on its own cannot
 * tell you whether the optimization worked.
 */
export function AcquisitionSplit({ appId, days }: { appId: string; days: number }) {
  const summary = api.metrics.summary.useQuery({
    appId,
    days,
    metrics: ["INSTALLS", "ORGANIC_INSTALLS", "PAID_INSTALLS"],
  });

  const total = summary.data?.find((m) => m.metric === "INSTALLS");
  const organic = summary.data?.find((m) => m.metric === "ORGANIC_INSTALLS");
  const paid = summary.data?.find((m) => m.metric === "PAID_INSTALLS");

  const hasSplit = organic?.hasData && paid?.hasData;
  const organicShare =
    hasSplit && total?.value ? (organic.value / total.value) * 100 : null;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Organic vs paid</CardTitle>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            Spend can lift total installs without the listing improving at all, so the split is
            what tells you whether ASO moved.
          </p>
        </div>
      </CardHeader>

      <CardContent>
        {summary.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !hasSplit ? (
          <p className="text-sm text-[var(--text-secondary)]">
            No paid install data for this app, so organic cannot be separated from total. Connect
            Google Ads or Apple Search Ads and the split appears here — claiming every install is
            organic without that would be a guess.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex h-3 overflow-hidden rounded-full">
              <div
                style={{ width: `${organicShare ?? 0}%`, background: seriesColor(0) }}
                aria-hidden
              />
              <div
                style={{ width: `${100 - (organicShare ?? 0)}%`, background: seriesColor(1) }}
                aria-hidden
              />
            </div>

            <dl className="grid grid-cols-3 gap-3">
              <div>
                <dt className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                  <span
                    aria-hidden
                    className="size-2 rounded-[2px]"
                    style={{ background: seriesColor(0) }}
                  />
                  Organic
                </dt>
                <dd className="tabular text-lg font-semibold">
                  {formatCompact(organic.value)}
                </dd>
                <dd className="tabular text-xs text-[var(--text-muted)]">
                  {organicShare === null ? "—" : formatPercent(organicShare, 0)} of installs
                </dd>
              </div>

              <div>
                <dt className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                  <span
                    aria-hidden
                    className="size-2 rounded-[2px]"
                    style={{ background: seriesColor(1) }}
                  />
                  Paid
                </dt>
                <dd className="tabular text-lg font-semibold">{formatCompact(paid.value)}</dd>
                <dd className="tabular text-xs text-[var(--text-muted)]">
                  {organicShare === null ? "—" : formatPercent(100 - organicShare, 0)} of installs
                </dd>
              </div>

              <div>
                <dt className="text-xs text-[var(--text-muted)]">Total</dt>
                <dd className="tabular text-lg font-semibold">
                  {formatCompact(total?.value ?? 0)}
                </dd>
                <dd className="text-xs text-[var(--text-muted)]">last {days} days</dd>
              </div>
            </dl>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
