import "server-only";

import { toUtcDate } from "@aso/shared";
import { GOOGLE_SCOPES, googleApiFetch } from "@/server/integrations/google/oauth";
import {
  buildDimension,
  type Connector,
  type FetchContext,
  type GoogleCredentials,
  type MetricRow,
  type RemoteResource,
  type TestResult,
} from "@/server/integrations/types";

const ADMOB_API = "https://admob.googleapis.com/v1";

type AdMobAccount = {
  name: string;
  publisherId: string;
  currencyCode?: string;
  reportingTimeZone?: string;
};

type AdMobApp = {
  name: string;
  appId: string;
  platform?: "IOS" | "ANDROID";
  manualAppInfo?: { displayName?: string };
  linkedAppInfo?: { appStoreId?: string; displayName?: string };
};

/**
 * The Network Report streams newline-delimited JSON rows wrapped in an array.
 * Each element is one of: header, row, footer.
 */
type AdMobReportItem = {
  header?: unknown;
  row?: {
    dimensionValues?: Record<string, { value?: string; displayLabel?: string }>;
    metricValues?: Record<string, { integerValue?: string; doubleValue?: number; microsValue?: string }>;
  };
  footer?: { matchingRowCount?: string; warnings?: { description?: string }[] };
};

function dateToApiDate(date: Date) {
  const d = toUtcDate(date);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

async function listAccounts(
  connectionId: string,
  credentials: GoogleCredentials,
): Promise<AdMobAccount[]> {
  const res = await googleApiFetch<{ account?: AdMobAccount[] }>({
    connectionId,
    credentials,
    url: `${ADMOB_API}/accounts?pageSize=100`,
  });
  return res.account ?? [];
}

export const admobConnector: Connector = {
  provider: "ADMOB",
  source: "ADMOB",
  scopes: [...GOOGLE_SCOPES.ADMOB],

  async test(credentials, connection): Promise<TestResult> {
    if (credentials.kind !== "google-oauth") {
      return { ok: false, detail: "AdMob requires a Google OAuth connection" };
    }
    try {
      const accounts = await listAccounts(connection.id, credentials);
      const first = accounts[0];
      if (!first) {
        return { ok: false, detail: "This Google account has no AdMob publisher account" };
      }
      return {
        ok: true,
        detail: `Publisher ${first.publisherId}`,
        externalId: first.publisherId,
        externalName: first.name,
      };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : "Unknown error" };
    }
  },

  async listResources(credentials, connection): Promise<RemoteResource[]> {
    if (credentials.kind !== "google-oauth") return [];

    const accounts = await listAccounts(connection.id, credentials);
    const resources: RemoteResource[] = [];

    for (const account of accounts) {
      let pageToken: string | undefined;
      do {
        const url = new URL(`${ADMOB_API}/${account.name}/apps`);
        url.searchParams.set("pageSize", "100");
        if (pageToken) url.searchParams.set("pageToken", pageToken);

        const res = await googleApiFetch<{ apps?: AdMobApp[]; nextPageToken?: string }>({
          connectionId: connection.id,
          credentials,
          url: url.toString(),
        });

        for (const app of res.apps ?? []) {
          resources.push({
            externalId: app.appId,
            name:
              app.linkedAppInfo?.displayName ??
              app.manualAppInfo?.displayName ??
              app.appId,
            platform: app.platform,
            storeId: app.linkedAppInfo?.appStoreId,
            metadata: {
              accountName: account.name,
              publisherId: account.publisherId,
              currency: account.currencyCode ?? "USD",
            },
          });
        }
        pageToken = res.nextPageToken;
      } while (pageToken);
    }

    return resources;
  },

  async fetchMetrics(ctx: FetchContext): Promise<MetricRow[]> {
    if (ctx.credentials.kind !== "google-oauth") return [];

    const accountName =
      (ctx.linkMetadata?.accountName as string | undefined) ??
      (ctx.linkMetadata?.publisherId
        ? `accounts/${ctx.linkMetadata.publisherId as string}`
        : undefined);

    if (!accountName) {
      throw new Error("AdMob account is missing from the resource link; re-sync resources.");
    }

    const currency = (ctx.linkMetadata?.currency as string | undefined) ?? "USD";

    const report = await googleApiFetch<AdMobReportItem[]>({
      connectionId: ctx.connection.id,
      credentials: ctx.credentials,
      url: `${ADMOB_API}/${accountName}/networkReport:generate`,
      method: "POST",
      body: {
        reportSpec: {
          dateRange: { startDate: dateToApiDate(ctx.start), endDate: dateToApiDate(ctx.end) },
          dimensions: ["DATE", "APP", "COUNTRY"],
          metrics: [
            "ESTIMATED_EARNINGS",
            "IMPRESSIONS",
            "CLICKS",
            "AD_REQUESTS",
            "MATCH_RATE",
            "IMPRESSION_RPM",
          ],
          dimensionFilters: [
            { dimension: "APP", matchesAny: { values: [ctx.externalId] } },
          ],
          localizationSettings: { currencyCode: currency },
        },
      },
    });

    const rows: MetricRow[] = [];

    for (const item of report) {
      const row = item.row;
      if (!row) continue;

      const rawDate = row.dimensionValues?.DATE?.value;
      if (!rawDate || rawDate.length !== 8) continue;
      const date = toUtcDate(
        `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`,
      );

      const country = (row.dimensionValues?.COUNTRY?.value ?? "unknown").toLowerCase();
      const dimension = buildDimension({ country });

      const earningsMicros = Number(row.metricValues?.ESTIMATED_EARNINGS?.microsValue ?? 0);
      const impressions = Number(row.metricValues?.IMPRESSIONS?.integerValue ?? 0);
      const clicks = Number(row.metricValues?.CLICKS?.integerValue ?? 0);
      const matchRate = Number(row.metricValues?.MATCH_RATE?.doubleValue ?? 0);
      const rpmMicros = Number(row.metricValues?.IMPRESSION_RPM?.microsValue ?? 0);

      const push = (metric: MetricRow["metric"], value: number) => {
        if (!Number.isFinite(value)) return;
        rows.push({ date, metric, value, dimension, currency });
      };

      push("AD_REVENUE", earningsMicros / 1_000_000);
      push("AD_IMPRESSIONS", impressions);
      push("AD_CLICKS", clicks);
      // AdMob reports RPM (per 1000); eCPM is the same figure for our purposes.
      push("AD_ECPM", rpmMicros / 1_000_000);
      push("AD_FILL_RATE", matchRate * 100);
    }

    return rows;
  },
};
