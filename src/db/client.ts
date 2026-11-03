import { createClient } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

export type Db = LibSQLDatabase<typeof schema>;

export function createDb(url: string): Db {
  const client = createClient({ url });
  return drizzle(client, { schema });
}

const globalForDb = globalThis as unknown as { __svaraDb?: Db };

/** App-wide database handle. Tests create their own with createDb(":memory:"). */
export function getDb(): Db {
  if (!globalForDb.__svaraDb) {
    globalForDb.__svaraDb = createDb(
      process.env.DATABASE_URL ?? "file:./data/svara.db",
    );
  }
  return globalForDb.__svaraDb;
}
