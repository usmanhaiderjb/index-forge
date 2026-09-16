"use client";

import { DigestCadence } from "@prisma/client";
import { Mail, Play, Plus, Trash2 } from "lucide-react";
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
  Label,
  Select,
  Skeleton,
} from "@/components/ui/primitives";
import { api } from "@/trpc/react";

/**
 * Recurring summaries.
 *
 * Distinct from alerts by intent: an alert fires when something crosses a
 * line, a digest arrives whether or not anything happened — and a quiet week
 * is itself information.
 */
export function DigestsCard() {
  const utils = api.useUtils();
  const [showForm, setShowForm] = React.useState(false);
  const [previewCadence, setPreviewCadence] = React.useState<DigestCadence>("WEEKLY");

  const digests = api.digests.list.useQuery();
  const preview = api.digests.preview.useQuery({ cadence: previewCadence, appIds: [] });

  const invalidate = () => utils.digests.list.invalidate();

  const create = api.digests.create.useMutation({
    onSuccess: async () => {
      toast.success("Digest created");
      setShowForm(false);
      await invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const setEnabled = api.digests.setEnabled.useMutation({ onSuccess: invalidate });
  const remove = api.digests.remove.useMutation({ onSuccess: invalidate });

  const sendNow = api.digests.sendNow.useMutation({
    onSuccess: async (result) => {
      toast.success(
        `Sent — ${Object.entries(result.outcome)
          .map(([channel, status]) => `${channel}: ${status}`)
          .join(", ")}`,
      );
      await invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <Mail className="size-4" aria-hidden /> Digests
          </CardTitle>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            A recurring summary to the same channels alerts use. Sent whether or not anything
            happened — a quiet week is worth knowing too.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setShowForm((v) => !v)}>
          <Plus /> New
        </Button>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {showForm ? (
          <form
            className="grid gap-3 sm:grid-cols-2"
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
                cadence: String(form.get("cadence")) as DigestCadence,
                sendHourUtc: Number(form.get("sendHourUtc")),
                appIds: [],
                channels: {
                  ...(webhook ? { webhook } : {}),
                  ...(emails.length ? { email: emails } : {}),
                },
              });
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="digest-name">Name</Label>
              <Input id="digest-name" name="name" required placeholder="Monday summary" />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cadence">Cadence</Label>
              <Select id="cadence" name="cadence" defaultValue="WEEKLY">
                <option value="WEEKLY">Weekly (Mondays)</option>
                <option value="DAILY">Daily</option>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sendHourUtc">Send hour (UTC)</Label>
              <Input
                id="sendHourUtc"
                name="sendHourUtc"
                type="number"
                min={0}
                max={23}
                defaultValue={8}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="digest-emails">Email recipients</Label>
              <Input id="digest-emails" name="emails" placeholder="team@acme.com" />
            </div>

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="digest-webhook">Webhook URL</Label>
              <Input id="digest-webhook" name="webhook" type="url" placeholder="https://…" />
            </div>

            <div className="flex items-end gap-2 sm:col-span-2">
              <Button variant="primary" type="submit" disabled={create.isPending}>
                Create
              </Button>
              <Button variant="ghost" type="button" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : null}

        {digests.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : digests.data?.length ? (
          <ul className="flex flex-col divide-y divide-[var(--border)]">
            {digests.data.map((digest) => (
              <li key={digest.id} className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{digest.name}</p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {digest.cadence === "DAILY" ? "Daily" : "Weekly"} at{" "}
                    {String(digest.sendHourUtc).padStart(2, "0")}:00 UTC ·{" "}
                    {digest.appIds.length ? `${digest.appIds.length} apps` : "all apps"}
                    {digest.lastSentAt
                      ? ` · last sent ${new Date(digest.lastSentAt).toLocaleDateString()}`
                      : " · never sent"}
                  </p>
                  {digest.lastError ? (
                    <p className="text-xs text-[var(--status-critical)]">{digest.lastError}</p>
                  ) : null}
                </div>

                <Badge tone={digest.isEnabled ? "good" : "neutral"}>
                  {digest.isEnabled ? "Enabled" : "Paused"}
                </Badge>

                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={sendNow.isPending}
                    onClick={() => sendNow.mutate({ digestId: digest.id })}
                  >
                    <Play /> Send now
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setEnabled.mutate({ digestId: digest.id, isEnabled: !digest.isEnabled })
                    }
                  >
                    {digest.isEnabled ? "Pause" : "Enable"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Delete ${digest.name}`}
                    onClick={() => remove.mutate({ digestId: digest.id })}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--text-secondary)]">No digests yet.</p>
        )}

        <details className="rounded-md border border-[var(--border)] p-3">
          <summary className="cursor-pointer text-xs text-[var(--text-secondary)]">
            Preview what a digest would say right now
          </summary>
          <div className="mt-2 flex items-center gap-2">
            <Select
              value={previewCadence}
              onChange={(e) => setPreviewCadence(e.target.value as DigestCadence)}
            >
              <option value="WEEKLY">Weekly</option>
              <option value="DAILY">Daily</option>
            </Select>
            {preview.data?.data.isQuiet ? <Badge tone="warning">Quiet period</Badge> : null}
          </div>
          <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded bg-[var(--page)] p-3 text-xs">
            {preview.isLoading ? "Building…" : (preview.data?.text ?? "")}
          </pre>
        </details>
      </CardContent>
    </Card>
  );
}
