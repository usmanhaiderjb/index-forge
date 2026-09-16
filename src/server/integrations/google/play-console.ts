import "server-only";

import { decodeCsvBuffer, parseCsvRecords } from "@/lib/csv";
import {
  buildDimension,
  normalizeTrafficSource,
  TRAFFIC_DIMENSION_KEY,
  toUtcDate,
} from "@aso/shared";
import { GOOGLE_SCOPES, getFreshGoogleToken, googleApiFetch } from "@/server/integrations/google/oauth";
import {
  type Connector,
  type FetchContext,
  type GoogleCredentials,
  type MetricRow,
  type RemoteResource,
  type ReviewRow,
  type TestResult,
} from "@/server/integrations/types";

const PUBLISHER_API = "https://androidpublisher.googleapis.com/androidpublisher/v3";
const REPORTING_API = "https://playdeveloperreporting.googleapis.com/v1beta1";
const GCS_API = "https://storage.googleapis.com/storage/v1";

type ReportingApp = {
  name: string; // "apps/com.example"
  packageName: string;
  displayName?: string;
};

type PlayReview = {
  reviewId: string;
  authorName?: string;
  comments?: {
    userComment?: {
      text?: string;
      lastModified?: { seconds?: string };
      starRating?: number;
      reviewerLanguage?: string;
      device?: string;
      appVersionName?: string;
      thumbsUpCount?: number;
    };
    developerComment?: {
      text?: string;
      lastModified?: { seconds?: string };
    };
  }[];
};

function monthsBetween(start: Date, end: Date): string[] {
  const months: string[] = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));

  while (cursor <= last) {
    months.push(
      `${cursor.getUTCFullYear()}${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`,
    );
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

/**
 * Downloads one Play Console statistics CSV from the developer's private
 * Cloud Storage bucket. Returns null when the report does not exist — that is
 * normal for the current month and for apps with no data.
 */
async function downloadReport(
  connectionId: string,
  credentials: GoogleCredentials,
  bucket: string,
  objectPath: string,
): Promise<Record<string, string>[] | null> {
  const { accessToken } = await getFreshGoogleToken(connectionId, credentials);
  const url = `${GCS_API}/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectPath)}?alt=media`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw Object.assign(new Error(`Play report download ${res.status}: ${objectPath}`), {
      status: res.status,
    });
  }

  return parseCsvRecords(decodeCsvBuffer(await res.arrayBuffer()));
}

