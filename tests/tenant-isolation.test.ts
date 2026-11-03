import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { auditEvents, users } from "@/db/schema";
import { listAuditEvents, recordAudit } from "@/lib/audit";
import { NotFoundError, type TenantContext } from "@/lib/tenant";
import { changeUserRole, listUsers, setUserActive } from "@/lib/users";
import { ctxFor, setupTestDb } from "./helpers";

let db: Db;
let kaveriAdmin: TenantContext;
let northbridgeAdmin: TenantContext;

beforeEach(async () => {
  ({ db } = await setupTestDb());
  kaveriAdmin = await ctxFor(db, "priya.admin@kaveri.demo");
  northbridgeAdmin = await ctxFor(db, "kavya.admin@northbridge.demo");
});

describe("tenant isolation", () => {
  it("lists only the caller's organisation's users", async () => {
    const kaveri = await listUsers(db, kaveriAdmin);
    const northbridge = await listUsers(db, northbridgeAdmin);
    expect(kaveri.every((u) => u.organisationId === kaveriAdmin.organisationId)).toBe(true);
    expect(northbridge.every((u) => u.organisationId === northbridgeAdmin.organisationId)).toBe(true);
    expect(kaveri.map((u) => u.email)).not.toContain("kavya.admin@northbridge.demo");
  });

  it("cannot modify a user in another organisation", async () => {
    const [kaveriAgent] = await db
      .select()
      .from(users)
      .where(eq(users.email, "ananya.agent@kaveri.demo"));

    await expect(
      changeUserRole(db, northbridgeAdmin, kaveriAgent.id, "ORG_ADMIN"),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      setUserActive(db, northbridgeAdmin, kaveriAgent.id, false),
    ).rejects.toBeInstanceOf(NotFoundError);

    const [unchanged] = await db.select().from(users).where(eq(users.id, kaveriAgent.id));
    expect(unchanged.role).toBe("AGENT");
    expect(unchanged.status).toBe("ACTIVE");
  });

  it("shows audit events only to their own organisation", async () => {
    await recordAudit(db, kaveriAdmin, { action: "test.kaveri", entityType: "test" });
    await recordAudit(db, northbridgeAdmin, { action: "test.northbridge", entityType: "test" });
    const kaveriEvents = await listAuditEvents(db, kaveriAdmin);
    expect(kaveriEvents.map((e) => e.action)).toEqual(["test.kaveri"]);
  });
});

describe("user management rules", () => {
  it("records an audit event when a role changes", async () => {
    const [agent] = await db.select().from(users).where(eq(users.email, "ananya.agent@kaveri.demo"));
    await changeUserRole(db, kaveriAdmin, agent.id, "MANAGER");
    const events = await db.select().from(auditEvents).where(eq(auditEvents.entityId, agent.id));
    expect(events).toHaveLength(1);
    expect(JSON.parse(events[0].redactedMetadataJson)).toEqual({ from: "AGENT", to: "MANAGER" });
  });

  it("refuses to remove the last active admin", async () => {
    const manager = await ctxFor(db, "rohan.manager@kaveri.demo");
    await expect(changeUserRole(db, manager, kaveriAdmin.userId, "AGENT")).rejects.toThrow(/Not permitted/);
    // Each demo org has a single admin: demoting them would leave none.
    await expect(changeUserRole(db, kaveriAdmin, kaveriAdmin.userId, "AGENT")).rejects.toThrow(
      /at least one active admin/,
    );
    await expect(
      setUserActive(db, northbridgeAdmin, northbridgeAdmin.userId, false),
    ).rejects.toThrow(/your own account/);
  });

  it("refuses user management to non-admins", async () => {
    const agent = await ctxFor(db, "ananya.agent@kaveri.demo");
    await expect(setUserActive(db, agent, kaveriAdmin.userId, false)).rejects.toThrow(/Not permitted/);
  });
});
