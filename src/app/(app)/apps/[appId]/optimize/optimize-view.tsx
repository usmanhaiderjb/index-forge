"use client";

import { Check, Copy, KeyRound, ListChecks, Sparkles, X } from "lucide-react";
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
  Skeleton,
} from "@/components/ui/primitives";
import { api } from "@/trpc/react";

export function OptimizeView({ appId }: { appId: string }) {
  const utils = api.useUtils();

  const aiStatus = api.ai.status.useQuery();
  const recommendations = api.ai.recommendations.useQuery({ appId });
  const suggestions = api.ai.suggestions.useQuery({ appId });

  const strategy = api.ai.keywordStrategy.useMutation({
    onError: (error) => toast.error(error.message),
  });

  const metadata = api.ai.metadataVariants.useMutation({
    onSuccess: async (result) => {
      const count = result?.variants?.length ?? 0;
      const rejected = result?.rejected ?? 0;
      toast.success(
        rejected > 0
          ? `${count} variants — ${rejected} rejected for exceeding the character limit`
          : `${count} variants generated`,
      );
      await utils.ai.suggestions.invalidate({ appId });
    },
    onError: (error) => toast.error(error.message),
  });

  const refreshRecs = api.ai.refreshRecommendations.useMutation({
    onSuccess: async () => {
      toast.success("Recommendations refreshed");
      await utils.ai.recommendations.invalidate({ appId });
    },
    onError: (error) => toast.error(error.message),
  });

  const setRecStatus = api.ai.setRecommendationStatus.useMutation({
    onSuccess: () => utils.ai.recommendations.invalidate({ appId }),
  });

  const setSuggestionStatus = api.ai.setSuggestionStatus.useMutation({
    onSuccess: () => utils.ai.suggestions.invalidate({ appId }),
  });

  const addKeyword = api.keywords.add.useMutation({
    onSuccess: () => toast.success("Keyword added"),
    onError: (error) => toast.error(error.message),
  });

  if (aiStatus.data && !aiStatus.data.configured) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm font-medium">AI features are not configured</p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Set <code className="rounded bg-[var(--page)] px-1 py-0.5 text-xs">GEMINI_API_KEY</code> or{" "}
            <code className="rounded bg-[var(--page)] px-1 py-0.5 text-xs">ANTHROPIC_API_KEY</code>{" "}
            on the deployment to enable keyword strategy, metadata generation, review themes and
            recommendations. Everything else — tracking, ranks, the deterministic listing audit —
            works without it.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          disabled={strategy.isPending}
          onClick={() => strategy.mutate({ appId })}
        >
          <KeyRound /> {strategy.isPending ? "Working…" : "Keyword strategy"}
        </Button>
        <Button
          variant="secondary"
          disabled={metadata.isPending}
          onClick={() => metadata.mutate({ appId, count: 3 })}
        >
          <Sparkles /> {metadata.isPending ? "Writing…" : "Generate metadata"}
        </Button>
        <Button
          variant="secondary"
          disabled={refreshRecs.isPending}
          onClick={() => refreshRecs.mutate({ appId })}
        >
          <ListChecks /> {refreshRecs.isPending ? "Thinking…" : "Refresh recommendations"}
        </Button>
      </div>

      {strategy.data ? (
        <Card>
          <CardHeader>
            <CardTitle>Keyword strategy</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-[var(--text-secondary)]">{strategy.data.summary}</p>

            {Array.isArray(strategy.data.keywords) && strategy.data.keywords.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {strategy.data.keywords.map((keyword) => (
                  <li
                    key={keyword.term}
                    className="flex flex-wrap items-start gap-2 rounded-md border border-[var(--border)] p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{keyword.term}</p>
                        <Badge tone={keyword.priority === "high" ? "good" : "neutral"}>
                          {keyword.priority}
                        </Badge>
                        <Badge tone="accent">{keyword.intent}</Badge>
                        <Badge>{keyword.placement.replace(/_/g, " ")}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">{keyword.rationale}</p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => addKeyword.mutate({ appId, terms: [keyword.term], source: "AI" })}
                    >
                      Track
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}

            {Array.isArray(strategy.data.avoid) && strategy.data.avoid.length > 0 ? (
              <div>
                <p className="text-sm font-medium">Not worth chasing</p>
                <ul className="mt-1.5 flex flex-col gap-1">
                  {strategy.data.avoid.map((item) => (
                    <li key={item.term} className="text-xs text-[var(--text-secondary)]">
                      <span className="font-medium text-[var(--text-primary)]">{item.term}</span> —{" "}
                      {item.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Metadata suggestions</CardTitle>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              Every variant is re-checked against the store's character limit before it is shown —
              anything over is discarded, not truncated.
            </p>
          </div>
        </CardHeader>
        <CardContent>
          {suggestions.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : Array.isArray(suggestions.data) && suggestions.data.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {suggestions.data.map((suggestion) => (
                <li key={suggestion.id} className="rounded-md border border-[var(--border)] p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="accent">{suggestion.field.replace(/_/g, " ")}</Badge>
                    <span
                      className={cn(
                        "tabular text-xs",
                        suggestion.charCount > suggestion.charLimit
                          ? "text-[var(--status-critical)]"
                          : "text-[var(--text-muted)]",
                      )}
                    >
                      {suggestion.charCount}/{suggestion.charLimit}
                    </span>
                    {suggestion.status !== "OPEN" ? (
                      <Badge tone={suggestion.status === "APPLIED" ? "good" : "neutral"}>
                        {suggestion.status}
                      </Badge>
                    ) : null}
                    <div className="ml-auto flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Copy"
                        onClick={() => {
                          void navigator.clipboard.writeText(suggestion.suggested);
                          toast.success("Copied");
                        }}
                      >
                        <Copy />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Mark applied"
                        onClick={() =>
                          setSuggestionStatus.mutate({
                            appId,
                            suggestionId: suggestion.id,
                            status: "APPLIED",
                          })
                        }
                      >
                        <Check />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Dismiss"
                        onClick={() =>
                          setSuggestionStatus.mutate({
                            appId,
                            suggestionId: suggestion.id,
                            status: "DISMISSED",
                          })
                        }
                      >
                        <X />
                      </Button>
                    </div>
                  </div>

                  <p className="mt-2 rounded bg-[var(--page)] p-2 text-sm">{suggestion.suggested}</p>

                  {suggestion.current ? (
                    <p className="mt-1.5 text-xs text-[var(--text-muted)]">
                      Currently: {suggestion.current.slice(0, 160)}
                    </p>
                  ) : null}
                  {suggestion.rationale ? (
                    <p className="mt-1.5 text-xs text-[var(--text-secondary)]">
                      {suggestion.rationale}
                    </p>
                  ) : null}
                  {Array.isArray(suggestion.targetKeywords) && suggestion.targetKeywords.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {suggestion.targetKeywords.map((term) => (
                        <Badge key={term}>{term}</Badge>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--text-secondary)]">
              None yet. Use “Generate metadata” above.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recommendations</CardTitle>
        </CardHeader>
        <CardContent>
          {recommendations.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : Array.isArray(recommendations.data) && recommendations.data.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {recommendations.data.map((rec) => (
                <li key={rec.id} className="rounded-md border border-[var(--border)] p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{rec.title}</p>
                    <Badge tone="accent">{rec.category}</Badge>
                    <Badge tone={rec.impact >= 4 ? "good" : "neutral"}>impact {rec.impact}/5</Badge>
                    <Badge>effort {rec.effort}/5</Badge>
                    {rec.status !== "OPEN" ? <Badge tone="neutral">{rec.status}</Badge> : null}
                  </div>

                  <p className="mt-1.5 text-sm text-[var(--text-secondary)]">{rec.rationale}</p>

                  {Array.isArray(rec.actions) ? (
                    <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5 text-sm">
                      {(rec.actions as { step: string; detail: string }[]).map((action, i) => (
                        <li key={i}>
                          <span className="font-medium">{action.step}</span>{" "}
                          <span className="text-[var(--text-secondary)]">{action.detail}</span>
                        </li>
                      ))}
                    </ol>
                  ) : null}

                  <div className="mt-3 flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        setRecStatus.mutate({
                          appId,
                          recommendationId: rec.id,
                          status: rec.status === "IN_PROGRESS" ? "APPLIED" : "IN_PROGRESS",
                        })
                      }
                    >
                      {rec.status === "IN_PROGRESS" ? "Mark applied" : "Start"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setRecStatus.mutate({
                          appId,
                          recommendationId: rec.id,
                          status: "DISMISSED",
                        })
                      }
                    >
                      Dismiss
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--text-secondary)]">
              No recommendations yet. They are generated nightly, or on demand with the button
              above.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
