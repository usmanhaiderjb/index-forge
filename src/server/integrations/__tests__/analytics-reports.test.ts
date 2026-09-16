import { describe, expect, it } from "vitest";

import { normalizeTrafficSource } from "@aso/shared";
import { parseTsv } from "@/server/integrations/apple/analytics-reports";

/**
 * App Store Connect Analytics report parsing.
 *
 * These run against fixtures, not a live account — no Apple credentials were
 * available. What they pin is the parsing and column-resolution behaviour, which
 * is where a rename or an encoding surprise turns into silently wrong numbers.
 * The network shape (request → report → instance → segment) is unverified and
 * says so in `analytics-reports.ts`.
 */

const ENGAGEMENT_TSV = [
  "Date\tApp Name\tApp Apple Identifier\tSource Type\tTerritory\tImpressions\tProduct Page Views",
  "2026-08-01\tHabitly\t1000000001\tApp Store Search\tUnited States\t18400\t2610",
  "2026-08-01\tHabitly\t1000000001\tApp Store Browse\tUnited States\t9100\t420",
  "2026-08-01\tHabitly\t1000000001\tWeb Referrer\tUnited States\t1200\t380",
  "2026-08-01\tHabitly\t1000000001\tUnavailable\tUnited States\t300\t40",
].join("\n");

const DOWNLOADS_TSV = [
  "Date\tSource Type\tDownload Type\tTerritory\tCounts",
  "2026-08-01\tApp Store Search\tFirst-time download\tUnited States\t812",
  "2026-08-01\tApp Store Search\tRedownload\tUnited States\t5300",
  "2026-08-01\tApp Store Browse\tFirst-time download\tUnited States\t47",
].join("\n");

describe("parseTsv", () => {
  it("reads a header line and maps every row to it", () => {
    const rows = parseTsv(ENGAGEMENT_TSV);

    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({
      Date: "2026-08-01",
      "Source Type": "App Store Search",
      Impressions: "18400",
      "Product Page Views": "2610",
    });
  });

  it("keeps commas inside values intact", () => {
    // The sales-report path swaps tabs for commas and reuses the CSV reader.
    // Doing that here would split "Korea, Republic of" into two columns and
    // shift every field after it.
    const tsv = [
      "Date\tSource Type\tTerritory\tImpressions",
      "2026-08-01\tApp Store Search\tKorea, Republic of\t4100",
    ].join("\n");

    const rows = parseTsv(tsv);
    expect(rows[0]!.Territory).toBe("Korea, Republic of");
    expect(rows[0]!.Impressions).toBe("4100");
  });

  it("survives CRLF, which Apple's exports use", () => {
    const rows = parseTsv(ENGAGEMENT_TSV.replace(/\n/g, "\r\n"));
    expect(rows).toHaveLength(4);
    expect(rows[0]!.Impressions).toBe("18400");
  });

  it("returns nothing for a header-only or empty segment", () => {
    expect(parseTsv("")).toEqual([]);
    expect(parseTsv("Date\tSource Type\tImpressions")).toEqual([]);
  });

  it("pads short rows rather than shifting fields", () => {
    const rows = parseTsv("Date\tSource Type\tImpressions\n2026-08-01\tApp Store Search");
    expect(rows[0]).toEqual({
      Date: "2026-08-01",
      "Source Type": "App Store Search",
      Impressions: "",
    });
  });
});

describe("Apple source types reach the shared buckets", () => {
  it("maps every value in the engagement fixture", () => {
    const mapped = parseTsv(ENGAGEMENT_TSV).map((r) => normalizeTrafficSource(r["Source Type"]!));
    expect(mapped).toEqual(["search", "browse", "referral", "other"]);
  });
});

describe("download type filtering", () => {
  // INSTALLS means a first-time download. Redownloads, auto-downloads to a
  // second device and restores are all real events and none of them is a new
  // install — counting them inflates Apple against every other source.
  const isFirstTime = (kind: string) => /first[\s-]*time/i.test(kind);

  it("keeps first-time downloads and drops the rest", () => {
    const rows = parseTsv(DOWNLOADS_TSV).filter((r) => isFirstTime(r["Download Type"]!));

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.Counts)).toEqual(["812", "47"]);
  });

  it("does not let redownloads through, which outnumber installs", () => {
    const redownloads = parseTsv(DOWNLOADS_TSV).filter((r) => !isFirstTime(r["Download Type"]!));
    expect(redownloads.map((r) => r.Counts)).toEqual(["5300"]);
    // 5300 against 812 — including it would have made search look 7x better.
    expect(Number(redownloads[0]!.Counts)).toBeGreaterThan(Number(parseTsv(DOWNLOADS_TSV)[0]!.Counts));
  });

  it("accepts the spelling variants Apple has used", () => {
    for (const kind of ["First-time download", "First Time Download", "firsttime download"]) {
      expect(isFirstTime(kind)).toBe(true);
    }
    for (const kind of ["Redownload", "Auto-download", "Restore"]) {
      expect(isFirstTime(kind)).toBe(false);
    }
  });
});
