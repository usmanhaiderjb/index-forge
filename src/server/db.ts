import { PrismaClient } from "@prisma/client";

import { env } from "@/env";

/**
 * Query logging is on in development, where seeing the SQL is the point.
 *
 * `PRISMA_LOG_QUERIES=0` turns it off for the long-running crawlers: a corpus
 * build issues millions of statements, and logging every one of them buries the
 * progress output and costs more time than the queries themselves.
 */
const createPrismaClient = () =>
  new PrismaClient({
    log:
      env.NODE_ENV === "development" && process.env.PRISMA_LOG_QUERIES !== "0"
        ? ["query", "error", "warn"]
        : ["error"],
  });

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") globalForPrisma.prisma = db;
