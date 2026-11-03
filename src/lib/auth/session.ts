import "server-only";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/db/client";
import { organisations, users } from "@/db/schema";
import type { Permission } from "@/lib/auth/rbac";
import { can } from "@/lib/auth/rbac";
import type { TenantContext } from "@/lib/tenant";
import { SESSION_COOKIE, verifySessionToken } from "./session-token";

export interface SessionInfo {
  ctx: TenantContext;
  user: typeof users.$inferSelect;
  organisation: typeof organisations.$inferSelect;
}

/** Resolves the signed-in user, or null. Deactivated users have no session. */
export const getSession = cache(async (): Promise<SessionInfo | null> => {
  const store = await cookies();
  const userId = verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (!userId) return null;

  const db = getDb();
  const [row] = await db
    .select({ user: users, organisation: organisations })
    .from(users)
    .innerJoin(organisations, eq(organisations.id, users.organisationId))
    .where(eq(users.id, userId));
  if (!row || row.user.status === "DEACTIVATED") return null;

  return {
    user: row.user,
    organisation: row.organisation,
    ctx: {
      userId: row.user.id,
      organisationId: row.organisation.id,
      role: row.user.role,
    },
  };
});

export async function requireSession(): Promise<SessionInfo> {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session;
}

/** For pages: signed-in AND permitted, otherwise a friendly 403 page. */
export async function requirePermission(permission: Permission): Promise<SessionInfo> {
  const session = await requireSession();
  if (!can(session.ctx.role, permission)) redirect(`/forbidden?need=${permission}`);
  return session;
}
