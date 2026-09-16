-- CreateEnum
CREATE TYPE "NicheKind" AS ENUM ('TERM', 'CATEGORY');

-- CreateEnum
CREATE TYPE "NicheQuadrant" AS ENUM ('GAP', 'HEATING', 'SETTLED', 'CROWDING');

-- CreateEnum
CREATE TYPE "ThemeKind" AS ENUM ('MISSING_FEATURE', 'DEFECT', 'MONETISATION', 'CHURN_REASON');

-- CreateTable
CREATE TABLE "market_apps" (
    "id" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "storeId" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'us',
    "name" TEXT NOT NULL,
    "developer" TEXT,
    "category" TEXT,
    "releasedAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_apps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_app_snapshots" (
    "id" TEXT NOT NULL,
    "marketAppId" TEXT NOT NULL,
    "ratingCount" INTEGER,
    "ratingAverage" DOUBLE PRECISION,
    "installsText" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_app_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_reviews" (
    "id" TEXT NOT NULL,
    "marketAppId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "body" TEXT,
    "locale" TEXT,
    "appVersion" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "themes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "analyzedAt" TIMESTAMP(3),

    CONSTRAINT "market_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_niches" (
    "id" TEXT NOT NULL,
    "kind" "NicheKind" NOT NULL,
    "label" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'us',
    "platform" "Platform" NOT NULL,
    "demandChange" DOUBLE PRECISION,
    "supplyChange" DOUBLE PRECISION,
    "quadrant" "NicheQuadrant",
    "newApps" INTEGER NOT NULL DEFAULT 0,
    "method" TEXT NOT NULL,
    "windowDays" INTEGER NOT NULL DEFAULT 28,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_niches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "niche_themes" (
    "id" TEXT NOT NULL,
    "nicheId" TEXT NOT NULL,
    "kind" "ThemeKind" NOT NULL,
    "label" TEXT NOT NULL,
    "appCount" INTEGER NOT NULL,
    "mentionCount" INTEGER NOT NULL,
    "meanRating" DOUBLE PRECISION NOT NULL,
    "evidenceIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "niche_themes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "market_apps_category_releasedAt_idx" ON "market_apps"("category", "releasedAt");

-- CreateIndex
CREATE UNIQUE INDEX "market_apps_platform_storeId_country_key" ON "market_apps"("platform", "storeId", "country");

-- CreateIndex
CREATE INDEX "market_app_snapshots_marketAppId_capturedAt_idx" ON "market_app_snapshots"("marketAppId", "capturedAt");

-- CreateIndex
CREATE INDEX "market_reviews_marketAppId_rating_idx" ON "market_reviews"("marketAppId", "rating");

-- CreateIndex
CREATE INDEX "market_reviews_analyzedAt_idx" ON "market_reviews"("analyzedAt");

-- CreateIndex
CREATE UNIQUE INDEX "market_reviews_marketAppId_externalId_key" ON "market_reviews"("marketAppId", "externalId");

-- CreateIndex
CREATE INDEX "market_niches_quadrant_idx" ON "market_niches"("quadrant");

-- CreateIndex
CREATE UNIQUE INDEX "market_niches_kind_label_country_platform_key" ON "market_niches"("kind", "label", "country", "platform");

-- CreateIndex
CREATE INDEX "niche_themes_nicheId_appCount_idx" ON "niche_themes"("nicheId", "appCount");

-- AddForeignKey
ALTER TABLE "market_app_snapshots" ADD CONSTRAINT "market_app_snapshots_marketAppId_fkey" FOREIGN KEY ("marketAppId") REFERENCES "market_apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_reviews" ADD CONSTRAINT "market_reviews_marketAppId_fkey" FOREIGN KEY ("marketAppId") REFERENCES "market_apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "niche_themes" ADD CONSTRAINT "niche_themes_nicheId_fkey" FOREIGN KEY ("nicheId") REFERENCES "market_niches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
