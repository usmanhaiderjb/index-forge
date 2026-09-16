"use client";

import { Check, Sparkles } from "lucide-react";
import Link from "next/link";
import * as React from "react";

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
import { api } from "@/trpc/react";

export default function InsightsPage() {
  const utils = api.useUtils();
  const [appId, setAppId] = React.useState<string>("");
  const [unreadOnly, setUnreadOnly] = React.useState(false);

  const apps = api.apps.list.useQuery();
  const insights = api.ai.insights.useQuery({
    ...(appId ? { appId } : {}),
    unreadOnly,
    limit: 50,
  });

  const markRead = api.ai.markRead.useMutation({
    onSuccess: () => utils.ai.insights.invalidate(),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Insights"
        description="Anomalies are detected numerically; the model is asked only to explain the ones that clear the threshold."
        actions={
          <>
            <Select value={appId} onChange={(e) => setAppId(e.target.value)}>
              <option value="">All apps</option>
              {apps.data?.map((app) => (
                <option key={app.id} value={app.id}>
                  {app.name}
                </option>
              ))}
            </Select>
            <Button
              variant={unreadOnly ? "primary" : "secondary"}
              size="md"
              onClick={() => setUnreadOnly((v) => !v)}
            >
              Unread only
            </Button>
          </>
        }
      />

      {insights.isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : insights.data?.length ? (
        <ul className="flex flex-col gap-3">
          {insights.data.map((insight) => (
            <li key={insight.id}>
              <Card>
                <CardContent className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-sm font-semibold">{insight.title}</h2>
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
                        <Badge tone="accent">{insight.type.replace(/_/g, " ")}</Badge>
                        {insight.app ? (
                          <Link
                            href={`/apps/${insight.app.id}`}
                            className="text-xs text-[var(--text-secondary)] hover:underline"
                          >
                            {insight.app.name}
                          </Link>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-[var(--text-secondary)]">{insight.summary}</p>
                    </div>

                    {!insight.isRead ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => markRead.mutate({ insightId: insight.id })}
                      >
                        <Check /> Mark read
                      </Button>
                    ) : null}
                  </div>

                  {insight.detail ? (
                    <details className="text-sm">
                      <summary className="cursor-pointer text-xs text-[var(--text-secondary)]">
                        Details
                      </summary>
                      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-md bg-[var(--page)] p-3 text-xs">
                        {insight.detail}
                      </pre>
                    </details>
                  ) : null}

                  <p className="text-xs text-[var(--text-muted)]">
                    {new Date(insight.createdAt).toLocaleString()}
                    {insight.model ? ` · ${insight.model}` : ""}
                  </p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title="No insights yet"
          description="Insights are generated nightly once an app has a couple of weeks of data. You can also trigger a pass from an app's Optimize tab."
          action={
            <Link href="/apps">
              <Button variant="primary">
                <Sparkles /> Go to apps
              </Button>
            </Link>
          }
        />
      )}
    </div>
  );
}
