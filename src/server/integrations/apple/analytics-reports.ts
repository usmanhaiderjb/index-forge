import "server-only";

import { gunzipSync } from "node:zlib";

import { createAppleToken } from "@/server/integrations/apple/jwt";
import type { AppleCredentials } from "@/server/integrations/types";

/**
 * App Store Connect Analytics Reports.
 *
 * A different API from Sales & Trends, and the only place Apple exposes *where
 * store traffic came from* — search vs browse vs referral. Sales reports know
 * how many units sold and in which territory; they do not know how the person
 * found the app.
 *
 * ## It is asynchronous, and that shapes everything
 *
 * You do not request a report and receive data. You register an ongoing
 * *request*, Apple begins provisioning it, and instances start appearing
 * **up to 48 hours later**. A brand-new connection therefore returns nothing,
 * and that is the correct, expected outcome rather than a failure — see
 * `AnalyticsAvailability` below, which exists so the caller can tell "not ready
 * yet" apart from "broken".
 *
 * ## The four hops
 *
 *   1. analyticsReportRequests   registered once per app, reused forever
 *   2. reports                   named report families under that request
 *   3. instances                 one per granularity per processing date
 *   4. segments                  pre-signed URLs to gzipped TSV
 *
 * Segment URLs are pre-signed and must be fetched **without** the Authorization
 * header — Apple rejects a signed URL that also carries a bearer token.
 */

const ASC_API = "https://api.appstoreconnect.apple.com/v1";

/** Why a fetch produced no rows. The distinction is the point. */
export type AnalyticsAvailability =
  | { kind: "ok" }
  /** Registered, Apple has not published instances yet. Normal for ~48h. */
  | { kind: "provisioning"; detail: string }
  /** The key cannot see analytics, or the app has no report of this name. */
  | { kind: "unavailable"; detail: string };

export type AnalyticsRow = Record<string, string>;

type AscList<T> = { data: T[] };
type AscEntity = { id: string; attributes?: Record<string, unknown> };

async function ascJson<T>(
  credentials: AppleCredentials,
  path: string,
  init: { method?: string; body?: unknown; query?: Record<string, string> } = {},
): Promise<T> {
  const token = await createAppleToken(credentials);
  const url = new URL(path.startsWith("http") ? path : `${ASC_API}${path}`);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);

  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw Object.assign(
      new Error(`App Store Connect ${res.status}: ${text.slice(0, 300)}`),
      { status: res.status },
    );
  }
  return (await res.json()) as T;
}

/**
 * The ongoing report request for an app, creating it on first use.
 *
 * Deliberately not cached in our database. A stored id goes stale — Apple stops
 * requests that see no traffic (`stoppedDueToInactivity`) and they can be
 * deleted from the portal — and the list endpoint is authoritative and cheap.
 */
export async function resolveAnalyticsRequest(
  credentials: AppleCredentials,
  appleAppId: string,
): Promise<{ id: string } | AnalyticsAvailability> {
  let existing: AscList<AscEntity>;
  try {
    existing = await ascJson<AscList<AscEntity>>(
      credentials,
      `/apps/${appleAppId}/analyticsReportRequests`,
      { query: { "filter[accessType]": "ONGOING", limit: "200" } },
    );
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 403 || status === 401) {
      return {
        kind: "unavailable",
        detail:
          "The App Store Connect key cannot read Analytics reports. It needs the Admin, Finance or Sales role.",
      };
    }
    throw error;
  }

  const live = existing.data.find((r) => r.attributes?.stoppedDueToInactivity !== true);
  if (live) return { id: live.id };

  // None yet, or every one was stopped. Register a fresh ongoing request.
  const created = await ascJson<{ data: AscEntity }>(credentials, "/analyticsReportRequests", {
    method: "POST",
    body: {
      data: {
        type: "analyticsReportRequests",
        attributes: { accessType: "ONGOING" },
        relationships: { app: { data: { type: "apps", id: appleAppId } } },
      },
    },
  });

  return {
    kind: "provisioning",
    detail:
      "Registered an ongoing analytics report with Apple. Instances appear within about 48 hours; " +
      `traffic-source data will start on the next sync after that (request ${created.data.id}).`,
  };
}

/**
 * Find a report by name inside a request.
 *
 * Matched case-insensitively on a substring rather than an exact string, because
 * Apple renames these ("App Store Discovery and Engagement Standard" has also
 * shipped as "App Discovery and Engagement Standard") and an exact match turns a
 * rename into silent data loss.
 */
