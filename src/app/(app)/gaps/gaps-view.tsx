"use client";

import { Info, Loader2, Quote, Sparkles, Star } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { cn } from "@aso/shared";
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  PageHeader,
  Select,
  Skeleton,
} from "@/components/ui/primitives";
import type { RouterOutputs } from "@/server/api/root";
import { api } from "@/trpc/react";

/**
 * Gap Finder.
 *
 * What users say is missing from the apps already serving a category — read
 * from the reviews of everything currently charting in it.
 *
 * Two rules run through the whole screen:
 *
 *   1. **A theme is ranked by how many apps carry it**, never by mention count.
 *      Mentions let the app with the most reviews dominate every row, which
 *      reports one app's problems as the market's.
 *   2. **Every theme shows its receipts.** Themes are extracted by a language
 *      model from review text — inference, not measurement — so the excerpts
 *      that produced one are always one click away.
 */
export function GapsView() {
  const [selected, setSelected] = React.useState<string>("");

  const categories = api.gaps.categories.useQuery();
  const analysed = React.useMemo(
    () => (categories.data ?? []).filter((category) => category.themes > 0),
    [categories.data],
  );

  // Land on something with data rather than an empty shell.
  React.useEffect(() => {
    if (!selected && analysed.length > 0) setSelected(analysed[0]!.label);
  }, [analysed, selected]);

  const themes = api.gaps.themes.useQuery(
    { label: selected },
    { enabled: selected.length > 0 },
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gaps"
        description="What users say is missing from the apps already serving a category. Read from the reviews of everything currently charting in it."
      />

      <Analyse categories={categories.data ?? []} onDone={() => void categories.refetch()} />

      {analysed.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="gaps-niche" className="text-xs font-medium text-[var(--text-secondary)]">
            Category
          </label>
          <Select
            id="gaps-niche"
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
            className="min-w-[16rem]"
          >
            {analysed.map((category) => (
              <option key={category.label} value={category.label}>
                {category.label} ({category.themes})
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      <Themes data={themes.data} loading={themes.isLoading && selected.length > 0} />
    </div>
  );
}

/* --------------------------------------------------------------- analyse */

type Category = RouterOutputs["gaps"]["categories"][number];

function Analyse({ categories, onDone }: { categories: Category[]; onDone: () => void }) {
  const [category, setCategory] = React.useState("");

  const analyse = api.gaps.analyse.useMutation({
    onSuccess: (result) => {
      toast.success(
        result.queued
          ? `Queued ${result.label}. Themes appear when the worker finishes.`
          : `${result.label}: ${result.themes} themes from ${result.reviewsFetched} reviews across ${result.appsRead} of ${result.apps} apps.`,
      );
      onDone();
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[14rem] flex-1">
            <label
              htmlFor="gaps-analyse"
              className="text-xs font-medium text-[var(--text-secondary)]"
            >
              Analyse a category
            </label>
            <Select
              id="gaps-analyse"
              className="mt-1 w-full"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="">Choose a category…</option>
              {categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                  {item.themes > 0 ? ` — ${item.themes} themes` : ""}
                </option>
              ))}
            </Select>
          </div>

          <Button
            disabled={!category || analyse.isPending}
            onClick={() => analyse.mutate({ categoryId: category })}
          >
            {analyse.isPending ? (
              <>
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                Reading reviews…
              </>
            ) : (
              <>
                <Sparkles className="mr-1 h-4 w-4" />
                Analyse
              </>
            )}
          </Button>
        </div>

        <p className="text-xs text-[var(--text-muted)]">
          Reads the top charting apps in the category and their most recent reviews, then groups
          what those reviewers ask for. Takes a few minutes — every request is rate limited out of
          politeness to the store. Google Play only: Apple serves no third-party review text
          through any public route.
        </p>
      </CardContent>
    </Card>
  );
}

/* ---------------------------------------------------------------- themes */

type ThemeData = NonNullable<RouterOutputs["gaps"]["themes"]>;

const KIND_LABEL: Record<string, string> = {
  MISSING_FEATURE: "Missing feature",
  DEFECT: "Defect",
  MONETISATION: "Monetisation",
  CHURN_REASON: "Churn reason",
};

const KIND_TONE: Record<string, "good" | "warning" | "critical" | "accent"> = {
  MISSING_FEATURE: "accent",
  DEFECT: "critical",
  MONETISATION: "warning",
  CHURN_REASON: "critical",
};

function Themes({ data, loading }: { data?: ThemeData | null; loading: boolean }) {
  const [open, setOpen] = React.useState<string | null>(null);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <EmptyState
        title="Nothing analysed yet"
        description="Pick a category above and run an analysis. It reads the reviews of the apps currently charting there and groups what their users are asking for."
      />
    );
  }

  if (data.themes.length === 0) {
    return (
      <EmptyState
        title="No shared themes in this category"
        description="Reviews were read, but nothing was raised about enough different apps to count as a market gap rather than one app's problem. That is a finding in itself — this category is being served."
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--text-muted)]">
        Ranked by how many different apps their users raise them about — not by how often they are
        mentioned, which would let the app with the most reviews dominate. Themes are extracted
        from review text by a language model, so they are inference: every one shows the reviews it
        came from.
      </p>

      {data.themes.map((theme) => (
        <Card key={theme.id}>
          <CardContent className="pt-4">
            <button
              className="flex w-full flex-wrap items-center justify-between gap-3 text-left"
              onClick={() => setOpen(open === theme.id ? null : theme.id)}
            >
              <span className="flex items-center gap-3">
                <Badge tone={KIND_TONE[theme.kind] ?? "neutral"}>
                  {KIND_LABEL[theme.kind] ?? theme.kind}
                </Badge>
                <span className="font-medium text-[var(--text-primary)]">{theme.label}</span>
              </span>

              <span className="flex items-center gap-4 text-sm text-[var(--text-secondary)]">
                <span>
                  <strong className="text-[var(--text-primary)]">{theme.appCount}</strong> apps
                </span>
                <span className="tabular-nums">{theme.mentionCount} mentions</span>
                <span className="flex items-center gap-1 tabular-nums">
                  <Star className="h-3.5 w-3.5 text-[var(--status-warning)]" aria-hidden />
                  {theme.meanRating.toFixed(1)}
                </span>
              </span>
            </button>

            {open === theme.id ? (
              <ul className="mt-4 space-y-3 border-t border-[var(--border-subtle)] pt-4">
                {theme.evidence.map((review) => (
                  <li key={review.id} className="flex gap-3">
                    <Quote
                      className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]"
                      aria-hidden
                    />
                    <div>
                      <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                        {review.body}
                      </p>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        {review.app} · {review.rating} stars ·{" "}
                        {new Date(review.submittedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
      ))}

      <p
        className={cn(
          "inline-flex items-start gap-2 rounded-lg border border-dashed border-[var(--border-strong)]",
          "px-3 py-2 text-xs text-[var(--text-muted)]",
        )}
      >
        <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          {data.method}. Reviewer names are never stored. The review sample skews recent, so a
          theme&apos;s absence is not evidence nobody feels it.
        </span>
      </p>
    </div>
  );
}
