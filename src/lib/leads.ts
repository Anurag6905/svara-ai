import { and, asc, count, desc, eq, inArray, like, or } from "drizzle-orm";
import Papa from "papaparse";
import { z } from "zod";
import type { Db } from "@/db/client";
import {
  DNC_STATUSES,
  PERMISSION_STATUSES,
  leads,
  type Lead,
  type LeadStatus,
} from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { assertCan } from "@/lib/auth/rbac";
import { NotFoundError, type TenantContext } from "@/lib/tenant";
import { ValidationError } from "@/lib/users";

export const CSV_HEADERS = [
  "lead_id",
  "first_name",
  "phone_number",
  "loan_category",
  "lead_source",
  "enquiry_date",
  "preferred_language",
  "permission_status",
  "permission_timestamp",
  "permission_source",
  "permission_reference",
  "do_not_call_status",
] as const;

export const REQUIRED_HEADERS = [
  "lead_id",
  "phone_number",
  "lead_source",
  "permission_status",
] as const;

export const LOAN_CATEGORIES = [
  "Business Loan",
  "Working Capital",
  "Equipment Loan",
  "Micro Enterprise Loan",
  "Personal Loan",
] as const;

export const LANGUAGES = ["English", "Hindi", "Hinglish", "Marathi"] as const;

// ───────────── Permission gate ─────────────

export type GateResult = { allowed: true } | { allowed: false; reasons: string[] };

/**
 * The single rule deciding whether a lead may enter any calling workflow
 * (simulation now, pilot later). Deliberately conservative: anything unknown blocks.
 */
export function checkContactGate(
  lead: Pick<
    Lead,
    | "permissionStatus"
    | "permissionTimestamp"
    | "permissionSource"
    | "permissionReference"
    | "doNotCallStatus"
    | "status"
  >,
): GateResult {
  const reasons: string[] = [];
  if (lead.status === "OPTED_OUT") reasons.push("Customer has opted out");
  if (lead.permissionStatus !== "GRANTED")
    reasons.push(`Permission status is ${lead.permissionStatus.toLowerCase()}`);
  if (!lead.permissionTimestamp) reasons.push("Missing permission timestamp");
  if (!lead.permissionSource) reasons.push("Missing permission source");
  if (!lead.permissionReference) reasons.push("Missing permission evidence reference");
  if (lead.doNotCallStatus === "REGISTERED") reasons.push("Number is on a do-not-call register");
  if (lead.doNotCallStatus === "UNKNOWN") reasons.push("Do-not-call status not checked");
  return reasons.length ? { allowed: false, reasons } : { allowed: true };
}

// ───────────── Phone helpers ─────────────

/** Normalises Indian mobile numbers to +91XXXXXXXXXX, or returns null. */
export function normalisePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, "");
  let local = digits;
  if (digits.length === 12 && digits.startsWith("91")) local = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) local = digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(local)) return null;
  return `+91${local}`;
}

/** Display form that never shows the full number. */
export function maskPhone(phone: string): string {
  return `+91 ••••• •${phone.slice(-4)}`;
}

// ───────────── CSV validation ─────────────

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be a date in YYYY-MM-DD format")
  .refine((v) => !Number.isNaN(Date.parse(v)), "is not a real date");

const isoDateTime = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), "must be an ISO date-time, e.g. 2026-10-14T10:30:00+05:30");

const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), schema.optional());

const upper = (v: unknown) => (typeof v === "string" ? v.trim().toUpperCase().replace(/[\s-]+/g, "_") : v);

export const csvRowSchema = z.object({
  lead_id: z.string().trim().min(1, "is required").max(64),
  first_name: optional(z.string().trim().max(60)),
  phone_number: z.string().trim().min(1, "is required"),
  loan_category: optional(z.string().trim().max(60)),
  lead_source: z.string().trim().min(1, "is required").max(80),
  enquiry_date: optional(isoDate),
  preferred_language: optional(z.string().trim().max(30)),
  permission_status: z.preprocess(upper, z.enum(PERMISSION_STATUSES, {
    errorMap: () => ({ message: `must be one of ${PERMISSION_STATUSES.join(", ")}` }),
  })),
  permission_timestamp: optional(isoDateTime),
  permission_source: optional(z.string().trim().max(80)),
  permission_reference: optional(z.string().trim().max(120)),
  do_not_call_status: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? "UNKNOWN" : upper(v)),
    z.enum(DNC_STATUSES, {
      errorMap: () => ({ message: `must be one of ${DNC_STATUSES.join(", ")}` }),
    }),
  ),
});
export type CsvRow = z.infer<typeof csvRowSchema>;

