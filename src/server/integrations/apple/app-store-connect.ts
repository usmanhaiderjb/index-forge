import "server-only";

import { gunzipSync } from "node:zlib";

import { parseCsv } from "@/lib/csv";
import {
  buildDimension,
  eachDay,
  normalizeTrafficSource,
  toUtcDate,
  TRAFFIC_DIMENSION_KEY,
  withRetry,
  ymd,
} from "@aso/shared";
import {
  fetchAnalyticsReport,
  resolveAnalyticsRequest,
} from "@/server/integrations/apple/analytics-reports";
import { createAppleToken } from "@/server/integrations/apple/jwt";
import {
  ReauthRequiredError,
  type AppleCredentials,
  type Connector,
  type FetchContext,
  type MetricRow,
  type RemoteResource,
  type ReviewRow,
  type TestResult,
} from "@/server/integrations/types";

const ASC_API = "https://api.appstoreconnect.apple.com/v1";

type AscApp = {
  id: string;
  attributes?: {
    name?: string;
    bundleId?: string;
    sku?: string;
    primaryLocale?: string;
  };
};

type AscReview = {
  id: string;
  attributes?: {
    rating?: number;
    title?: string;
    body?: string;
    reviewerNickname?: string;
    createdDate?: string;
    territory?: string;
  };
};

async function ascFetch<T>(
  credentials: AppleCredentials,
  path: string,
  init: { method?: string; query?: Record<string, string>; accept?: string } = {},
): Promise<T> {
  return withRetry(async () => {
    const token = await createAppleToken(credentials);
    const url = new URL(path.startsWith("http") ? path : `${ASC_API}${path}`);
    for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);

    const res = await fetch(url, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: init.accept ?? "application/json",
      },
    });

    if (res.status === 401) {
      throw new ReauthRequiredError("App Store Connect rejected the API key");
    }
    if (res.status === 403) {
      throw new ReauthRequiredError(
        "The App Store Connect key lacks permission for this resource (needs Admin, Finance, or Sales role)",
      );
    }
    if (!res.ok) {
      const text = await res.text();
      throw Object.assign(new Error(`App Store Connect ${res.status}: ${text.slice(0, 400)}`), {
        status: res.status,
      });
    }

    return (await res.json()) as T;
  });
}

/**
 * Sales & Trends reports are gzipped TSV, served outside the JSON API shape.
 * They are the only source of App Store install/unit counts.
 */
async function fetchSalesReport(
  credentials: AppleCredentials,
  vendorNumber: string,
  date: Date,
): Promise<string[][] | null> {
  const token = await createAppleToken(credentials);
  const url = new URL(`${ASC_API}/salesReports`);
  url.searchParams.set("filter[frequency]", "DAILY");
  url.searchParams.set("filter[reportType]", "SALES");
  url.searchParams.set("filter[reportSubType]", "SUMMARY");
  url.searchParams.set("filter[vendorNumber]", vendorNumber);
  url.searchParams.set("filter[reportDate]", ymd(date));
  url.searchParams.set("filter[version]", "1_1");

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/a-gzip" },
  });

  // 404 means the report is not published yet — normal for the last 1-2 days.
  if (res.status === 404 || res.status === 410) return null;
  if (!res.ok) return null;

  const buffer = Buffer.from(await res.arrayBuffer());
  const text = gunzipSync(buffer).toString("utf8");
  // Sales reports are tab separated; reuse the CSV reader by swapping the delimiter.
  return parseCsv(text.replace(/\t/g, ","));
}

/**
 * Column lookup for Analytics reports.
 *
 * Apple does not version these headers and has renamed them between report
 * generations, so every field is resolved through a list of aliases and matched
 * case-insensitively on a normalised name. A fixed header string turns a rename
 * into silent data loss — the parse succeeds, every row yields zero, and the
 * funnel quietly reports that nobody found the app through search.
 *
 * The aliases below are best-known rather than verified against a live account.
 * If a column is missing the row is skipped, never counted as zero.
 */
