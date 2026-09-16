-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('IOS', 'ANDROID');

-- CreateEnum
CREATE TYPE "Provider" AS ENUM ('FIREBASE', 'ADMOB', 'GOOGLE_ADS', 'PLAY_CONSOLE', 'APP_STORE_CONNECT');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('PENDING', 'ACTIVE', 'NEEDS_REAUTH', 'ERROR', 'DISABLED');

-- CreateEnum
CREATE TYPE "MetricSource" AS ENUM ('FIREBASE', 'ADMOB', 'GOOGLE_ADS', 'PLAY_CONSOLE', 'APP_STORE_CONNECT', 'ASO_SCRAPER', 'DERIVED');

-- CreateEnum
CREATE TYPE "MetricKey" AS ENUM ('IMPRESSIONS', 'STORE_PAGE_VIEWS', 'INSTALLS', 'UNINSTALLS', 'CONVERSION_RATE', 'ACTIVE_USERS_DAILY', 'ACTIVE_USERS_MONTHLY', 'SESSIONS', 'SESSION_DURATION_AVG', 'RETENTION_D1', 'RETENTION_D7', 'RETENTION_D30', 'CRASH_FREE_USERS', 'AD_REVENUE', 'AD_IMPRESSIONS', 'AD_CLICKS', 'AD_ECPM', 'AD_FILL_RATE', 'IAP_REVENUE', 'TOTAL_REVENUE', 'ARPDAU', 'SPEND', 'PAID_INSTALLS', 'CPI', 'ROAS', 'RATING_AVERAGE', 'RATING_COUNT', 'REVIEW_COUNT');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "Sentiment" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "InsightType" AS ENUM ('KEYWORD_OPPORTUNITY', 'METADATA_GAP', 'COMPETITOR_MOVE', 'REVIEW_THEME', 'CONVERSION_DROP', 'REVENUE_ANOMALY', 'RANK_CHANGE', 'GENERAL');

-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'APPLIED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ListingField" AS ENUM ('TITLE', 'SUBTITLE', 'KEYWORDS', 'SHORT_DESCRIPTION', 'FULL_DESCRIPTION', 'PROMOTIONAL_TEXT', 'WHATS_NEW');

