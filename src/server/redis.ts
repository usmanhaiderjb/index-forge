import "server-only";

import IORedis, { type RedisOptions } from "ioredis";

import { env } from "@/env";

const globalForRedis = globalThis as unknown as {
  redis: IORedis | undefined;
  redisBlocking: IORedis | undefined;
};

/**
 * Repeated connection errors are collapsed to one log line. A Redis that is
 * simply not running would otherwise emit a line per retry, forever.
 */
function attachLogging(client: IORedis, label: string) {
  let last = "";

  client.on("error", (error) => {
    const detail =
      (error as NodeJS.ErrnoException).code ?? error.message ?? error.name ?? "connection failed";
    if (detail === last) return;
    last = detail;
    console.error(`[${label}] ${detail} — queue-backed features are unavailable until Redis is reachable`);
  });

  client.on("ready", () => {
    last = "";
  });

  return client;
}

function createClient(label: string, options: RedisOptions): IORedis {
  // lazyConnect keeps `next build` from opening a socket while collecting page
  // data — the build imports these modules but never issues a command.
  return attachLogging(new IORedis(env.REDIS_URL, { lazyConnect: true, ...options }), label);
}

/**
 * Request-path client: rate limiting, OAuth state, scrape throttling, and
 * enqueueing jobs.
 *
 * Retries are deliberately bounded. A request that needs Redis while Redis is
 * down has to fail with a message the user can act on — retrying forever turns
 * a clear error into a spinner that never resolves.
 */
export const redis =
  globalForRedis.redis ??
  createClient("redis", {
    maxRetriesPerRequest: 2,
    enableReadyCheck: false,
    connectTimeout: 3000,
    commandTimeout: 5000,
    retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1000)),
  });

/**
 * Worker client. BullMQ's blocking reads (BZPOPMIN and friends) sit open for
 * far longer than any command timeout would allow, and a worker that gives up
 * on a brief Redis blip would stop processing entirely — so this one has no
 * command timeout and reconnects indefinitely.
 */
export function blockingRedis(): IORedis {
  globalForRedis.redisBlocking ??= createClient("redis:worker", {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  return globalForRedis.redisBlocking;
}

if (env.NODE_ENV !== "production") globalForRedis.redis = redis;

/**
 * Fixed-window counter. Good enough for outbound API politeness and for
 * capping AI spend per organization; not a distributed token bucket.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
  const redisKey = `ratelimit:${key}`;
  const count = await redis.incr(redisKey);
  const windowSecs = Math.max(1, Math.round(Number(windowSeconds) || 60));
  if (count === 1) await redis.expire(redisKey, windowSecs);
  const ttl = await redis.ttl(redisKey);
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    resetIn: ttl < 0 ? windowSecs : ttl,
  };
}

/**
 * Serializes outbound calls to a host across every worker. Store scraping
 * from many concurrent jobs is the fastest way to get blocked.
 */
export async function throttleHost(host: string, minIntervalMs: number): Promise<void> {
  const key = `throttle:${host}`;
  const interval = Math.max(10, Math.round(Number(minIntervalMs) || 1200));

  // SET NX is the whole point: the old read-wait-write version let every
  // concurrent caller read the same timestamp, sleep the same amount, and then
  // fire simultaneously — so N crawl lanes hit a host N times at once while
  // appearing to be throttled. Only one caller can take the key, and everyone
  // else waits out its TTL, which holds across processes and workers too.
  for (;;) {
    const taken = await blockingRedis().set(key, "1", "PX", interval, "NX");
    if (taken) return;

    const ttl = await blockingRedis().pttl(key);
    // -2 is "already gone", -1 is "no expiry set" — neither should sleep long.
    await new Promise((r) => setTimeout(r, ttl > 0 ? ttl : 25));
  }
}
