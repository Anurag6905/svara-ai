"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { ROLES } from "@/db/schema";
import { ForbiddenError } from "@/lib/auth/rbac";
import { requireSession } from "@/lib/auth/session";
import { NotFoundError } from "@/lib/tenant";
import {
  changeUserRole,
  inviteUser,
  inviteUserSchema,
  setUserActive,
  ValidationError,
} from "@/lib/users";

export type ActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

function toResult(err: unknown): ActionResult {
  if (err instanceof ValidationError || err instanceof NotFoundError) {
    return { ok: false, message: err.message };
  }
  if (err instanceof ForbiddenError) {
    return { ok: false, message: "Your role does not allow this action." };
  }
  console.error("[users action] unexpected error", (err as Error)?.name);
  return { ok: false, message: "Something went wrong. Please try again." };
}

export async function inviteUserAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { ctx } = await requireSession();
  const parsed = inviteUserSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    title: formData.get("title") ?? "",
    role: formData.get("role"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[String(issue.path[0])] ??= issue.message;
    }
    return { ok: false, message: "Please fix the highlighted fields.", fieldErrors };
  }
  try {
    const user = await inviteUser(getDb(), ctx, parsed.data);
    revalidatePath("/settings/users");
    return { ok: true, message: `${user.name} has been invited.` };
  } catch (err) {
    return toResult(err);
  }
}

const roleSchema = z.object({ userId: z.string().uuid(), role: z.enum(ROLES) });

export async function changeRoleAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { ctx } = await requireSession();
  const parsed = roleSchema.safeParse({
    userId: formData.get("userId"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { ok: false, message: "Invalid role change." };
  try {
    await changeUserRole(getDb(), ctx, parsed.data.userId, parsed.data.role);
    revalidatePath("/settings/users");
    return { ok: true, message: "Role updated." };
  } catch (err) {
    return toResult(err);
  }
}

const activeSchema = z.object({
  userId: z.string().uuid(),
  active: z.enum(["true", "false"]),
});

export async function setActiveAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { ctx } = await requireSession();
  const parsed = activeSchema.safeParse({
    userId: formData.get("userId"),
    active: formData.get("active"),
  });
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  try {
    const active = parsed.data.active === "true";
    await setUserActive(getDb(), ctx, parsed.data.userId, active);
    revalidatePath("/settings/users");
    return { ok: true, message: active ? "User reactivated." : "User deactivated." };
  } catch (err) {
    return toResult(err);
  }
}
