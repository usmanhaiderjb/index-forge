import { describe, expect, it, vi } from "vitest";
import { fastCache } from "@/server/cache/fast-cache";

describe("fastCache in-memory acceleration", () => {
  it("stores and retrieves items from memory cache", () => {
    fastCache.set("test:item1", { count: 42 }, 10);
    const retrieved = fastCache.get<{ count: number }>("test:item1");
    expect(retrieved).toEqual({ count: 42 });
  });

  it("handles cache misses and expiration correctly", () => {
    expect(fastCache.get("nonexistent_key")).toBeNull();

    // Expired item (negative TTL)
    fastCache.set("expired_key", "value", -1);
    expect(fastCache.get("expired_key")).toBeNull();
  });

  it("prevents thundering herd with getOrSet", async () => {
    let callCount = 0;
    const fetcher = vi.fn(async () => {
      callCount++;
      await new Promise((r) => setTimeout(r, 20));
      return { result: "ok", count: callCount };
    });

    const [res1, res2, res3] = await Promise.all([
      fastCache.getOrSet("concurrent:key", 60, fetcher),
      fastCache.getOrSet("concurrent:key", 60, fetcher),
      fastCache.getOrSet("concurrent:key", 60, fetcher),
    ]);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(res1).toEqual({ result: "ok", count: 1 });
    expect(res2).toEqual({ result: "ok", count: 1 });
    expect(res3).toEqual({ result: "ok", count: 1 });
  });
});
