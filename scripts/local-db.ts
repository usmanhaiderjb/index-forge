/**
 * Local Postgres for machines without Docker.
 *
 * Runs a real PostgreSQL server from binaries under node_modules, with its data
 * directory inside the project. Nothing is installed system-wide and cleanup is
 * deleting `.localdb`.
 *
 *   npm run localdb        start and keep running
 *   npm run localdb:stop   stop a server left running
 *
 * Prefer `docker compose up -d` when Docker is available — this exists so the
 * app can be run and tested without it.
 */
import EmbeddedPostgres from "embedded-postgres";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";

const DATA_DIR = path.resolve(process.cwd(), ".localdb");
const PORT = Number(process.env.LOCAL_DB_PORT ?? 5432);
const USER = "aso";
const PASSWORD = "aso";
/**
 * Taken from DATABASE_URL when it is set, so this and the app never disagree
 * about which database is in play.
 *
 * They did disagree once, and it was confusing: the cluster had been created
 * with the Windows codepage, so a second UTF8 database was added alongside and
 * `.env` repointed at it — while this banner went on printing the old name.
 */
const DATABASE = databaseFromUrl(process.env.DATABASE_URL) ?? "aso";

function databaseFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const name = new URL(url).pathname.replace(/^\//, "");
    return name.length > 0 ? name : null;
  } catch {
    return null;
  }
}

async function main() {
  const reset = process.argv.includes("--reset");
  if (reset && existsSync(DATA_DIR)) {
    console.log(`Removing ${DATA_DIR}`);
    rmSync(DATA_DIR, { recursive: true, force: true });
  }

  const fresh = !existsSync(DATA_DIR);

  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: USER,
    password: PASSWORD,
    port: PORT,
    persistent: true,
  });

  if (fresh) {
    console.log("Initialising cluster (first run only, this takes a moment)…");
    await pg.initialise();
  }

  await pg.start();

  if (fresh) {
    // Explicitly UTF8, and explicitly from template0.
    //
    // initdb on Windows takes its encoding from the OS codepage, so a cluster
    // created here lands on WIN1252 and every database cloned from template1
    // inherits it. That is invisible until something stores a non-ASCII
    // string: the keyword corpus crawls every store locale, and Postgres
    // rejects the insert with "character with byte sequence 0xc4 0xb1 in
    // encoding UTF8 has no equivalent in encoding WIN1252" — which drops the
    // entire international long tail. Only template0 permits an encoding that
    // differs from the cluster's, and it requires the C locale to go with it.
    const client = pg.getPgClient();
    await client.connect();
    await client.query(
      `CREATE DATABASE "${DATABASE}" TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'`,
    );
    await client.end();
    console.log(`Created database "${DATABASE}" (UTF8)`);
  }

  console.log(
    `\nPostgres listening on port ${PORT}\n` +
      `DATABASE_URL=postgresql://${USER}:${PASSWORD}@localhost:${PORT}/${DATABASE}?schema=public\n` +
      `Data directory: ${DATA_DIR}\n\nCtrl-C to stop.`,
  );

  const shutdown = async () => {
    console.log("\nStopping Postgres…");
    await pg.stop().catch(() => undefined);
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  // Hold the process open.
  setInterval(() => undefined, 1 << 30);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
