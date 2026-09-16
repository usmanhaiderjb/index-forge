import "server-only";

import { toUtcDate, withRetry, ymd } from "@aso/shared";
import { getSearchAdsToken } from "@/server/integrations/apple/search-ads-auth";
import {
  buildDimension,
  ReauthRequiredError,
  type AppleSearchAdsCredentials,
  type Connector,
  type FetchContext,
  type MetricRow,
  type RemoteResource,
  type TestResult,
} from "@/server/integrations/types";

// Pinned: Apple ships breaking changes as new major versions and leaves the
// old one serving until it is switched off.
const API = "https://api.searchads.apple.com/api/v5";

/** Apple wraps money as an object so the currency travels with the amount. */
type Money = { amount?: string; currency?: string };

type ReportRow = {
  metadata?: {
    campaignId?: number;
    campaignName?: string;
    adamId?: number;
    app?: { adamId?: number; appName?: string };
    countriesOrRegions?: string[];
  };
  granularity?: Array<{
    date?: string;
    impressions?: number;
    taps?: number;
    installs?: number;
    newDownloads?: number;
    redownloads?: number;
    localSpend?: Money;
    avgCPA?: Money;
    avgCPT?: Money;
    conversionRate?: number;
    ttr?: number;
  }>;
};

async function searchAdsFetch<T>(opts: {
  credentials: AppleSearchAdsCredentials;
  path: string;
  body?: unknown;
}): Promise<T> {
  return withRetry(async () => {
    const token = await getSearchAdsToken(opts.credentials);

    const res = await fetch(`${API}/${opts.path}`, {
      method: opts.body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        // Every request must name the org; without it Apple returns the
        // caller's default org, which may not be the one that was connected.
        "X-AP-Context": `orgId=${opts.credentials.orgId}`,
        "Content-Type": "application/json",
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });

    if (res.status === 401) {
      throw new ReauthRequiredError("Apple Search Ads rejected the access token");
    }

    if (!res.ok) {
      const text = await res.text();
      if (res.status === 403) {
        throw new ReauthRequiredError(
          `Apple Search Ads access denied for org ${opts.credentials.orgId}. The API user needs at least the Read Only role. ${text.slice(0, 200)}`,
        );
      }
      throw Object.assign(
        new Error(`Apple Search Ads ${res.status}: ${text.slice(0, 400)}`),
        { status: res.status },
      );
    }

    return (await res.json()) as T;
  });
}

/** Apple returns money as a decimal string; a bad parse must not become zero spend. */
function money(value: Money | undefined): number | null {
  if (!value?.amount) return null;
  const parsed = Number(value.amount);
  return Number.isFinite(parsed) ? parsed : null;
}

