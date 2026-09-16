import "server-only";

import { type MetricKey } from "@prisma/client";

import { toUtcDate, ymd } from "@aso/shared";
import {
  GOOGLE_SCOPES,
  googleApiFetch,
} from "@/server/integrations/google/oauth";
import {
  buildDimension,
  type Connector,
  type FetchContext,
  type GoogleCredentials,
  type MetricRow,
  type RemoteResource,
  type TestResult,
} from "@/server/integrations/types";

const FIREBASE_API = "https://firebase.googleapis.com/v1beta1";
const GA_ADMIN_API = "https://analyticsadmin.googleapis.com/v1beta";
const GA_DATA_API = "https://analyticsdata.googleapis.com/v1beta";

type FirebaseProject = { projectId: string; displayName?: string; name: string };
type FirebaseAndroidApp = {
  name: string;
  appId: string;
  displayName?: string;
  packageName: string;
};
type FirebaseIosApp = {
  name: string;
  appId: string;
  displayName?: string;
  bundleId: string;
  appStoreId?: string;
};

type GaAccountSummary = {
  account: string;
  displayName: string;
  propertySummaries?: { property: string; displayName: string; propertyType?: string }[];
};

type GaRunReportResponse = {
  dimensionHeaders?: { name: string }[];
  metricHeaders?: { name: string; type?: string }[];
  rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[];
};

/**
 * GA4 metric name -> our MetricKey. GA4 is the analytics backend behind
 * Firebase, so this connector reads Firebase for app identity and GA4 for
 * the numbers.
 */
const GA_METRIC_MAP: Record<string, { key: MetricKey; scale?: number }> = {
  activeUsers: { key: "ACTIVE_USERS_DAILY" },
  active28DayUsers: { key: "ACTIVE_USERS_MONTHLY" },
  sessions: { key: "SESSIONS" },
  averageSessionDuration: { key: "SESSION_DURATION_AVG" },
  totalAdRevenue: { key: "AD_REVENUE" },
  purchaseRevenue: { key: "IAP_REVENUE" },
  totalRevenue: { key: "TOTAL_REVENUE" },
  crashFreeUsersRate: { key: "CRASH_FREE_USERS", scale: 100 },
};

const GA_METRICS = Object.keys(GA_METRIC_MAP);