-- CreateEnum
CREATE TYPE "AlertComparator" AS ENUM ('GT', 'LT', 'PCT_CHANGE_UP', 'PCT_CHANGE_DOWN');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('TRIGGERED', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ChartType" AS ENUM ('TOP_FREE', 'TOP_PAID', 'TOP_GROSSING');

-- CreateEnum
CREATE TYPE "KeywordSource" AS ENUM ('MANUAL', 'SUGGESTED', 'COMPETITOR', 'AI', 'STORE_AUTOCOMPLETE');

-- CreateEnum
CREATE TYPE "DigestCadence" AS ENUM ('DAILY', 'WEEKLY');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "imageUrl" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invites" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "token" TEXT NOT NULL,
    "invitedById" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "apps" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "storeId" TEXT NOT NULL,
    "bundleId" TEXT,
    "name" TEXT NOT NULL,
    "developer" TEXT,
    "iconUrl" TEXT,
    "country" TEXT NOT NULL DEFAULT 'us',
    "locale" TEXT NOT NULL DEFAULT 'en-US',
    "category" TEXT,
    "currentVersion" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "apps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_locales" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_locales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connections" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" "Provider" NOT NULL,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "label" TEXT,
    "externalId" TEXT,
    "externalName" TEXT,
    "credentials" TEXT,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expiresAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_links" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "externalRef" TEXT,
    "displayName" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resource_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_runs" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT,
    "appId" TEXT,
    "job" TEXT NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'QUEUED',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "recordsRead" INTEGER NOT NULL DEFAULT 0,
    "recordsWrote" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "meta" JSONB,

    CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metric_points" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "source" "MetricSource" NOT NULL,
    "metric" "MetricKey" NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "dimension" TEXT NOT NULL DEFAULT '',
    "currency" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "metric_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_listings" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" TEXT,
    "subtitle" TEXT,
    "keywordField" TEXT,
    "shortDescription" TEXT,
    "fullDescription" TEXT,
    "promotionalText" TEXT,
    "whatsNew" TEXT,
    "version" TEXT,
    "screenshotCount" INTEGER,
    "screenshotUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hasVideo" BOOLEAN NOT NULL DEFAULT false,
    "iconUrl" TEXT,
    "ratingAverage" DOUBLE PRECISION,
    "ratingCount" INTEGER,
    "price" DOUBLE PRECISION,
    "contentRating" TEXT,
    "contentHash" TEXT NOT NULL,

    CONSTRAINT "store_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "keywords" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'us',
    "locale" TEXT NOT NULL DEFAULT 'en-US',
    "source" "KeywordSource" NOT NULL DEFAULT 'MANUAL',
    "isTracked" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "keywords_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "keyword_ranks" (
    "id" TEXT NOT NULL,
    "keywordId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "rank" INTEGER,
    "prevRank" INTEGER,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "keyword_ranks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "keyword_metrics" (
    "id" TEXT NOT NULL,
    "keywordId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "popularity" DOUBLE PRECISION,
    "difficulty" DOUBLE PRECISION,
    "resultCount" INTEGER,
    "opportunity" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "keyword_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chart_ranks" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "country" TEXT NOT NULL,
    "chart" "ChartType" NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'overall',
    "rank" INTEGER,
    "prevRank" INTEGER,
    "scanDepth" INTEGER NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chart_ranks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitors" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "developer" TEXT,
    "iconUrl" TEXT,
    "country" TEXT NOT NULL DEFAULT 'us',
    "autoDetected" BOOLEAN NOT NULL DEFAULT false,
    "isTracked" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitor_snapshots" (
    "id" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" TEXT,
    "subtitle" TEXT,
    "description" TEXT,
    "version" TEXT,
    "ratingAverage" DOUBLE PRECISION,
    "ratingCount" INTEGER,
    "categoryRank" INTEGER,
    "contentHash" TEXT NOT NULL,

    CONSTRAINT "competitor_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "source" "MetricSource" NOT NULL,
    "rating" INTEGER NOT NULL,
    "title" TEXT,
    "body" TEXT,
    "authorName" TEXT,
    "locale" TEXT,
    "country" TEXT,
    "appVersion" TEXT,
    "device" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "developerReply" TEXT,
    "repliedAt" TIMESTAMP(3),
    "sentiment" "Sentiment",
    "topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "analyzedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_insights" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "appId" TEXT,
    "type" "InsightType" NOT NULL,
    "severity" "Severity" NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "detail" TEXT,
    "evidence" JSONB,
    "model" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_recommendations" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "insightId" TEXT,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "impact" INTEGER NOT NULL DEFAULT 3,
    "effort" INTEGER NOT NULL DEFAULT 3,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "actions" JSONB,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'OPEN',
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metadata_suggestions" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "field" "ListingField" NOT NULL,
    "current" TEXT,
    "suggested" TEXT NOT NULL,
    "rationale" TEXT,
    "targetKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "charCount" INTEGER NOT NULL,
    "charLimit" INTEGER NOT NULL,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'OPEN',
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metadata_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_rules" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "appId" TEXT,
    "name" TEXT NOT NULL,
    "metric" "MetricKey" NOT NULL,
    "comparator" "AlertComparator" NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "windowDays" INTEGER NOT NULL DEFAULT 1,
    "severity" "Severity" NOT NULL DEFAULT 'MEDIUM',
    "channels" JSONB,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastEvaluatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alert_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_events" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'TRIGGERED',
    "value" DOUBLE PRECISION NOT NULL,
    "baseline" DOUBLE PRECISION,
    "message" TEXT NOT NULL,
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "deliveryAttempts" INTEGER NOT NULL DEFAULT 0,
    "deliveryError" TEXT,
    "deliveryLog" JSONB,
    "isTest" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "alert_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "digests" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cadence" "DigestCadence" NOT NULL DEFAULT 'WEEKLY',
    "sendHourUtc" INTEGER NOT NULL DEFAULT 8,
    "appIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "channels" JSONB,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "digests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "meta" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hashedKey" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "accounts_userId_idx" ON "accounts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_providerAccountId_key" ON "accounts"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_sessionToken_key" ON "sessions"("sessionToken");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "verification_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_identifier_token_key" ON "verification_tokens"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "memberships_organizationId_idx" ON "memberships"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_userId_organizationId_key" ON "memberships"("userId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "invites_token_key" ON "invites"("token");

-- CreateIndex
CREATE UNIQUE INDEX "invites_organizationId_email_key" ON "invites"("organizationId", "email");

-- CreateIndex
CREATE INDEX "apps_organizationId_idx" ON "apps"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "apps_organizationId_platform_storeId_key" ON "apps"("organizationId", "platform", "storeId");

-- CreateIndex
CREATE INDEX "app_locales_appId_isActive_idx" ON "app_locales"("appId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "app_locales_appId_country_locale_key" ON "app_locales"("appId", "country", "locale");

-- CreateIndex
CREATE INDEX "connections_organizationId_provider_idx" ON "connections"("organizationId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "connections_organizationId_provider_externalId_key" ON "connections"("organizationId", "provider", "externalId");

-- CreateIndex
CREATE INDEX "resource_links_appId_idx" ON "resource_links"("appId");

-- CreateIndex
CREATE UNIQUE INDEX "resource_links_connectionId_appId_externalId_key" ON "resource_links"("connectionId", "appId", "externalId");

-- CreateIndex
CREATE INDEX "sync_runs_connectionId_startedAt_idx" ON "sync_runs"("connectionId", "startedAt");

-- CreateIndex
CREATE INDEX "sync_runs_appId_startedAt_idx" ON "sync_runs"("appId", "startedAt");

-- CreateIndex
CREATE INDEX "sync_runs_job_status_idx" ON "sync_runs"("job", "status");

-- CreateIndex
CREATE INDEX "metric_points_appId_metric_date_idx" ON "metric_points"("appId", "metric", "date");

-- CreateIndex
CREATE INDEX "metric_points_appId_date_idx" ON "metric_points"("appId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "metric_points_appId_date_source_metric_dimension_key" ON "metric_points"("appId", "date", "source", "metric", "dimension");

-- CreateIndex
CREATE INDEX "store_listings_appId_locale_capturedAt_idx" ON "store_listings"("appId", "locale", "capturedAt");

-- CreateIndex
CREATE INDEX "keywords_appId_isTracked_idx" ON "keywords"("appId", "isTracked");

-- CreateIndex
CREATE UNIQUE INDEX "keywords_appId_term_country_key" ON "keywords"("appId", "term", "country");

-- CreateIndex
CREATE INDEX "keyword_ranks_keywordId_date_idx" ON "keyword_ranks"("keywordId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "keyword_ranks_keywordId_date_key" ON "keyword_ranks"("keywordId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "keyword_metrics_keywordId_date_key" ON "keyword_metrics"("keywordId", "date");

-- CreateIndex
CREATE INDEX "chart_ranks_appId_chart_date_idx" ON "chart_ranks"("appId", "chart", "date");

-- CreateIndex
CREATE UNIQUE INDEX "chart_ranks_appId_date_country_chart_category_key" ON "chart_ranks"("appId", "date", "country", "chart", "category");

-- CreateIndex
CREATE INDEX "competitors_appId_idx" ON "competitors"("appId");

-- CreateIndex
CREATE UNIQUE INDEX "competitors_appId_platform_storeId_country_key" ON "competitors"("appId", "platform", "storeId", "country");

-- CreateIndex
CREATE INDEX "competitor_snapshots_competitorId_capturedAt_idx" ON "competitor_snapshots"("competitorId", "capturedAt");

-- CreateIndex
CREATE INDEX "reviews_appId_submittedAt_idx" ON "reviews"("appId", "submittedAt");

-- CreateIndex
CREATE INDEX "reviews_appId_sentiment_idx" ON "reviews"("appId", "sentiment");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_appId_source_externalId_key" ON "reviews"("appId", "source", "externalId");

-- CreateIndex
CREATE INDEX "ai_insights_organizationId_createdAt_idx" ON "ai_insights"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_insights_appId_type_idx" ON "ai_insights"("appId", "type");

-- CreateIndex
CREATE INDEX "ai_recommendations_appId_status_priority_idx" ON "ai_recommendations"("appId", "status", "priority");

-- CreateIndex
CREATE INDEX "metadata_suggestions_appId_locale_field_idx" ON "metadata_suggestions"("appId", "locale", "field");

-- CreateIndex
CREATE INDEX "ai_usage_organizationId_createdAt_idx" ON "ai_usage"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "alert_rules_organizationId_isEnabled_idx" ON "alert_rules"("organizationId", "isEnabled");

-- CreateIndex
CREATE INDEX "alert_events_ruleId_triggeredAt_idx" ON "alert_events"("ruleId", "triggeredAt");

-- CreateIndex
CREATE INDEX "digests_organizationId_isEnabled_idx" ON "digests"("organizationId", "isEnabled");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_createdAt_idx" ON "audit_logs"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_hashedKey_key" ON "api_keys"("hashedKey");

-- CreateIndex
CREATE INDEX "api_keys_organizationId_idx" ON "api_keys"("organizationId");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apps" ADD CONSTRAINT "apps_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_locales" ADD CONSTRAINT "app_locales_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connections" ADD CONSTRAINT "connections_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_links" ADD CONSTRAINT "resource_links_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_links" ADD CONSTRAINT "resource_links_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_points" ADD CONSTRAINT "metric_points_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_listings" ADD CONSTRAINT "store_listings_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keywords" ADD CONSTRAINT "keywords_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keyword_ranks" ADD CONSTRAINT "keyword_ranks_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "keywords"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keyword_metrics" ADD CONSTRAINT "keyword_metrics_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "keywords"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chart_ranks" ADD CONSTRAINT "chart_ranks_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitor_snapshots" ADD CONSTRAINT "competitor_snapshots_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "competitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_recommendations" ADD CONSTRAINT "ai_recommendations_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_recommendations" ADD CONSTRAINT "ai_recommendations_insightId_fkey" FOREIGN KEY ("insightId") REFERENCES "ai_insights"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metadata_suggestions" ADD CONSTRAINT "metadata_suggestions_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "alert_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digests" ADD CONSTRAINT "digests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

