"use client";

import { Plus, RefreshCw } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { Badge, Button, Card, CardContent, EmptyState, PageHeader, Skeleton } from "@/components/ui/primitives";
import { api } from "@/trpc/react";

export default function AppsPage() {
  const utils = api.useUtils();
  const apps = api.apps.list.useQuery();

  const refresh = api.apps.refresh.useMutation({
    onSuccess: () => toast.success("Refresh queued — the worker will pick it up shortly"),
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Apps"
        description="Every app you track, across both stores."
        actions={
          <Link href="/apps/new">
            <Button variant="primary">
              <Plus /> Add app
            </Button>
          </Link>
        }
      />

      {apps.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : apps.data?.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {apps.data.map((app) => (
            <Card key={app.id}>
              <CardContent className="flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  {app.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={app.iconUrl} alt="" className="size-12 rounded-xl" />
                  ) : (
                    <div className="size-12 rounded-xl bg-[var(--page)]" />
                  )}
                  <div className="min-w-0 flex-1">
                    <Link href={`/apps/${app.id}`} className="block truncate font-medium hover:underline">
                      {app.name}
                    </Link>
                    <p className="truncate text-xs text-[var(--text-secondary)]">
                      {app.developer ?? "Unknown developer"}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <Badge tone="accent">
                        {app.platform === "IOS" ? "App Store" : "Google Play"}
                      </Badge>
                      <Badge>{app.country.toUpperCase()}</Badge>
                      {!app.isActive ? <Badge tone="warning">Paused</Badge> : null}
                    </div>
                  </div>
                </div>

                <dl className="grid grid-cols-3 gap-2 border-t border-[var(--border)] pt-3 text-center">
                  <div>
                    <dt className="text-xs text-[var(--text-muted)]">Keywords</dt>
                    <dd className="tabular text-sm font-medium">{app._count.keywords}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--text-muted)]">Competitors</dt>
                    <dd className="tabular text-sm font-medium">{app._count.competitors}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--text-muted)]">Reviews</dt>
                    <dd className="tabular text-sm font-medium">{app._count.reviews}</dd>
                  </div>
                </dl>

                <div className="flex gap-2">
                  <Link href={`/apps/${app.id}`} className="flex-1">
                    <Button variant="secondary" size="sm" className="w-full">
                      Open
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={refresh.isPending}
                    onClick={() =>
                      refresh.mutate({ appId: app.id }, { onSuccess: () => void utils.apps.list.invalidate() })
                    }
                    aria-label={`Refresh ${app.name}`}
                  >
                    <RefreshCw />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No apps tracked yet"
          description="Search either store for an app and it will be added with its current listing, ready for keyword and review tracking."
          action={
            <Link href="/apps/new">
              <Button variant="primary">
                <Plus /> Add app
              </Button>
            </Link>
          }
        />
      )}
    </div>
  );
}
