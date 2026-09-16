import "server-only";

import { env } from "@/env";
import { withRetry } from "@aso/shared";
import { throttleHost } from "@/server/redis";

/**
 * Public reviews for any Play app.
 *
 * ## Why this is not a documented API call
 *
 * Neither store serves third-party review text through anything documented any
 * more, and both of the obvious routes are dead:
 *
 *   - Apple's `rss/customerreviews` feed still answers 200 with a current
 *     `updated` timestamp and **zero entries**, for every app tried. It is a
 *     shell.
 *   - Play's listing page no longer embeds review payloads, and neither
 *     `showAllReviews=true` nor Apple's `?see-all=reviews` changes that.
 *
 * Both stores moved reviews to client-side fetches. This module calls the same
 * endpoint the Play web interface calls — `batchexecute`, RPC `UsvDTd` — which
 * is how the reviews a browser shows you actually arrive.
 *
 * ## What that means for reliability
 *
 * It is undocumented and unversioned. The RPC id, the request shape and the
 * positions within the response array are all reverse-engineered, and Google
 * can change any of them without notice. `parsePlayReviews` is therefore
 * written to fail loudly on an unexpected shape rather than return an empty
 * array, because a silent empty result is how a broken scraper survives for
 * months looking healthy — which is exactly what the dead Apple feed does.
 *
 * There is no equivalent here for iOS. Apple's internal `amp-api` requires a
 * bearer token that is no longer discoverable in the page or its scripts, and
 * answers 401 without one.
 */

const BATCH_URL = "https://play.google.com/_/PlayStoreUi/data/batchexecute";

/** The reviews RPC used by the Play web interface. */
const REVIEWS_RPC = "UsvDTd";

export type PlayReview = {
  /** Store-native review id, used to ingest and classify exactly once. */
  externalId: string;
  rating: number;
  body: string;
  submittedAt: Date;
  appVersion: string | null;
  thumbsUp: number;
};

export type PlayReviewPage = {
  reviews: PlayReview[];
  /** Opaque cursor for the next page, or null at the end. */
  nextToken: string | null;
};

/**
 * Turn one `batchexecute` response into reviews.
 *
 * Exported separately from the fetch so the response shape can be tested
 * against a recorded payload — the part most likely to break is the parsing,
 * and it is the part a network test would exercise least reliably.
 */
export function parsePlayReviews(raw: string): PlayReviewPage {
  // The response opens with an anti-JSON-hijacking prefix, )]}' and a newline.
  const newline = raw.indexOf("\n");
  const json = newline === -1 ? raw : raw.slice(newline);

  let envelope: unknown;
  try {
    envelope = JSON.parse(json);
  } catch {
    throw new Error("Play reviews: response was not JSON. The endpoint shape has changed.");
  }

  if (!Array.isArray(envelope) || !Array.isArray(envelope[0])) {
    throw new Error("Play reviews: unexpected envelope. The endpoint shape has changed.");
  }

  const inner = envelope[0][2];
  if (typeof inner !== "string") {
    /*
     * A null payload means one of three things, and they are indistinguishable
     * from the response alone: the app does not exist, the RPC id has gone
     * stale, or **we are being throttled**.
     *
     * The third is by far the commonest, and it is the reason this is thrown
     * with a 429 rather than a plain error. Play does not answer 429 here — it
     * answers 200 with an empty payload — so a caller that treats this as a
     * permanent failure will declare the integration dead every time it is
     * asked to slow down. This was observed directly: a burst of probes turned
     * every app into a null payload for a few minutes, then it recovered on its
     * own with no code change.
     *
     * Same lesson as Apple answering 403 instead of 429 for search throttling:
     * classify on behaviour, not on the status line.
     */
    throw Object.assign(
      new Error(
        `Play reviews: empty payload for RPC ${REVIEWS_RPC}. ` +
          `Usually rate limiting — back off before assuming the endpoint changed.`,
      ),
      { status: 429 },
    );
  }

  const payload = JSON.parse(inner) as unknown[];
  const rows = Array.isArray(payload[0]) ? (payload[0] as unknown[]) : [];

  const reviews: PlayReview[] = [];

  for (const row of rows) {
    if (!Array.isArray(row)) continue;

    const externalId = typeof row[0] === "string" ? row[0] : null;
    const rating = typeof row[2] === "number" ? row[2] : null;
    const body = typeof row[4] === "string" ? row[4] : "";
    const seconds = Array.isArray(row[5]) && typeof row[5][0] === "number" ? row[5][0] : null;

    // A review with no id cannot be deduplicated and a review with no rating
    // cannot be weighted, so neither is worth storing.
    if (!externalId || rating === null || seconds === null) continue;

    reviews.push({
      externalId,
      rating,
      body,
      submittedAt: new Date(seconds * 1000),
      appVersion: typeof row[10] === "string" ? row[10] : null,
      thumbsUp: typeof row[6] === "number" ? row[6] : 0,
    });
  }

  const cursor = Array.isArray(payload[1]) ? payload[1][1] : null;

  return { reviews, nextToken: typeof cursor === "string" ? cursor : null };
}

