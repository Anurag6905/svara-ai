import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { auditEvents, users } from "@/db/schema";
import { assertCan } from "@/lib/auth/rbac";
import type { TenantContext } from "@/lib/tenant";

/**
 * Keys whose values must never be written to the audit log (PRD §9: redact
 * sensitive information from logs). Values are replaced, keys are kept so the
 * log still shows *that* a field changed.
 */
const SENSITIVE_KEYS = [
  "phone",
  "phonenumber",
  "phone_number",
  "transcript",
  "text",
  "email",
  "otp",
  "password",
  "pin",
];

export function redactMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    const k = key.toLowerCase();
    if (SENSITIVE_KEYS.some((s) => k === s || k.includes(s))) {
      out[key] = "[redacted]";
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = redactMetadata(value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export async function recordAudit(
  db: Db,
  ctx: Pick<TenantContext, "organisationId" | "userId">,
  event: {
    action: string;
    entityType: string;
    entityId?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  await db.insert(auditEvents).values({
    organisationId: ctx.organisationId,
    userId: ctx.userId,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId ?? null,
    timestamp: new Date(),
    redactedMetadataJson: JSON.stringify(redactMetadata(event.metadata ?? {})),
  });
}

export async function listAuditEvents(
  db: Db,
  ctx: TenantContext,
  opts: { limit?: number; entityType?: string } = {},
) {
  assertCan(ctx.role, "audit.view");
  const where = opts.entityType
    ? and(
        eq(auditEvents.organisationId, ctx.organisationId),
        eq(auditEvents.entityType, opts.entityType),
      )
    : eq(auditEvents.organisationId, ctx.organisationId);

  return db
    .select({
      id: auditEvents.id,
      action: auditEvents.action,
      entityType: auditEvents.entityType,
      entityId: auditEvents.entityId,
      timestamp: auditEvents.timestamp,
      metadataJson: auditEvents.redactedMetadataJson,
      actorName: users.name,
    })
    .from(auditEvents)
    .leftJoin(users, eq(users.id, auditEvents.userId))
    .where(where)
    .orderBy(desc(auditEvents.timestamp))
    .limit(opts.limit ?? 200);
}

/** Human-readable labels for audit actions shown in the UI. */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "auth.sign_in": "Signed in",
  "auth.sign_out": "Signed out",
  "user.invite": "Invited user",
  "user.role_change": "Changed user role",
  "user.deactivate": "Deactivated user",
  "user.reactivate": "Reactivated user",
  "lead.import": "Imported leads",
  "lead.approve_pilot": "Approved leads for pilot",
  "lead.opt_out": "Recorded opt-out",
  "lead.status_change": "Lead status changed",
  "product.create": "Created product",
  "product.update": "Edited product",
  "product.activate": "Activated product",
  "product.deactivate": "Deactivated product",
  "simulation.run": "Ran simulation",
  "review.submit": "Submitted review",
  "export.results": "Exported results",
};
