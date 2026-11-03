import { eq } from "drizzle-orm";
import { createDb, type Db } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { users } from "@/db/schema";
import { seed } from "@/db/seed";
import type { TenantContext } from "@/lib/tenant";

/** Fresh, migrated, seeded in-memory database per call. */
export async function setupTestDb() {
  const db = createDb(":memory:");
  await runMigrations(db);
  const { orgIds } = await seed(db);
  return { db, orgIds };
}

export async function ctxFor(db: Db, email: string): Promise<TenantContext> {
  const [u] = await db.select().from(users).where(eq(users.email, email));
  if (!u) throw new Error(`No seeded user ${email}`);
  return { userId: u.id, organisationId: u.organisationId, role: u.role };
}
