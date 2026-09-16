"use client";

import { Check, Plus, Search, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Input,
  Label,
  PageHeader,
  Select,
  Skeleton,
} from "@/components/ui/primitives";
import { api } from "@/trpc/react";
import { detectStoreInput } from "@/lib/store-detect";

const COUNTRIES = ["us", "gb", "ca", "au", "de", "fr", "es", "it", "br", "mx", "jp", "kr", "in"];

export default function NewAppPage() {
  const router = useRouter();
  const utils = api.useUtils();

  const [platform, setPlatform] = React.useState<"IOS" | "ANDROID">("IOS");
  const [country, setCountry] = React.useState("us");
  const [term, setTerm] = React.useState("");
  const [submitted, setSubmitted] = React.useState("");
  const [pendingStoreId, setPendingStoreId] = React.useState<string | null>(null);

  const existingApps = api.apps.list.useQuery();

  const search = api.apps.search.useQuery(
    { platform, term: submitted, country },
    { enabled: submitted.length >= 2 },
  );

  const create = api.apps.create.useMutation({
    onSuccess: async (app) => {
      setPendingStoreId(null);
      toast.success(`${app.name} added! Listing snapshot and keyword tracking are queued.`);
      await utils.apps.list.invalidate();
      router.push(`/apps/${app.id}`);
    },
    onError: (error) => {
      setPendingStoreId(null);
      toast.error(error.message);
    },
  });

  const handleTrack = (storeId: string) => {
    setPendingStoreId(storeId);
    create.mutate({
      platform,
      storeId,
      country,
      locale: "en-US",
    });
  };

  const getExistingApp = (storeId: string) => {
    return existingApps.data?.find(
      (a) => a.storeId.toLowerCase() === storeId.toLowerCase() && a.platform === platform,
    );
  };

  const isExactSingleMatch = search.data && search.data.length === 1;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Add an app"
        description="Search by app name, or paste a Google Play / App Store link or package ID directly."
      />

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-[140px_120px_1fr]">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="platform">Store</Label>
              <Select
                id="platform"
                value={platform}
                onChange={(e) => setPlatform(e.target.value as "IOS" | "ANDROID")}
              >
                <option value="IOS">App Store</option>
                <option value="ANDROID">Google Play</option>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="country">Country</Label>
              <Select id="country" value={country} onChange={(e) => setCountry(e.target.value)}>
                {COUNTRIES.map((code) => (
                  <option key={code} value={code}>
                    {code.toUpperCase()}
                  </option>
                ))}
              </Select>
            </div>

            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setSubmitted(term.trim());
              }}
            >
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="term">App URL, name, or package id</Label>
                <Input
                  id="term"
                  value={term}
                  onChange={(e) => {
                    const val = e.target.value;
                    setTerm(val);
                    const detected = detectStoreInput(val);
                    if (detected.platform && detected.platform !== platform) {
                      setPlatform(detected.platform);
                    }
                    if (detected.country && detected.country !== country) {
                      setCountry(detected.country);
                    }
                  }}
                  placeholder={
                    platform === "IOS"
                      ? "e.g. Duolingo, 570060128, or App Store URL"
                      : "e.g. com.duolingo or Google Play URL"
                  }
                />
              </div>
              <Button variant="primary" type="submit" disabled={search.isFetching}>
                <Search className="size-4" /> Search
              </Button>
            </form>
          </div>

          <p className="text-xs text-[var(--text-muted)]">
            Store searches are rate limited and live-scraped from official store endpoints.
          </p>
        </CardContent>
      </Card>

      {search.isFetching ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      ) : null}

      {search.error ? (
        <Card className="border-[var(--status-critical)]/40 bg-[var(--status-critical)]/5">
          <CardContent className="py-4 text-sm text-[var(--status-critical)]">
            {search.error.message}
          </CardContent>
        </Card>
      ) : null}

      {search.data?.length ? (
        <div className="flex flex-col gap-4">
          {/* Featured / Direct App Card */}
          {search.data[0] ? (
            (() => {
              const app = search.data[0];
              const existing = getExistingApp(app.storeId);
              const isTracking = create.isPending && pendingStoreId === app.storeId;

              return (
                <Card className="border-[var(--accent)]/30 bg-[var(--card)] shadow-lg shadow-black/20">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkles className="size-4 text-[var(--accent)]" />
                        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">
                          {isExactSingleMatch ? "App Found" : "Top Result"}
                        </span>
                      </div>
                      <Badge tone="neutral">
                        {platform === "IOS" ? "Apple App Store" : "Google Play"} · {country.toUpperCase()}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4 pt-2">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                      <div className="relative size-20 shrink-0 overflow-hidden rounded-2xl bg-[var(--page)] ring-1 ring-[var(--border)]">
                        {app.iconUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={app.iconUrl}
                            alt={app.name}
                            className="size-full object-cover"
                          />
                        ) : (
                          <div className="flex size-full items-center justify-center font-bold text-[var(--text-muted)]">
                            {app.name.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <h3 className="text-lg font-bold text-[var(--text-primary)]">{app.name}</h3>
                        <p className="text-sm text-[var(--text-secondary)]">
                          {app.developer ?? app.storeId}
                        </p>
                        <p className="mt-1 font-mono text-xs text-[var(--text-muted)]">
                          {app.storeId}
                        </p>
                        {app.ratingAverage ? (
                          <p className="mt-1.5 tabular text-xs text-[var(--text-muted)]">
                            <span className="font-semibold text-amber-400">
                              ★ {app.ratingAverage.toFixed(2)}
                            </span>
                            {app.ratingCount ? ` · ${app.ratingCount.toLocaleString()} ratings` : ""}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex sm:flex-col items-center gap-2">
                        {existing ? (
                          <Button
                            variant="secondary"
                            className="w-full sm:w-auto"
                            onClick={() => router.push(`/apps/${existing.id}`)}
                          >
                            <Check className="mr-1.5 size-4 text-[var(--status-healthy)]" />
                            View in Dashboard
                          </Button>
                        ) : (
                          <Button
                            variant="primary"
                            size="lg"
                            className="w-full sm:w-auto px-6 font-semibold"
                            disabled={create.isPending}
                            onClick={() => handleTrack(app.storeId)}
                          >
                            {isTracking ? (
                              "Adding App..."
                            ) : (
                              <>
                                <Plus className="mr-1.5 size-4" /> Track App
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })()
          ) : null}

          {/* Additional search results if searching generic terms */}
          {search.data.length > 1 ? (
            <div className="flex flex-col gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] px-1">
                Other Matching Apps ({search.data.length - 1})
              </h4>
              <ul className="flex flex-col gap-2">
                {search.data.slice(1).map((result) => {
                  const existing = getExistingApp(result.storeId);
                  const isTracking = create.isPending && pendingStoreId === result.storeId;

                  return (
                    <li key={result.storeId}>
                      <Card className="hover:border-[var(--border-strong)] transition-colors">
                        <CardContent className="flex items-center gap-3 py-3">
                          <div className="size-12 shrink-0 overflow-hidden rounded-xl bg-[var(--page)] ring-1 ring-[var(--border)]">
                            {result.iconUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={result.iconUrl}
                                alt=""
                                className="size-full object-cover"
                              />
                            ) : (
                              <div className="flex size-full items-center justify-center text-xs font-bold text-[var(--text-muted)]">
                                {result.name.slice(0, 2).toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                              {result.name}
                            </p>
                            <p className="truncate text-xs text-[var(--text-secondary)]">
                              {result.developer ?? result.storeId}
                            </p>
                            {result.ratingAverage ? (
                              <p className="tabular text-xs text-[var(--text-muted)]">
                                {result.ratingAverage.toFixed(2)}★
                                {result.ratingCount
                                  ? ` · ${result.ratingCount.toLocaleString()} ratings`
                                  : ""}
                              </p>
                            ) : null}
                          </div>
                          {existing ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => router.push(`/apps/${existing.id}`)}
                            >
                              <Check className="mr-1 size-3.5 text-[var(--status-healthy)]" />
                              Added
                            </Button>
                          ) : (
                            <Button
                              variant="primary"
                              size="sm"
                              disabled={create.isPending}
                              onClick={() => handleTrack(result.storeId)}
                            >
                              {isTracking ? "Adding..." : "Track"}
                            </Button>
                          )}
                        </CardContent>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
      ) : submitted && !search.isFetching ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-[var(--text-secondary)]">
            <p>No app found for &quot;{submitted}&quot; in the {country.toUpperCase()} store.</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Try pasting the full Play Store / App Store link or the exact bundle/package ID.
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

