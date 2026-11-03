"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { getSession } from "@/lib/auth/session";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth/session-token";

const signInSchema = z.object({ userId: z.string().uuid() });

/**
 * Demo sign-in: choose a seeded demo user. No passwords exist in this MVP.
 * Replace with the lender's SSO before any pilot (see ASSUMPTIONS.md A-04).
 */
export async function signInAsDemoUser(formData: FormData) {
  const parsed = signInSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) redirect("/sign-in?error=invalid");

  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, parsed.data.userId));
  if (!user || user.status === "DEACTIVATED") redirect("/sign-in?error=inactive");

  if (user.status === "INVITED") {
    await db.update(users).set({ status: "ACTIVE" }).where(eq(users.id, user.id));
  }

  const store = await cookies();
  store.set(SESSION_COOKIE, createSessionToken(user.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  await recordAudit(db, { organisationId: user.organisationId, userId: user.id }, {
    action: "auth.sign_in",
    entityType: "session",
    entityId: user.id,
  });
  redirect("/");
}

export async function signOut() {
  const session = await getSession();
  if (session) {
    await recordAudit(getDb(), session.ctx, {
      action: "auth.sign_out",
      entityType: "session",
      entityId: session.user.id,
    });
  }
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/sign-in");
}
