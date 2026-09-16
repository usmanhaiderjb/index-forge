/**
 * End-to-end smoke test for the public API.
 *
 * Mints a temporary key against the seeded organization, exercises every v1
 * endpoint over real HTTP, then revokes the key. Nothing is mocked — this is
 * the same path an external integration takes.
 *
 *   npm run smoke:api
 */
import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";

const db = new PrismaClient();
const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";

let failures = 0;

function report(name: string, ok: boolean, detail: string) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function check(
  name: string,
  path: string,
  key: string | null,
  expectStatus: number,
  validate?: (body: Record<string, unknown>) => string | null,
) {
  const res = await fetch(`${BASE}${path}`, {
    headers: key ? { Authorization: `Bearer ${key}` } : {},
  });

  if (res.status !== expectStatus) {
    report(name, false, `expected ${expectStatus}, got ${res.status}`);
    return;
  }

  const body = (await res.json()) as Record<string, unknown>;
  const problem = validate?.(body) ?? null;
  report(name, problem === null, problem ?? `${res.status}`);
}

async function main() {
  const org = await db.organization.findFirst({ orderBy: { createdAt: "asc" } });
  if (!org) throw new Error("No organization found — run `npm run db:seed` first");

  const app = await db.app.findFirst({ where: { organizationId: org.id } });
  if (!app) throw new Error("No app found — run `npm run db:seed` first");

  const keyword = await db.keyword.findFirst({ where: { appId: app.id } });

  const plaintext = `aso_${randomBytes(24).toString("base64url")}`;
  const created = await db.apiKey.create({
    data: {
      organizationId: org.id,
      name: "smoke-test",
      hashedKey: createHash("sha256").update(plaintext).digest("hex"),
      prefix: plaintext.slice(0, 12),
    },
  });

  console.log(`Testing ${BASE}/api/v1 as "${org.name}"\n`);

  try {
    // --- Auth -------------------------------------------------------------
    await check("index is public", "/api/v1", null, 200, (b) =>
      Array.isArray(b.endpoints) ? null : "no endpoint list",
    );
    await check("rejects missing key", "/api/v1/apps", null, 401);
    await check("rejects bogus key", "/api/v1/apps", "aso_not-a-real-key", 401);

    // --- Endpoints --------------------------------------------------------
    await check("apps", "/api/v1/apps", plaintext, 200, (b) => {
      const data = b.data as unknown[];
      return Array.isArray(data) && data.length > 0 ? null : "no apps returned";
    });

    await check(
      "metrics",
      `/api/v1/metrics?appId=${app.id}&metric=INSTALLS&days=14`,
      plaintext,
      200,
      (b) => {
        const data = b.data as { date: string; value: number }[];
        if (!Array.isArray(data) || data.length === 0) return "no metric points";
        return data.every((d) => typeof d.value === "number" && /^\d{4}-\d{2}-\d{2}$/.test(d.date))
          ? null
          : "malformed point";
      },
    );

    await check(
      "metrics rejects unknown metric",
      `/api/v1/metrics?appId=${app.id}&metric=NOT_A_METRIC`,
      plaintext,
      400,
    );

    await check("metrics requires appId", "/api/v1/metrics?metric=INSTALLS", plaintext, 400);

    await check(
      "metrics with dimension",
      `/api/v1/metrics?appId=${app.id}&metric=INSTALLS&dimension=country&days=7`,
      plaintext,
      200,
      (b) => {
        const data = b.data as { dimensionValue?: string }[];
        return data.length > 0 && data.every((d) => "dimensionValue" in d)
          ? null
          : "dimensionValue missing";
      },
    );

    await check("keywords", `/api/v1/keywords?appId=${app.id}`, plaintext, 200, (b) => {
      const data = b.data as unknown[];
      return Array.isArray(data) && data.length > 0 ? null : "no keywords";
    });

    if (keyword) {
      await check(
        "keyword history",
        `/api/v1/keywords/history?keywordId=${keyword.id}&days=30`,
        plaintext,
        200,
        (b) => {
          const ranks = b.ranks as unknown[];
          return Array.isArray(ranks) && ranks.length > 0 ? null : "no rank history";
        },
      );
    }

    await check("charts", `/api/v1/charts?appId=${app.id}&days=30`, plaintext, 200, (b) => {
      const data = b.data as { rank: number | null; scanDepth: number }[];
      if (!Array.isArray(data) || data.length === 0) return "no chart rows";
      // A null rank must still carry a scan depth, or it cannot be read as
      // "outside the top N" rather than "never checked".
      return data.every((d) => typeof d.scanDepth === "number") ? null : "scanDepth missing";
    });

    await check("reviews", `/api/v1/reviews?appId=${app.id}&limit=5`, plaintext, 200, (b) => {
      const data = b.data as unknown[];
      return Array.isArray(data) && data.length <= 5 ? null : "limit not honoured";
    });

    await check(
      "reviews rejects bad sentiment",
      `/api/v1/reviews?appId=${app.id}&sentiment=SPICY`,
      plaintext,
      400,
    );

    await check("insights", "/api/v1/insights", plaintext, 200, (b) =>
      Array.isArray(b.insights) && Array.isArray(b.recommendations) ? null : "wrong shape",
    );

    await check(
      "export rejects an unknown type",
      `/api/v1/export?appId=${app.id}&type=nonsense`,
      plaintext,
      400,
    );

    // Exports return a file, not JSON, so they are checked directly.
    for (const type of ["metrics", "keywords", "reviews", "charts", "changes"]) {
      const res = await fetch(
        `${BASE}/api/v1/export?appId=${app.id}&type=${type}&days=30&format=csv`,
        { headers: { Authorization: `Bearer ${plaintext}` } },
      );
      // Read bytes, not text: Response.text() performs a UTF-8 decode, which
      // strips the BOM — so a text-level check can never see it.
      const bytes = new Uint8Array(await res.arrayBuffer());
      const body = Buffer.from(bytes).toString("utf8");
      const disposition = res.headers.get("content-disposition") ?? "";

      const problems: string[] = [];
      if (res.status !== 200) problems.push(`status ${res.status}`);
      if (!res.headers.get("content-type")?.includes("text/csv")) problems.push("not text/csv");
      if (!/attachment; filename=".+\.csv"/.test(disposition)) problems.push("no filename");
      if (!(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)) {
        problems.push("missing BOM");
      }
      if (body.split("\r\n").length < 2) problems.push("no rows");

      report(`export ${type}`, problems.length === 0, problems.join(", ") || "csv");
    }

    const jsonExport = await fetch(
      `${BASE}/api/v1/export?appId=${app.id}&type=metrics&days=7&format=json`,
      { headers: { Authorization: `Bearer ${plaintext}` } },
    );
    const parsed = (await jsonExport.json()) as { rows?: unknown[] };
    report(
      "export json",
      jsonExport.status === 200 && Array.isArray(parsed.rows) && parsed.rows.length > 0,
      `${parsed.rows?.length ?? 0} rows`,
    );

    await check(
      "export refuses another org's app",
      "/api/v1/export?appId=clzzzzzzzzzzzzzzzzzzzzzzz&type=metrics",
      plaintext,
      404,
    );

    // --- Tenant isolation -------------------------------------------------
    const foreignApp = await db.app.findFirst({ where: { organizationId: { not: org.id } } });
    if (foreignApp) {
      await check(
        "cannot read another org's app",
        `/api/v1/metrics?appId=${foreignApp.id}&metric=INSTALLS`,
        plaintext,
        404,
      );
    } else {
      await check(
        "unknown appId is 404",
        "/api/v1/metrics?appId=clzzzzzzzzzzzzzzzzzzzzzzz&metric=INSTALLS",
        plaintext,
        404,
      );
    }

    // --- Revocation -------------------------------------------------------
    await db.apiKey.update({ where: { id: created.id }, data: { revokedAt: new Date() } });
    await check("revoked key is rejected", "/api/v1/apps", plaintext, 401);

    // lastUsedAt should have been recorded by the successful calls above.
    const after = await db.apiKey.findUnique({ where: { id: created.id } });
    report("records lastUsedAt", after?.lastUsedAt != null, after?.lastUsedAt?.toISOString() ?? "never set");
  } finally {
    await db.apiKey.delete({ where: { id: created.id } }).catch(() => undefined);
  }

  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) failed.`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => void db.$disconnect());
