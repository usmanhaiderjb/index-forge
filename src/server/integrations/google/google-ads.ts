import "server-only";

import { env } from "@/env";
import { toUtcDate, withRetry, ymd } from "@aso/shared";
import { GOOGLE_SCOPES, getFreshGoogleToken } from "@/server/integrations/google/oauth";
import {
  buildDimension,
  IntegrationNotConfiguredError,
  ReauthRequiredError,
  type Connector,
  type FetchContext,
  type GoogleCredentials,
  type MetricRow,
  type RemoteResource,
  type TestResult,
} from "@/server/integrations/types";

// Pin the version: Google Ads deprecates versions on a fixed schedule and a
// silent bump changes response shapes.
const ADS_API = "https://googleads.googleapis.com/v18";

type AdsRow = {
  campaign?: { id?: string; name?: string; advertisingChannelType?: string };
  customer?: { id?: string; descriptiveName?: string; currencyCode?: string };
  segments?: { date?: string };
  metrics?: {
    costMicros?: string;
    impressions?: string;
    clicks?: string;
    conversions?: number;
    conversionsValue?: number;
    allConversions?: number;
  };
};

function requireDeveloperToken(): string {
  if (!env.GOOGLE_ADS_DEVELOPER_TOKEN) {
    throw new IntegrationNotConfiguredError("GOOGLE_ADS_DEVELOPER_TOKEN");
  }
  return env.GOOGLE_ADS_DEVELOPER_TOKEN;
}

async function adsFetch<T>(opts: {
  connectionId: string;
  credentials: GoogleCredentials;
  path: string;
  body?: unknown;
  loginCustomerId?: string;
}): Promise<T> {
  const developerToken = requireDeveloperToken();

  return withRetry(async () => {
    const { accessToken } = await getFreshGoogleToken(opts.connectionId, opts.credentials);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": developerToken,
      "Content-Type": "application/json",
    };
    const loginCustomerId = opts.loginCustomerId ?? env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
    if (loginCustomerId) headers["login-customer-id"] = loginCustomerId.replace(/-/g, "");

    const res = await fetch(`${ADS_API}/${opts.path}`, {
      method: opts.body === undefined ? "GET" : "POST",
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });

    if (res.status === 401) throw new ReauthRequiredError("Google Ads rejected the access token");
    if (!res.ok) {
      const text = await res.text();
      if (res.status === 403 && /DEVELOPER_TOKEN|CUSTOMER_NOT_ENABLED|USER_PERMISSION_DENIED/i.test(text)) {
        throw new ReauthRequiredError(`Google Ads access denied: ${text.slice(0, 400)}`);
      }
      throw Object.assign(new Error(`Google Ads ${res.status}: ${text.slice(0, 400)}`), {
        status: res.status,
      });
    }

    return (await res.json()) as T;
  });
}

async function search(
  connectionId: string,
  credentials: GoogleCredentials,
  customerId: string,
  query: string,
  loginCustomerId?: string,
): Promise<AdsRow[]> {
  const rows: AdsRow[] = [];
  let pageToken: string | undefined;

  do {
    const res = await adsFetch<{ results?: AdsRow[]; nextPageToken?: string }>({
      connectionId,
      credentials,
      path: `customers/${customerId}/googleAds:search`,
      body: { query, pageSize: 10000, ...(pageToken ? { pageToken } : {}) },
      loginCustomerId,
    });
    rows.push(...(res.results ?? []));
    pageToken = res.nextPageToken;
  } while (pageToken);

  return rows;
}

