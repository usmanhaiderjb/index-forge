import "server-only";

import { env } from "@/env";
import { withRetry } from "@aso/shared";
import { throttleHost } from "@/server/redis";

/**
 * Every outbound store request goes through here: one shared throttle per
 * host across all workers, a stable user agent, and retries on transient
 * failures. Hammering the stores from parallel jobs is what gets an IP blocked.
 */
/**
 * Hosts that need a slower floor than everything else.
 *
 * Not a guess. Across a five-hour corpus build the two autocomplete hosts —
 * `search.itunes.apple.com` and `suggestqueries.google.com` — were never rate
 * limited once, while both of these throttled us repeatedly, Apple answering
 * 403 rather than 429. Search is simply the expensive endpoint and the stores
 * price it accordingly.
 *
 * Slowing the whole host also slows lookups and chart reads that share it. That
 * is the correct behaviour: the store throttled the host, not the path.
 */
const SLOW_HOSTS = new Set(["itunes.apple.com", "play.google.com"]);

/** The minimum gap between requests to one host. */
export function intervalFor(host: string): number {
  const scrapeDelay = Number(env.ASO_SCRAPE_DELAY_MS) || 1200;
  const searchDelay = Number(env.ASO_SEARCH_DELAY_MS) || 4000;
  return SLOW_HOSTS.has(host)
    ? Math.max(scrapeDelay, searchDelay)
    : scrapeDelay;
}

export async function storeFetch(
  url: string,
  init: { headers?: Record<string, string>; acceptLanguage?: string; timeoutMs?: number } = {},
): Promise<string> {
  const host = new URL(url).host;

  return withRetry(
    async () => {
      await throttleHost(host, intervalFor(host));

      const res = await fetch(url, {
        headers: {
          "User-Agent": env.ASO_USER_AGENT,
          Accept: "text/html,application/json;q=0.9,*/*;q=0.8",
          "Accept-Language": init.acceptLanguage ?? "en-US,en;q=0.9",
          ...init.headers,
        },
        redirect: "follow",
        // A store under load will accept a connection and then never answer.
        // Without a deadline that request waits forever, and in a long crawl
        // one hung socket silently parks a whole lane for the rest of the run —
        // the failure looks like "the crawler stopped finding terms" rather
        // than like an error. A timeout turns it into a retry.
        signal: AbortSignal.timeout(init.timeoutMs ?? 20_000),
      });

      if (res.status === 404) {
        throw Object.assign(new Error(`Not found: ${url}`), { status: 404, notFound: true });
      }
      if (res.status === 429) {
        throw Object.assign(new Error(`Rate limited by ${host}`), { status: 429 });
      }
      if (!res.ok) {
        throw Object.assign(new Error(`${host} responded ${res.status}`), { status: res.status });
      }

      return res.text();
    },
    { retries: 2, baseMs: 1500 },
  );
}

export async function storeFetchJson<T>(url: string, init?: { acceptLanguage?: string }): Promise<T> {
  const text = await storeFetch(url, init);
  return JSON.parse(text) as T;
}

export function isNotFound(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { notFound?: boolean }).notFound === true;
}
