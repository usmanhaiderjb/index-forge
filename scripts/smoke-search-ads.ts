/**
 * Exercises the Apple Search Ads connector against stubbed Apple endpoints.
 *
 * The five existing connectors have never touched a live account either; this
 * proves the request shapes, the auth exchange, the org scoping and the metric
 * mapping, not that Apple accepts our real credentials.
 *
 *   npm run smoke:search-ads
 */
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
const { appleSearchAdsConnector } = (await import(
  "../src/server/integrations/apple/search-ads"
)) as typeof import("../src/server/integrations/apple/search-ads");
const { clearSearchAdsTokenCache } = (await import(
  "../src/server/integrations/apple/search-ads-auth"
)) as typeof import("../src/server/integrations/apple/search-ads-auth");

let failures = 0;
function report(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

type Call = { url: string; headers: Record<string, string>; body: string | null };

async function main() {
  // A real ES256 key, so the JWT is genuinely signed rather than faked.
  const { privateKey } = await generateKeyPair("ES256", { extractable: true });
  const pem = await exportPKCS8(privateKey);

  const credentials = {
    kind: "apple-search-ads" as const,
    clientId: "SEARCHADS.test-client",
    teamId: "SEARCHADS.test-team",
    keyId: "test-key-id",
    privateKey: pem,
    orgId: "424242",
    currency: "EUR",
  };

  const calls: Call[] = [];
  let tokenCalls = 0;
  let failAuth = false;

  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const headers = Object.fromEntries(
      Object.entries((init?.headers ?? {}) as Record<string, string>),
    );
    const body = typeof init?.body === "string" ? init.body : init?.body ? String(init.body) : null;
    calls.push({ url, headers, body });

    if (url.includes("appleid.apple.com/auth/oauth2/token")) {
      tokenCalls++;
      if (failAuth) {
        return new Response(JSON.stringify({ error: "invalid_client" }), { status: 400 });
      }
      return new Response(
        JSON.stringify({ access_token: "stub-token", expires_in: 3600, token_type: "Bearer" }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    if (url.endsWith("/acls")) {
      return new Response(
        JSON.stringify({
          data: [
            { orgId: 424242, orgName: "Acme GmbH", currency: "EUR", roleNames: ["Read Only"] },
            { orgId: 999, orgName: "Other Org", currency: "USD", roleNames: ["Admin"] },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    if (url.endsWith("/campaigns/find")) {
      return new Response(
        JSON.stringify({
          data: [
            { id: 1, name: "Brand EU", adamId: 1000000001, status: "ENABLED" },
            { id: 2, name: "Generic EU", adamId: 1000000001, status: "PAUSED" },
            { id: 3, name: "Other app", adamId: 2000000002, status: "ENABLED" },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    if (url.endsWith("/reports/campaigns")) {
      return new Response(
        JSON.stringify({
          data: {
            reportingDataResponse: {
              row: [
                {
                  metadata: { campaignId: 1, campaignName: "Brand EU", adamId: 1000000001 },
                  granularity: [
                    {
                      date: "2026-08-01",
                      impressions: 5000,
                      taps: 400,
                      installs: 90,
                      localSpend: { amount: "250.50", currency: "EUR" },
                      avgCPA: { amount: "2.78", currency: "EUR" },
                      avgCPT: { amount: "0.63", currency: "EUR" },
                    },
                    {
                      date: "2026-08-02",
                      impressions: 0,
                      taps: 0,
                      installs: 0,
                      localSpend: { amount: "0", currency: "EUR" },
                    },
                  ],
                },
                {
                  // A campaign for a different app in the same org. Must not
                  // land on this app's metrics.
                  metadata: { campaignId: 3, campaignName: "Other app", adamId: 2000000002 },
                  granularity: [
                    {
                      date: "2026-08-01",
                      impressions: 111,
                      taps: 11,
                      installs: 1,
                      localSpend: { amount: "9999", currency: "EUR" },
                    },
                  ],
                },
              ],
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    return realFetch(input as never, init);
  }) as typeof fetch;

  try {
    // --- auth ---------------------------------------------------------------
    const test = await appleSearchAdsConnector.test(credentials, {} as never);
    report("verifies the credential against the org", test.ok, test.detail);
    report("returns the org identity", test.externalId === "424242", String(test.externalId));

    const tokenCall = calls.find((c) => c.url.includes("auth/oauth2/token"));
    const tokenBody = new URLSearchParams(tokenCall?.body ?? "");
    report(
      "requests a client_credentials token with the searchadsorg scope",
      tokenBody.get("grant_type") === "client_credentials" &&
        tokenBody.get("scope") === "searchadsorg",
      `${tokenBody.get("grant_type")} / ${tokenBody.get("scope")}`,
    );

    const assertion = tokenBody.get("client_secret") ?? "";
    const claims = JSON.parse(
      Buffer.from(assertion.split(".")[1] ?? "", "base64url").toString("utf8"),
    ) as { aud?: string; iss?: string; sub?: string };
    report(
      "signs the assertion for Apple's ID service, not the Search Ads API",
      claims.aud === "https://appleid.apple.com",
      String(claims.aud),
    );
    report(
      "issues the assertion from the team id and subjects it to the client id",
      claims.iss === credentials.teamId && claims.sub === credentials.clientId,
      `iss ${claims.iss}, sub ${claims.sub}`,
    );

    const apiCall = calls.find((c) => c.url.endsWith("/acls"));
    report(
      "scopes every API call to the connected org",
      apiCall?.headers["X-AP-Context"] === "orgId=424242",
      apiCall?.headers["X-AP-Context"] ?? "missing",
    );

    // --- resources ----------------------------------------------------------
    const resources = await appleSearchAdsConnector.listResources(credentials, {} as never);
    report(
      "lists one resource per promoted app, not per campaign",
      resources.length === 2,
      `${resources.length} resource(s) from 3 campaigns`,
    );
    const first = resources.find((r) => r.externalId === "1000000001");
    report(
      "uses the adamId as the store id so apps auto-match",
      first?.storeId === "1000000001" && first?.platform === "IOS",
      `${first?.storeId} / ${first?.platform}`,
    );
    report(
      "counts the campaigns behind each app",
      (first?.metadata?.campaigns as number) === 2,
      String(first?.metadata?.campaigns),
    );

    // --- metrics ------------------------------------------------------------
    const rows = await appleSearchAdsConnector.fetchMetrics({
      connection: { id: "conn_1" } as never,
      credentials,
      externalId: "1000000001",
      start: new Date("2026-08-01T00:00:00Z"),
      end: new Date("2026-08-02T00:00:00Z"),
      linkMetadata: null,
    });

    const otherApp = rows.filter((r) => r.value === 9999);
    report(
      "drops campaigns promoting a different app in the same org",
      otherApp.length === 0,
      `${otherApp.length} leaked row(s)`,
    );

    const day1 = rows.filter((r) => r.date.toISOString().startsWith("2026-08-01"));
    const spend = day1.find((r) => r.metric === "SPEND");
    report("maps localSpend to SPEND", spend?.value === 250.5, String(spend?.value));
    report(
      "carries the campaign currency, not a hardcoded USD",
      spend?.currency === "EUR",
      String(spend?.currency),
    );
    report(
      "tags rows with the campaign so spend is attributable",
      spend?.dimension === "campaign=1",
      String(spend?.dimension),
    );
    report(
      "maps taps to PAID_CLICKS, distinct from monetization AD_CLICKS",
      day1.find((r) => r.metric === "PAID_CLICKS")?.value === 400,
      String(day1.find((r) => r.metric === "PAID_CLICKS")?.value),
    );
    report(
      "maps installs to PAID_INSTALLS",
      day1.find((r) => r.metric === "PAID_INSTALLS")?.value === 90,
      String(day1.find((r) => r.metric === "PAID_INSTALLS")?.value),
    );
    report(
      "maps avgCPA to CPI and avgCPT to CPC",
      day1.find((r) => r.metric === "CPI")?.value === 2.78 &&
        day1.find((r) => r.metric === "CPC")?.value === 0.63,
      `CPI ${day1.find((r) => r.metric === "CPI")?.value}, CPC ${day1.find((r) => r.metric === "CPC")?.value}`,
    );

    const day2 = rows.filter((r) => r.date.toISOString().startsWith("2026-08-02"));
    report(
      "records a zero-spend day as zero rather than omitting it",
      day2.find((r) => r.metric === "SPEND")?.value === 0,
      `${day2.length} row(s) on the quiet day`,
    );
    report(
      "omits cost-per metrics on a day with no cost, rather than reporting zero",
      day2.every((r) => r.metric !== "CPI" && r.metric !== "CPC"),
      day2.map((r) => r.metric).join(", "),
    );

    const reportCall = calls.find((c) => c.url.endsWith("/reports/campaigns"));
    const reportBody = JSON.parse(reportCall?.body ?? "{}") as Record<string, unknown>;
    report(
      "requests daily granularity over the exact window",
      reportBody.granularity === "DAILY" &&
        reportBody.startTime === "2026-08-01" &&
        reportBody.endTime === "2026-08-02",
      `${String(reportBody.startTime)}..${String(reportBody.endTime)} ${String(reportBody.granularity)}`,
    );

    // --- token reuse --------------------------------------------------------
    report(
      "mints one token for the whole sync instead of one per request",
      tokenCalls === 1,
      `${tokenCalls} token call(s) across ${calls.length - tokenCalls} API call(s)`,
    );

    // --- credential failure -------------------------------------------------
    clearSearchAdsTokenCache(credentials);
    failAuth = true;
    const rejected = await appleSearchAdsConnector.test(credentials, {} as never);
    report(
      "explains what to check when Apple returns invalid_client",
      !rejected.ok && /Search Ads/i.test(rejected.detail) && !/invalid_client/i.test(rejected.detail),
      rejected.detail,
    );

    // --- wrong credential kind ---------------------------------------------
    const wrongKind = await appleSearchAdsConnector.test(
      { kind: "apple-asc", issuerId: "x", keyId: "y", privateKey: "z" } as never,
      {} as never,
    );
    report(
      "rejects an App Store Connect key instead of failing later at Apple",
      !wrongKind.ok,
      wrongKind.detail,
    );
  } finally {
    globalThis.fetch = realFetch;
  }

  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) failed.`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