export const googleAdsConnector: Connector = {
  provider: "GOOGLE_ADS",
  source: "GOOGLE_ADS",
  scopes: [...GOOGLE_SCOPES.GOOGLE_ADS],

  async test(credentials, connection): Promise<TestResult> {
    if (credentials.kind !== "google-oauth") {
      return { ok: false, detail: "Google Ads requires a Google OAuth connection" };
    }
    try {
      const res = await adsFetch<{ resourceNames?: string[] }>({
        connectionId: connection.id,
        credentials,
        path: "customers:listAccessibleCustomers",
      });
      const count = res.resourceNames?.length ?? 0;
      return {
        ok: count > 0,
        detail: count
          ? `${count} accessible Ads account${count === 1 ? "" : "s"}`
          : "No accessible Google Ads accounts for this login",
      };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : "Unknown error" };
    }
  },

  async listResources(credentials, connection): Promise<RemoteResource[]> {
    if (credentials.kind !== "google-oauth") return [];

    const accessible = await adsFetch<{ resourceNames?: string[] }>({
      connectionId: connection.id,
      credentials,
      path: "customers:listAccessibleCustomers",
    });

    const resources: RemoteResource[] = [];

    for (const resourceName of accessible.resourceNames ?? []) {
      const customerId = resourceName.split("/").pop();
      if (!customerId) continue;

      try {
        // A manager account has no campaigns of its own; expand it to its
        // children so app campaigns are actually reachable.
        const rows = await search(
          connection.id,
          credentials,
          customerId,
          `SELECT customer_client.id, customer_client.descriptive_name,
                  customer_client.currency_code, customer_client.manager
           FROM customer_client
           WHERE customer_client.status = 'ENABLED'`,
          customerId,
        );

        const clients = rows as unknown as {
          customerClient?: {
            id?: string;
            descriptiveName?: string;
            currencyCode?: string;
            manager?: boolean;
          };
        }[];

        for (const row of clients) {
          const client = row.customerClient;
          if (!client?.id || client.manager) continue;
          resources.push({
            externalId: client.id,
            name: client.descriptiveName ?? client.id,
            metadata: {
              currency: client.currencyCode ?? "USD",
              loginCustomerId: customerId,
            },
          });
        }
      } catch {
        // Fall back to the bare account when customer_client is not readable.
        resources.push({
          externalId: customerId,
          name: `Ads account ${customerId}`,
          metadata: { currency: "USD" },
        });
      }
    }

    // Deduplicate: the same client shows up under every manager it belongs to.
    const seen = new Set<string>();
    return resources.filter((r) => {
      if (seen.has(r.externalId)) return false;
      seen.add(r.externalId);
      return true;
    });
  },

  async fetchMetrics(ctx: FetchContext): Promise<MetricRow[]> {
    if (ctx.credentials.kind !== "google-oauth") return [];

    const currency = (ctx.linkMetadata?.currency as string | undefined) ?? "USD";
    const loginCustomerId = ctx.linkMetadata?.loginCustomerId as string | undefined;

    const query = `
      SELECT campaign.id, campaign.name, campaign.advertising_channel_type,
             segments.date,
             metrics.cost_micros, metrics.impressions, metrics.clicks,
             metrics.conversions, metrics.conversions_value
      FROM campaign
      WHERE segments.date BETWEEN '${ymd(ctx.start)}' AND '${ymd(ctx.end)}'
        AND campaign.advertising_channel_type IN ('MULTI_CHANNEL', 'APP_CAMPAIGN')
    `;

    let rows: AdsRow[];
    try {
      rows = await search(ctx.connection.id, ctx.credentials, ctx.externalId, query, loginCustomerId);
    } catch (err) {
      // Older accounts reject the channel-type filter; retry unfiltered.
      const message = err instanceof Error ? err.message : "";
      if (!/advertising_channel_type|INVALID_VALUE|QueryError/i.test(message)) throw err;
      rows = await search(
        ctx.connection.id,
        ctx.credentials,
        ctx.externalId,
        query.replace(/AND campaign\.advertising_channel_type[^\n]*\n/, ""),
        loginCustomerId,
      );
    }

    const out: MetricRow[] = [];

    for (const row of rows) {
      const rawDate = row.segments?.date;
      if (!rawDate) continue;
      const date = toUtcDate(rawDate);
      const campaignId = row.campaign?.id ?? "unknown";
      const dimension = buildDimension({ campaign: campaignId });

      const spend = Number(row.metrics?.costMicros ?? 0) / 1_000_000;
      const impressions = Number(row.metrics?.impressions ?? 0);
      const clicks = Number(row.metrics?.clicks ?? 0);
      const conversions = Number(row.metrics?.conversions ?? 0);
      const conversionValue = Number(row.metrics?.conversionsValue ?? 0);

      const push = (metric: MetricRow["metric"], value: number) => {
        if (!Number.isFinite(value)) return;
        out.push({
          date,
          metric,
          value,
          dimension,
          currency,
          meta: { campaignName: row.campaign?.name },
        });
      };

      push("SPEND", spend);
      push("IMPRESSIONS", impressions);
      push("PAID_CLICKS", clicks);
      push("PAID_INSTALLS", conversions);
      if (conversions > 0) push("CPI", spend / conversions);
      if (clicks > 0) push("CPC", spend / clicks);
      if (spend > 0) push("ROAS", (conversionValue / spend) * 100);
    }

    return out;
  },
};
