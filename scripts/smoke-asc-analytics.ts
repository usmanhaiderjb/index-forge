/**
 * Exercises the App Store Connect Analytics Reports flow against a stubbed Apple.
 *
 * No Apple account was available, so this proves the request shapes, the four-hop
 * traversal, the gzip handling, the column resolution and the metric mapping —
 * not that Apple accepts real credentials or that the column names are current.
 *
 *   npm run smoke:asc-analytics
 */
import { gzipSync } from "node:zlib";
import Module from "node:module";

const load = (Module as unknown as { _load: (...args: unknown[]) => unknown })._load;
(Module as unknown as { _load: (...args: unknown[]) => unknown })._load = function (
  this: unknown,
  request: unknown,
  ...rest: unknown[]
) {
  if (typeof request === "string" && request.includes("server-only")) return {};
  return load.call(this, request, ...rest);
} as never;

const { generateKeyPair, exportPKCS8 } = (await import("jose")) as typeof import("jose");
const { appStoreConnectConnector } = (await import(
  "../src/server/integrations/apple/app-store-connect"
)) as typeof import("../src/server/integrations/apple/app-store-connect");

let failures = 0;
function report(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const APP_ID = "1000000001";
const REQUEST_ID = "req-ongoing-1";
const ENGAGEMENT_REPORT = "rep-engagement";
const DOWNLOADS_REPORT = "rep-downloads";
const SEGMENT_HOST = "https://stub-segments.apple.test";

const ENGAGEMENT_TSV = [
  "Date\tApp Name\tSource Type\tTerritory\tImpressions\tProduct Page Views",
  "2026-08-01\tHabitly\tApp Store Search\tUnited States\t18400\t2610",
  "2026-08-01\tHabitly\tApp Store Browse\tUnited States\t9100\t420",
  "2026-08-01\tHabitly\tWeb Referrer\tKorea, Republic of\t1200\t380",
].join("\n");

const DOWNLOADS_TSV = [
  "Date\tSource Type\tDownload Type\tTerritory\tCounts",
  "2026-08-01\tApp Store Search\tFirst-time download\tUnited States\t812",
  "2026-08-01\tApp Store Search\tRedownload\tUnited States\t5300",
  "2026-08-01\tApp Store Browse\tFirst-time download\tUnited States\t47",
].join("\n");

async function main() {
  const { privateKey } = await generateKeyPair("ES256", { extractable: true });
  const pem = await exportPKCS8(privateKey);

  const credentials = {
    kind: "apple-asc" as const,
    issuerId: "issuer-1",
    keyId: "key-1",
    privateKey: pem,
  };

  const calls: { url: string; method: string; auth: boolean }[] = [];
  let requestsCreated = 0;
  let ongoingExists = true;

  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const method = init?.method ?? "GET";
    const headers = Object.fromEntries(
      new Headers(init?.headers as HeadersInit | undefined).entries(),
    );
    calls.push({ url, method, auth: Boolean(headers.authorization) });

    const json = (body: unknown) =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    // 1. the ongoing report request
    if (url.includes(`/apps/${APP_ID}/analyticsReportRequests`)) {
      return json({
        data: ongoingExists
          ? [{ id: REQUEST_ID, attributes: { accessType: "ONGOING" } }]
          : [],
      });
    }
    if (url.endsWith("/analyticsReportRequests") && method === "POST") {
      requestsCreated++;
      return json({ data: { id: "req-new", attributes: { accessType: "ONGOING" } } });
    }

    // 2. named reports under it
    if (url.includes(`/analyticsReportRequests/${REQUEST_ID}/reports`)) {
      return json({
        data: [
          { id: ENGAGEMENT_REPORT, attributes: { name: "App Store Discovery and Engagement Standard" } },
          { id: DOWNLOADS_REPORT, attributes: { name: "App Downloads Standard" } },
        ],
      });
    }

    // 3. daily instances
    if (url.includes("/instances")) {
      const reportId = url.includes(ENGAGEMENT_REPORT) ? "eng" : "dl";
      return json({
        data: [
          { id: `inst-${reportId}`, attributes: { granularity: "DAILY", processingDate: "2026-08-01" } },
          // Outside the requested window — must be filtered out.
          { id: `inst-${reportId}-old`, attributes: { granularity: "DAILY", processingDate: "2020-01-01" } },
        ],
      });
    }

    // 4. segments, pointing at pre-signed URLs
    if (url.includes("/segments")) {
      const which = url.includes("inst-eng") ? "eng" : "dl";
      return json({ data: [{ attributes: { url: `${SEGMENT_HOST}/${which}.gz`, sizeInBytes: 1 } }] });
    }

    // the pre-signed download itself
    if (url.startsWith(SEGMENT_HOST)) {
      const body = url.includes("eng") ? ENGAGEMENT_TSV : DOWNLOADS_TSV;
      return new Response(gzipSync(Buffer.from(body, "utf8")) as unknown as BodyInit, {
        status: 200,
      });
    }

    // Sales & Trends is not what this smoke test covers.
    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  try {
    const rows = await appStoreConnectConnector.fetchMetrics({
      connection: { id: "conn-1" } as never,
      credentials,
      externalId: APP_ID,
      start: new Date(Date.UTC(2026, 7, 1)),
      end: new Date(Date.UTC(2026, 7, 1)),
      linkMetadata: null,
    });

    const bySource = (metric: string, source: string) =>
      rows.find((r) => r.metric === metric && r.dimension === `source=${source}`)?.value;

    report("impressions land under source=search", bySource("IMPRESSIONS", "search") === 18400,
      String(bySource("IMPRESSIONS", "search")));
    report("page views land under source=browse", bySource("STORE_PAGE_VIEWS", "browse") === 420,
      String(bySource("STORE_PAGE_VIEWS", "browse")));
    report("Web Referrer maps to source=referral", bySource("IMPRESSIONS", "referral") === 1200,
      String(bySource("IMPRESSIONS", "referral")));

    report("first-time downloads become INSTALLS", bySource("INSTALLS", "search") === 812,
      String(bySource("INSTALLS", "search")));
    report(
      "redownloads are excluded",
      bySource("INSTALLS", "search") !== 5300 && bySource("INSTALLS", "search") !== 6112,
      "5300 redownloads must not be counted",
    );

    report("no CONVERSION_RATE row is written per source",
      !rows.some((r) => r.metric === "CONVERSION_RATE" && (r.dimension ?? "").startsWith("source=")),
      "rates are computed from summed counters at read time");

    report("every emitted row carries a source dimension",
      rows.every((r) => /^source=(search|browse|referral|other)$/.test(r.dimension ?? "")),
      rows.map((r) => r.dimension).join(","));

    report("instances outside the window are ignored",
      rows.every((r) => r.date.getUTCFullYear() === 2026),
      "2020 instance must not be read");

    const segmentCall = calls.find((c) => c.url.startsWith(SEGMENT_HOST));
    report("pre-signed segment URL is fetched without an Authorization header",
      Boolean(segmentCall) && segmentCall!.auth === false,
      "Apple rejects a signed URL that also carries a bearer token");

    report("an existing ongoing request is reused, not duplicated", requestsCreated === 0,
      `created ${requestsCreated}`);

    // The state every new connection starts in: no ongoing request yet. It must
    // register one and return no rows, rather than throwing — Apple takes up to
    // 48 hours to publish the first instance and that is not an error.
    ongoingExists = false;
    calls.length = 0;

    const firstSync = await appStoreConnectConnector.fetchMetrics({
      connection: { id: "conn-1" } as never,
      credentials,
      externalId: APP_ID,
      start: new Date(Date.UTC(2026, 7, 1)),
      end: new Date(Date.UTC(2026, 7, 1)),
      linkMetadata: null,
    });

    report("a first sync registers the ongoing request", requestsCreated > 0,
      `created ${requestsCreated}`);
    report("a first sync returns no rows instead of throwing", firstSync.length === 0,
      `${firstSync.length} rows`);
  } finally {
    globalThis.fetch = realFetch;
  }

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
