import { and, asc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { ROLES, users, type Role } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { assertCan } from "@/lib/auth/rbac";
import { NotFoundError, type TenantContext } from "@/lib/tenant";

export const inviteUserSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(80),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email address"),
  title: z.string().trim().max(80).optional().or(z.literal("")),
  role: z.enum(ROLES),
});
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export async function listUsers(db: Db, ctx: TenantContext) {
  return db
    .select()
    .from(users)
    .where(eq(users.organisationId, ctx.organisationId))
    .orderBy(asc(users.name));
}

async function getScopedUser(db: Db, ctx: TenantContext, userId: string) {
  const [row] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), eq(users.organisationId, ctx.organisationId)));
  if (!row) throw new NotFoundError("User");
  return row;
}

async function activeAdminCount(db: Db, organisationId: string, excludeId?: string) {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.organisationId, organisationId),
        eq(users.role, "ORG_ADMIN"),
        eq(users.status, "ACTIVE"),
        excludeId ? ne(users.id, excludeId) : undefined,
      ),
    );
  return rows.length;
}

export async function inviteUser(db: Db, ctx: TenantContext, input: InviteUserInput) {
  assertCan(ctx.role, "users.manage");
  const data = inviteUserSchema.parse(input);
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, data.email));
  if (existing) throw new ValidationError("A user with this email already exists.");

  const [created] = await db
    .insert(users)
    .values({
      organisationId: ctx.organisationId,
      name: data.name,
      email: data.email,
      title: data.title || null,
      role: data.role,
      status: "INVITED",
    })
    .returning();

  await recordAudit(db, ctx, {
    action: "user.invite",
    entityType: "user",
    entityId: created.id,
    metadata: { role: data.role },
  });
  return created;
}

export async function changeUserRole(
  db: Db,
  ctx: TenantContext,
  userId: string,
  role: Role,
) {
  assertCan(ctx.role, "users.manage");
  const target = await getScopedUser(db, ctx, userId);
  if (target.role === role) return target;
  if (
    target.role === "ORG_ADMIN" &&
    (await activeAdminCount(db, ctx.organisationId, target.id)) === 0
  ) {
    throw new ValidationError("The organisation must keep at least one active admin.");
  }
  const [updated] = await db
    .update(users)
    .set({ role })
    .where(and(eq(users.id, userId), eq(users.organisationId, ctx.organisationId)))
    .returning();
  await recordAudit(db, ctx, {
    action: "user.role_change",
    entityType: "user",
    entityId: userId,
    metadata: { from: target.role, to: role },
  });
  return updated;
}

export async function setUserActive(
  db: Db,
  ctx: TenantContext,
  userId: string,
  active: boolean,
) {
  assertCan(ctx.role, "users.manage");
  const target = await getScopedUser(db, ctx, userId);
  if (!active && target.id === ctx.userId) {
    throw new ValidationError("You cannot deactivate your own account.");
  }
  if (
    !active &&
    target.role === "ORG_ADMIN" &&
    (await activeAdminCount(db, ctx.organisationId, target.id)) === 0
  ) {
    throw new ValidationError("The organisation must keep at least one active admin.");
  }
  const [updated] = await db
    .update(users)
    .set({ status: active ? "ACTIVE" : "DEACTIVATED" })
    .where(and(eq(users.id, userId), eq(users.organisationId, ctx.organisationId)))
    .returning();
  await recordAudit(db, ctx, {
    action: active ? "user.reactivate" : "user.deactivate",
    entityType: "user",
    entityId: userId,
  });
  return updated;
}
