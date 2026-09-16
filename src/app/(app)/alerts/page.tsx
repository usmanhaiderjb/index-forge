"use client";

import { AlertComparator, MetricKey, Severity } from "@prisma/client";
import { Bell, Play, Plus, Send, Trash2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { formatMetric, METRIC_META } from "@aso/shared";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  PageHeader,
  Select,
  Skeleton,
} from "@/components/ui/primitives";
import { DigestsCard } from "@/components/digests-card";
import { api } from "@/trpc/react";

const COMPARATOR_LABEL: Record<AlertComparator, string> = {
  GT: "is above",
  LT: "is below",
  PCT_CHANGE_UP: "rises by at least",
  PCT_CHANGE_DOWN: "falls by at least",
};

export default function AlertsPage() {
  const utils = api.useUtils();
  const [showForm, setShowForm] = React.useState(false);

  const rules = api.alerts.rules.useQuery();
  const events = api.alerts.events.useQuery({ limit: 30 });
  const apps = api.apps.list.useQuery();

  const invalidate = async () => {
    await Promise.all([utils.alerts.rules.invalidate(), utils.alerts.events.invalidate()]);
  };

  const create = api.alerts.create.useMutation({
    onSuccess: async () => {
      toast.success("Rule created");
      setShowForm(false);
      await invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const setEnabled = api.alerts.setEnabled.useMutation({ onSuccess: invalidate });
  const remove = api.alerts.remove.useMutation({ onSuccess: invalidate });
  const setEventStatus = api.alerts.setEventStatus.useMutation({ onSuccess: invalidate });
  const evaluate = api.alerts.evaluateNow.useMutation({
    onSuccess: () => toast.success("Evaluation queued"),
    onError: (error) => toast.error(error.message),
  });

  const sendTest = api.alerts.sendTest.useMutation({
    onSuccess: async (result) => {
      toast.success(
        `Test delivered — ${Object.entries(result.outcome)
          .map(([channel, status]) => `${channel}: ${status}`)
          .join(", ")}`,
      );
      await invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const redeliver = api.alerts.redeliver.useMutation({
    onSuccess: async () => {
      toast.success("Delivered");
      await invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Alerts"
        description="Threshold and percentage-change rules, evaluated twice an hour. One open event per rule — a rule that keeps firing does not keep notifying."
        actions={
          <>
            <Button variant="secondary" onClick={() => evaluate.mutate()}>
              <Play /> Evaluate now
            </Button>
            <Button variant="primary" onClick={() => setShowForm((v) => !v)}>
              <Plus /> New rule
            </Button>
          </>
        }
      />

      {showForm ? (
        <Card>
          <CardHeader>
            <CardTitle>New alert rule</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                const webhook = String(form.get("webhook") ?? "").trim();
                const emails = String(form.get("emails") ?? "")
                  .split(/[,\s]+/)
                  .map((s) => s.trim())
                  .filter((s) => s.includes("@"));

                create.mutate({
                  name: String(form.get("name")),
                  appId: String(form.get("appId")) || null,
                  metric: String(form.get("metric")) as MetricKey,
                  comparator: String(form.get("comparator")) as AlertComparator,
                  threshold: Number(form.get("threshold")),
                  windowDays: Number(form.get("windowDays")),
                  severity: String(form.get("severity")) as Severity,
                  channels: {
                    ...(webhook ? { webhook } : {}),
                    ...(emails.length ? { email: emails } : {}),
                  },
                });
              }}
            >
              <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-1">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" required placeholder="Installs dropped" />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="appId">App</Label>
                <Select id="appId" name="appId" defaultValue="">
                  <option value="">All apps</option>
                  {apps.data?.map((app) => (
                    <option key={app.id} value={app.id}>
                      {app.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="metric">Metric</Label>
                <Select id="metric" name="metric" defaultValue="INSTALLS">
                  {Object.values(MetricKey).map((metric) => (
                    <option key={metric} value={metric}>
                      {METRIC_META[metric].label}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="comparator">Condition</Label>
                <Select id="comparator" name="comparator" defaultValue="PCT_CHANGE_DOWN">
                  {Object.values(AlertComparator).map((comparator) => (
                    <option key={comparator} value={comparator}>
                      {COMPARATOR_LABEL[comparator]}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="threshold">Threshold</Label>
                <Input id="threshold" name="threshold" type="number" step="any" required defaultValue={20} />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="windowDays">Window (days)</Label>
                <Input id="windowDays" name="windowDays" type="number" min={1} max={90} defaultValue={7} />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="severity">Severity</Label>
                <Select id="severity" name="severity" defaultValue="MEDIUM">
                  {Object.values(Severity).map((severity) => (
                    <option key={severity} value={severity}>
                      {severity}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="webhook">Webhook URL</Label>
                <Input
                  id="webhook"
                  name="webhook"
                  type="url"
                  placeholder="https://hooks.slack.com/services/… or your own endpoint"
                />
                <p className="text-xs text-[var(--text-muted)]">
                  Slack and Discord incoming webhooks are detected automatically. Anything else
                  receives the signed JSON payload.
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="emails">Email recipients</Label>
                <Input id="emails" name="emails" placeholder="ops@acme.com, lead@acme.com" />
              </div>

              <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
                <Button variant="primary" type="submit" disabled={create.isPending}>
                  Create rule
                </Button>
                <Button variant="ghost" type="button" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Open and recent events</CardTitle>
        </CardHeader>
        <CardContent>
          {events.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : events.data?.length ? (
            <ul className="flex flex-col divide-y divide-[var(--border)]">
              {events.data.map((event) => (
                <li key={event.id} className="flex flex-wrap items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{event.rule.name}</p>
                      {event.isTest ? <Badge tone="accent">Test</Badge> : null}
                      <Badge
                        tone={
                          event.status === "TRIGGERED"
                            ? "critical"
                            : event.status === "ACKNOWLEDGED"
                              ? "warning"
                              : "good"
                        }
                      >
                        {event.status}
                      </Badge>
                      {event.rule.app ? <Badge>{event.rule.app.name}</Badge> : null}
                      <DeliveryBadge event={event} />
                    </div>
                    <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{event.message}</p>
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                      {formatMetric(event.rule.metric, event.value)}
                      {event.baseline !== null
                        ? ` vs baseline ${formatMetric(event.rule.metric, event.baseline)}`
                        : ""}{" "}
                      · {new Date(event.triggeredAt).toLocaleString()}
                    </p>
                  </div>

                  <div className="flex gap-1.5">
                    {event.deliveryError ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={redeliver.isPending}
                        onClick={() => redeliver.mutate({ eventId: event.id })}
                      >
                        <Send /> Retry delivery
                      </Button>
                    ) : null}
                    {event.status === "TRIGGERED" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setEventStatus.mutate({ eventId: event.id, status: "ACKNOWLEDGED" })
                        }
                      >
                        Acknowledge
                      </Button>
                    ) : null}
                    {event.status !== "RESOLVED" ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          setEventStatus.mutate({ eventId: event.id, status: "RESOLVED" })
                        }
                      >
                        Resolve
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--text-secondary)]">
              Nothing has fired. Events appear here when a rule's condition is met.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="size-4" aria-hidden /> Rules
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rules.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : rules.data?.length ? (
            <ul className="flex flex-col divide-y divide-[var(--border)]">
              {rules.data.map((rule) => (
                <li key={rule.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{rule.name}</p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {METRIC_META[rule.metric].label} {COMPARATOR_LABEL[rule.comparator]}{" "}
                      {rule.comparator.startsWith("PCT")
                        ? `${rule.threshold}%`
                        : formatMetric(rule.metric, rule.threshold)}{" "}
                      over {rule.windowDays} day{rule.windowDays === 1 ? "" : "s"}
                      {rule.app ? ` · ${rule.app.name}` : " · all apps"}
                    </p>
                  </div>

                  <ChannelBadges channels={rule.channels} />
                  <Badge tone={rule.isEnabled ? "good" : "neutral"}>
                    {rule.isEnabled ? "Enabled" : "Paused"}
                  </Badge>
                  <Badge>{rule._count.events} events</Badge>

                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={sendTest.isPending}
                      onClick={() => sendTest.mutate({ ruleId: rule.id })}
                    >
                      <Send /> Test
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setEnabled.mutate({ ruleId: rule.id, isEnabled: !rule.isEnabled })
                      }
                    >
                      {rule.isEnabled ? "Pause" : "Enable"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Delete ${rule.name}`}
                      onClick={() => remove.mutate({ ruleId: rule.id })}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--text-secondary)]">
              No rules yet. A good first one: installs fall by 20% over 7 days.
            </p>
          )}
        </CardContent>
      </Card>

      <DigestsCard />
      <WebhookSecretCard />
    </div>
  );
}

/** Shows where a rule delivers, so a rule with no channels is obvious at a glance. */
function ChannelBadges({ channels }: { channels: unknown }) {
  const parsed = (channels ?? {}) as { webhook?: string; email?: string[] };
  const items: string[] = [];

  if (parsed.webhook) {
    items.push(
      /hooks\.slack\.com/.test(parsed.webhook)
        ? "Slack"
        : /discord/.test(parsed.webhook)
          ? "Discord"
          : "Webhook",
    );
  }
  if (parsed.email?.length) items.push(`${parsed.email.length} email`);

  if (items.length === 0) {
    return <Badge tone="warning">No channels</Badge>;
  }

  return (
    <>
      {items.map((item) => (
        <Badge key={item} tone="accent">
          {item}
        </Badge>
      ))}
    </>
  );
}

/**
 * Delivery is reported separately from the alert itself: an alert that fired
 * but never reached anyone is a different failure from one that never fired.
 */
function DeliveryBadge({
  event,
}: {
  event: { deliveredAt: Date | null; deliveryError: string | null; deliveryAttempts: number };
}) {
  if (event.deliveryError) {
    return <Badge tone="critical">Delivery failed</Badge>;
  }
  if (event.deliveredAt) {
    return <Badge tone="good">Delivered</Badge>;
  }
  return <Badge tone="neutral">{event.deliveryAttempts > 0 ? "Delivering…" : "Not sent"}</Badge>;
}

function WebhookSecretCard() {
  const secret = api.alerts.webhookSecret.useQuery();
  const [revealed, setRevealed] = React.useState(false);

  if (!secret.data) return null;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Webhook signature</CardTitle>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            Every non-Slack webhook delivery is signed so your endpoint can reject forged posts.
            The timestamp is part of the signed value, so a captured delivery cannot be replayed.
          </p>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <code className="flex-1 overflow-x-auto rounded bg-[var(--page)] px-2 py-1.5 text-xs">
            {revealed ? secret.data.secret : "•".repeat(48)}
          </code>
          <Button variant="ghost" size="sm" onClick={() => setRevealed((v) => !v)}>
            {revealed ? "Hide" : "Reveal"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void navigator.clipboard.writeText(secret.data.secret);
              toast.success("Copied");
            }}
          >
            Copy
          </Button>
        </div>
        <pre className="overflow-x-auto rounded bg-[var(--page)] p-3 text-xs">
          <code>{`X-ASO-Signature: sha256=<hex>
X-ASO-Timestamp: <unix seconds>

expected = HMAC_SHA256(secret, timestamp + "." + rawBody)`}</code>
        </pre>
      </CardContent>
    </Card>
  );
}
