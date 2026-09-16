-- CreateEnum
CREATE TYPE "TermDiscovery" AS ENUM ('PREFIX_CRAWL', 'METADATA_MINING', 'CUSTOMER', 'RELATED');

-- CreateEnum
CREATE TYPE "SignalSource" AS ENUM ('SUGGEST_RANK', 'SUGGEST_CONTAINS', 'RESULT_COUNT', 'CHART_PRESENCE', 'ASA_IMPRESSIONS');

-- CreateEnum
CREATE TYPE "EstimateKind" AS ENUM ('ESTIMATED', 'MEASURED');

-- CreateEnum
CREATE TYPE "Confidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "keyword_terms" (
    "id" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'us',
    "locale" TEXT NOT NULL DEFAULT 'en-US',
    "discovery" "TermDiscovery" NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "keyword_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "keyword_signals" (
    "id" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "source" "SignalSource" NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "context" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "keyword_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "keyword_volume_estimates" (
    "id" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "kind" "EstimateKind" NOT NULL DEFAULT 'ESTIMATED',
    "confidence" "Confidence" NOT NULL DEFAULT 'LOW',
    "method" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "keyword_volume_estimates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "keyword_terms_country_lastSeenAt_idx" ON "keyword_terms"("country", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "keyword_terms_term_country_key" ON "keyword_terms"("term", "country");

-- CreateIndex
CREATE INDEX "keyword_signals_termId_source_capturedAt_idx" ON "keyword_signals"("termId", "source", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "keyword_volume_estimates_termId_key" ON "keyword_volume_estimates"("termId");

-- CreateIndex
CREATE INDEX "keyword_volume_estimates_kind_value_idx" ON "keyword_volume_estimates"("kind", "value");

-- AddForeignKey
ALTER TABLE "keyword_signals" ADD CONSTRAINT "keyword_signals_termId_fkey" FOREIGN KEY ("termId") REFERENCES "keyword_terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keyword_volume_estimates" ADD CONSTRAINT "keyword_volume_estimates_termId_fkey" FOREIGN KEY ("termId") REFERENCES "keyword_terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
