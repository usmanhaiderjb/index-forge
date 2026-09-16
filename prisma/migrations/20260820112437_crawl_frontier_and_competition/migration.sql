-- CreateEnum
CREATE TYPE "CrawlKind" AS ENUM ('PREFIX', 'CATEGORY', 'DIFFICULTY');

-- CreateEnum
CREATE TYPE "CrawlState" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED');

-- AlterTable
ALTER TABLE "keyword_signals" ADD COLUMN     "platform" "Platform";

-- CreateTable
CREATE TABLE "keyword_competition" (
    "id" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "difficulty" INTEGER NOT NULL,
    "resultCount" INTEGER NOT NULL,
    "topRatingCount" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "keyword_competition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crawl_tasks" (
    "id" TEXT NOT NULL,
    "kind" "CrawlKind" NOT NULL,
    "platform" "Platform" NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'us',
    "input" TEXT NOT NULL,
    "depth" INTEGER NOT NULL DEFAULT 1,
    "state" "CrawlState" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "discovered" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "crawl_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "keyword_competition_platform_difficulty_idx" ON "keyword_competition"("platform", "difficulty");

-- CreateIndex
CREATE UNIQUE INDEX "keyword_competition_termId_platform_key" ON "keyword_competition"("termId", "platform");

-- CreateIndex
CREATE INDEX "crawl_tasks_state_kind_platform_depth_idx" ON "crawl_tasks"("state", "kind", "platform", "depth");

-- CreateIndex
CREATE UNIQUE INDEX "crawl_tasks_kind_platform_country_input_key" ON "crawl_tasks"("kind", "platform", "country", "input");

-- AddForeignKey
ALTER TABLE "keyword_competition" ADD CONSTRAINT "keyword_competition_termId_fkey" FOREIGN KEY ("termId") REFERENCES "keyword_terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
