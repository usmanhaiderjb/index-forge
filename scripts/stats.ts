/**
 * What the collections currently hold.
 *
 * Read-only, and safe to run while `grow.ts` is collecting.
 */
process.env.PRISMA_LOG_QUERIES = "0";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({ log: [] });
const n = (x: number): string => x.toLocaleString("en-US");

const [terms, scored, estimates, apps, snapshots, reviews, niches] = await Promise.all([
  db.keywordTerm.count(),
  db.keywordCompetition.count(),
  db.keywordVolumeEstimate.count(),
  db.marketApp.count(),
  db.marketAppSnapshot.count(),
  db.marketReview.count(),
  db.marketNiche.count(),
]);

const readyForMovement = (
  await db.marketAppSnapshot.groupBy({ by: ["marketAppId"], _count: { _all: true } })
).filter((row) => row._count._all >= 2).length;

const rescored = await db.keywordCompetition.count({
  where: { platform: "ANDROID", method: { contains: "star ratings only" } },
});
const android = await db.keywordCompetition.count({ where: { platform: "ANDROID" } });
const pendingFrontier = await db.crawlTask.count({ where: { state: "PENDING" } });

console.log(`keywords   terms=${n(terms)} scored=${n(scored)} estimates=${n(estimates)} frontier_pending=${n(pendingFrontier)}`);
console.log(`trends     apps=${n(apps)} snapshots=${n(snapshots)} ready_for_movement=${n(readyForMovement)}`);
console.log(`gaps       reviews=${n(reviews)} niches=${n(niches)}`);
console.log(`rescore    android_star_basis=${n(rescored)}/${n(android)}`);

await db.$disconnect();
