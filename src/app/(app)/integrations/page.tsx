"use client";

import { CheckCircle2, ExternalLink, Link2, Loader2, Plug, RefreshCw, Search, TriangleAlert, Unplug, Zap } from "lucide-react";
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
                            variant={resourcesFor === connection.id ? "primary" : "ghost"}
                            size="sm"
                            onClick={() => {
                              if (resourcesFor === connection.id) {
                                setResourcesFor(null);
                              } else {
                                setResourcesFor(connection.id);
                                setTimeout(() => {
                                  document.getElementById("resource-linker")?.scrollIntoView({ behavior: "smooth", block: "center" });
                                }, 50);
                              }
                            }}
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
  const [filter, setFilter] = React.useState("");
  const resources = api.connections.resources.useMutation();

  const refetch = () => {
    resources.mutate({ connectionId });
  };

  const link = api.connections.link.useMutation({
    onSuccess: async () => {
      toast.success("App linked — 90-day backfill queued");
      await utils.connections.catalog.invalidate();
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const importAndLink = api.connections.importAndLink.useMutation({
    onSuccess: async (data) => {
      toast.success(`Tracked "${data.app.name}" & linked — 90-day backfill queued`);
      await Promise.all([
        utils.apps.list.invalidate(),
        utils.connections.catalog.invalidate(),
      ]);
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const unlink = api.connections.unlink.useMutation({
    onSuccess: async () => {
      toast.success("App unlinked");
      await utils.connections.catalog.invalidate();
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  React.useEffect(() => {
    resources.mutate({ connectionId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId]);

  const filteredData = React.useMemo(() => {
    if (!resources.data) return [];
    if (!filter.trim()) return resources.data;
    const q = filter.toLowerCase().trim();
    return resources.data.filter((item) => {
      const nameMatch = item.resource.name.toLowerCase().includes(q);
      const idMatch = item.resource.externalId.toLowerCase().includes(q);
      const storeMatch = item.resource.storeId?.toLowerCase().includes(q);
      const bundleMatch = item.resource.bundleId?.toLowerCase().includes(q);
      const appNameMatch = item.linkedAppName?.toLowerCase().includes(q);
      const projectMatch = String(item.resource.metadata?.projectId ?? "")
        .toLowerCase()
        .includes(q);
      return nameMatch || idMatch || storeMatch || bundleMatch || appNameMatch || projectMatch;
    });
  }, [resources.data, filter]);

  return (
    <Card id="resource-linker" className="border-[var(--border-strong)] shadow-md">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-[var(--border)]">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="size-4 text-[var(--accent)]" />
            Link Apps to this Connection
          </CardTitle>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            Match remote accounts, Google Analytics streams, or AdMob properties to your tracked apps.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="ghost" size="sm" onClick={refetch} disabled={resources.isPending}>
            <RefreshCw className={resources.isPending ? "animate-spin" : ""} /> Refresh
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-4 flex flex-col gap-3">
        {resources.isPending ? (
          <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
            <Loader2 className="size-7 animate-spin text-[var(--accent)]" />
            <p className="text-sm font-medium text-[var(--text-primary)]">
              Fetching remote projects and apps...
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              Querying Google Firebase & Analytics endpoints
            </p>
          </div>
        ) : resources.error ? (
          <div className="rounded-lg border border-[var(--status-critical)] bg-[color-mix(in_oklab,var(--status-critical)_10%,transparent)] p-4">
            <div className="flex items-start gap-2.5">
              <TriangleAlert className="size-4 text-[var(--status-critical)] shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--status-critical)]">
                  Failed to load remote resources
                </p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  {resources.error.message}
                </p>
                <Button variant="secondary" size="sm" onClick={refetch} className="mt-3">
                  Retry
                </Button>
              </div>
            </div>
          </div>
        ) : resources.data?.length ? (
          <>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 size-4 text-[var(--text-muted)]" />
                <Input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter by app name, package ID, bundle ID..."
                  className="pl-8 text-xs h-9"
                />
              </div>
              <span className="text-xs text-[var(--text-muted)] self-center">
                Showing {filteredData.length} of {resources.data.length} resource{resources.data.length === 1 ? "" : "s"}
              </span>
            </div>

            <ul className="flex flex-col gap-2 max-h-[520px] overflow-y-auto pr-1">
              {filteredData.map(
                ({ resource, suggestedAppId, isLinked, linkedAppName, linkId }) => {
                  const effectiveStoreId = resource.storeId || resource.bundleId;
                  const isTrackAndLinking =
                    importAndLink.isPending &&
                    importAndLink.variables?.externalId === resource.externalId;
                  const isLinking =
                    link.isPending && link.variables?.externalId === resource.externalId;
                  const isUnlinking =
                    unlink.isPending && unlink.variables?.linkId === linkId;

                  return (
                    <li
                      key={resource.externalId}
                      className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-3 hover:border-[var(--border-strong)] transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="truncate text-sm font-medium text-[var(--text-primary)]">
                            {resource.name}
                          </span>
                          {resource.platform ? (
                            <Badge tone="neutral" className="text-[10px] font-mono uppercase px-1.5 py-0">
                              {resource.platform}
                            </Badge>
                          ) : null}
                          {isLinked ? (
                            <Badge tone="good" className="text-xs flex items-center gap-1">
                              <CheckCircle2 className="size-3" />
                              Linked to {linkedAppName ?? "App"}
                            </Badge>
                          ) : (
                            <Badge tone="neutral" className="text-[11px]">
                              Not linked
                            </Badge>
                          )}
                        </div>

                        <div className="mt-1 flex items-center gap-2 text-xs text-[var(--text-secondary)] flex-wrap">
                          {effectiveStoreId ? (
                            <code className="font-mono text-[11px] bg-[var(--page)] px-1.5 py-0.5 rounded border border-[var(--border)] text-[var(--text-primary)] select-all">
                              {effectiveStoreId}
                            </code>
                          ) : null}
                          {resource.metadata?.projectId ? (
                            <span className="text-[var(--text-muted)] text-[11px]">
                              Project: <strong className="font-normal text-[var(--text-secondary)]">{String(resource.metadata.projectId)}</strong>
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap shrink-0">
                        {isLinked && linkId ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isUnlinking}
                            onClick={() => unlink.mutate({ linkId })}
                            className="text-[var(--status-critical)] hover:bg-[var(--page)] text-xs h-8"
                          >
                            {isUnlinking ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Unplug className="size-3.5" />
                            )}
                            Unlink
                          </Button>
                        ) : (
                          <>
                            <Button
                              variant="primary"
                              size="sm"
                              disabled={isTrackAndLinking}
                              onClick={() =>
                                importAndLink.mutate({
                                  connectionId,
                                  platform: (resource.platform as "IOS" | "ANDROID") ?? "ANDROID",
                                  storeId: resource.storeId,
                                  bundleId: resource.bundleId,
                                  displayName: resource.name,
                                  externalId: resource.externalId,
                                  externalRef: resource.externalRef,
                                  metadata: resource.metadata as Record<string, unknown> | undefined,
                                })
                              }
                              className="text-xs h-8 whitespace-nowrap shadow-sm"
                            >
                              {isTrackAndLinking ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <Zap className="size-3.5" />
                              )}
                              Track & Link
                            </Button>

                            <form
                              className="flex items-center gap-1.5"
                              onSubmit={(e) => {
                                e.preventDefault();
                                const form = new FormData(e.currentTarget);
                                const appId = String(form.get("appId") ?? "");
                                if (!appId) {
                                  toast.error(
                                    "Please select an app from the dropdown or click 'Track & Link' to import it.",
                                  );
                                  return;
                                }

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
                              <Select
                                name="appId"
                                defaultValue={suggestedAppId ?? ""}
                                className="text-xs h-8 max-w-[170px]"
                              >
                                <option value="">Select tracked app...</option>
                                {apps.map((app) => (
                                  <option key={app.id} value={app.id}>
                                    {app.name}
                                  </option>
                                ))}
                              </Select>
                              <Button
                                variant="secondary"
                                size="sm"
                                type="submit"
                                disabled={isLinking}
                                className="text-xs h-8"
                              >
                                {isLinking ? <Loader2 className="size-3.5 animate-spin" /> : null}
                                Link
                              </Button>
                            </form>
                          </>
                        )}
                      </div>
                    </li>
                  );
                },
              )}
            </ul>
          </>
        ) : (
          <div className="py-8 text-center">
            <p className="text-sm font-medium text-[var(--text-secondary)]">
              No linkable resources found for this account.
            </p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Ensure this Google account has active Firebase projects with Android/iOS apps configured.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
