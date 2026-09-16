"use client";

import { CheckCircle2, ExternalLink, Link2, Plug, RefreshCw, TriangleAlert, Unplug } from "lucide-react";
import { useSearchParams } from "next/navigation";
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
  PageHeader,
  Select,
  Skeleton,
  Textarea,
} from "@/components/ui/primitives";
import { api } from "@/trpc/react";

export default function IntegrationsPage() {
  const params = useSearchParams();
  const utils = api.useUtils();

  const catalog = api.connections.catalog.useQuery();
  const apps = api.apps.list.useQuery();
  const runs = api.connections.syncRuns.useQuery({ limit: 15 });

  const [resourcesFor, setResourcesFor] = React.useState<string | null>(null);

  React.useEffect(() => {
    const error = params.get("error");
    const connected = params.get("connected");
    if (error) toast.error(error);
    if (connected) toast.success(`${connected.replace(/_/g, " ")} connected`);
  }, [params]);

  const invalidate = async () => {
    await Promise.all([utils.connections.catalog.invalidate(), utils.connections.syncRuns.invalidate()]);
  };

  const test = api.connections.test.useMutation({
    onSuccess: async (result) => {
      result.ok ? toast.success(result.detail) : toast.error(result.detail);
      await invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const sync = api.connections.sync.useMutation({
    onSuccess: () => toast.success("Sync queued"),
    onError: (error) => toast.error(error.message),
  });

  const remove = api.connections.remove.useMutation({
    onSuccess: async () => {
      toast.success("Connection removed");
      await invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Integrations"
        description="Connect the accounts that hold your numbers. Credentials are encrypted with AES-256-GCM and never returned to the browser."
      />

      {catalog.isLoading ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {catalog.data?.map((entry) => (
            <Card key={entry.provider}>
              <CardHeader>
                <div className="min-w-0">
                  <CardTitle className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="size-2.5 rounded-full"
                      style={{ background: entry.accent }}
                    />
                    {entry.name}
                  </CardTitle>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">{entry.description}</p>
                </div>
                <a
                  href={entry.docsUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  aria-label={`${entry.name} API docs`}
                >
                  <ExternalLink className="size-4" />
                </a>
              </CardHeader>

              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-1.5">
                  {entry.provides.map((item) => (
                    <Badge key={item}>{item}</Badge>
                  ))}
                </div>

                {entry.setupNote ? (
                  <p className="rounded-md bg-[var(--page)] p-2.5 text-xs text-[var(--text-secondary)]">
                    {entry.setupNote}
                  </p>
                ) : null}

                {!entry.deploymentReady ? (
                  <div className="flex items-start gap-2 rounded-md border border-[var(--status-warning)] bg-[color-mix(in_oklab,var(--status-warning)_12%,transparent)] p-2.5 text-xs">
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <div className="min-w-0">
                      <p>This deployment has no Google OAuth client configured. Set:</p>
                      <ul className="mt-1 flex flex-col gap-0.5">
                        <li>
                          <code>GOOGLE_OAUTH_CLIENT_ID</code>
                        </li>
                        <li>
                          <code>GOOGLE_OAUTH_CLIENT_SECRET</code>
                        </li>
                      </ul>
                    </div>
                  </div>
                ) : null}

                {entry.connections.length > 0 ? (
                  <ul className="flex flex-col gap-2">
                    {entry.connections.map((connection) => (
                      <li
                        key={connection.id}
                        className="rounded-md border border-[var(--border)] p-2.5"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-medium">
                            {connection.label ?? connection.externalName ?? connection.externalId}
                          </span>
                          <Badge
                            tone={
                              connection.status === "ACTIVE"
                                ? "good"
                                : connection.status === "NEEDS_REAUTH" || connection.status === "ERROR"
                                  ? "critical"
                                  : "neutral"
                            }
                          >
                            {connection.status === "ACTIVE" ? (
                              <CheckCircle2 className="size-3" aria-hidden />
                            ) : (
                              <TriangleAlert className="size-3" aria-hidden />
                            )}
                            {connection.status.replace(/_/g, " ")}
                          </Badge>
                          <Badge>{connection.linkedApps} linked</Badge>
                        </div>

                        {connection.lastError ? (
                          <p className="mt-1.5 text-xs text-[var(--status-critical)]">
                            {connection.lastError}
                          </p>
                        ) : null}

                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => test.mutate({ connectionId: connection.id })}
                          >
                            Test
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => sync.mutate({ connectionId: connection.id, days: 30 })}
                          >
                            <RefreshCw /> Sync
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setResourcesFor(connection.id)}
                          >
                            <Link2 /> Link apps
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => remove.mutate({ connectionId: connection.id })}
                          >
                            <Unplug /> Remove
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {entry.authKind === "google-oauth" ? (
                  <a href={`/api/oauth/google/start?provider=${entry.provider}`}>
                    <Button variant="primary" size="sm" disabled={!entry.deploymentReady}>
                      <Plug /> {entry.connections.length ? "Connect another account" : "Connect"}
                    </Button>
                  </a>
                ) : entry.authKind === "apple-search-ads-key" ? (
                  <AppleSearchAdsForm onDone={invalidate} />
                ) : (
                  <AppleKeyForm onDone={invalidate} />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {resourcesFor ? (
        <ResourceLinker
          connectionId={resourcesFor}
          apps={apps.data ?? []}
          onClose={() => setResourcesFor(null)}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Recent syncs</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {runs.data?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-secondary)]">
                    <th className="px-4 py-2 font-medium">Job</th>
                    <th className="px-2 py-2 font-medium">Target</th>
                    <th className="px-2 py-2 font-medium">Status</th>
                    <th className="px-2 py-2 text-right font-medium">Read</th>
                    <th className="px-2 py-2 text-right font-medium">Wrote</th>
                    <th className="px-2 py-2 text-right font-medium">Duration</th>
                    <th className="px-4 py-2 text-right font-medium">Started</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.data.map((run) => (
                    <tr key={run.id} className="border-b border-[var(--border)] last:border-0">
                      <td className="px-4 py-2 font-medium">{run.job}</td>
                      <td className="px-2 py-2 text-[var(--text-secondary)]">
                        {run.app?.name ?? run.connection?.label ?? run.connection?.provider ?? "—"}
                      </td>
                      <td className="px-2 py-2">
                        <Badge
                          tone={
                            run.status === "SUCCESS"
                              ? "good"
                              : run.status === "FAILED"
                                ? "critical"
                                : run.status === "PARTIAL"
                                  ? "warning"
                                  : "neutral"
                          }
                        >
                          {run.status}
                        </Badge>
                      </td>
                      <td className="tabular px-2 py-2 text-right">{run.recordsRead}</td>
                      <td className="tabular px-2 py-2 text-right">{run.recordsWrote}</td>
                      <td className="tabular px-2 py-2 text-right">
                        {run.durationMs ? `${(run.durationMs / 1000).toFixed(1)}s` : "—"}
                      </td>
                      <td className="px-4 py-2 text-right text-xs text-[var(--text-muted)]">
                        {new Date(run.startedAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="p-4 text-sm text-[var(--text-secondary)]">
              No syncs yet. They appear here once a connection runs — including the failures.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AppleKeyForm({ onDone }: { onDone: () => Promise<void> }) {
  const [open, setOpen] = React.useState(false);
  const connect = api.connections.connectAppleKey.useMutation({
    onSuccess: async (result) => {
      toast.success(result.detail);
      setOpen(false);
      await onDone();
    },
    onError: (error) => toast.error(error.message),
  });

  if (!open) {
    return (
      <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
        <Plug /> Add API key
      </Button>
    );
  }

  return (
    <form
      className="flex flex-col gap-2 rounded-md border border-[var(--border)] p-3"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        connect.mutate({
          label: String(form.get("label")),
          issuerId: String(form.get("issuerId")),
          keyId: String(form.get("keyId")),
          privateKey: String(form.get("privateKey")),
          vendorNumber: String(form.get("vendorNumber") || "") || undefined,
        });
      }}
    >
      <Label htmlFor="label">Label</Label>
      <Input id="label" name="label" required placeholder="Acme App Store Connect" />

      <Label htmlFor="issuerId">Issuer ID</Label>
      <Input id="issuerId" name="issuerId" required placeholder="57246542-96fe-1a63-e053-0824d011072a" />

      <Label htmlFor="keyId">Key ID</Label>
      <Input id="keyId" name="keyId" required placeholder="2X9R4HXF34" />

      <Label htmlFor="vendorNumber">Vendor number (optional)</Label>
      <Input id="vendorNumber" name="vendorNumber" placeholder="Needed for Sales & Trends units" />

      <Label htmlFor="privateKey">Private key (.p8 contents)</Label>
      <Textarea
        id="privateKey"
        name="privateKey"
        required
        rows={5}
        placeholder="-----BEGIN PRIVATE KEY-----"
        className="font-mono text-xs"
      />

      <div className="flex gap-2">
        <Button variant="primary" size="sm" type="submit" disabled={connect.isPending}>
          {connect.isPending ? "Verifying…" : "Connect"}
        </Button>
        <Button variant="ghost" size="sm" type="button" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function AppleSearchAdsForm({ onDone }: { onDone: () => Promise<void> }) {
  const [open, setOpen] = React.useState(false);
  const connect = api.connections.connectAppleSearchAds.useMutation({
    onSuccess: async (result) => {
      toast.success(result.detail);
      setOpen(false);
      await onDone();
    },
    onError: (error) => toast.error(error.message),
  });

  if (!open) {
    return (
      <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
        <Plug /> Add API key
      </Button>
    );
  }

  return (
    <form
      className="flex flex-col gap-2 rounded-md border border-[var(--border)] p-3"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        connect.mutate({
          label: String(form.get("label")),
          clientId: String(form.get("clientId")),
          teamId: String(form.get("teamId")),
          keyId: String(form.get("keyId")),
          privateKey: String(form.get("privateKey")),
          orgId: String(form.get("orgId")),
          currency: String(form.get("currency") || "") || undefined,
        });
      }}
    >
      <p className="text-xs text-[var(--text-secondary)]">
        These come from Search Ads, not App Store Connect. In Search Ads: Account Settings &gt; API.
        An App Store Connect key will be rejected here.
      </p>

      <Label htmlFor="sa-label">Label</Label>
      <Input id="sa-label" name="label" required placeholder="Acme Search Ads" />

      <Label htmlFor="sa-orgId">Org ID</Label>
      <Input id="sa-orgId" name="orgId" required inputMode="numeric" placeholder="1234567" />

      <Label htmlFor="sa-clientId">Client ID</Label>
      <Input id="sa-clientId" name="clientId" required placeholder="SEARCHADS.27c8a…" />

      <Label htmlFor="sa-teamId">Team ID</Label>
      <Input id="sa-teamId" name="teamId" required placeholder="SEARCHADS.27c8a…" />

      <Label htmlFor="sa-keyId">Key ID</Label>
      <Input id="sa-keyId" name="keyId" required placeholder="a1b2c3d4-…" />

      <Label htmlFor="sa-currency">Currency (optional)</Label>
      <Input id="sa-currency" name="currency" maxLength={3} placeholder="USD" />

      <Label htmlFor="sa-privateKey">Private key (.p8 contents)</Label>
      <Textarea
        id="sa-privateKey"
        name="privateKey"
        required
        rows={5}
        placeholder="-----BEGIN PRIVATE KEY-----"
        className="font-mono text-xs"
      />

      <div className="flex gap-2">
        <Button variant="primary" size="sm" type="submit" disabled={connect.isPending}>
          {connect.isPending ? "Verifying…" : "Connect"}
        </Button>
        <Button variant="ghost" size="sm" type="button" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function ResourceLinker({
  connectionId,
  apps,
  onClose,
}: {
  connectionId: string;
  apps: { id: string; name: string }[];
  onClose: () => void;
}) {
  const utils = api.useUtils();
  const resources = api.connections.resources.useMutation();
  const link = api.connections.link.useMutation({
    onSuccess: async () => {
      toast.success("Linked — a 90-day backfill is queued");
      await utils.connections.catalog.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  React.useEffect(() => {
    resources.mutate({ connectionId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId]);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Link apps to this connection</CardTitle>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            Resources matched by store id or bundle id are pre-selected.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </CardHeader>
      <CardContent>
        {resources.isPending ? (
          <Skeleton className="h-32 w-full" />
        ) : resources.error ? (
          <p className="text-sm text-[var(--status-critical)]">{resources.error.message}</p>
        ) : resources.data?.length ? (
          <ul className="flex flex-col gap-2">
            {resources.data.map(({ resource, suggestedAppId }) => (
              <li
                key={resource.externalId}
                className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--border)] p-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{resource.name}</p>
                  <p className="truncate text-xs text-[var(--text-muted)]">{resource.externalId}</p>
                </div>

                <form
                  className="flex items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = new FormData(e.currentTarget);
                    const appId = String(form.get("appId"));
                    if (!appId) return;

                    const bucket = String(form.get("reportsBucket") ?? "").trim();
                    link.mutate({
                      connectionId,
                      appId,
                      externalId: resource.externalId,
                      externalRef: resource.externalRef,
                      displayName: resource.name,
                      metadata: {
                        ...(resource.metadata ?? {}),
                        ...(bucket ? { reportsBucket: bucket } : {}),
                      },
                    });
                  }}
                >
                  <Select name="appId" defaultValue={suggestedAppId ?? ""}>
                    <option value="">Not linked</option>
                    {apps.map((app) => (
                      <option key={app.id} value={app.id}>
                        {app.name}
                      </option>
                    ))}
                  </Select>
                  <Input
                    name="reportsBucket"
                    placeholder="Play reports bucket (optional)"
                    className="w-56"
                  />
                  <Button variant="secondary" size="sm" type="submit">
                    Link
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--text-secondary)]">
            No linkable resources found for this account.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