function pick(row: Record<string, string>, aliases: string[]): string | null {
  const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const wanted = aliases.map(normalise);

  for (const [key, value] of Object.entries(row)) {
    if (wanted.includes(normalise(key))) return value;
  }
  return null;
}

function num(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

const COLUMN = {
  date: ["Date", "Processing Date"],
  source: ["Source Type", "Source", "Acquisition Source"],
  impressions: ["Impressions", "Impressions (Unique Devices)", "Total Impressions"],
  pageViews: [
    "Product Page Views",
    "Product Page Views (Unique Devices)",
    "Page Views",
    "Total Product Page Views",
  ],
  downloads: ["Counts", "Total Downloads", "Downloads", "Units"],
  downloadType: ["Download Type"],
} as const;

/**
 * Store traffic split by where it came from, from the Analytics Reports API.
 *
 * Filed under the `source=` dimension, matching what the Play Console connector
 * emits, so `metrics.funnel` reads both stores through one code path. No
 * CONVERSION_RATE row is written per source — a rate is computed from summed
 * counters at read time, because the mean of daily ratios is not the ratio of
 * the sums.
 *
 * Returns an empty array rather than throwing when Apple is still provisioning.
 * That state lasts up to 48 hours after a connection is made and is not an
 * error.
 */
async function fetchTrafficSource(
  credentials: AppleCredentials,
  appleAppId: string,
  start: Date,
  end: Date,
): Promise<MetricRow[]> {
  const days = eachDay(start, end).map(ymd);
  const rows: MetricRow[] = [];

  // Resolved once and shared. Resolving inside each report fetch raced two
  // POSTs on a first sync and registered two ongoing requests for the same app.
  const request = await resolveAnalyticsRequest(credentials, appleAppId);
  if ("kind" in request) return rows;

  const empty = { rows: [], availability: { kind: "unavailable" as const, detail: "request failed" } };
  const [engagement, downloads] = await Promise.all([
    fetchAnalyticsReport(credentials, request.id, "Discovery and Engagement", days).catch(
      () => empty,
    ),
    fetchAnalyticsReport(credentials, request.id, "App Downloads", days).catch(() => empty),
  ]);

  const emit = (
    raw: Record<string, string>,
    metric: MetricRow["metric"],
    aliases: readonly string[],
  ) => {
    const date = pick(raw, [...COLUMN.date]);
    const source = pick(raw, [...COLUMN.source]);
    const value = num(pick(raw, [...aliases]));

    // A missing column is a schema change, not a zero. Skipping keeps the
    // funnel visibly incomplete rather than confidently wrong.
    if (!date || !source || value === null || value <= 0) return;

    rows.push({
      date: toUtcDate(date),
      metric,
      value,
      dimension: buildDimension({ [TRAFFIC_DIMENSION_KEY]: normalizeTrafficSource(source) }),
    });
  };

  for (const raw of engagement.rows) {
    emit(raw, "IMPRESSIONS", COLUMN.impressions);
    emit(raw, "STORE_PAGE_VIEWS", COLUMN.pageViews);
  }

  for (const raw of downloads.rows) {
    // "Download Type" separates a genuine new install from a redownload,
    // auto-download to a second device, or a restore. INSTALLS means the first
    // kind; counting the rest inflates it against every other source.
    const kind = pick(raw, [...COLUMN.downloadType]);
    if (kind && !/first[\s-]*time/i.test(kind)) continue;

    emit(raw, "INSTALLS", COLUMN.downloads);
  }

  return rows;
}

/** App Store Connect rejects responses beyond this. */
const APPLE_REPLY_LIMIT = 5970;

export const appStoreConnectConnector: Connector = {
  provider: "APP_STORE_CONNECT",
  source: "APP_STORE_CONNECT",
  scopes: [],
  replyCharLimit: APPLE_REPLY_LIMIT,

  async test(credentials): Promise<TestResult> {
    if (credentials.kind !== "apple-asc") {
      return { ok: false, detail: "App Store Connect requires an API key connection" };
    }
    try {
      const res = await ascFetch<{ data?: AscApp[] }>(credentials, "/apps", {
        query: { limit: "10" },
      });
      const count = res.data?.length ?? 0;
      return {
        ok: count > 0,
        detail: count ? `${count} app${count === 1 ? "" : "s"} visible` : "Key is valid but sees no apps",
        externalId: credentials.issuerId,
        externalName: "App Store Connect",
      };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : "Unknown error" };
    }
  },

  async listResources(credentials): Promise<RemoteResource[]> {
    if (credentials.kind !== "apple-asc") return [];

    const resources: RemoteResource[] = [];
    let next: string | undefined = "/apps";

    while (next) {
      const res: { data?: AscApp[]; links?: { next?: string } } = await ascFetch(credentials, next, {
        query: next === "/apps" ? { limit: "200" } : undefined,
      });

      for (const app of res.data ?? []) {
        resources.push({
          externalId: app.id,
          name: app.attributes?.name ?? app.id,
          platform: "IOS",
          storeId: app.id,
          bundleId: app.attributes?.bundleId,
          metadata: {
            sku: app.attributes?.sku,
            primaryLocale: app.attributes?.primaryLocale,
            vendorNumber: credentials.vendorNumber,
          },
        });
      }

      next = res.links?.next;
    }

    return resources;
  },

  async fetchMetrics(ctx: FetchContext): Promise<MetricRow[]> {
    if (ctx.credentials.kind !== "apple-asc") return [];

    const vendorNumber =
      ctx.credentials.vendorNumber ?? (ctx.linkMetadata?.vendorNumber as string | undefined);

    const rows: MetricRow[] = [];

    // Traffic source comes from the Analytics Reports API, which is a separate
    // permission from Sales & Trends — so it is fetched before the vendor-number
    // guard below and works on a connection that has no Sales access at all.
    // A failure here must not lose the sales rows, hence the catch.
    try {
      rows.push(
        ...(await fetchTrafficSource(ctx.credentials, ctx.externalId, ctx.start, ctx.end)),
      );
    } catch {
      // Analytics is best-effort. Apple provisions reports asynchronously and
      // the endpoint 404s in ways that are not worth failing a whole sync over.
    }

    if (!vendorNumber) {
      // Without a vendor number there is no Sales & Trends access. Reviews,
      // listing data and the traffic split above still sync; total installs come
      // from the store scraper instead.
      return rows;
    }

    const sku = ctx.linkMetadata?.sku as string | undefined;

    for (const day of eachDay(ctx.start, ctx.end)) {
      const report: string[][] | null = await fetchSalesReport(
        ctx.credentials,
        vendorNumber,
        day,
      ).catch(() => null);
      if (!report || report.length < 2) continue;

      const header: string[] = (report[0] ?? []).map((h) => h.trim());
      const idx = (name: string): number =>
        header.findIndex((h) => h.toLowerCase() === name.toLowerCase());

      const skuIdx = idx("SKU");
      const unitsIdx = idx("Units");
      const territoryIdx = idx("Country Code");
      const typeIdx = idx("Product Type Identifier");
      const proceedsIdx = idx("Developer Proceeds");
      const currencyIdx = idx("Currency of Proceeds");

      const byCountry = new Map<string, { units: number; revenue: number; currency: string }>();

      for (const row of report.slice(1)) {
        if (sku && skuIdx >= 0 && row[skuIdx] !== sku) continue;

        const units = Number(row[unitsIdx] ?? 0);
        if (!Number.isFinite(units)) continue;

        const country = (row[territoryIdx] ?? "unknown").toLowerCase();
        const productType = row[typeIdx] ?? "";
        const proceeds = Number(row[proceedsIdx] ?? 0) * units;
        const currency = row[currencyIdx] ?? "USD";

        const bucket = byCountry.get(country) ?? { units: 0, revenue: 0, currency };
        // Product types starting with "1" are app downloads; "IA"/"F" are IAP.
        if (/^1/.test(productType)) bucket.units += units;
        if (Number.isFinite(proceeds)) bucket.revenue += proceeds;
        byCountry.set(country, bucket);
      }

      for (const [country, bucket] of byCountry) {
        const dimension = buildDimension({ country });
        if (bucket.units > 0) {
          rows.push({ date: toUtcDate(day), metric: "INSTALLS", value: bucket.units, dimension });
        }
        if (bucket.revenue !== 0) {
          rows.push({
            date: toUtcDate(day),
            metric: "IAP_REVENUE",
            value: bucket.revenue,
            dimension,
            currency: bucket.currency,
          });
        }
      }
    }

    return rows;
  },

  async fetchReviews(ctx: FetchContext): Promise<ReviewRow[]> {
    if (ctx.credentials.kind !== "apple-asc") return [];

    const out: ReviewRow[] = [];
    let next: string | undefined = `/apps/${ctx.externalId}/customerReviews`;
    let pages = 0;

    while (next && pages < 20) {
      const res: { data?: AscReview[]; links?: { next?: string } } = await ascFetch(
        ctx.credentials,
        next,
        {
          query: next.includes("?")
            ? undefined
            : { limit: "200", sort: "-createdDate" },
        },
      );

      let reachedCutoff = false;

      for (const review of res.data ?? []) {
        const createdDate = review.attributes?.createdDate;
        if (!createdDate) continue;
        const submittedAt = new Date(createdDate);

        // Reviews come newest-first; stop once we pass the window.
        if (submittedAt < ctx.start) {
          reachedCutoff = true;
          break;
        }

        out.push({
          externalId: review.id,
          rating: review.attributes?.rating ?? 0,
          title: review.attributes?.title,
          body: review.attributes?.body,
          authorName: review.attributes?.reviewerNickname,
          country: review.attributes?.territory?.toLowerCase(),
          submittedAt,
        });
      }

      if (reachedCutoff) break;
      next = res.links?.next;
      pages++;
    }

    return out;
  },

  /**
   * Publishes a public response.
   *
   * Apple models responses as their own resource, so creating one twice is a
   * conflict rather than an overwrite — an existing response is updated in
   * place instead. Not retried: a timeout after the write would post twice.
   */
  async replyToReview(ctx, reviewExternalId, body) {
    if (ctx.credentials.kind !== "apple-asc") {
      throw new Error("App Store Connect replies require an API key connection");
    }

    const text = body.trim();
    if (!text) throw new Error("Reply text is empty");
    if (text.length > APPLE_REPLY_LIMIT) {
      throw new Error(
        `App Store replies are limited to ${APPLE_REPLY_LIMIT} characters; this is ${text.length}`,
      );
    }

    const token = await createAppleToken(ctx.credentials);

    const existing = await fetch(
      `${ASC_API}/customerReviews/${encodeURIComponent(reviewExternalId)}/response`,
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
    );

    // 404 means there is no response yet, which is the normal first-reply case.
    const current =
      existing.ok
        ? ((await existing.json()) as { data?: { id?: string } }).data?.id
        : undefined;

    const url = current
      ? `${ASC_API}/customerReviewResponses/${current}`
      : `${ASC_API}/customerReviewResponses`;

    const payload = current
      ? {
          data: {
            type: "customerReviewResponses",
            id: current,
            attributes: { responseBody: text },
          },
        }
      : {
          data: {
            type: "customerReviewResponses",
            attributes: { responseBody: text },
            relationships: {
              review: { data: { type: "customerReviews", id: reviewExternalId } },
            },
          },
        };

    const res = await fetch(url, {
      method: current ? "PATCH" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (res.status === 401 || res.status === 403) {
      throw new ReauthRequiredError(
        "The App Store Connect key lacks permission to respond to reviews (needs the Customer Support or Admin role)",
      );
    }
    if (!res.ok) {
      throw new Error(
        `App Store Connect rejected the reply (${res.status}): ${(await res.text()).slice(0, 400)}`,
      );
    }
  },
};
