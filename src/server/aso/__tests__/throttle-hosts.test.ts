import { describe, expect, it, vi } from "vitest";

/**
 * Per-host request floors.
 *
 * The distinction these encode was learned the expensive way. Over a five-hour
 * corpus build the two autocomplete hosts were never rate limited once, while
 * both search hosts throttled us repeatedly — Apple answering 403 rather than
 * 429, which is its own trap. One global delay cannot express that, and setting
 * it slow enough for search would have made discovery three times slower for no
 * reason.
 *
 * The env module validates at import, so it is mocked here rather than dragging
 * a full environment into a unit test.
 */

vi.mock("@/env", () => ({
  env: { ASO_SCRAPE_DELAY_MS: 1200, ASO_SEARCH_DELAY_MS: 4000, ASO_USER_AGENT: "test" },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/server/redis", () => ({ throttleHost: vi.fn() }));

const { intervalFor } = await import("../builtin/http");

describe("intervalFor", () => {
  it("holds search hosts to the slower floor", () => {
    expect(intervalFor("itunes.apple.com")).toBe(4000);
    expect(intervalFor("play.google.com")).toBe(4000);
  });

  it("leaves autocomplete hosts at the normal delay", () => {
    // These are where discovery throughput comes from, and they never
    // complained. Slowing them would cost ~40,000 terms an hour for nothing.
    expect(intervalFor("search.itunes.apple.com")).toBe(1200);
    expect(intervalFor("suggestqueries.google.com")).toBe(1200);
  });

  it("treats an unknown host as ordinary", () => {
    expect(intervalFor("example.com")).toBe(1200);
  });
});
