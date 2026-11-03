/** Runs before `npm run dev`: creates and seeds the demo DB on first run only. */
import fs from "node:fs";
import path from "node:path";
import { createDb } from "../src/db/client";
import { runMigrations } from "../src/db/migrate";
import { seed } from "../src/db/seed";

async function main() {
  const url = process.env.DATABASE_URL ?? "file:./data/svara.db";
  if (!url.startsWith("file:")) return;
  const file = path.resolve(url.slice("file:".length));
  const fresh = !fs.existsSync(file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = createDb(url);
  await runMigrations(db); // applies any new migrations to an existing DB
  if (fresh) {
    await seed(db);
    console.log("✓ Created and seeded demo database (synthetic data only).");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