async function findReport(
  credentials: AppleCredentials,
  requestId: string,
  namePart: string,
): Promise<string | null> {
  const reports = await ascJson<AscList<AscEntity>>(
    credentials,
    `/analyticsReportRequests/${requestId}/reports`,
    { query: { limit: "200" } },
  );

  const wanted = namePart.toLowerCase();
  const hit = reports.data.find((r) =>
    String(r.attributes?.name ?? "").toLowerCase().includes(wanted),
  );
  return hit?.id ?? null;
}

/** Daily instances covering a date range. */
async function findInstances(
  credentials: AppleCredentials,
  reportId: string,
  days: string[],
): Promise<{ id: string; date: string }[]> {
  const instances = await ascJson<AscList<AscEntity>>(
    credentials,
    `/analyticsReports/${reportId}/instances`,
    { query: { "filter[granularity]": "DAILY", limit: "200" } },
  );

  const wanted = new Set(days);
  return instances.data
    .map((i) => ({ id: i.id, date: String(i.attributes?.processingDate ?? "") }))
    .filter((i) => wanted.has(i.date));
}

/**
 * Download every segment of one instance and return its rows.
 *
 * A large report is split across segments; each is an independently gzipped TSV
 * carrying its own header line, so they are parsed separately rather than
 * concatenated.
 */
async function readInstance(
  credentials: AppleCredentials,
  instanceId: string,
): Promise<AnalyticsRow[]> {
  const segments = await ascJson<AscList<AscEntity>>(
    credentials,
    `/analyticsReportInstances/${instanceId}/segments`,
    { query: { limit: "200" } },
  );

  const rows: AnalyticsRow[] = [];

  for (const segment of segments.data) {
    const url = segment.attributes?.url;
    if (typeof url !== "string" || !url) continue;

    // No Authorization header: the URL is already pre-signed and Apple rejects
    // a request that carries both.
    const res = await fetch(url);
    if (!res.ok) continue;

    const buffer = Buffer.from(await res.arrayBuffer());
    rows.push(...parseTsv(decompress(buffer)));
  }

  return rows;
}

/**
 * Segments are gzipped, but a plain-TSV segment has been observed. Sniffing the
 * two-byte gzip magic number is cheaper than being wrong.
 */
function decompress(buffer: Buffer): string {
  const isGzip = buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
  return (isGzip ? gunzipSync(buffer) : buffer).toString("utf8");
}

/**
 * Tab-separated, with a header line.
 *
 * Not reusing the CSV reader by swapping delimiters, the way the sales-report
 * path does: analytics rows contain commas inside values ("Search, Browse" style
 * labels and territory names), and swapping tabs for commas would split them.
 */
export function parseTsv(text: string): AnalyticsRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length < 2) return [];

  const headers = lines[0]!.split("\t").map((h) => h.trim());

  return lines.slice(1).map((line) => {
    const cells = line.split("\t");
    const row: AnalyticsRow = {};
    headers.forEach((header, i) => {
      row[header] = (cells[i] ?? "").trim();
    });
    return row;
  });
}

/**
 * Read one named daily report across a date range.
 *
 * Takes an already-resolved request id rather than resolving one itself. A
 * caller reading two reports must call `resolveAnalyticsRequest` once and pass
 * the result to both — resolving per report races two POSTs and registers two
 * ongoing requests for the same app.
 *
 * Returns rows plus an availability verdict, so a caller can report "Apple is
 * still provisioning" differently from "this produced nothing".
 */
export async function fetchAnalyticsReport(
  credentials: AppleCredentials,
  requestId: string,
  reportName: string,
  days: string[],
): Promise<{ rows: AnalyticsRow[]; availability: AnalyticsAvailability }> {
  const reportId = await findReport(credentials, requestId, reportName);
  if (!reportId) {
    return {
      rows: [],
      availability: {
        kind: "provisioning",
        detail: `Apple has not published a "${reportName}" report for this app yet.`,
      },
    };
  }

  const instances = await findInstances(credentials, reportId, days);
  if (instances.length === 0) {
    return {
      rows: [],
      availability: {
        kind: "provisioning",
        detail: `No daily "${reportName}" instances published for the requested dates yet.`,
      },
    };
  }

  const rows: AnalyticsRow[] = [];
  for (const instance of instances) {
    // One bad instance should not lose the rest of the window.
    try {
      rows.push(...(await readInstance(credentials, instance.id)));
    } catch {
      continue;
    }
  }

  return { rows, availability: { kind: "ok" } };
}
