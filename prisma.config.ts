import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "prisma/config";

// A config file stops the CLI from auto-loading .env, so it is loaded here.
// Without this, every prisma command fails with "Environment variable not
// found: DATABASE_URL" even though .env is present.
if (existsSync(".env")) process.loadEnvFile(".env");

/**
 * Prisma CLI configuration.
 *
 * Replaces the `prisma` key in package.json, which is deprecated and removed
 * in Prisma 7. The seed command keeps the `--require` preload so it can import
 * modules marked `server-only` (see scripts/allow-server-modules.cjs).
 */
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
    seed: "tsx --env-file-if-exists=.env prisma/seed.ts",
  },
});
