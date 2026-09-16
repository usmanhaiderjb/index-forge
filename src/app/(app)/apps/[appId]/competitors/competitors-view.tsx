"use client";

import { Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react";
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
  Input,
  Skeleton,
} from "@/components/ui/primitives";
import { api } from "@/trpc/react";
import { detectStoreInput } from "@/lib/store-detect";

export function CompetitorsView({ appId }: { appId: string }) {
  const utils = api.useUtils();
  const [storeId, setStoreId] = React.useState("");

  const competitors = api.competitors.list.useQuery({ appId });
  const gaps = api.competitors.keywordGaps.useQuery({ appId });

  const invalidate = () => utils.competitors.list.invalidate({ appId });

  const add = api.competitors.add.useMutation({
    onSuccess: async () => {
      toast.success("Competitor added");
      setStoreId("");
      await invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const remove = api.competitors.remove.useMutation({
    onSuccess: invalidate,
    onError: (error) => toast.error(error.message),
  });

  const refresh = api.competitors.refresh.useMutation({
    onSuccess: () => toast.success("Refresh queued — new competitors are discovered from your keyword results"),
    onError: (error) => toast.error(error.message),
  });

  const analyze = api.ai.competitorGap.useMutation({
    onError: (error) => toast.error(error.message),
  });

  const addKeyword = api.keywords.add.useMutation({
    onSuccess: () => toast.success("Keyword added and queued for ranking"),
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Competitors</CardTitle>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              Apps appearing in the top 10 for three or more of your tracked keywords are added
              automatically.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={refresh.isPending}
              onClick={() => refresh.mutate({ appId, discover: true })}
            >
              <RefreshCw className={cn(refresh.isPending && "animate-spin")} />
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={analyze.isPending || !competitors.data?.length}
              onClick={() => analyze.mutate({ appId })}
            >
              <Sparkles /> {analyze.isPending ? "Analyzing…" : "Gap analysis"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (storeId.trim()) add.mutate({ appId, storeId: storeId.trim() });
            }}
          >
            <Input
              value={storeId}
              onChange={(e) => {
                const val = e.target.value;
                const detected = detectStoreInput(val);
                setStoreId(detected.storeId ?? val);
              }}
              placeholder="Store id or URL — e.g. 570060128, com.duolingo, or store URL"
            />
            <Button variant="secondary" type="submit" disabled={add.isPending}>
              <Plus /> Add
            </Button>
          </form>

          {competitors.isLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : competitors.data?.length ? (
            <ul className="flex flex-col divide-y divide-[var(--border)]">
              {competitors.data.map((competitor) => (
                <li key={competitor.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  {competitor.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={competitor.iconUrl} alt="" className="size-10 rounded-lg" />
                  ) : (
                    <div className="size-10 rounded-lg bg-[var(--page)]" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium">{competitor.name}</p>
                      {competitor.autoDetected ? <Badge tone="accent">Auto-detected</Badge> : null}
                      {competitor.changedSinceLast ? (
                        <Badge tone="warning">Listing changed</Badge>
                      ) : null}
                    </div>
                    <p className="truncate text-xs text-[var(--text-secondary)]">
                      {competitor.latest?.title ?? competitor.storeId}
                    </p>
                    {competitor.latest?.ratingAverage ? (
                      <p className="tabular text-xs text-[var(--text-muted)]">
                        {competitor.latest.ratingAverage.toFixed(2)}★ ·{" "}
                        {competitor.latest.ratingCount?.toLocaleString() ?? 0} ratings
                      </p>
                    ) : null}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove ${competitor.name}`}
                    onClick={() => remove.mutate({ appId, competitorId: competitor.id })}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--text-secondary)]">
              No competitors yet. Add one by store id, or track a few keywords and they will be
              discovered from the results.
            </p>
          )}
        </CardContent>
      </Card>

      {analyze.data ? (
        <Card>
          <CardHeader>
            <CardTitle>Gap analysis</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-[var(--text-secondary)]">{analyze.data.summary}</p>
            <p className="rounded-md bg-[var(--page)] p-3 text-sm">{analyze.data.positioning}</p>
            {Array.isArray(analyze.data.gaps) && analyze.data.gaps.length > 0 ? (
              <ul className="flex flex-col gap-3">
                {analyze.data.gaps.map((gap, i) => (
                  <li key={i} className="rounded-md border border-[var(--border)] p-3">
                    <div className="flex items-center gap-2">
                      <Badge tone="accent">{gap.area}</Badge>
                      <Badge tone={gap.impact === "high" ? "critical" : gap.impact === "medium" ? "warning" : "neutral"}>
                        {gap.impact} impact
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm">{gap.finding}</p>
                    <blockquote className="mt-2 border-l-2 border-[var(--border-strong)] pl-3 text-xs italic text-[var(--text-secondary)]">
                      {gap.competitorExample}
                    </blockquote>
                    <p className="mt-2 text-sm font-medium">{gap.action}</p>
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Keyword gaps</CardTitle>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              Terms at least two competitors use that your listing never mentions. Computed
              directly from the listing text — no AI involved.
            </p>
          </div>
        </CardHeader>
        <CardContent>
          {gaps.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : gaps.data?.length ? (
            <div className="flex flex-wrap gap-1.5">
              {gaps.data.map((gap) => (
                <button
                  key={gap.term}
                  type="button"
                  onClick={() =>
                    addKeyword.mutate({ appId, terms: [gap.term], source: "COMPETITOR" })
                  }
                  className="rounded-full border border-[var(--border-strong)] px-2.5 py-1 text-xs transition-colors hover:bg-[var(--page)]"
                >
                  + {gap.term}{" "}
                  <span className="text-[var(--text-muted)]">({gap.competitorCount})</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--text-secondary)]">
              No gaps found — either your listing already covers what competitors use, or there are
              not enough competitor snapshots yet.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