export const appleSearchAdsConnector: Connector = {
  provider: "APPLE_SEARCH_ADS",
  source: "APPLE_SEARCH_ADS",
  // Key-based, not OAuth-redirect based: nothing to request from the user.
  scopes: [],

  async test(credentials): Promise<TestResult> {
    if (credentials.kind !== "apple-search-ads") {
      return { ok: false, detail: "Apple Search Ads requires a Search Ads API key" };
    }

    try {
      const res = await searchAdsFetch<{
        data?: Array<{ orgId?: number; orgName?: string; currency?: string; roleNames?: string[] }>;
      }>({ credentials, path: "acls" });

      const orgs = res.data ?? [];
      const match = orgs.find((org) => String(org.orgId) === String(credentials.orgId));

      if (!match) {
        return {
          ok: false,
          detail: orgs.length
            ? `This key has no access to org ${credentials.orgId}. It can reach: ${orgs
                .map((o) => `${o.orgName ?? "?"} (${o.orgId})`)
                .join(", ")}`
            : "This key has no Search Ads org access at all",
        };
      }

      return {
        ok: true,
        detail: `${match.orgName ?? credentials.orgId}${
          match.roleNames?.length ? ` · ${match.roleNames.join(", ")}` : ""
        }`,
        externalId: String(match.orgId),
        externalName: match.orgName,
      };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : "Unknown error" };
    }
  },

  /**
   * Lists the apps being promoted, not the campaigns.
   *
   * Campaigns come and go every time someone restructures an account, and a
   * link keyed to a campaign id would break when they do. The promoted app is
   * stable, and its adamId is the App Store id, so it auto-matches an existing
   * app without the user picking anything.
   */
  async listResources(credentials): Promise<RemoteResource[]> {
    if (credentials.kind !== "apple-search-ads") return [];

    const res = await searchAdsFetch<{
      data?: Array<{
        id?: number;
        name?: string;
        adamId?: number;
        status?: string;
        servingStatus?: string;
        countriesOrRegions?: string[];
      }>;
    }>({
      credentials,
      path: "campaigns/find",
      body: {
        // Deleted campaigns still describe a promoted app, but an account that
        // stopped advertising an app should not keep appearing as linkable.
        selector: {
          conditions: [{ field: "status", operator: "IN", values: ["ENABLED", "PAUSED"] }],
          pagination: { offset: 0, limit: 1000 },
        },
      },
    });

    const byApp = new Map<string, RemoteResource>();

    for (const campaign of res.data ?? []) {
      if (!campaign.adamId) continue;
      const adamId = String(campaign.adamId);

      const existing = byApp.get(adamId);
      if (existing) {
        const count = ((existing.metadata?.campaigns as number | undefined) ?? 1) + 1;
        existing.metadata = { ...existing.metadata, campaigns: count };
        continue;
      }

      byApp.set(adamId, {
        externalId: adamId,
        // The campaign name is the advertiser's label, not the app's name, so
        // it is kept as metadata rather than presented as the app.
        name: `App ${adamId}`,
        platform: "IOS",
        storeId: adamId,
        metadata: {
          campaigns: 1,
          sampleCampaignName: campaign.name,
          currency: credentials.currency ?? "USD",
        },
      });
    }

    return [...byApp.values()];
  },

  async fetchMetrics(ctx: FetchContext): Promise<MetricRow[]> {
    if (ctx.credentials.kind !== "apple-search-ads") return [];

    const credentials = ctx.credentials;
    const currency = (ctx.linkMetadata?.currency as string | undefined) ?? credentials.currency ?? "USD";

    const res = await searchAdsFetch<{
      data?: { reportingDataResponse?: { row?: ReportRow[] } };
    }>({
      credentials,
      path: "reports/campaigns",
      body: {
        startTime: ymd(ctx.start),
        endTime: ymd(ctx.end),
        granularity: "DAILY",
        // Rows for days with no activity, so a zero-spend day is recorded as
        // zero rather than left as a hole the chart would interpolate over.
        returnRecordsWithNoMetrics: true,
        returnRowTotals: false,
        selector: {
          orderBy: [{ field: "campaignId", sortOrder: "ASCENDING" }],
          pagination: { offset: 0, limit: 1000 },
        },
        timeZone: credentials.timeZone ?? "UTC",
      },
    });

    const rows = res.data?.reportingDataResponse?.row ?? [];
    const out: MetricRow[] = [];

    for (const row of rows) {
      // One report covers the whole org; keep only the campaigns promoting the
      // app this resource link points at.
      const adamId = row.metadata?.adamId ?? row.metadata?.app?.adamId;
      if (adamId !== undefined && String(adamId) !== ctx.externalId) continue;

      const campaignId = row.metadata?.campaignId;
      const dimension = buildDimension({ campaign: campaignId });
      const meta = { campaignName: row.metadata?.campaignName };

      for (const day of row.granularity ?? []) {
        if (!day.date) continue;
        const date = toUtcDate(day.date);

        const push = (metric: MetricRow["metric"], value: number | null | undefined) => {
          if (value === null || value === undefined || !Number.isFinite(value)) return;
          out.push({ date, metric, value, dimension, currency, meta });
        };

        const spend = money(day.localSpend);

        push("SPEND", spend);
        push("IMPRESSIONS", day.impressions);
        push("PAID_CLICKS", day.taps);
        // `installs` is Apple's conversion count for the campaign. It counts
        // redownloads too, which is why it can exceed new downloads.
        push("PAID_INSTALLS", day.installs);
        push("CPI", money(day.avgCPA));
        push("CPC", money(day.avgCPT));
      }
    }

    return out;
  },
};
