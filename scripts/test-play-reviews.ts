process.env.PRISMA_LOG_QUERIES = "0";
import { collectPlayReviews } from "../src/server/market/play-reviews";

async function main() {
  const pkg = "com.fitbit.FitbitMobile";
  console.log(`Testing collectPlayReviews for ${pkg}...`);
  try {
    const reviews = await collectPlayReviews({
      packageName: pkg,
      country: "us",
      limit: 10,
    });
    console.log(`Successfully fetched ${reviews.length} reviews!`);
    if (reviews.length > 0) {
      console.log('Sample review:', reviews[0]);
    }
  } catch (err) {
    console.error('Failed to fetch reviews:', err);
  }
}

main().catch(console.error);
