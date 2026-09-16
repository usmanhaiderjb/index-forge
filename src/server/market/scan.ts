import "server-only";

import { playChart } from "@/server/aso/builtin/charts";
import { playDetails } from "@/server/aso/builtin/play";
import { MINE_CATEGORIES } from "@/server/aso/mining";
import { db } from "@/server/db";

/**
 * Sweep the charts and record what is there.
 *
 * Separate from the Gap Finder's `collectNicheApps`, which reads a single
 * category on demand as part of building a niche. This is the standing
 * collection that Trends runs on: broad, shallow, and repeated, so a second
 * reading of the same app eventually exists.
 *
 * Every pass writes a snapshot even when nothing changed. That is the point —
 * a velocity figure is derived from two readings, and a pass that skipped
 * unchanged apps would never produce the second one.
 */

export type ScanResult = {
  category: string;
  seen: number;
  created: number;
  snapshots: number;
};

export async function scanCategory(options: {
  category: string;
  country?: string;
  depth?: number;
}): Promise<ScanResult> {
  const country = options.country ?? "us";
  const depth = options.depth ?? 20;

  const chart = await playChart({
    chart: "TOP_FREE",
    country,
    category: options.category,
    limit: depth,
  });

  let created = 0;
  let snapshots = 0;

  for (const [index, entry] of chart.entries.slice(0, depth).entries()) {
    let detail;
    try {
      detail = await playDetails(entry.storeId, { country, locale: "en-US" });
    } catch {
      // One unreadable listing must not abort the sweep.
      continue;
    }
    if (!detail) continue;

    const existing = await db.marketApp.findUnique({
      where: {
        platform_storeId_country: { platform: "ANDROID", storeId: entry.storeId, country },
      },
      select: { id: true },
    });

    const app = existing
      ? await db.marketApp.update({
          where: { id: existing.id },
          data: {
            lastSeenAt: new Date(),
            name: detail.name,
            developer: detail.developer,
            category: options.category,
            // Set only if the provider ever supplies one. Play's listing pages
            // do not — see chartMovement() in velocity.ts for why we no longer
            // try to infer it.
            ...(detail.releasedAt ? { releasedAt: detail.releasedAt } : {}),
          },
          select: { id: true },
        })
      : await db.marketApp.create({
          data: {
            platform: "ANDROID",
            storeId: entry.storeId,
            country,
            name: detail.name,
            developer: detail.developer,
            category: options.category,
            releasedAt: detail.releasedAt ?? null,
          },
          select: { id: true },
        });

    if (!existing) created++;

    await db.marketAppSnapshot.create({
      data: {
        marketAppId: app.id,
        ratingCount: detail.ratingCount ?? null,
        ratingAverage: detail.ratingAverage ?? null,
        installsText: detail.installsText ?? null,
        chartRank: index + 1,
      },
    });
    snapshots++;
  }

  return { category: options.category, seen: chart.entries.length, created, snapshots };
}

/**
 * Sweep every tracked category.
 *
 * Sequential, because every listing lookup goes through the shared per-host
 * throttle. Twenty apps across eight categories is 160 requests at the search
 * floor — roughly eleven minutes, which is why this belongs on a schedule
 * rather than behind a button someone waits on.
 */
export async function scanAllCategories(options: {
  country?: string;
  depth?: number;
} = {}): Promise<ScanResult[]> {
  const results: ScanResult[] = [];

  for (const category of MINE_CATEGORIES.ANDROID) {
    try {
      results.push(await scanCategory({ ...options, category: category.id }));
    } catch (error) {
      // A throttled category should not cost the ones after it.
      console.warn(`[scan] ${category.id}: ${(error as Error).message.slice(0, 120)}`);
      results.push({ category: category.id, seen: 0, created: 0, snapshots: 0 });
    }
  }

  return results;
}
