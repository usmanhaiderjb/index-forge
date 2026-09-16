import "server-only";

import { redis } from "@/server/redis";

type CacheEntry<T> = {
  data: T;
  expiresAt: number;
};

/**
 * High-performance in-memory LRU cache with Redis L2 backing.
 * Provides <1ms response times for hot queries (corpus searches, app dossiers, charts, stats).
 */
class MemoryCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private inflight = new Map<string, Promise<unknown>>();
  private readonly maxSize: number;

  constructor(maxSize = 10_000) {
    this.maxSize = maxSize;
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    // Refresh LRU order
    this.cache.delete(key);
    this.cache.set(key, entry as CacheEntry<unknown>);
    return entry.data;
  }

  set<T>(key: string, data: T, ttlSeconds: number): void {
    if (this.cache.size >= this.maxSize) {
      // Evict oldest item
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  /**
   * Cached query with thundering herd / stampede protection.
   * Checks L1 (Memory) -> L2 (Redis) -> executes fetcher.
   */
  async getOrSet<T>(
    key: string,
    ttlSeconds: number,
    fetcher: () => Promise<T>,
  ): Promise<T> {
    // 1. Check L1 Memory Cache (<0.1ms)
    const memVal = this.get<T>(key);
    if (memVal !== null) {
      return memVal;
    }

    // 2. Prevent Thundering Herd with in-flight promise sharing
    if (this.inflight.has(key)) {
      return (await this.inflight.get(key)) as T;
    }

    const task = (async (): Promise<T> => {
      try {
        // 3. Check L2 Redis Cache (<2ms)
        try {
          const cachedJson = await redis.get(`fast:${key}`);
          if (cachedJson) {
            const parsed = JSON.parse(cachedJson) as T;
            this.set(key, parsed, ttlSeconds);
            return parsed;
          }
        } catch {
          // Redis down or not configured, proceed to fetcher
        }

        // 4. Execute Fetcher
        const result = await fetcher();

        // 5. Store in L1 and L2
        this.set(key, result, ttlSeconds);
        try {
          await redis.setex(`fast:${key}`, ttlSeconds, JSON.stringify(result));
        } catch {
          // Redis write error ignored
        }

        return result;
      } finally {
        this.inflight.delete(key);
      }
    })();

    this.inflight.set(key, task);
    return task;
  }
}

export const fastCache = new MemoryCache(10_000);
