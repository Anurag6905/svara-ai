/**
 * Rebuilds the local demo database from scratch: migrations + synthetic seed.
 * Usage: npm run db:reset
 */
import fs from "node:fs";
import path from "node:path";
import { createDb } from "../src/db/client";
import { runMigrations } from "../src/db/migrate";
import { seed } from "../src/db/seed";

async function main() {
  const url = process.env.DATABASE_URL ?? "file:./data/svara.db";
  if (url.startsWith("file:")) {
    const file = path.resolve(url.slice("file:".length));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    for (const suffix of ["", "-wal", "-shm", "-journal"]) {
      fs.rmSync(file + suffix, { force: true });
    }
  }
  const db = createDb(url);
  await runMigrations(db);
  await seed(db);
  console.log(`✓ Demo database ready at ${url}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
