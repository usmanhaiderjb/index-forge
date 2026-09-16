/**
 * Development seed.
 *
 * Creates one organization, one owner, two apps, keywords with 90 days of
 * plausible rank history, and daily metrics — enough to see every chart
 * populated without connecting a real integration.
 *
 *   npm run db:seed
 */
import { MetricKey, MetricSource, PrismaClient, Sentiment } from "@prisma/client";
import { createHash } from "node:crypto";

const db = new PrismaClient();

const DAYS = 90;

function utcDay(offset: number): Date {
  const now = new Date();
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  date.setUTCDate(date.getUTCDate() - offset);
  return date;
}

/** Deterministic pseudo-random so reseeding gives the same shape. */
function noise(seed: string, index: number): number {
  const hash = createHash("sha256").update(`${seed}:${index}`).digest();
  return hash.readUInt32BE(0) / 0xffffffff;
}

const SHOT_CAPTIONS = [
  "Track every habit",
  "See your streaks",
  "Weekly review",
  "Flexible reminders",
  "Works offline",
  "Sync everywhere",
];

/**
 * An inline SVG data URL, so seeded galleries render with no network access
 * and no dependency on a placeholder service. Real listings store store-CDN
 * URLs here.
 */
function placeholderScreenshot(appName: string, index: number): string {
  const caption = SHOT_CAPTIONS[(index - 1) % SHOT_CAPTIONS.length]!;
  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="540" height="960" viewBox="0 0 540 960">
<rect width="540" height="960" fill="#1a1a19"/>
<rect x="40" y="180" width="460" height="600" rx="24" fill="#222220" stroke="#383835"/>
<text x="270" y="110" fill="#c3c2b7" font-family="system-ui" font-size="30" font-weight="600" text-anchor="middle">${escape(caption)}</text>
<text x="270" y="500" fill="#3987e5" font-family="system-ui" font-size="120" font-weight="700" text-anchor="middle">${index}</text>
<text x="270" y="880" fill="#898781" font-family="system-ui" font-size="24" text-anchor="middle">${escape(appName)}</text>
</svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

function trend(base: number, growth: number, day: number, seed: string): number {
  const drift = base * (1 + growth * (DAYS - day) / DAYS);
  const weekly = 1 + 0.15 * Math.sin((day / 7) * Math.PI * 2);
  const jitter = 0.85 + noise(seed, day) * 0.3;
  return Math.max(0, drift * weekly * jitter);
}

async function main() {
  const email = process.env.SEED_EMAIL ?? "founder@example.com";

  const user = await db.user.upsert({
    where: { email },
    create: { email, name: "Seed Founder", emailVerified: new Date() },
    update: {},
  });

  const org = await db.organization.upsert({
    where: { slug: "seed-workspace" },
    create: {
      name: "Seed Workspace",
      slug: "seed-workspace",
      memberships: { create: { userId: user.id, role: "OWNER" } },
    },
    update: {},
  });

  console.log(`Organization ${org.slug} for ${email}`);

  const apps = [
    {
      platform: "IOS" as const,
      storeId: "1000000001",
      bundleId: "com.seed.habits",
      name: "Habitly — Daily Habit Tracker",
      developer: "Seed Labs",
      category: "Productivity",
      installsBase: 900,
      revenueBase: 420,
    },
    {
      platform: "ANDROID" as const,
      storeId: "com.seed.budget",
      bundleId: "com.seed.budget",
      name: "Pocketwise Budget Planner",
      developer: "Seed Labs",
      category: "FINANCE",
      installsBase: 1400,
      revenueBase: 310,
    },
  ];

  for (const spec of apps) {
    const app = await db.app.upsert({
      where: {
        organizationId_platform_storeId: {
          organizationId: org.id,
          platform: spec.platform,
          storeId: spec.storeId,
        },
      },
      create: {
        organizationId: org.id,
        platform: spec.platform,
        storeId: spec.storeId,
        bundleId: spec.bundleId,
        name: spec.name,
        developer: spec.developer,
        category: spec.category,
        currentVersion: "3.4.1",
      },
      update: {},
    });

    console.log(`  App ${app.name}`);

    // Listing history. A snapshot is only written when the text changes, so
    // these three rows are a change log: one ASO edit, one release.
    const description =
      "Build habits that actually stick. Track streaks, set flexible reminders, and see exactly where your routine breaks down.\n\nHabitly keeps the day simple: one screen, one tap per habit, and a weekly review that tells you what to change.";

    const isIos = spec.platform === "IOS";

    const revisions = isIos
      ? [
          {
            daysAgo: 62,
            title: "Habitly",
            subtitle: "Build better habits",
            keywordField: "habit,routine,daily",
            screenshotCount: 4,
            version: "3.2.0",
          },
          {
            // The ASO edit: fuller title, fuller keyword field, more screenshots.
            daysAgo: 34,
            title: "Habitly: Habit Tracker",
            subtitle: "Streaks, reminders, insights",
            keywordField: "habit,routine,streak,daily,goals,planner,tracker,journal,checklist",
            screenshotCount: 6,
            version: "3.3.0",
          },
          {
            // A release with no ASO change — should be flagged cosmetic.
            daysAgo: 9,
            title: "Habitly: Habit Tracker",
            subtitle: "Streaks, reminders, insights",
            keywordField: "habit,routine,streak,daily,goals,planner,tracker,journal,checklist",
            screenshotCount: 6,
            version: "3.4.1",
          },
        ]
      : [
          {
            daysAgo: 62,
            title: "Pocketwise",
            shortDescription: "A simple budget app.",
            screenshotCount: 4,
            version: "3.2.0",
          },
          {
            daysAgo: 34,
            title: "Pocketwise Budget Planner",
            shortDescription: "Track spending, set budgets, and stop the month-end surprise.",
            screenshotCount: 6,
            version: "3.3.0",
          },
          {
            daysAgo: 9,
            title: "Pocketwise Budget Planner",
            shortDescription: "Track spending, set budgets, and stop the month-end surprise.",
            screenshotCount: 6,
            version: "3.4.1",
          },
        ];

    // Storefronts: a primary plus two secondaries — one properly localized,
    // one still serving the primary's English text, which is the failure the
    // localization view exists to surface.
    await db.appLocale.deleteMany({ where: { appId: app.id } });
    await db.appLocale.createMany({
      data: [
        { appId: app.id, country: "us", locale: "en-US", isPrimary: true },
        { appId: app.id, country: "de", locale: "de-DE" },
        { appId: app.id, country: "br", locale: "pt-BR" },
      ],
    });

    // Reseeding replaces the history rather than stacking a second copy.
    await db.storeListing.deleteMany({ where: { appId: app.id } });

    for (const revision of revisions) {
      const title = revision.title;
      await db.storeListing.create({
        data: {
          appId: app.id,
          locale: "en-US",
          country: "us",
          capturedAt: utcDay(revision.daysAgo),
          title,
          subtitle: "subtitle" in revision ? revision.subtitle : null,
          keywordField: "keywordField" in revision ? revision.keywordField : null,
          shortDescription: "shortDescription" in revision ? revision.shortDescription : null,
          fullDescription: description,
          version: revision.version,
          screenshotCount: revision.screenshotCount,
          // Self-contained placeholders so the gallery renders with no network
          // and no external service. Real captures are store CDN URLs.
          screenshotUrls: Array.from({ length: revision.screenshotCount }, (_, i) =>
            placeholderScreenshot(title.split(":")[0] ?? title, i + 1),
          ),
          hasVideo: isIos,
          ratingAverage: 4.4,
          ratingCount: 12480,
          contentHash: createHash("sha256")
            .update(`${title}${revision.version}${revision.screenshotCount}${description}`)
            .digest("hex"),
        },
      });
    }
    console.log(`    ${revisions.length} listing snapshots`);

    // German is translated; Brazil still carries the English text verbatim.
    const current = revisions[revisions.length - 1]!;
    const secondaries = [
      {
        country: "de",
        locale: "de-DE",
        title: isIos ? "Habitly: Gewohnheiten" : "Pocketwise Budgetplaner",
        subtitle: isIos ? "Serien, Erinnerungen, Analysen" : null,
        keywordField: isIos ? "gewohnheit,routine,serie,taeglich,ziele,planer" : null,
        shortDescription: isIos ? null : "Ausgaben verfolgen und Budgets setzen.",
        fullDescription:
          "Baue Gewohnheiten auf, die wirklich halten. Verfolge Serien und sieh genau, wo deine Routine bricht.",
      },
      {
        // Untranslated on purpose.
        country: "br",
        locale: "pt-BR",
        title: current.title,
        subtitle: "subtitle" in current ? current.subtitle : null,
        keywordField: "keywordField" in current ? current.keywordField : null,
        shortDescription: "shortDescription" in current ? current.shortDescription : null,
        fullDescription: description,
      },
    ];

    for (const secondary of secondaries) {
      await db.storeListing.create({
        data: {
          appId: app.id,
          locale: secondary.locale,
          country: secondary.country,
          capturedAt: utcDay(9),
          title: secondary.title,
          subtitle: secondary.subtitle,
          keywordField: secondary.keywordField,
          shortDescription: secondary.shortDescription,
          fullDescription: secondary.fullDescription,
          version: current.version,
          screenshotCount: current.screenshotCount,
          hasVideo: isIos,
          ratingAverage: 4.3,
          ratingCount: 3100,
          contentHash: createHash("sha256")
            .update(`${secondary.country}${secondary.title}${secondary.fullDescription}`)
            .digest("hex"),
        },
      });
    }
    console.log(`    ${secondaries.length} secondary storefronts`);

    // Metrics.
    //
    // The store metrics must come from the store the app is actually on. Seeding
    // every app from Play Console made the overview screen state that an App
    // Store app's installs came from Play Console — the provenance panel was
    // reporting the seed faithfully, and the seed was wrong.
    const storeSource: MetricSource = isIos ? "APP_STORE_CONNECT" : "PLAY_CONSOLE";

    const metricSpecs: { metric: MetricKey; source: MetricSource; base: number; growth: number }[] = [
      { metric: "INSTALLS", source: storeSource, base: spec.installsBase, growth: 0.35 },
      { metric: "UNINSTALLS", source: storeSource, base: spec.installsBase * 0.22, growth: 0.1 },
      { metric: "STORE_PAGE_VIEWS", source: storeSource, base: spec.installsBase * 4.5, growth: 0.3 },
      { metric: "ACTIVE_USERS_DAILY", source: "FIREBASE", base: spec.installsBase * 7, growth: 0.4 },
      { metric: "SESSIONS", source: "FIREBASE", base: spec.installsBase * 18, growth: 0.4 },
      { metric: "AD_REVENUE", source: "ADMOB", base: spec.revenueBase * 0.6, growth: 0.5 },
      { metric: "IAP_REVENUE", source: storeSource, base: spec.revenueBase * 0.4, growth: 0.6 },
      { metric: "TOTAL_REVENUE", source: "DERIVED", base: spec.revenueBase, growth: 0.55 },
      { metric: "SPEND", source: "GOOGLE_ADS", base: spec.revenueBase * 0.35, growth: 0.2 },
      { metric: "PAID_INSTALLS", source: "GOOGLE_ADS", base: spec.installsBase * 0.18, growth: 0.25 },
    ];

    const rows: {
      appId: string;
      date: Date;
      source: MetricSource;
      metric: MetricKey;
      value: number;
      dimension: string;
    }[] = [];

    for (let day = 0; day < DAYS; day++) {
      const date = utcDay(day);

      for (const m of metricSpecs) {
        rows.push({
          appId: app.id,
          date,
          source: m.source,
          metric: m.metric,
          value: Math.round(trend(m.base, m.growth, day, `${app.id}:${m.metric}`) * 100) / 100,
          dimension: "",
        });
      }

      // Rates, computed from the same shape so the numbers agree with each other.
      const views = trend(spec.installsBase * 4.5, 0.3, day, `${app.id}:STORE_PAGE_VIEWS`);
      const installs = trend(spec.installsBase, 0.35, day, `${app.id}:INSTALLS`);

      rows.push(
        {
          appId: app.id,
          date,
          source: storeSource,
          metric: "CONVERSION_RATE",
          value: Math.round((installs / views) * 10000) / 100,
          dimension: "",
        },
        {
          appId: app.id,
          date,
          source: "FIREBASE",
          metric: "CRASH_FREE_USERS",
          value: Math.round((99.1 + noise(`${app.id}:crash`, day) * 0.8) * 100) / 100,
          dimension: "",
        },
        {
          appId: app.id,
          date,
          source: "ASO_SCRAPER",
          metric: "RATING_AVERAGE",
          value: Math.round((4.3 + noise(`${app.id}:rating`, day) * 0.25) * 100) / 100,
          dimension: "",
        },
      );

      // Country dimension on installs, so the breakdown chart has something.
      // Store traffic split by where it came from.
      //
      // Views and installs are apportioned out of the app-wide figures rather
      // than generated independently, so the breakdown always adds up to the
      // totals shown above it. A demo that contradicts itself teaches the
      // reader to distrust the product.
      //
      // The install shares are derived from relative conversion strength and
      // then normalised, which keeps the shape that makes this view worth
      // showing — search converting roughly three times better than browse —
      // without letting the parts drift away from the whole.
      const trafficMix = [
        { source: "search", views: 0.58, strength: 0.31, tapThrough: 0.14 },
        { source: "browse", views: 0.27, strength: 0.11, tapThrough: 0.04 },
        { source: "referral", views: 0.11, strength: 0.24, tapThrough: 0.31 },
        { source: "other", views: 0.04, strength: 0.09, tapThrough: 0.08 },
      ] as const;

      const weightTotal = trafficMix.reduce((sum, m) => sum + m.views * m.strength, 0);

      for (const mix of trafficMix) {
        const sourceViews = Math.round(views * mix.views);
        if (sourceViews <= 0) continue;

        const dimension = `source=${mix.source}`;
        const installShare = (mix.views * mix.strength) / weightTotal;

        rows.push({
          appId: app.id,
          date,
          source: storeSource,
          metric: "STORE_PAGE_VIEWS",
          value: sourceViews,
          dimension,
        });
        rows.push({
          appId: app.id,
          date,
          source: storeSource,
          metric: "INSTALLS",
          value: Math.round(installs * installShare),
          dimension,
        });
        rows.push({
          appId: app.id,
          date,
          source: storeSource,
          metric: "IMPRESSIONS",
          value: Math.round(sourceViews / mix.tapThrough),
          dimension,
        });
      }

      for (const [country, share] of [["us", 0.42], ["gb", 0.13], ["de", 0.11], ["br", 0.09], ["in", 0.25]] as const) {
        rows.push({
          appId: app.id,
          date,
          source: storeSource,
          metric: "INSTALLS",
          value: Math.round(installs * share),
          dimension: `country=${country}`,
        });
      }
    }

    // createMany with skipDuplicates keeps reseeding idempotent.
    for (let i = 0; i < rows.length; i += 1000) {
      await db.metricPoint.createMany({ data: rows.slice(i, i + 1000), skipDuplicates: true });
    }
    console.log(`    ${rows.length} metric points`);

    // Chart position: charted in its own category, outside the overall top 200.
    await db.chartRank.deleteMany({ where: { appId: app.id } });

    for (let day = 0; day < 30; day++) {
      const date = utcDay(day);
      const drift = Math.round(18 + (day / 30) * 40 + (noise(`${app.id}:chart`, day) - 0.5) * 10);

      await db.chartRank.createMany({
        data: [
          {
            appId: app.id,
            date,
            country: "us",
            chart: "TOP_FREE",
            category: spec.category,
            rank: Math.max(1, drift),
            scanDepth: 200,
          },
          {
            // Absent from the overall chart — a null rank with a known scan
            // depth, which is not the same as never having been checked.
            appId: app.id,
            date,
            country: "us",
            chart: "TOP_FREE",
            category: "overall",
            rank: null,
            scanDepth: 200,
          },
        ],
        skipDuplicates: true,
      });
    }
    console.log(`    30 days of chart ranks`);

    // Keywords with rank history.
    const terms =
      spec.platform === "IOS"
        ? ["habit tracker", "daily routine", "streak app", "goal tracker", "morning routine"]
        : ["budget planner", "expense tracker", "money manager", "spending tracker", "bill reminder"];

    // Competitors, so the head-to-head keyword view has something to compare.
    const rivalSpecs =
      spec.platform === "IOS"
        ? [
            { storeId: "1000000101", name: "Streakly" },
            { storeId: "1000000102", name: "Routinely — Habits" },
            { storeId: "1000000103", name: "DoneDaily" },
          ]
        : [
            { storeId: "com.example.pennywise", name: "Pennywise Budget" },
            { storeId: "com.example.spendlog", name: "SpendLog" },
            { storeId: "com.example.moneymap", name: "MoneyMap" },
          ];

    const rivals = [];
    for (const rival of rivalSpecs) {
      rivals.push(
        await db.competitor.upsert({
          where: {
            appId_platform_storeId_country: {
              appId: app.id,
              platform: spec.platform,
              storeId: rival.storeId,
              country: "us",
            },
          },
          create: {
            appId: app.id,
            platform: spec.platform,
            storeId: rival.storeId,
            name: rival.name,
            country: "us",
            autoDetected: true,
          },
          update: {},
        }),
      );
    }

    const rankRows: { keywordId: string; date: Date; rank: number | null; scanDepth: number }[] = [];
    const competitorRankRows: { keywordId: string; competitorId: string; date: Date; rank: number | null; prevRank: number | null; scanDepth: number }[] = [];
    const metricRows: { keywordId: string; date: Date; popularity: number; difficulty: number; resultCount: number; opportunity: number }[] = [];

    for (const [index, term] of terms.entries()) {
      const keyword = await db.keyword.upsert({
        where: { appId_term_country: { appId: app.id, term, country: "us" } },
        create: { appId: app.id, term, country: "us", locale: "en-US", source: "SUGGESTED" },
        update: {},
      });

      const startRank = 12 + index * 9;

      for (let day = 0; day < DAYS; day++) {
        const date = utcDay(day);
        const drift = (day / DAYS) * 14;
        const rank = Math.max(1, Math.round(startRank + drift + (noise(`${keyword.id}`, day) - 0.5) * 6));

        rankRows.push({ keywordId: keyword.id, date, rank: rank > 100 ? null : rank, scanDepth: 100 });

        for (const [rivalIndex, rival] of rivals.entries()) {
          const base = startRank + (rivalIndex - 1) * 7;
          const rivalRank = Math.round(base + (noise(`${rival.id}:${keyword.id}`, day) - 0.5) * 8);
          const previous =
            day + 1 < DAYS
              ? Math.round(base + (noise(`${rival.id}:${keyword.id}`, day + 1) - 0.5) * 8)
              : null;

          competitorRankRows.push({
            keywordId: keyword.id,
            competitorId: rival.id,
            date,
            rank: rivalRank < 1 || rivalRank > 100 ? null : rivalRank,
            prevRank: previous === null || previous < 1 || previous > 100 ? null : previous,
            scanDepth: 100,
          });
        }
      }

      metricRows.push({
        keywordId: keyword.id,
        date: utcDay(0),
        popularity: Math.round(30 + noise(`${keyword.id}:pop`, 0) * 55),
        difficulty: Math.round(25 + noise(`${keyword.id}:diff`, 0) * 60),
        resultCount: 50,
        opportunity: Math.round(20 + noise(`${keyword.id}:opp`, 0) * 60),
      });
    }

    // Bulk insert rank rows in chunks of 500
    for (let i = 0; i < rankRows.length; i += 500) {
      await db.keywordRank.createMany({ data: rankRows.slice(i, i + 500), skipDuplicates: true });
    }
    for (let i = 0; i < competitorRankRows.length; i += 500) {
      await db.keywordCompetitorRank.createMany({ data: competitorRankRows.slice(i, i + 500), skipDuplicates: true });
    }
    for (let i = 0; i < metricRows.length; i += 500) {
      await db.keywordMetric.createMany({ data: metricRows.slice(i, i + 500), skipDuplicates: true });
    }

    console.log(`    ${terms.length} keywords with ${DAYS} days of ranks`);

    // Reviews bulk insert
    const samples = [
      { rating: 5, title: "Finally one that sticks", body: "The weekly review is the only thing that has ever made habits work for me.", sentiment: "POSITIVE" as Sentiment, topics: ["onboarding", "reviews"] },
      { rating: 2, title: "Crashes on open", body: "Since the last update it crashes every time I open it on my Pixel.", sentiment: "NEGATIVE" as Sentiment, topics: ["crash", "stability"] },
      { rating: 4, title: "Good, but pricey", body: "Works well. The subscription feels steep for what it does.", sentiment: "NEUTRAL" as Sentiment, topics: ["pricing"] },
      { rating: 1, title: "Lost all my data", body: "Signed in on a new phone and every streak was gone.", sentiment: "NEGATIVE" as Sentiment, topics: ["sync", "data-loss"] },
      { rating: 5, title: "Clean and fast", body: "No clutter. Opens instantly. Exactly what I wanted.", sentiment: "POSITIVE" as Sentiment, topics: ["performance", "design"] },
    ];

    const reviewRows = [];
    for (let i = 0; i < 40; i++) {
      const sample = samples[i % samples.length]!;
      reviewRows.push({
        appId: app.id,
        source: (spec.platform === "IOS" ? "APP_STORE_CONNECT" : "PLAY_CONSOLE") as MetricSource,
        externalId: `seed-${i}`,
        rating: sample.rating,
        title: sample.title,
        body: sample.body,
        authorName: `Reviewer ${i + 1}`,
        country: "us",
        appVersion: "3.4.1",
        submittedAt: utcDay(i % DAYS),
        sentiment: sample.sentiment,
        topics: sample.topics,
        analyzedAt: new Date(),
      });
    }
    await db.review.createMany({ data: reviewRows, skipDuplicates: true });
    console.log(`    40 reviews`);
  }

  // One alert rule so the alerts page is not empty. Replaced rather than
  // appended, so re-seeding does not stack duplicates.
  const RULE_NAME = "Installs dropped week over week";
  await db.alertRule.deleteMany({ where: { organizationId: org.id, name: RULE_NAME } });
  await db.alertRule.create({
    data: {
      organizationId: org.id,
      name: RULE_NAME,
      metric: "INSTALLS",
      comparator: "PCT_CHANGE_DOWN",
      threshold: 20,
      windowDays: 7,
      severity: "HIGH",
    },
  });

  console.log("\nDone. Sign in with the dev provider using:", email);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
