-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MetricKey" ADD VALUE 'PAID_CLICKS';
ALTER TYPE "MetricKey" ADD VALUE 'CPC';

-- AlterEnum
ALTER TYPE "MetricSource" ADD VALUE 'APPLE_SEARCH_ADS';

-- AlterEnum
ALTER TYPE "Provider" ADD VALUE 'APPLE_SEARCH_ADS';
