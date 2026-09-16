import { notFound } from "next/navigation";

import { AppTabs } from "@/app/(app)/apps/[appId]/app-tabs";
import { api } from "@/trpc/server";

export default async function AppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ appId: string }>;
}) {
  const { appId } = await params;

  const app = await api.apps.byId({ appId }).catch(() => null);
  if (!app) notFound();

  const listing = app.listings[0];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start gap-4">
        {app.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={app.iconUrl} alt="" className="size-14 rounded-2xl" />
        ) : (
          <div className="size-14 rounded-2xl bg-[var(--surface)]" />
        )}

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold tracking-tight">{app.name}</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            {app.platform === "IOS" ? "App Store" : "Google Play"} ·{" "}
            {app.country.toUpperCase()} · {app.storeId}
            {app.currentVersion ? ` · v${app.currentVersion}` : ""}
          </p>
          {listing?.subtitle ? (
            <p className="mt-1 truncate text-sm text-[var(--text-muted)]">{listing.subtitle}</p>
          ) : null}
        </div>

        {listing?.ratingAverage ? (
          <div className="text-right">
            <p className="tabular text-2xl font-semibold">{listing.ratingAverage.toFixed(2)}★</p>
            <p className="text-xs text-[var(--text-muted)]">
              {listing.ratingCount?.toLocaleString() ?? 0} ratings
            </p>
          </div>
        ) : null}
      </header>

      <AppTabs appId={appId} />

      {children}
    </div>
  );
}