export interface RowIssue {
  row: number; // 1-based data row (header is row 0)
  leadId?: string;
  kind: "error" | "duplicate";
  messages: string[];
}

export interface ParsedLead {
  row: number;
  values: Omit<typeof leads.$inferInsert, "organisationId">;
  gate: GateResult;
}

export interface CsvValidationResult {
  headerErrors: string[];
  valid: ParsedLead[];
  issues: RowIssue[];
  totalRows: number;
}

/**
 * Pure validation of an uploaded CSV. `existing` holds the organisation's
 * current lead ids and phones so duplicates can be reported per row.
 */
export function validateLeadCsv(
  csvText: string,
  existing: { leadIds: Set<string>; phones: Set<string> },
): CsvValidationResult {
  const parsed = Papa.parse<Record<string, string>>(csvText.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  const headers = parsed.meta.fields ?? [];
  const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
  if (missing.length) {
    return {
      headerErrors: [`Missing required column(s): ${missing.join(", ")}. Download the template for the exact headers.`],
      valid: [],
      issues: [],
      totalRows: parsed.data.length,
    };
  }
  if (parsed.data.length > 2000) {
    return {
      headerErrors: ["The demo accepts up to 2,000 rows per file."],
      valid: [],
      issues: [],
      totalRows: parsed.data.length,
    };
  }

  const valid: ParsedLead[] = [];
  const issues: RowIssue[] = [];
  const seenIds = new Set<string>();
  const seenPhones = new Set<string>();

  parsed.data.forEach((raw, i) => {
    const row = i + 1;
    const result = csvRowSchema.safeParse(raw);
    if (!result.success) {
      issues.push({
        row,
        leadId: raw.lead_id?.trim() || undefined,
        kind: "error",
        messages: result.error.issues.map((iss) => `${String(iss.path[0]).replace(/_/g, " ")} ${iss.message}`),
      });
      return;
    }
    const r = result.data;
    const phone = normalisePhone(r.phone_number);
    if (!phone) {
      issues.push({
        row,
        leadId: r.lead_id,
        kind: "error",
        messages: ["phone number is not a valid 10-digit Indian mobile number"],
      });
      return;
    }
    const dupReasons: string[] = [];
    if (existing.leadIds.has(r.lead_id)) dupReasons.push("lead id already exists in this workspace");
    else if (seenIds.has(r.lead_id)) dupReasons.push("lead id repeats an earlier row in this file");
    if (existing.phones.has(phone)) dupReasons.push("phone number already belongs to an existing lead");
    else if (seenPhones.has(phone)) dupReasons.push("phone number repeats an earlier row in this file");
    if (dupReasons.length) {
      issues.push({ row, leadId: r.lead_id, kind: "duplicate", messages: dupReasons });
      return;
    }
    seenIds.add(r.lead_id);
    seenPhones.add(phone);

    const values = {
      externalLeadId: r.lead_id,
      firstName: r.first_name ?? null,
      phoneNumber: phone,
      category: r.loan_category ?? null,
      source: r.lead_source,
      enquiryDate: r.enquiry_date ?? null,
      preferredLanguage: r.preferred_language ?? null,
      permissionStatus: r.permission_status,
      permissionTimestamp: r.permission_timestamp ?? null,
      permissionSource: r.permission_source ?? null,
      permissionReference: r.permission_reference ?? null,
      doNotCallStatus: r.do_not_call_status,
      status: "IMPORTED" as LeadStatus,
    };
    const gate = checkContactGate(values);
    values.status = gate.allowed ? "READY_FOR_TEST" : "NEEDS_REVIEW";
    valid.push({ row, values, gate });
  });

  return { headerErrors: [], valid, issues, totalRows: parsed.data.length };
}

export function csvTemplate(): string {
  const example = [
    "KC-2026-0001",
    "Meena",
    "+91 98765 00001",
    "Equipment Loan",
    "Website enquiry form",
    "2026-10-20",
    "Hindi",
    "GRANTED",
    "2026-10-20T11:02:00+05:30",
    "Callback request on website",
    "WEB-CONSENT-88213",
    "CLEAR",
  ];
  return `${CSV_HEADERS.join(",")}\n${example.join(",")}\n`;
}

// ───────────── Queries & mutations ─────────────

export interface LeadFilters {
  status?: LeadStatus | "BLOCKED" | "CALLABLE";
  q?: string;
  category?: string;
}

export async function listLeads(db: Db, ctx: TenantContext, filters: LeadFilters = {}) {
  assertCan(ctx.role, "leads.view");
  const conds = [eq(leads.organisationId, ctx.organisationId)];
  if (filters.status && filters.status !== "BLOCKED" && filters.status !== "CALLABLE") {
    conds.push(eq(leads.status, filters.status));
  }
  if (filters.category) conds.push(eq(leads.category, filters.category));
  if (filters.q) {
    const q = `%${filters.q.trim()}%`;
    conds.push(or(like(leads.firstName, q), like(leads.externalLeadId, q), like(leads.source, q))!);
  }
  const rows = await db
    .select()
    .from(leads)
    .where(and(...conds))
    .orderBy(desc(leads.createdAt), asc(leads.externalLeadId));
  const withGate = rows.map((l) => ({ ...l, gate: checkContactGate(l) }));
  if (filters.status === "BLOCKED") return withGate.filter((l) => !l.gate.allowed);
  if (filters.status === "CALLABLE") return withGate.filter((l) => l.gate.allowed);
  return withGate;
}

export async function getLead(db: Db, ctx: TenantContext, leadId: string) {
  assertCan(ctx.role, "leads.view");
  const [row] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.organisationId, ctx.organisationId)));
  if (!row) throw new NotFoundError("Lead");
  return { ...row, gate: checkContactGate(row) };
}

