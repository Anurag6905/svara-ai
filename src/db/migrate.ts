import { migrate } from "drizzle-orm/libsql/migrator";
import path from "node:path";
import type { Db } from "./client";

export async function runMigrations(db: Db) {
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
}
