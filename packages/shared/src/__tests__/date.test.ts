import { describe, expect, it } from "vitest";

import { toUtcDate, ymd, ymdCompact } from "@aso/shared";

describe("toUtcDate", () => {
  it("reads a bare calendar date as that UTC day", () => {
    // The bug this pins: parsed as local midnight, a host east of UTC turned
    // 2026-08-01 into 2026-07-31T…Z and filed the whole sync a day early.
    expect(toUtcDate("2026-08-01").toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });

  it("reads a compact calendar date the same way", () => {
    expect(toUtcDate("20260801").toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });

  it("round-trips through ymd unchanged", () => {
    for (const input of ["2026-01-01", "2026-02-28", "2026-03-01", "2026-12-31"]) {
      expect(ymd(toUtcDate(input))).toBe(input);
    }
  });

  it("round-trips through ymdCompact unchanged", () => {
    expect(ymdCompact(toUtcDate("20260801"))).toBe("20260801");
  });

  it("keeps the UTC day of a full timestamp", () => {
    expect(toUtcDate("2026-08-01T23:59:59.000Z").toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(toUtcDate("2026-08-01T00:00:01.000Z").toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });

  it("truncates a Date to its UTC midnight", () => {
    expect(toUtcDate(new Date("2026-08-01T18:30:00.000Z")).toISOString()).toBe(
      "2026-08-01T00:00:00.000Z",
    );
  });

  it("is idempotent", () => {
    const once = toUtcDate("2026-08-01");
    expect(toUtcDate(once).toISOString()).toBe(once.toISOString());
  });
});