function num(value: string | undefined): number {
  const parsed = Number((value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Google Play truncates developer replies beyond this. */
const PLAY_REPLY_LIMIT = 350;

export const playConsoleConnector: Connector = {
  provider: "PLAY_CONSOLE",
  source: "PLAY_CONSOLE",
  scopes: [...GOOGLE_SCOPES.PLAY_CONSOLE],
  replyCharLimit: PLAY_REPLY_LIMIT,

  async test(credentials, connection): Promise<TestResult> {
    if (credentials.kind !== "google-oauth") {
      return { ok: false, detail: "Play Console requires a Google OAuth connection" };
    }
    try {
      const res = await googleApiFetch<{ apps?: ReportingApp[] }>({
        connectionId: connection.id,
        credentials,
        url: `${REPORTING_API}/apps:search?pageSize=50`,
      });
      const count = res.apps?.length ?? 0;
      return {
        ok: count > 0,
        detail: count
          ? `${count} app${count === 1 ? "" : "s"} in Play Console`
          : "No Play Console apps visible to this account",
      };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : "Unknown error" };
    }
  },

  async listResources(credentials, connection): Promise<RemoteResource[]> {
    if (credentials.kind !== "google-oauth") return [];

    const resources: RemoteResource[] = [];
    let pageToken: string | undefined;

    do {
      const url = new URL(`${REPORTING_API}/apps:search`);
      url.searchParams.set("pageSize", "50");
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const res = await googleApiFetch<{ apps?: ReportingApp[]; nextPageToken?: string }>({
        connectionId: connection.id,
        credentials,
        url: url.toString(),
      });

      for (const app of res.apps ?? []) {
        resources.push({
          externalId: app.packageName,
          name: app.displayName ?? app.packageName,
          platform: "ANDROID",
          storeId: app.packageName,
          bundleId: app.packageName,
        });
      }
      pageToken = res.nextPageToken;
    } while (pageToken);

    return resources;
  },

  async fetchMetrics(ctx: FetchContext): Promise<MetricRow[]> {
    if (ctx.credentials.kind !== "google-oauth") return [];

    // The reports bucket id comes from Play Console > Download reports and is
    // stored on the resource link when the app is connected.
    const bucket = ctx.linkMetadata?.reportsBucket as string | undefined;
    const pkg = ctx.externalId;
    const rows: MetricRow[] = [];

    if (bucket) {
      const months = monthsBetween(ctx.start, ctx.end);

      for (const month of months) {
        const [installs, ratings, storePerformance, trafficSource] = await Promise.all([
          downloadReport(
            ctx.connection.id,
            ctx.credentials,
            bucket,
            `stats/installs/installs_${pkg}_${month}_overview.csv`,
          ).catch(() => null),
          downloadReport(
            ctx.connection.id,
            ctx.credentials,
            bucket,
            `stats/ratings/ratings_${pkg}_${month}_overview.csv`,
          ).catch(() => null),
          downloadReport(
            ctx.connection.id,
            ctx.credentials,
            bucket,
            `stats/store_performance/store_performance_${pkg}_${month}_overview.csv`,
          ).catch(() => null),
          // Same report, sliced by acquisition channel. Missing for apps with
          // too little traffic to break down, hence the same catch as the rest.
          downloadReport(
            ctx.connection.id,
            ctx.credentials,
            bucket,
            `stats/store_performance/store_performance_${pkg}_${month}_traffic_source.csv`,
          ).catch(() => null),
        ]);

        for (const record of installs ?? []) {
          const date = record["Date"];
          if (!date) continue;
          const d = toUtcDate(date);
          if (d < ctx.start || d > ctx.end) continue;

          const push = (metric: MetricRow["metric"], value: number) =>
            rows.push({ date: d, metric, value, dimension: "" });

          push("INSTALLS", num(record["Daily Device Installs"] ?? record["Daily User Installs"]));
          push("UNINSTALLS", num(record["Daily Device Uninstalls"] ?? record["Daily User Uninstalls"]));
        }

        for (const record of ratings ?? []) {
          const date = record["Date"];
          if (!date) continue;
          const d = toUtcDate(date);
          if (d < ctx.start || d > ctx.end) continue;

          const average = num(record["Total Average Rating"]);
          if (average > 0) {
            rows.push({ date: d, metric: "RATING_AVERAGE", value: average, dimension: "" });
          }
          const count = num(record["Total Daily Ratings"]);
          if (count > 0) {
            rows.push({ date: d, metric: "RATING_COUNT", value: count, dimension: "" });
          }
        }

        // Store traffic split by where it came from. Filed under the `source`
        // dimension; the app-wide rows above stay untouched, so nothing here
        // changes a total. Note no CONVERSION_RATE row is written per source —
        // a rate is computed from summed counters at read time, because the
        // mean of daily ratios is not the ratio of the sums.
        for (const record of trafficSource ?? []) {
          const date = record["Date"];
          if (!date) continue;
          const d = toUtcDate(date);
          if (d < ctx.start || d > ctx.end) continue;

          const raw =
            record["Traffic Source"] ?? record["Acquisition Channel"] ?? record["Source"];
          if (!raw) continue;

          const dimension = buildDimension({
            [TRAFFIC_DIMENSION_KEY]: normalizeTrafficSource(raw),
          });

          const views = num(record["Store Listing Visitors"] ?? record["Store Listing Views"]);
          const acquisitions = num(record["Store Listing Acquisitions"]);

          if (views > 0) {
            rows.push({ date: d, metric: "STORE_PAGE_VIEWS", value: views, dimension });
          }
          if (acquisitions > 0) {
            rows.push({ date: d, metric: "INSTALLS", value: acquisitions, dimension });
          }
        }

        for (const record of storePerformance ?? []) {
          const date = record["Date"];
          if (!date) continue;
          const d = toUtcDate(date);
          if (d < ctx.start || d > ctx.end) continue;

          const listingViews = num(record["Store Listing Visitors"] ?? record["Store Listing Views"]);
          const acquisitions = num(record["Store Listing Acquisitions"]);

          if (listingViews > 0) {
            rows.push({ date: d, metric: "STORE_PAGE_VIEWS", value: listingViews, dimension: "" });
            if (acquisitions > 0) {
              rows.push({
                date: d,
                metric: "CONVERSION_RATE",
                value: (acquisitions / listingViews) * 100,
                dimension: "",
              });
            }
          }
        }
      }
    }

    // Crash-free rate comes from the Play Developer Reporting API, which does
    // have a real endpoint.
    try {
      const crash = await googleApiFetch<{
        rows?: {
          startTime?: { year?: number; month?: number; day?: number };
          metrics?: { metric?: string; decimalValue?: { value?: string } }[];
        }[];
      }>({
        connectionId: ctx.connection.id,
        credentials: ctx.credentials,
        url: `${REPORTING_API}/apps/${pkg}/crashRateMetricSet:query`,
        method: "POST",
        body: {
          timelineSpec: {
            aggregationPeriod: "DAILY",
            startTime: {
              year: ctx.start.getUTCFullYear(),
              month: ctx.start.getUTCMonth() + 1,
              day: ctx.start.getUTCDate(),
            },
            endTime: {
              year: ctx.end.getUTCFullYear(),
              month: ctx.end.getUTCMonth() + 1,
              day: ctx.end.getUTCDate(),
            },
          },
          metrics: ["userPerceivedCrashRate"],
          pageSize: 1000,
        },
      });

      for (const row of crash.rows ?? []) {
        const { year, month, day } = row.startTime ?? {};
        if (!year || !month || !day) continue;
        const value = Number(
          row.metrics?.find((m) => m.metric === "userPerceivedCrashRate")?.decimalValue?.value ?? NaN,
        );
        if (!Number.isFinite(value)) continue;

        rows.push({
          date: toUtcDate(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`),
          metric: "CRASH_FREE_USERS",
          value: (1 - value) * 100,
          dimension: "",
        });
      }
    } catch {
      // Vitals are unavailable for apps below the reporting threshold.
    }

    return rows;
  },

  /**
   * Play only exposes reviews from the last 7 days through this endpoint.
   * Anything older has to come from the reviews CSV in the reports bucket.
   */
  async fetchReviews(ctx: FetchContext): Promise<ReviewRow[]> {
    if (ctx.credentials.kind !== "google-oauth") return [];

    const out: ReviewRow[] = [];
    let token: string | undefined;

    do {
      const url = new URL(`${PUBLISHER_API}/applications/${ctx.externalId}/reviews`);
      url.searchParams.set("maxResults", "100");
      if (token) url.searchParams.set("token", token);

      const res = await googleApiFetch<{
        reviews?: PlayReview[];
        tokenPagination?: { nextPageToken?: string };
      }>({
        connectionId: ctx.connection.id,
        credentials: ctx.credentials,
        url: url.toString(),
      });

      for (const review of res.reviews ?? []) {
        const comment = review.comments?.find((c) => c.userComment)?.userComment;
        if (!comment) continue;

        const seconds = Number(comment.lastModified?.seconds ?? 0);
        const developer = review.comments?.find((c) => c.developerComment)?.developerComment;

        out.push({
          externalId: review.reviewId,
          rating: comment.starRating ?? 0,
          body: comment.text,
          authorName: review.authorName,
          locale: comment.reviewerLanguage,
          appVersion: comment.appVersionName,
          device: comment.device,
          submittedAt: new Date(seconds * 1000),
          developerReply: developer?.text,
          repliedAt: developer?.lastModified?.seconds
            ? new Date(Number(developer.lastModified.seconds) * 1000)
            : undefined,
        });
      }

      token = res.tokenPagination?.nextPageToken;
    } while (token);

    return out;
  },

  /**
   * Publishes a public reply. Google replaces any existing reply rather than
   * appending, so this is an upsert from the store's point of view.
   *
   * Deliberately not wrapped in the usual retry helper: a timeout after the
   * write has landed would publish twice.
   */
  async replyToReview(ctx, reviewExternalId, body) {
    if (ctx.credentials.kind !== "google-oauth") {
      throw new Error("Play Console replies require a Google OAuth connection");
    }

    const text = body.trim();
    if (!text) throw new Error("Reply text is empty");
    if (text.length > PLAY_REPLY_LIMIT) {
      throw new Error(
        `Google Play replies are limited to ${PLAY_REPLY_LIMIT} characters; this is ${text.length}`,
      );
    }

    await googleApiFetch({
      connectionId: ctx.connection.id,
      credentials: ctx.credentials,
      url: `${PUBLISHER_API}/applications/${ctx.externalId}/reviews/${encodeURIComponent(
        reviewExternalId,
      )}:reply`,
      method: "POST",
      body: { replyText: text },
    });
  },
};
