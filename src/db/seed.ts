import type { Db } from "./client";
import { organisations, users } from "./schema";
import { DEMO_ORGS, DEMO_USERS, type DemoOrgKey } from "./seed-data";

export async function seed(db: Db) {
  const orgIds = {} as Record<DemoOrgKey, string>;

  for (const org of DEMO_ORGS) {
    const [row] = await db
      .insert(organisations)
      .values({
        name: org.name,
        shortName: org.shortName,
        institutionType: org.institutionType,
        isDemo: true,
      })
      .returning({ id: organisations.id });
    orgIds[org.key] = row.id;
  }

  for (const u of DEMO_USERS) {
    await db.insert(users).values({
      organisationId: orgIds[u.org],
      name: u.name,
      email: u.email,
      title: u.title,
      role: u.role,
      status: "ACTIVE",
    });
  }

  return { orgIds };
}
