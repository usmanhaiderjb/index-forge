-- AlterTable
ALTER TABLE "keyword_ranks" ADD COLUMN     "scanDepth" INTEGER NOT NULL DEFAULT 100;

-- CreateTable
CREATE TABLE "keyword_competitor_ranks" (
    "id" TEXT NOT NULL,
    "keywordId" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "rank" INTEGER,
    "prevRank" INTEGER,
    "scanDepth" INTEGER NOT NULL DEFAULT 100,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "keyword_competitor_ranks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "keyword_competitor_ranks_keywordId_date_idx" ON "keyword_competitor_ranks"("keywordId", "date");

-- CreateIndex
CREATE INDEX "keyword_competitor_ranks_competitorId_date_idx" ON "keyword_competitor_ranks"("competitorId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "keyword_competitor_ranks_keywordId_competitorId_date_key" ON "keyword_competitor_ranks"("keywordId", "competitorId", "date");

-- AddForeignKey
ALTER TABLE "keyword_competitor_ranks" ADD CONSTRAINT "keyword_competitor_ranks_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "keywords"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keyword_competitor_ranks" ADD CONSTRAINT "keyword_competitor_ranks_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "competitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
