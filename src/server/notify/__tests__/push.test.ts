import { describe, expect, it } from "vitest";

import { inQuietHours } from "@/server/notify/push";
import { parseChannels } from "@/server/notify";

/** A Date at a known UTC hour, so the zone maths is checkable. */
function atUtcHour(hour: number): Date {
  return new Date(Date.UTC(2026, 7, 17, hour, 30, 0));
}

describe("inQuietHours", () => {
  it("is off when neither end is set", () => {
    expect(inQuietHours(null, null, "UTC", atUtcHour(3))).toBe(false);
  });

  it("is off when only one end is set", () => {
    expect(inQuietHours(22, null, "UTC", atUtcHour(23))).toBe(false);
    expect(inQuietHours(null, 8, "UTC", atUtcHour(3))).toBe(false);
  });

  it("handles a window inside one day", () => {
    // 9 → 17
    expect(inQuietHours(9, 17, "UTC", atUtcHour(12))).toBe(true);
    expect(inQuietHours(9, 17, "UTC", atUtcHour(8))).toBe(false);
    expect(inQuietHours(9, 17, "UTC", atUtcHour(18))).toBe(false);
  });

  it("handles a window spanning midnight", () => {
    // 22 → 8 is the normal setting, and the one a naive range check breaks on.
    expect(inQuietHours(22, 8, "UTC", atUtcHour(23))).toBe(true);
    expect(inQuietHours(22, 8, "UTC", atUtcHour(2))).toBe(true);
    expect(inQuietHours(22, 8, "UTC", atUtcHour(7))).toBe(true);
    expect(inQuietHours(22, 8, "UTC", atUtcHour(8))).toBe(false);
    expect(inQuietHours(22, 8, "UTC", atUtcHour(12))).toBe(false);
    expect(inQuietHours(22, 8, "UTC", atUtcHour(21))).toBe(false);
  });

  it("is inclusive at the start and exclusive at the end", () => {
    expect(inQuietHours(22, 8, "UTC", atUtcHour(22))).toBe(true);
    expect(inQuietHours(9, 17, "UTC", atUtcHour(17))).toBe(false);
  });

  it("treats an empty window as off rather than as all day", () => {
    expect(inQuietHours(8, 8, "UTC", atUtcHour(8))).toBe(false);
  });

  it("evaluates in the user's zone, not the server's", () => {
    // 02:30 UTC is 22:30 the previous day in New York, so a 22→8 window is
    // active there and not in Tokyo, where it is already 11:30.
    expect(inQuietHours(22, 8, "America/New_York", atUtcHour(2))).toBe(true);
    expect(inQuietHours(22, 8, "Asia/Tokyo", atUtcHour(2))).toBe(false);
  });

  it("stays off for an unknown zone rather than silencing everything", () => {
    // A bad stored value must not become a permanent do-not-disturb.
    expect(inQuietHours(22, 8, "Mars/Olympus_Mons", atUtcHour(23))).toBe(false);
  });
});

describe("parseChannels — push", () => {
  it("reads an explicit user list", () => {
    expect(parseChannels({ push: { userIds: ["u1", "u2"] } }).push).toEqual({
      userIds: ["u1", "u2"],
    });
  });

  it("treats `true` as everyone in the organization", () => {
    expect(parseChannels({ push: true }).push).toEqual({});
  });

  it("treats an empty object as everyone", () => {
    expect(parseChannels({ push: {} }).push).toEqual({});
  });

  it("treats an empty user list as everyone rather than as nobody", () => {
    // A saved rule with an emptied list means "no longer restricted", not
    // "silently stop delivering".
    expect(parseChannels({ push: { userIds: [] } }).push).toEqual({});
  });

  it("is absent when not configured", () => {
    expect(parseChannels({ webhook: "https://example.com/hook" }).push).toBeUndefined();
    expect(parseChannels({}).push).toBeUndefined();
  });

  it("ignores non-string ids", () => {
    expect(parseChannels({ push: { userIds: ["u1", 42, null] } }).push).toEqual({
      userIds: ["u1"],
    });
  });

  it("does not disturb the existing channels", () => {
    const parsed = parseChannels({
      webhook: "https://example.com/hook",
      email: ["ops@example.com"],
      push: true,
    });
    expect(parsed.webhook).toBe("https://example.com/hook");
    expect(parsed.email).toEqual(["ops@example.com"]);
    expect(parsed.push).toEqual({});
  });
});