export async function leadStatusCounts(db: Db, ctx: TenantContext) {
  const rows = await db
    .select({ status: leads.status, n: count() })
    .from(leads)
    .where(eq(leads.organisationId, ctx.organisationId))
    .groupBy(leads.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Partial<Record<LeadStatus, number>>;
}

async function existingKeys(db: Db, organisationId: string) {
  const rows = await db
    .select({ id: leads.externalLeadId, phone: leads.phoneNumber })
    .from(leads)
    .where(eq(leads.organisationId, organisationId));
  return { leadIds: new Set(rows.map((r) => r.id)), phones: new Set(rows.map((r) => r.phone)) };
}

export async function previewLeadImport(db: Db, ctx: TenantContext, csvText: string) {
  assertCan(ctx.role, "leads.import");
  return validateLeadCsv(csvText, await existingKeys(db, ctx.organisationId));
}

export async function importLeads(
  db: Db,
  ctx: TenantContext,
  csvText: string,
  opts: { fileName?: string } = {},
) {
  assertCan(ctx.role, "leads.import");
  const result = validateLeadCsv(csvText, await existingKeys(db, ctx.organisationId));
  if (result.headerErrors.length) throw new ValidationError(result.headerErrors[0]);
  const batchId = crypto.randomUUID();
  if (result.valid.length) {
    await db.insert(leads).values(
      result.valid.map((v) => ({
        ...v.values,
        organisationId: ctx.organisationId,
        importBatchId: batchId,
        isSynthetic: true,
      })),
    );
  }
  const ready = result.valid.filter((v) => v.gate.allowed).length;
  await recordAudit(db, ctx, {
    action: "lead.import",
    entityType: "lead_batch",
    entityId: batchId,
    metadata: {
      file: opts.fileName ?? "upload.csv",
      rows: result.totalRows,
      imported: result.valid.length,
      readyForTest: ready,
      needsReview: result.valid.length - ready,
      rejected: result.issues.filter((i) => i.kind === "error").length,
      duplicates: result.issues.filter((i) => i.kind === "duplicate").length,
    },
  });
  return { ...result, batchId, ready };
}

/**
 * Manager/admin approval of callable leads for a future pilot. Leads that fail
 * the gate are skipped and reported — never approved.
 */
export async function approveForPilot(db: Db, ctx: TenantContext, leadIds: string[]) {
  assertCan(ctx.role, "leads.approve_pilot");
  if (leadIds.length === 0) return { approved: 0, skipped: [] as string[] };
  const rows = await db
    .select()
    .from(leads)
    .where(and(eq(leads.organisationId, ctx.organisationId), inArray(leads.id, leadIds)));
  const ok = rows.filter((l) => checkContactGate(l).allowed && l.status === "READY_FOR_TEST");
  const skipped = rows.filter((l) => !ok.includes(l)).map((l) => l.externalLeadId);
  if (ok.length) {
    await db
      .update(leads)
      .set({ status: "APPROVED_FOR_PILOT" })
      .where(and(eq(leads.organisationId, ctx.organisationId), inArray(leads.id, ok.map((l) => l.id))));
  }
  await recordAudit(db, ctx, {
    action: "lead.approve_pilot",
    entityType: "lead",
    metadata: { approved: ok.length, skipped: skipped.length },
  });
  return { approved: ok.length, skipped };
}

/**
 * Records an opt-out. This is one-way in the product: no UI or service path
 * reverses it (PRD §7.3 — never silently override an opt-out).
 */
export async function recordOptOut(
  db: Db,
  ctx: TenantContext,
  leadId: string,
  reason: "CUSTOMER_REQUEST_IN_CONVERSATION" | "MANUAL_ENTRY",
) {
  const lead = await getLead(db, ctx, leadId);
  if (lead.status === "OPTED_OUT") return lead;
  await db
    .update(leads)
    .set({ status: "OPTED_OUT" })
    .where(and(eq(leads.id, leadId), eq(leads.organisationId, ctx.organisationId)));
  await recordAudit(db, ctx, { action: "lead.opt_out", entityType: "lead", entityId: leadId, metadata: { reason } });
  return { ...lead, status: "OPTED_OUT" as const };
}

/** Status changes driven by outcomes. Refuses to move a lead out of OPTED_OUT. */
export async function setLeadStatus(db: Db, ctx: TenantContext, leadId: string, status: LeadStatus) {
  const lead = await getLead(db, ctx, leadId);
  if (lead.status === "OPTED_OUT" && status !== "OPTED_OUT") {
    throw new ValidationError("This customer opted out. Their status cannot be changed.");
  }
  if (lead.status === status) return;
  await db
    .update(leads)
    .set({ status })
    .where(and(eq(leads.id, leadId), eq(leads.organisationId, ctx.organisationId)));
  await recordAudit(db, ctx, {
    action: "lead.status_change",
    entityType: "lead",
    entityId: leadId,
    metadata: { from: lead.status, to: status },
  });
}

export const LEAD_STATUS_META: Record<LeadStatus, { label: string; tone: "neutral" | "ok" | "warn" | "danger" | "accent" | "sim" }> = {
  IMPORTED: { label: "Imported", tone: "neutral" },
  NEEDS_REVIEW: { label: "Needs review", tone: "warn" },
  READY_FOR_TEST: { label: "Ready for test", tone: "neutral" },
  APPROVED_FOR_PILOT: { label: "Approved for pilot", tone: "accent" },
  CONTACTED: { label: "Contacted", tone: "neutral" },
  INTERESTED: { label: "Interested", tone: "ok" },
  NOT_INTERESTED: { label: "Not interested", tone: "neutral" },
  FOLLOW_UP_REQUESTED: { label: "Follow-up requested", tone: "ok" },
  UNREACHABLE: { label: "Unreachable", tone: "neutral" },
  OPTED_OUT: { label: "Opted out", tone: "danger" },
  HUMAN_REVIEW_REQUIRED: { label: "Human review required", tone: "warn" },
};