async function listFirebaseProjects(
  connectionId: string,
  credentials: GoogleCredentials,
): Promise<FirebaseProject[]> {
  const out: FirebaseProject[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(`${FIREBASE_API}/projects`);
    url.searchParams.set("pageSize", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await googleApiFetch<{ results?: FirebaseProject[]; nextPageToken?: string }>({
      connectionId,
      credentials,
      url: url.toString(),
    });
    out.push(...(res.results ?? []));
    pageToken = res.nextPageToken;
  } while (pageToken);

  return out;
}

async function listAllGaProperties(
  connectionId: string,
  credentials: GoogleCredentials,
): Promise<{ propertyId: string; displayName: string }[]> {
  try {
    const summaries = await googleApiFetch<{ accountSummaries?: GaAccountSummary[] }>({
      connectionId,
      credentials,
      url: `${GA_ADMIN_API}/accountSummaries?pageSize=200`,
    });
    const list: { propertyId: string; displayName: string }[] = [];
    for (const account of summaries.accountSummaries ?? []) {
      for (const property of account.propertySummaries ?? []) {
        list.push({
          propertyId: property.property.replace("properties/", ""),
          displayName: property.displayName,
        });
      }
    }
    return list;
  } catch {
    return [];
  }
}

type GaDataStream = {
  name: string;
  displayName?: string;
  type?: string;
  androidAppStreamData?: { firebaseAppId?: string; packageName?: string };
  iosAppStreamData?: { firebaseAppId?: string; bundleId?: string };
};

/**
 * GA4 reports are property-wide. A property can hold both the iOS and Android
 * stream of the same app, so metrics must be filtered to one stream. The
 * stream id is not the Firebase app id — it has to be looked up.
 */
async function findStreamId(
  connectionId: string,
  credentials: GoogleCredentials,
  propertyId: string,
  firebaseAppId: string,
): Promise<string | undefined> {
  try {
    const res = await googleApiFetch<{ dataStreams?: GaDataStream[] }>({
      connectionId,
      credentials,
      url: `${GA_ADMIN_API}/properties/${propertyId}/dataStreams?pageSize=200`,
    });
    const match = (res.dataStreams ?? []).find(
      (s) =>
        s.androidAppStreamData?.firebaseAppId === firebaseAppId ||
        s.iosAppStreamData?.firebaseAppId === firebaseAppId,
    );
    return match?.name.split("/").pop();
  } catch {
    return undefined;
  }
}

async function runGaReport(
  connectionId: string,
  credentials: GoogleCredentials,
  propertyId: string,
  body: Record<string, unknown>,
): Promise<GaRunReportResponse> {
  return googleApiFetch<GaRunReportResponse>({
    connectionId,
    credentials,
    url: `${GA_DATA_API}/properties/${propertyId}:runReport`,
    method: "POST",
    body,
  });
}

/**
 * GA4 rejects an entire report when one metric is unavailable on the property
 * (crashFreeUsersRate only exists on app streams, ad revenue only when AdMob
 * is linked). Rather than guess, drop the offending metric and retry.
 */
async function runGaReportTolerant(
  connectionId: string,
  credentials: GoogleCredentials,
  propertyId: string,
  metrics: string[],
  base: Record<string, unknown>,
): Promise<{ response: GaRunReportResponse; metrics: string[] }> {
  let current = [...metrics];

  for (let attempt = 0; attempt < 4 && current.length > 0; attempt++) {
    try {
      const response = await runGaReport(connectionId, credentials, propertyId, {
        ...base,
        metrics: current.map((name) => ({ name })),
      });
      return { response, metrics: current };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const bad = current.find((m) => message.includes(m));
      if (!bad) throw err;
      current = current.filter((m) => m !== bad);
    }
  }
  return { response: {}, metrics: [] };
}

function rowsToMetrics(
  response: GaRunReportResponse,
  metricNames: string[],
  opts: { withCountry: boolean },
): MetricRow[] {
  const out: MetricRow[] = [];

  for (const row of response.rows ?? []) {
    const dateValue = row.dimensionValues[0]?.value;
    if (!dateValue || dateValue.length !== 8) continue;

    const date = toUtcDate(
      `${dateValue.slice(0, 4)}-${dateValue.slice(4, 6)}-${dateValue.slice(6, 8)}`,
    );
    const country = opts.withCountry ? row.dimensionValues[1]?.value : undefined;
    const dimension = opts.withCountry
      ? buildDimension({ country: (country ?? "unknown").toLowerCase() })
      : "";

    metricNames.forEach((name, i) => {
      const mapping = GA_METRIC_MAP[name];
      const raw = row.metricValues[i]?.value;
      if (!mapping || raw === undefined) return;
      const value = Number(raw);
      if (!Number.isFinite(value)) return;

      out.push({
        date,
        metric: mapping.key,
        value: value * (mapping.scale ?? 1),
        dimension,
      });
    });
  }

  return out;
}

export const firebaseConnector: Connector = {
  provider: "FIREBASE",
  source: "FIREBASE",
  scopes: [...GOOGLE_SCOPES.FIREBASE],

  async test(credentials, connection): Promise<TestResult> {
    if (credentials.kind !== "google-oauth") {
      return { ok: false, detail: "Firebase requires a Google OAuth connection" };
    }
    try {
      const projects = await listFirebaseProjects(connection.id, credentials);
      return {
        ok: true,
        detail: `${projects.length} Firebase project${projects.length === 1 ? "" : "s"} visible`,
      };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : "Unknown error" };
    }
  },

  async listResources(credentials, connection): Promise<RemoteResource[]> {
    if (credentials.kind !== "google-oauth") return [];

    const [projects, gaProperties] = await Promise.all([
      listFirebaseProjects(connection.id, credentials),
      listAllGaProperties(connection.id, credentials),
    ]);

    const resources: RemoteResource[] = [];

    await Promise.all(
      projects.map(async (project) => {
        const pIdNorm = project.projectId.toLowerCase().replace(/[^a-z0-9]/g, "");
        const pDisplayNorm = (project.displayName ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

        const matchedGa = gaProperties.find((ga) => {
          const gaNorm = ga.displayName.toLowerCase().replace(/[^a-z0-9]/g, "");
          return (
            gaNorm === pIdNorm ||
            (pDisplayNorm && gaNorm === pDisplayNorm) ||
            gaNorm.includes(pIdNorm) ||
            pIdNorm.includes(gaNorm) ||
            (pDisplayNorm && (gaNorm.includes(pDisplayNorm) || pDisplayNorm.includes(gaNorm)))
          );
        });

        const propertyId = matchedGa?.propertyId;

        const [streams, android, ios] = await Promise.all([
          propertyId
            ? googleApiFetch<{ dataStreams?: GaDataStream[] }>({
                connectionId: connection.id,
                credentials,
                url: `${GA_ADMIN_API}/properties/${propertyId}/dataStreams?pageSize=200`,
              })
                .then((r) => r.dataStreams ?? [])
                .catch(() => [] as GaDataStream[])
            : Promise.resolve([] as GaDataStream[]),
          googleApiFetch<{ apps?: FirebaseAndroidApp[] }>({
            connectionId: connection.id,
            credentials,
            url: `${FIREBASE_API}/projects/${project.projectId}/androidApps?pageSize=100`,
          }).catch(() => ({ apps: [] as FirebaseAndroidApp[] })),
          googleApiFetch<{ apps?: FirebaseIosApp[] }>({
            connectionId: connection.id,
            credentials,
            url: `${FIREBASE_API}/projects/${project.projectId}/iosApps?pageSize=100`,
          }).catch(() => ({ apps: [] as FirebaseIosApp[] })),
        ]);

        const streamIdFor = (firebaseAppId: string) =>
          streams
            .find(
              (s) =>
                s.androidAppStreamData?.firebaseAppId === firebaseAppId ||
                s.iosAppStreamData?.firebaseAppId === firebaseAppId,
            )
            ?.name.split("/")
            .pop();

        for (const app of android.apps ?? []) {
          resources.push({
            externalId: app.appId,
            externalRef: propertyId,
            name: app.displayName ?? app.packageName,
            platform: "ANDROID",
            storeId: app.packageName,
            bundleId: app.packageName,
            metadata: {
              projectId: project.projectId,
              analyticsPropertyId: propertyId,
              streamId: streamIdFor(app.appId),
              gaLinked: Boolean(propertyId),
            },
          });
        }

        for (const app of ios.apps ?? []) {
          resources.push({
            externalId: app.appId,
            externalRef: propertyId,
            name: app.displayName ?? app.bundleId,
            platform: "IOS",
            storeId: app.appStoreId,
            bundleId: app.bundleId,
            metadata: {
              projectId: project.projectId,
              analyticsPropertyId: propertyId,
              streamId: streamIdFor(app.appId),
              gaLinked: Boolean(propertyId),
            },
          });
        }
      }),
    );

    return resources;
  },

  async fetchMetrics(ctx: FetchContext): Promise<MetricRow[]> {
    if (ctx.credentials.kind !== "google-oauth") return [];

    const propertyId =
      ctx.externalRef ??
      (ctx.linkMetadata?.analyticsPropertyId as string | undefined);

    if (!propertyId) {
      throw new Error(
        "No GA4 property linked to this Firebase app. Link Google Analytics in the Firebase console, then re-sync resources.",
      );
    }

    const dateRanges = [{ startDate: ymd(ctx.start), endDate: ymd(ctx.end) }];

    // A property can hold both platforms of the same app. Without a stream
    // filter the two would be summed into one series.
    const streamId =
      (ctx.linkMetadata?.streamId as string | undefined) ??
      (await findStreamId(ctx.connection.id, ctx.credentials, propertyId, ctx.externalId));

    const dimensionFilter = streamId
      ? {
          filter: {
            fieldName: "streamId",
            stringFilter: { value: streamId, matchType: "EXACT" },
          },
        }
      : undefined;

    const appWide = await runGaReportTolerant(ctx.connection.id, ctx.credentials, propertyId, GA_METRICS, {
      dateRanges,
      dimensions: [{ name: "date" }],
      ...(dimensionFilter ? { dimensionFilter } : {}),
      limit: 100000,
    });

    const byCountry = await runGaReportTolerant(
      ctx.connection.id,
      ctx.credentials,
      propertyId,
      ["activeUsers", "sessions", "totalRevenue"],
      {
        dateRanges,
        dimensions: [{ name: "date" }, { name: "countryId" }],
        ...(dimensionFilter ? { dimensionFilter } : {}),
        limit: 100000,
      },
    ).catch(() => ({ response: {} as GaRunReportResponse, metrics: [] as string[] }));

    return [
      ...rowsToMetrics(appWide.response, appWide.metrics, { withCountry: false }),
      ...rowsToMetrics(byCountry.response, byCountry.metrics, { withCountry: true }),
    ];
  },
};
