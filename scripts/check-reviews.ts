process.env.PRISMA_LOG_QUERIES = "0";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({ log: [] });

async function inspect() {
  const niches = await db.marketNiche.findMany({
    include: {
      themes: true
    }
  });
  console.log('Niches count:', niches.length);
  for (const n of niches) {
    console.log(`- Niche: ${n.label} (${n.kind}), ComputedAt: ${n.computedAt}, Themes: ${n.themes.length}`);
  }
  
  const totalReviews = await db.marketReview.count();
  const analyzedReviews = await db.marketReview.count({ where: { analyzedAt: { not: null } } });
  console.log(`Total MarketReviews in DB: ${totalReviews}, Analyzed: ${analyzedReviews}`);
  
  const reviewsByApp = await db.marketReview.groupBy({
    by: ['marketAppId'],
    _count: { _all: true }
  });
  console.log(`Unique Apps with reviews: ${reviewsByApp.length}`);
  for (const r of reviewsByApp) {
    const app = await db.marketApp.findUnique({ where: { id: r.marketAppId }, select: { name: true, category: true, storeId: true } });
    console.log(`  App: ${app ? app.name : r.marketAppId} (${app ? app.category : ''}): ${r._count._all} reviews`);
  }
  
  await db.$disconnect();
}

inspect().catch(e => {
  console.error(e);
  process.exit(1);
});
