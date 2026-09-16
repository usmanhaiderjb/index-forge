import "server-only";

import { buildNiche } from "@/server/market/ingest";
import { scanAllCategories } from "@/server/market/scan";

/**
 * Build one niche: charts, listings, reviews, classification, themes.
 *
 * One job per niche rather than one per app. Every step is a throttled store
 * request and the steps depend on each other in order, so splitting it across
 * jobs would buy no parallelism and lose the ability to report a single
 * coherent result.
 */
export async function handleMarketNiche(data: {
  category: string;
  label: string;
  organizationId: string;
}): Promise<void> {
  const result = await buildNiche({
    category: data.category,
    label: data.label,
    organizationId: data.organizationId,
  });

  console.log(
    `[market] ${data.label} — ${result.appsRead}/${result.apps} apps read, ` +
      `${result.reviewsFetched} reviews, ${result.reviewsClassified} classified, ` +
      `${result.themes} themes`,
  );
}

/**
 * Sweep every category chart and snapshot what is there.
 *
 * Repeated on a schedule rather than run on demand: a velocity figure needs two
 * readings of the same app, and the second one only exists because this ran
 * again a week later.
 */
export async function handleMarketScan(depth?: number): Promise<void> {
  const results = await scanAllCategories({ depth });

  const created = results.reduce((sum, r) => sum + r.created, 0);
  const snapshots = results.reduce((sum, r) => sum + r.snapshots, 0);

  console.log(
    `[market] scanned ${results.length} categories — ${created} new apps, ${snapshots} snapshots`,
  );
}
