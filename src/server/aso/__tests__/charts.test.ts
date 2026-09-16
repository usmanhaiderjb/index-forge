import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/aso/builtin/http", () => ({
  storeFetch: vi.fn(),
  storeFetchJson: vi.fn(),
  isNotFound: () => false,
}));

import { itunesChart, playChart } from "@/server/aso/builtin/charts";
import { storeFetch, storeFetchJson } from "@/server/aso/builtin/http";

const fetchJson = vi.mocked(storeFetchJson);
const fetchText = vi.mocked(storeFetch);

function entry(id: string, name: string) {
  return { id: { attributes: { "im:id": id } }, "im:name": { label: name } };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("itunesChart", () => {
  it("numbers entries by their position in the feed", async () => {
    fetchJson.mockResolvedValue({
      feed: { entry: [entry("1", "First"), entry("2", "Second"), entry("3", "Third")] },
    });

    const result = await itunesChart({ chart: "TOP_FREE", country: "us" });

    expect(result.entries).toEqual([
      { position: 1, storeId: "1", name: "First" },
      { position: 2, storeId: "2", name: "Second" },
      { position: 3, storeId: "3", name: "Third" },
    ]);
    expect(result.scanDepth).toBe(3);
  });

  it("handles a single-entry feed, which Apple returns as an object not an array", async () => {
    fetchJson.mockResolvedValue({ feed: { entry: entry("42", "Only") } });

    const result = await itunesChart({ chart: "TOP_PAID", country: "gb" });

    expect(result.entries).toEqual([{ position: 1, storeId: "42", name: "Only" }]);
  });

  it("reports an empty feed as a zero-depth scan, not as a rank", async () => {
    fetchJson.mockResolvedValue({ feed: {} });

    const result = await itunesChart({ chart: "TOP_FREE", country: "us" });

    expect(result.entries).toEqual([]);
    expect(result.scanDepth).toBe(0);
  });

  it("drops entries with no track id rather than emitting a blank storeId", async () => {
    fetchJson.mockResolvedValue({
      feed: { entry: [entry("1", "Good"), { "im:name": { label: "Broken" } }] },
    });

    const result = await itunesChart({ chart: "TOP_FREE", country: "us" });
    expect(result.entries).toHaveLength(1);
  });

  it("requests the category feed when a category is given", async () => {
    fetchJson.mockResolvedValue({ feed: { entry: [] } });

    await itunesChart({ chart: "TOP_GROSSING", country: "de", category: "6007" });

    expect(fetchJson).toHaveBeenCalledWith(
      expect.stringContaining("/de/rss/topgrossingapplications/limit=200/genre=6007/json"),
    );
  });

  it("caps the requested depth at the feed's own maximum", async () => {
    fetchJson.mockResolvedValue({ feed: { entry: [] } });

    await itunesChart({ chart: "TOP_FREE", country: "us", limit: 5000 });

    expect(fetchJson).toHaveBeenCalledWith(expect.stringContaining("limit=200"));
  });
});

describe("playChart", () => {
  it("ranks packages by document order and de-duplicates", async () => {
    fetchText.mockResolvedValue(`
      <a href="/store/apps/details?id=com.a">A</a>
      <a href="/store/apps/details?id=com.b">B</a>
      <a href="/store/apps/details?id=com.a">A again</a>
      <a href="/store/apps/details?id=com.c">C</a>
    `);

    const result = await playChart({ chart: "TOP_FREE", country: "us" });

    expect(result.entries.map((e) => e.storeId)).toEqual(["com.a", "com.b", "com.c"]);
    expect(result.entries[0]?.position).toBe(1);
  });

  it("reports top grossing as an empty scan rather than returning the free chart", async () => {
    const result = await playChart({ chart: "TOP_GROSSING", country: "us" });

    expect(result.entries).toEqual([]);
    expect(result.scanDepth).toBe(0);
    // Must not have gone to the network at all.
    expect(fetchText).not.toHaveBeenCalled();
  });

  it("honours the requested depth", async () => {
    fetchText.mockResolvedValue(
      Array.from({ length: 50 }, (_, i) => `<a href="/store/apps/details?id=com.p${i}">x</a>`).join(""),
    );

    const result = await playChart({ chart: "TOP_FREE", country: "us", limit: 10 });
    expect(result.entries).toHaveLength(10);
  });
});
