"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import {
  Button,
  Card,
  CardContent,
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

  const search = api.apps.search.useQuery(
    { platform, term: submitted, country },
    { enabled: submitted.length >= 2 },
  );

  const create = api.apps.create.useMutation({
    onSuccess: async (app) => {
      toast.success(`${app.name} added. The first listing snapshot is queued.`);
      await utils.apps.list.invalidate();
      router.push(`/apps/${app.id}`);
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Add an app"
        description="Search the store, or paste a numeric App Store id / Android package name directly."
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
                <Label htmlFor="term">App name or id</Label>
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
                  placeholder={platform === "IOS" ? "e.g. Duolingo or 570060128" : "e.g. com.duolingo"}
                />
              </div>
              <Button variant="primary" type="submit">
                <Search /> Search
              </Button>
            </form>
          </div>

          <p className="text-xs text-[var(--text-muted)]">
            Store searches are rate limited and shared across your workspace, so results may take a
            second.
          </p>
        </CardContent>
      </Card>

      {search.isFetching ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : null}

      {search.error ? (
        <p className="text-sm text-[var(--status-critical)]">{search.error.message}</p>
      ) : null}

      {search.data?.length ? (
        <ul className="flex flex-col gap-2">
          {search.data.map((result) => (
            <li key={result.storeId}>
              <Card>
                <CardContent className="flex items-center gap-3">
                  {result.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={result.iconUrl} alt="" className="size-12 rounded-xl" />
                  ) : (
                    <div className="size-12 rounded-xl bg-[var(--page)]" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{result.name}</p>
                    <p className="truncate text-xs text-[var(--text-secondary)]">
                      {result.developer ?? result.storeId}
                    </p>
                    {result.ratingAverage ? (
                      <p className="tabular text-xs text-[var(--text-muted)]">
                        {result.ratingAverage.toFixed(2)}★ · {result.ratingCount?.toLocaleString() ?? 0}{" "}
                        ratings
                      </p>
                    ) : null}
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={create.isPending}
                    onClick={() =>
                      create.mutate({
                        platform,
                        storeId: result.storeId,
                        country,
                        locale: "en-US",
                      })
                    }
                  >
                    Track
                  </Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      ) : submitted && !search.isFetching ? (
        <p className="text-sm text-[var(--text-secondary)]">
          No results. Try the exact store id instead.
        </p>
      ) : null}
    </div>
  );
}
