"use client";

import { Sentiment } from "@prisma/client";
import { Sparkles, Star } from "lucide-react";
import { format } from "date-fns";
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
  Select,
  Skeleton,
} from "@/components/ui/primitives";
import { RatingDistribution } from "@/components/charts/breakdown-bar";
import { ReplyEditor } from "@/components/reviews/reply-editor";
import { api } from "@/trpc/react";

export function ReviewsView({ appId }: { appId: string }) {
  const utils = api.useUtils();
  const [days, setDays] = React.useState(30);
  const [sentiment, setSentiment] = React.useState<Sentiment | "ALL">("ALL");
  const [topic, setTopic] = React.useState<string>("");

  const stats = api.reviews.stats.useQuery({ appId, days });
  const reviews = api.reviews.list.useQuery({
    appId,
    limit: 25,
    ...(sentiment !== "ALL" ? { sentiment } : {}),
    ...(topic ? { topic } : {}),
  });

  const themes = api.ai.reviewThemes.useMutation({
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </Select>
        <Select
          value={sentiment}
          onChange={(e) => setSentiment(e.target.value as Sentiment | "ALL")}
        >
          <option value="ALL">All sentiment</option>
          <option value="POSITIVE">Positive</option>
          <option value="NEUTRAL">Neutral</option>
          <option value="NEGATIVE">Negative</option>
        </Select>
        {topic ? (
          <Button variant="ghost" size="sm" onClick={() => setTopic("")}>
            Clear topic: {topic}
          </Button>
        ) : null}
        <div className="flex-1" />
        <Button
          variant="primary"
          size="sm"
          disabled={themes.isPending}
          onClick={() => themes.mutate({ appId, days })}
        >
          <Sparkles /> {themes.isPending ? "Analyzing…" : "Summarize themes"}
        </Button>
      </div>

      {themes.data ? (
        <Card>
          <CardHeader>
            <CardTitle>Review themes, last {days} days</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-[var(--text-secondary)]">{themes.data.summary}</p>
            <ul className="flex flex-col gap-3">
              {themes.data.themes.map((theme) => (
                <li key={theme.theme} className="rounded-md border border-[var(--border)] p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{theme.theme}</p>
                    <Badge
                      tone={
                        theme.sentiment === "NEGATIVE"
                          ? "critical"
                          : theme.sentiment === "POSITIVE"
                            ? "good"
                            : "neutral"
                      }
                    >
                      {theme.sentiment}
                    </Badge>
                    <Badge>{theme.mentionCount} mentions</Badge>
                    <Badge tone={theme.severity === "HIGH" || theme.severity === "CRITICAL" ? "critical" : "neutral"}>
                      {theme.severity}
                    </Badge>
                  </div>
                  <blockquote className="mt-2 border-l-2 border-[var(--border-strong)] pl-3 text-xs italic text-[var(--text-secondary)]">
                    {theme.exampleQuote}
                  </blockquote>
                  <p className="mt-2 text-sm">{theme.recommendation}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Rating distribution</CardTitle>
              {stats.data ? (
                <span className="tabular text-lg font-semibold">
                  {stats.data.average.toFixed(2)}★
                </span>
              ) : null}
            </CardHeader>
            <CardContent>
              {stats.isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : (
                <RatingDistribution rows={stats.data?.byRating ?? []} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Topics</CardTitle>
            </CardHeader>
            <CardContent>
              {stats.data?.topics.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {stats.data.topics.map((row) => (
                    <button
                      key={row.topic}
                      type="button"
                      onClick={() => setTopic(row.topic)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs transition-colors",
                        topic === row.topic
                          ? "border-[var(--accent)] text-[var(--accent)]"
                          : "border-[var(--border-strong)] hover:bg-[var(--page)]",
                      )}
                    >
                      {row.topic} <span className="tabular text-[var(--text-muted)]">{row.count}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[var(--text-secondary)]">
                  Topics are extracted when reviews are classified. That needs an Anthropic API key.
                </p>
              )}
            </CardContent>
          </Card>

          {stats.data ? (
            <Card>
              <CardContent className="flex flex-col gap-2 text-sm">
                <Row label="Reviews in period" value={stats.data.total.toString()} />
                <Row label="Awaiting a reply" value={stats.data.unreplied.toString()} />
                {stats.data.bySentiment.map((row) => (
                  <Row key={row.sentiment} label={row.sentiment} value={row.count.toString()} />
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Reviews</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {reviews.isLoading ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20" />)
            ) : reviews.data?.items.length ? (
              reviews.data.items.map((review) => (
                <article
                  key={review.id}
                  className="rounded-md border border-[var(--border)] p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex items-center gap-0.5" aria-label={`${review.rating} out of 5`}>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          aria-hidden
                          className={cn(
                            "size-3.5",
                            i < review.rating
                              ? "fill-[var(--status-warning)] text-[var(--status-warning)]"
                              : "text-[var(--text-muted)]",
                          )}
                        />
                      ))}
                    </span>
                    {review.sentiment ? (
                      <Badge
                        tone={
                          review.sentiment === "NEGATIVE"
                            ? "critical"
                            : review.sentiment === "POSITIVE"
                              ? "good"
                              : "neutral"
                        }
                      >
                        {review.sentiment}
                      </Badge>
                    ) : null}
                    {review.appVersion ? <Badge>v{review.appVersion}</Badge> : null}
                    <span className="ml-auto text-xs text-[var(--text-muted)]">
                      {format(review.submittedAt, "d MMM yyyy")}
                    </span>
                  </div>

                  {review.title ? (
                    <p className="mt-1.5 text-sm font-medium">{review.title}</p>
                  ) : null}
                  {review.body ? (
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">{review.body}</p>
                  ) : null}

                  {review.topics.length ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {review.topics.map((t) => (
                        <Badge key={t}>{t}</Badge>
                      ))}
                    </div>
                  ) : null}

                  {review.developerReply ? (
                    <div className="mt-2 rounded-md bg-[var(--page)] p-2.5">
                      <p className="text-xs font-medium text-[var(--text-secondary)]">
                        Your reply
                        {review.repliedAt
                          ? ` · ${format(review.repliedAt, "d MMM yyyy")}`
                          : ""}
                      </p>
                      <p className="mt-0.5 text-sm">{review.developerReply}</p>
                    </div>
                  ) : (
                    <ReplyEditor
                      reviewId={review.id}
                      onPublished={() => utils.reviews.invalidate()}
                    />
                  )}
                </article>
              ))
            ) : (
              <p className="text-sm text-[var(--text-secondary)]">
                No reviews synced yet. Play Console and App Store Connect are the review sources —
                note that Google Play only exposes the last 7 days through its API.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--text-secondary)]">{label}</span>
      <span className="tabular font-medium">{value}</span>
    </div>
  );
}
