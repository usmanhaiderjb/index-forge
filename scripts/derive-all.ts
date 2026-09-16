/**
 * Backfills derived metrics for every app. Useful after a seed, or after
 * adding a new derived metric to an existing database.
 *
 *   npm run derive:all
 */
import { PrismaClient } from "@prisma/client";
import Module from "node:module";

const load = (Module as unknown as { _load: (...args: unknown[]) => unknown })._load;
(Module as unknown as { _load: (...args: unknown[]) => unknown })._load = function (
  this: unknown,
  request: unknown,
  ...rest: unknown[]
) {
  if (typeof request === "string" && request.includes("server-only")) return {};
  return load.call(this, request, ...rest);
} as never;

const { deriveMetrics } = (await import(
  "../src/server/metrics/derive"
)) as typeof import("../src/server/metrics/derive");

const db = new PrismaClient();

const apps = await db.app.findMany({ select: { id: true, name: true } });

for (const app of apps) {
  const result = await deriveMetrics(app.id, { days: 90 });
  console.log(
    `${app.name.padEnd(24)} organic: ${
      result.organic.skipped ?? `${result.organic.written} written, ${result.organic.removed} stale removed`
    }`,
  );
}

await db.$disconnect();
