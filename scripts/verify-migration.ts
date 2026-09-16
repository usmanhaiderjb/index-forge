/**
 * Proves the migration can build the schema from nothing.
 *
 * A baselined migration that has only ever been marked "applied" is unproven:
 * it may not actually run. This creates a scratch database, applies the
 * migration to it with `migrate deploy`, and diffs the result against the
 * schema — the diff must come back empty.
 *
 *   npm run verify:migration
 */
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";

const SCRATCH = "aso_migration_check";

function run(args: string[], databaseUrl: string): string {
  // Node 24 on Windows refuses to spawn a .cmd shim without a shell, so the
  // command is quoted and run through one. Arguments here are all static.
  const quoted = ["prisma", ...args].map((a) => (a.includes(" ") ? `"${a}"` : a));

  return execFileSync("npx", quoted, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}

async function main() {
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error("DATABASE_URL is not set");

  const url = new URL(base);
  const adminUrl = new URL(base);
  adminUrl.pathname = "/postgres";

  const scratchUrl = new URL(base);
  scratchUrl.pathname = `/${SCRATCH}`;
  const scratchConnection = scratchUrl.toString();

  const admin = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } } });

  try {
    // Recreate the scratch database so the run starts from genuinely nothing.
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${SCRATCH}"`);
    await admin.$executeRawUnsafe(`CREATE DATABASE "${SCRATCH}"`);
    console.log(`Created scratch database "${SCRATCH}"`);

    run(["migrate", "deploy"], scratchConnection);

    // The real test: does the result match the schema exactly?
    const diff = run(
      [
        "migrate",
        "diff",
        "--from-url",
        scratchConnection,
        "--to-schema-datamodel",
        "prisma/schema.prisma",
        "--script",
      ],
      scratchConnection,
    );

    const meaningful = diff
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("--"));

    if (meaningful.length === 0) {
      console.log("PASS  the result matches the schema exactly — no drift");
    } else {
      console.log(`FAIL  the migration does not reproduce the schema:\n${meaningful.slice(0, 20).join("\n")}`);
      process.exitCode = 1;
    }

    // Spot-check a constraint that only exists if the SQL really ran.
    const scratch = new PrismaClient({ datasources: { db: { url: scratchConnection } } });
    try {
      // Read what was recorded rather than scraping the CLI's wording, which
      // varies between versions.
      const migrations = await scratch.$queryRawUnsafe<
        { migration_name: string; finished_at: Date | null }[]
      >(`SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY started_at`);

      const finished = migrations.filter((m) => m.finished_at !== null);
      console.log(
        finished.length > 0
          ? `PASS  migration applies to an empty database — ${finished.map((m) => m.migration_name).join(", ")}`
          : "FAIL  no migration was recorded as applied",
      );
      if (finished.length === 0) process.exitCode = 1;

      const rows = await scratch.$queryRawUnsafe<{ count: bigint }[]>(
        `SELECT count(*)::bigint AS count FROM information_schema.tables WHERE table_schema = 'public'`,
      );
      const count = Number(rows[0]?.count ?? 0);
      console.log(
        count >= 25
          ? `PASS  tables exist in the rebuilt database — ${count}`
          : `FAIL  only ${count} tables were created`,
      );
      if (count < 25) process.exitCode = 1;
    } finally {
      await scratch.$disconnect();
    }
  } finally {
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${SCRATCH}"`).catch(() => undefined);
    await admin.$disconnect();
    void url;
  }

  console.log(process.exitCode ? "\nMigration verification failed." : "\nMigration verified.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
