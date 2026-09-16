"use client";

import { Role } from "@prisma/client";
import { Copy, KeyRound, Trash2, UserPlus } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { formatCurrency, formatNumber } from "@aso/shared";
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
import { api } from "@/trpc/react";

export default function SettingsPage() {
  const utils = api.useUtils();

  const org = api.org.current.useQuery();
  const members = api.org.members.useQuery();
  const apiKeys = api.org.apiKeys.useQuery();
  const aiStatus = api.ai.status.useQuery();
  const auditLog = api.org.auditLog.useQuery({ limit: 25 });

  const [newKey, setNewKey] = React.useState<string | null>(null);

  // Shown in the copy-paste curl example, so it matches wherever this is deployed.
  const appUrl = typeof window === "undefined" ? "" : window.location.origin;

  const invite = api.org.invite.useMutation({
    onSuccess: async (result) => {
      toast.success(`Invite created — send them ${result.acceptUrl}`);
      await utils.org.members.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const setRole = api.org.setRole.useMutation({
    onSuccess: () => utils.org.members.invalidate(),
    onError: (error) => toast.error(error.message),
  });

  const removeMember = api.org.removeMember.useMutation({
    onSuccess: () => utils.org.members.invalidate(),
    onError: (error) => toast.error(error.message),
  });

  const createKey = api.org.createApiKey.useMutation({
    onSuccess: async (result) => {
      setNewKey(result.key);
      await utils.org.apiKeys.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const revokeKey = api.org.revokeApiKey.useMutation({
    onSuccess: () => utils.org.apiKeys.invalidate(),
  });

  const canAdmin = org.data?.role === "OWNER" || org.data?.role === "ADMIN";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Settings"
        description={org.data ? `${org.data.name} · ${org.data.slug}` : undefined}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Workspace</CardTitle>
          </CardHeader>
          <CardContent>
            {org.isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : org.data ? (
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <Stat label="Your role" value={org.data.role} />
                <Stat label="Plan" value={org.data.plan} />
                <Stat label="Apps" value={String(org.data._count.apps)} />
                <Stat label="Connections" value={String(org.data._count.connections)} />
                <Stat label="Members" value={String(org.data._count.memberships)} />
              </dl>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>AI usage this month</CardTitle>
          </CardHeader>
          <CardContent>
            {!aiStatus.data?.configured ? (
              <p className="text-sm text-[var(--text-secondary)]">
                AI features are disabled. Set <code>ANTHROPIC_API_KEY</code> to enable them.
              </p>
            ) : aiStatus.data.usage ? (
              <div className="flex flex-col gap-3">
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <Stat label="Calls" value={formatNumber(aiStatus.data.usage.calls)} />
                  <Stat
                    label="Output tokens"
                    value={formatNumber(aiStatus.data.usage.outputTokens)}
                  />
                  <Stat
                    label="Input tokens"
                    value={formatNumber(aiStatus.data.usage.inputTokens)}
                  />
                  <Stat
                    label="Estimated cost"
                    value={formatCurrency(aiStatus.data.usage.costUsd)}
                  />
                </dl>

                {aiStatus.data.usage.budget > 0 ? (
                  <div>
                    <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                      <span>Monthly output-token budget</span>
                      <span className="tabular">
                        {formatNumber(aiStatus.data.usage.outputTokens)} /{" "}
                        {formatNumber(aiStatus.data.usage.budget)}
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--text-muted)_14%,transparent)]">
                      <div
                        className="h-full rounded-full bg-[var(--accent)]"
                        style={{
                          width: `${Math.min(100, (aiStatus.data.usage.outputTokens / aiStatus.data.usage.budget) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                ) : null}

                {aiStatus.data.usage.byFeature.length ? (
                  <ul className="flex flex-col gap-1 text-xs">
                    {aiStatus.data.usage.byFeature.map((row) => (
                      <li key={row.feature} className="flex justify-between">
                        <span className="text-[var(--text-secondary)]">{row.feature}</span>
                        <span className="tabular">{formatCurrency(row.costUsd)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <p className="text-xs text-[var(--text-muted)]">
                  Cost is estimated from published list prices, not from your bill.
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {canAdmin ? (
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                invite.mutate({
                  email: String(form.get("email")),
                  role: String(form.get("role")) as Role,
                });
                e.currentTarget.reset();
              }}
            >
              <div className="flex min-w-56 flex-1 flex-col gap-1.5">
                <Label htmlFor="email">Invite by email</Label>
                <Input id="email" name="email" type="email" required placeholder="teammate@company.com" />
              </div>
              <Select name="role" defaultValue="MEMBER">
                {Object.values(Role).map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </Select>
              <Button variant="primary" type="submit" disabled={invite.isPending}>
                <UserPlus /> Invite
              </Button>
            </form>
          ) : null}

          {members.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--border)]">
              {members.data?.members.map((member) => (
                <li key={member.id} className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {member.user.name ?? member.user.email}
                    </p>
                    <p className="truncate text-xs text-[var(--text-muted)]">{member.user.email}</p>
                  </div>

                  {canAdmin ? (
                    <Select
                      value={member.role}
                      onChange={(e) =>
                        setRole.mutate({ userId: member.userId, role: e.target.value as Role })
                      }
                    >
                      {Object.values(Role).map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Badge>{member.role}</Badge>
                  )}

                  {canAdmin ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Remove member"
                      onClick={() => removeMember.mutate({ userId: member.userId })}
                    >
                      <Trash2 />
                    </Button>
                  ) : null}
                </li>
              ))}

              {members.data?.invites.map((pending) => (
                <li key={pending.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{pending.email}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      Invited · expires {new Date(pending.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge tone="warning">Pending</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {canAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="size-4" aria-hidden /> API keys
            </CardTitle>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => createKey.mutate({ name: `Key ${new Date().toISOString().slice(0, 10)}` })}
            >
              Create key
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {newKey ? (
              <div className="rounded-md border border-[var(--accent)] p-3">
                <p className="text-xs font-medium text-[var(--text-secondary)]">
                  Copy this now — it is not shown again.
                </p>
                <div className="mt-1.5 flex items-center gap-2">
                  <code className="flex-1 overflow-x-auto rounded bg-[var(--page)] px-2 py-1.5 text-xs">
                    {newKey}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Copy key"
                    onClick={() => {
                      void navigator.clipboard.writeText(newKey);
                      toast.success("Copied");
                    }}
                  >
                    <Copy />
                  </Button>
                </div>
              </div>
            ) : null}

            {apiKeys.data?.length ? (
              <ul className="flex flex-col divide-y divide-[var(--border)]">
                {apiKeys.data.map((key) => (
                  <li key={key.id} className="flex items-center gap-3 py-2.5 first:pt-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{key.name}</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {key.prefix}… · created {new Date(key.createdAt).toLocaleDateString()}
                        {key.lastUsedAt
                          ? ` · last used ${new Date(key.lastUsedAt).toLocaleDateString()}`
                          : " · never used"}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Revoke ${key.name}`}
                      onClick={() => revokeKey.mutate({ keyId: key.id })}
                    >
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[var(--text-secondary)]">No API keys.</p>
            )}

            <div className="rounded-md border border-[var(--border)] bg-[var(--page)] p-3">
              <p className="text-xs font-medium text-[var(--text-secondary)]">
                Keys authenticate the read-only REST API. 120 requests per minute per key.
              </p>
              <pre className="mt-2 overflow-x-auto text-xs">
                <code>{`curl ${appUrl}/api/v1/apps \\\n  -H "Authorization: Bearer aso_…"`}</code>
              </pre>
              <a
                href="/api/v1"
                target="_blank"
                rel="noreferrer noopener"
                className="mt-2 inline-block text-xs text-[var(--accent)] hover:underline"
              >
                Browse the endpoint reference →
              </a>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {canAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle>Audit log</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {auditLog.data?.length ? (
              <ul className="flex flex-col divide-y divide-[var(--border)]">
                {auditLog.data.map((entry) => (
                  <li key={entry.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                    <span className="font-medium">{entry.action}</span>
                    <span className="text-[var(--text-secondary)]">
                      {entry.actor?.email ?? "system"}
                    </span>
                    <span className="ml-auto text-xs text-[var(--text-muted)]">
                      {new Date(entry.createdAt).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-4 text-sm text-[var(--text-secondary)]">Nothing logged yet.</p>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-[var(--text-muted)]">{label}</dt>
      <dd className="tabular text-sm font-medium">{value}</dd>
    </div>
  );
}
