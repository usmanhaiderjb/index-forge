"use client";

import { HelpCircle } from "lucide-react";

import { formatMetric, TRAFFIC_SOURCE_META, type TrafficSource } from "@aso/shared";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from "@/components/ui/primitives";
import { seriesColor } from "@/components/charts/tokens";
import { api } from "@/trpc/react";

/**
 * Impressions to page views to installs, split by where the traffic came from.
 *
 * The point of the split: a blended conversion rate cannot tell you what to
 * change. Search traffic that does not convert means the listing is not
 * convincing the people who were already looking for it — screenshots, first
 * impression. Browse traffic that does not convert usually means the icon or
 * the category is wrong. Same number, opposite fix.
 */
export function TrafficFunnel({ appId, days }: { appId: string; days: number }) {
  const funnel = api.metrics.funnel.useQuery({ appId, days });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Where installs come from
          <span
            className="text-muted-foreground"
            title="Store-reported traffic. Separate from paid vs organic, which comes from the ad networks and is attributed on their terms — the two must not be added together."
          >
            <HelpCircle className="h-3.5 w-3.5" aria-hidden />
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent>
        {funnel.isLoading ? (
          <Skeleton className="h-56 w-full" />
        ) : !funnel.data?.hasData ? (
          <p className="text-sm text-muted-foreground">
            No traffic-source breakdown yet. Play Console reports this once an app has enough daily
            traffic to split. App Store Connect provisions its analytics reports asynchronously —
            after a connection is made, Apple takes up to 48 hours before the first daily report
            exists, so this stays empty until then.
          </p>
        ) : (
          <div className="space-y-5">
            {funnel.data.sources.map((row, i) => {
              const widest = Math.max(...funnel.data!.sources.map((s) => s.pageViews ?? 0), 1);
              const width = ((row.pageViews ?? 0) / widest) * 100;

              return (
                <div key={row.source} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium" title={row.description}>
                      {row.label}
                    </span>
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {/* A missing count and a count of zero are different
                          facts, so an absent number stays absent. */}
                      {row.pageViews === null
                        ? "—"
                        : `${formatMetric("STORE_PAGE_VIEWS", row.pageViews)} views`}
                      {row.installs !== null
                        ? ` · ${formatMetric("INSTALLS", row.installs)} installs`
                        : ""}
                    </span>
                  </div>

                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${width}%`,
                        backgroundColor: seriesColor(i),
                      }}
                    />
                  </div>

                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>
                      {row.conversion === null
                        ? "Conversion unknown"
                        : `${row.conversion}% of viewers install`}
                    </span>
                    {row.tapThrough !== null ? <span>{row.tapThrough}% tap through</span> : null}
                  </div>
                </div>
              );
            })}

            <FunnelSummary sources={funnel.data.sources} totals={funnel.data.totals} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type Row = {
  source: TrafficSource;
  label: string;
  conversion: number | null;
  installs: number | null;
};

/**
 * States the gap between the best and worst converting source, because that gap
 * is the actionable part and reading it off four bars is work the reader should
 * not have to do.
 */
function FunnelSummary({
  sources,
  totals,
}: {
  sources: Row[];
  totals: { conversion: number | null } | null;
}) {
  // `other` is a residual bucket — whatever the store declined to attribute.
  // It is frequently the worst converting, and "Search converts 3.4x better
  // than Other" is true and useless: there is no such thing as optimising for
  // Other. Comparing real acquisition surfaces is the point.
  const rated = sources.filter(
    (s): s is Row & { conversion: number } => s.conversion !== null && s.source !== "other",
  );
  if (rated.length < 2 || totals?.conversion == null) return null;

  const best = rated.reduce((a, b) => (b.conversion > a.conversion ? b : a));
  const worst = rated.reduce((a, b) => (b.conversion < a.conversion ? b : a));
  if (best.source === worst.source) return null;

  return (
    <p className="border-t pt-3 text-xs leading-relaxed text-muted-foreground">
      <span className="font-medium text-foreground">
        {TRAFFIC_SOURCE_META[best.source].label} converts{" "}
        {(best.conversion / Math.max(worst.conversion, 0.01)).toFixed(1)}× better than{" "}
        {TRAFFIC_SOURCE_META[worst.source].label}
      </span>{" "}
      ({best.conversion}% against {worst.conversion}%). Blended, that is{" "}
      {totals.conversion}% — which is why the split matters:{" "}
      {worst.source === "browse"
        ? "browse traffic bouncing usually points at the icon or the category, not the keywords."
        : worst.source === "search"
          ? "search traffic bouncing points at the screenshots, not the keywords — these people were already looking for you."
          : "the weakest source is where the next change is worth making."}
    </p>
  );
}
