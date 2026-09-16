"use client";

import { CheckCircle2, CircleAlert, Info, Send, Trash2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

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
import type { RouterOutputs } from "@/server/api/root";
import { api } from "@/trpc/react";

/**
 * Push campaigns.
 *
 * One composer across a whole portfolio. The thing Firebase does not do is not
 * "send a notification" — it is "send the same notification to eleven apps
 * without opening eleven consoles".
 */
export function PushView() {
  const readiness = api.push.readiness.useQuery();
  const campaigns = api.push.list.useQuery({ limit: 20 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Push</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Send a Firebase notification to any number of your apps at once.
        </p>
      </div>

      <Composer
        apps={readiness.data ?? []}
        loading={readiness.isLoading}
        onSent={() => void campaigns.refetch()}
      />

      <Credentials apps={readiness.data ?? []} loading={readiness.isLoading} />

      <History campaigns={campaigns.data ?? []} loading={campaigns.isLoading} />
    </div>
  );
}

type ReadyApp = RouterOutputs["push"]["readiness"][number];
type Campaign = RouterOutputs["push"]["list"][number];

/* -------------------------------------------------------------- composer */

function Composer({
  apps,
  loading,
  onSent,
}: {
  apps: ReadyApp[];
  loading: boolean;
  onSent: () => void;
}) {
  const utils = api.useUtils();
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [linkUrl, setLinkUrl] = React.useState("");
  const [topic, setTopic] = React.useState("all");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [confirming, setConfirming] = React.useState(false);

  const ready = apps.filter((a) => a.ready);

  const send = api.push.send.useMutation({
    onSuccess: (result) => {
      toast.success(
        `Queued for ${result.queued} app${result.queued === 1 ? "" : "s"}` +
          (result.skipped > 0 ? `, ${result.skipped} skipped` : ""),
      );
      setTitle("");
      setBody("");
      setLinkUrl("");
      setSelected(new Set());
      setConfirming(false);
      onSent();
      void utils.push.readiness.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
      setConfirming(false);
    },
  });

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const canSend = title.trim() && body.trim() && selected.size > 0 && topic.trim();

  if (loading) return <Skeleton className="h-96 w-full" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Compose</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="push-title">
            Title
          </label>
          <Input
            id="push-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Version 3.2 is live"
            maxLength={120}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="push-body">
            Message
          </label>
          <textarea
            id="push-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Streaks now sync across devices."
            className="w-full rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-3 text-sm outline-none focus-visible:border-[var(--accent)]"
          />
          <p className="text-xs text-[var(--text-muted)]">
            Android truncates around 40 characters of title and 100 of body on the lock screen.
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="push-link">
            Link when tapped <span className="text-[var(--text-muted)]">(optional)</span>
          </label>
          <Input
            id="push-link"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://example.com/whats-new"
          />
          <p className="text-xs text-[var(--text-muted)]">
            Sent as a <code>link</code> data field. Your app has to read it and route — Firebase
            has no link concept of its own.
          </p>
        </div>

        {/* The constraint, stated where the decision is made rather than buried
            in documentation. Promising "all users" here would be a lie the API
            cannot honour. */}
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="push-topic">
            Audience
          </label>
          <Input
            id="push-topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="all"
          />
          <div className="flex gap-2 rounded-[var(--radius-card)] bg-[var(--surface)] p-3 text-xs leading-relaxed text-[var(--text-secondary)]">
            <Info className="mt-0.5 size-4 shrink-0 text-[var(--accent)]" aria-hidden />
            <p>
              This sends to an FCM <strong>topic</strong>. It reaches every device whose app called{" "}
              <code>subscribeToTopic(&quot;{topic || "all"}&quot;)</code> — not every install.
              Firebase&apos;s own &quot;all users&quot; option is backed by a device registry Google
              does not expose to any third party, so no tool outside the Firebase Console can offer
              it.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              Apps <span className="text-[var(--text-muted)]">({selected.size} selected)</span>
            </span>
            {ready.length > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setSelected(
                    selected.size === ready.length ? new Set() : new Set(ready.map((a) => a.id)),
                  )
                }
              >
                {selected.size === ready.length ? "Clear" : `Select all ${ready.length}`}
              </Button>
            ) : null}
          </div>

          {ready.length === 0 ? (
            <p className="rounded-[var(--radius-card)] bg-[var(--surface)] p-3 text-sm text-[var(--text-secondary)]">
              No app has a working Firebase key yet. Add one below, then come back.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {ready.map((app) => (
                <label
                  key={app.id}
                  className="flex cursor-pointer items-center gap-3 rounded-[var(--radius-card)] border border-[var(--border)] p-3 text-sm hover:border-[var(--accent)]"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(app.id)}
                    onChange={() => toggle(app.id)}
                    className="size-4 accent-[var(--accent)]"
                  />
                  <span className="min-w-0 flex-1 truncate">{app.name}</span>
                  <Badge>{app.platform === "IOS" ? "iOS" : "Android"}</Badge>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Two steps on purpose. A push cannot be recalled once Firebase accepts
            it, so the count goes in front of the user before it happens. */}
        {confirming ? (
          <div className="space-y-3 rounded-[var(--radius-card)] border border-[var(--accent)] p-4">
            <p className="text-sm">
              Send <strong>{title}</strong> to topic <code>{topic}</code> across{" "}
              <strong>
                {selected.size} app{selected.size === 1 ? "" : "s"}
              </strong>
              ? This cannot be undone once Firebase accepts it.
            </p>
            <div className="flex gap-2">
              <Button onClick={() => setConfirming(false)} variant="secondary">
                Back
              </Button>
              <Button
                variant="primary"
                disabled={send.isPending}
                onClick={() =>
                  send.mutate({
                    title: title.trim(),
                    body: body.trim(),
                    linkUrl: linkUrl.trim() || null,
                    appIds: [...selected],
                    target: { kind: "TOPIC", topic: topic.trim() },
                  })
                }
              >
                <Send className="size-4" aria-hidden /> Send now
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="primary" disabled={!canSend} onClick={() => setConfirming(true)}>
            <Send className="size-4" aria-hidden /> Review and send
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------ credentials */

function Credentials({ apps, loading }: { apps: ReadyApp[]; loading: boolean }) {
  const utils = api.useUtils();
  const [openFor, setOpenFor] = React.useState<string | null>(null);
  const [json, setJson] = React.useState("");

  const save = api.push.saveCredential.useMutation({
    onSuccess: (cred) => {
      if (cred.status === "ACTIVE") toast.success(`Connected ${cred.projectId}`);
      else toast.error(cred.lastError ?? "Firebase rejected that key");
      setOpenFor(null);
      setJson("");
      void utils.push.readiness.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const remove = api.push.removeCredential.useMutation({
    onSuccess: () => void utils.push.readiness.invalidate(),
  });

  if (loading) return <Skeleton className="h-64 w-full" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Firebase keys</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2 rounded-[var(--radius-card)] bg-[var(--surface)] p-3 text-xs leading-relaxed text-[var(--text-secondary)]">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-[var(--status-warning)]" aria-hidden />
          <p>
            Create the service account with the <strong>Firebase Cloud Messaging API Admin</strong>{" "}
            role only — not Owner or Editor. A key with broader rights can do far more than send a
            notification if it is ever exposed. Keys are encrypted with AES-256-GCM and never
            returned to the browser.
          </p>
        </div>

        {apps.map((app) => (
          <div
            key={app.id}
            className="flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border border-[var(--border)] p-3"
          >
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{app.name}</span>

            {app.credential ? (
              <>
                <Badge tone={app.credential.status === "ACTIVE" ? "good" : "critical"}>
                  {app.credential.status === "ACTIVE" ? (
                    <CheckCircle2 className="size-3" aria-hidden />
                  ) : (
                    <CircleAlert className="size-3" aria-hidden />
                  )}
                  {app.credential.projectId}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove Firebase key for ${app.name}`}
                  onClick={() => remove.mutate({ appId: app.id })}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => setOpenFor(app.id)}>
                Add key
              </Button>
            )}

            {app.credential?.status === "INVALID" && app.credential.lastError ? (
              <p className="w-full text-xs text-[var(--status-critical)]">
                {app.credential.lastError}
              </p>
            ) : null}

            {openFor === app.id ? (
              <div className="w-full space-y-2 pt-2">
                <textarea
                  value={json}
                  onChange={(e) => setJson(e.target.value)}
                  rows={5}
                  spellCheck={false}
                  placeholder='{ "type": "service_account", "project_id": "...", ... }'
                  className="w-full rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-3 font-mono text-xs outline-none focus-visible:border-[var(--accent)]"
                />
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setOpenFor(null)}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={save.isPending || json.trim().length < 50}
                    onClick={() =>
                      save.mutate({ appId: app.id, serviceAccountJson: json.trim() })
                    }
                  >
                    Verify and save
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* ---------------------------------------------------------------- history */

function History({ campaigns, loading }: { campaigns: Campaign[]; loading: boolean }) {
  if (loading) return <Skeleton className="h-48 w-full" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sent</CardTitle>
      </CardHeader>
      <CardContent>
        {campaigns.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">Nothing sent yet.</p>
        ) : (
          <div className="space-y-3">
            {campaigns.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] pb-3 last:border-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.title}</p>
                  <p className="truncate text-xs text-[var(--text-muted)]">
                    topic <code>{c.targetValue}</code> ·{" "}
                    {new Date(c.createdAt).toLocaleString()}
                  </p>
                </div>

                {/* Counts rather than a single status word: "sent" for a
                    campaign where three of twelve apps failed is a lie. */}
                <div className="flex gap-2 text-xs tabular-nums">
                  {c.counts.sent > 0 ? (
                    <Badge tone="good">{c.counts.sent} sent</Badge>
                  ) : null}
                  {c.counts.failed > 0 ? (
                    <Badge tone="critical">{c.counts.failed} failed</Badge>
                  ) : null}
                  {c.counts.skipped > 0 ? (
                    <Badge tone="warning">{c.counts.skipped} skipped</Badge>
                  ) : null}
                  {c.counts.pending > 0 ? (
                    <Badge>{c.counts.pending} sending</Badge>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