/**
 * Fetch one page of reviews.
 *
 * `sort` 1 is most recent, which is what market research wants — a theme that
 * stopped being raised six months ago is a fixed bug, not a gap.
 */
export async function fetchPlayReviews(options: {
  packageName: string;
  country?: string;
  count?: number;
  token?: string | null;
}): Promise<PlayReviewPage> {
  const count = Math.min(options.count ?? 40, 150);
  const country = options.country ?? "us";

  // Paging replaces the count block with the cursor from the previous page.
  const pagination = options.token
    ? [null, null, null, options.token]
    : [count, null, null];

  const inner = JSON.stringify([
    null,
    null,
    [2, 1, pagination, null, []],
    [options.packageName, 7],
  ]);

  const body = new URLSearchParams({
    "f.req": JSON.stringify([[[REVIEWS_RPC, inner, null, "generic"]]]),
  }).toString();

  const host = new URL(BATCH_URL).host;

  return withRetry(
    async () => {
      await throttleHost(host, env.ASO_SEARCH_DELAY_MS);

      const res = await fetch(`${BATCH_URL}?hl=en&gl=${encodeURIComponent(country)}`, {
        method: "POST",
        headers: {
          "User-Agent": env.ASO_USER_AGENT,
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body,
        signal: AbortSignal.timeout(25_000),
      });

      if (res.status === 429) {
        throw Object.assign(new Error("Rate limited by play.google.com"), { status: 429 });
      }
      if (!res.ok) {
        throw Object.assign(new Error(`play.google.com responded ${res.status}`), {
          status: res.status,
        });
      }

      return parsePlayReviews(await res.text());
    },
    { retries: 2, baseMs: 2000 },
  );
}

/**
 * Walk pages until `limit` reviews are collected or the store runs out.
 *
 * Throttled per host like every other outbound call. This is a heavier endpoint
 * than autocomplete and sits behind the search-host floor accordingly.
 */
export async function collectPlayReviews(options: {
  packageName: string;
  country?: string;
  limit?: number;
}): Promise<PlayReview[]> {
  const limit = options.limit ?? 120;
  const collected: PlayReview[] = [];
  let token: string | null = null;

  while (collected.length < limit) {
    const page: PlayReviewPage = await fetchPlayReviews({
      packageName: options.packageName,
      country: options.country,
      count: Math.min(40, limit - collected.length),
      token,
    });

    collected.push(...page.reviews);

    // No cursor, or a page that returned nothing, means the end. The second
    // check matters: the endpoint can return a cursor alongside an empty page,
    // and following it forever is an infinite loop.
    if (!page.nextToken || page.reviews.length === 0) break;
    token = page.nextToken;
  }

  return collected.slice(0, limit);
}
