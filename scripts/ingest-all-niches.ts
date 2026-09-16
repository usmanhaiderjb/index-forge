process.env.PRISMA_LOG_QUERIES = "0";
import Module from "node:module";

const load = (Module as unknown as { _load: (...args: unknown[]) => unknown })._load;
(Module as unknown as { _load: (...args: unknown[]) => unknown })._load = function (
  this: unknown,
  request: unknown,
  ...rest: unknown[]
) {
  if (typeof request === "string" && request.includes("server-only")) return {};
  return load.call(this, request, ...rest);
} as never;

const { buildNiche } = (await import("../src/server/market/ingest")) as typeof import("../src/server/market/ingest");
const { MINE_CATEGORIES } = (await import("../src/server/aso/mining")) as typeof import("../src/server/aso/mining");
const { db } = (await import("../src/server/db")) as typeof import("../src/server/db");

async function main() {
  const organization = await db.organization.findFirst({ select: { id: true, name: true } });
  if (!organization) {
    console.error("No organization found in database.");
    process.exit(1);
  }

  console.log(`Starting niche review ingestion for "${organization.name}"...`);
  const categories = MINE_CATEGORIES.ANDROID;

  for (let i = 0; i < categories.length; i++) {
    const category = categories[i];
    if (!category) continue;
    console.log(`[${i + 1}/${categories.length}] Processing ${category.label} (${category.id})...`);

    try {
      const result = await buildNiche({
        category: category.id,
        label: category.label,
        organizationId: organization.id,
        country: "us",
        apps: 8,
        reviewsPerApp: 40,
      });

      console.log(
        `  -> ${category.label}: ${result.appsRead}/${result.apps} apps read, ` +
          `${result.reviewsFetched} reviews fetched, ${result.themes} themes derived`
      );
    } catch (err) {
      console.error(`  -> Failed for ${category.label}:`, (err as Error).message);
    }

    // Polite cooldown between categories
    await new Promise((r) => setTimeout(r, 4000));
  }

  const totalReviews = await db.marketReview.count();
  const totalNiches = await db.marketNiche.count();
  console.log(`\nIngestion complete! Total MarketReviews in DB: ${totalReviews} across ${totalNiches} niches.`);
  await db.$disconnect();
}

main().catch(console.error);
