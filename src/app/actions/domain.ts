"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { ForbiddenError } from "@/lib/auth/rbac";
import { requireSession } from "@/lib/auth/session";
import { customInputsSchema, reviewInputSchema, runSimulation, submitReview } from "@/lib/conversations";
import { approveForPilot, importLeads, listLeads, previewLeadImport, recordOptOut, type CsvValidationResult } from "@/lib/leads";
import { createProduct, productInputSchema, setProductStatus, updateProduct } from "@/lib/products";
import { NotFoundError } from "@/lib/tenant";
import { ValidationError } from "@/lib/users";

export type Result<T = undefined> =
  | { ok: true; message: string; data?: T }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

function fail(err: unknown): { ok: false; message: string } {
  if (err instanceof ValidationError || err instanceof NotFoundError) return { ok: false, message: err.message };
  if (err instanceof ForbiddenError) return { ok: false, message: "Your role does not allow this action." };
  if (err instanceof z.ZodError) return { ok: false, message: err.issues[0]?.message ?? "Invalid input." };
  console.error("[action] unexpected error:", (err as Error)?.name, (err as Error)?.message);
  return { ok: false, message: "Something went wrong. Please try again." };
}

// ───────────── Leads ─────────────

const MAX_CSV_BYTES = 1_000_000;

export async function previewImportAction(csvText: string): Promise<Result<Omit<CsvValidationResult, "valid"> & { validCount: number; readyCount: number; sample: { row: number; leadId: string; ready: boolean; reasons: string[] }[] }>> {
  const { ctx } = await requireSession();
  if (csvText.length > MAX_CSV_BYTES) return { ok: false, message: "File is larger than 1 MB." };
  try {
    const r = await previewLeadImport(getDb(), ctx, csvText);
    return {
      ok: true,
      message: "Preview ready",
      data: {
        headerErrors: r.headerErrors,
        issues: r.issues,
        totalRows: r.totalRows,
        validCount: r.valid.length,
        readyCount: r.valid.filter((v) => v.gate.allowed).length,
        sample: r.valid.slice(0, 200).map((v) => ({
          row: v.row,
          leadId: v.values.externalLeadId,
          ready: v.gate.allowed,
          reasons: v.gate.allowed ? [] : v.gate.reasons,
        })),
      },
    };
  } catch (err) {
    return fail(err);
  }
}

export async function importLeadsAction(csvText: string, fileName: string): Promise<Result<{ imported: number; ready: number }>> {
  const { ctx } = await requireSession();
  if (csvText.length > MAX_CSV_BYTES) return { ok: false, message: "File is larger than 1 MB." };
  try {
    const r = await importLeads(getDb(), ctx, csvText, { fileName: fileName.slice(0, 120) });
    revalidatePath("/leads");
    return {
      ok: true,
      message: `Imported ${r.valid.length} lead${r.valid.length === 1 ? "" : "s"} (${r.ready} ready for test, ${r.valid.length - r.ready} need permission review). ${r.issues.length} row${r.issues.length === 1 ? "" : "s"} skipped.`,
      data: { imported: r.valid.length, ready: r.ready },
    };
  } catch (err) {
    return fail(err);
  }
}

export async function approveReadyLeadsAction(): Promise<Result> {
  const { ctx } = await requireSession();
  try {
    const db = getDb();
    const ready = (await listLeads(db, ctx, { status: "READY_FOR_TEST" })).filter((l) => l.gate.allowed);
    const r = await approveForPilot(db, ctx, ready.map((l) => l.id));
    revalidatePath("/leads");
    return { ok: true, message: r.approved ? `${r.approved} lead${r.approved === 1 ? "" : "s"} approved for a future pilot batch.` : "No leads were ready for approval." };
  } catch (err) {
    return fail(err);
  }
}

export async function approveLeadAction(leadId: string): Promise<Result> {
  const { ctx } = await requireSession();
  try {
    const r = await approveForPilot(getDb(), ctx, [leadId]);
    revalidatePath(`/leads/${leadId}`);
    revalidatePath("/leads");
    return r.approved ? { ok: true, message: "Approved for a future pilot batch." } : { ok: false, message: "Only permissioned leads that are Ready for test can be approved." };
  } catch (err) {
    return fail(err);
  }
}

export async function recordOptOutAction(leadId: string): Promise<Result> {
  const { ctx } = await requireSession();
  try {
    if (ctx.role === "ANALYST") throw new ForbiddenError("reviews.write");
    await recordOptOut(getDb(), ctx, leadId, "MANUAL_ENTRY");
    revalidatePath(`/leads/${leadId}`);
    revalidatePath("/leads");
    return { ok: true, message: "Opt-out recorded. This lead is now permanently suppressed." };
  } catch (err) {
    return fail(err);
  }
}

// ───────────── Products ─────────────

export async function saveProductAction(productId: string | null, raw: unknown): Promise<Result<{ id: string }>> {
  const { ctx } = await requireSession();
  const parsed = productInputSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[i.path.join(".")] ??= i.message;
    return { ok: false, message: "Please fix the highlighted fields.", fieldErrors };
  }
  try {
    const db = getDb();
    const row = productId ? await updateProduct(db, ctx, productId, parsed.data) : await createProduct(db, ctx, parsed.data);
    revalidatePath("/products");
    return { ok: true, message: productId ? "Product saved." : "Product created.", data: { id: row.id } };
  } catch (err) {
    return fail(err);
  }
}

export async function setProductStatusAction(productId: string, status: "ACTIVE" | "INACTIVE"): Promise<Result> {
  const { ctx } = await requireSession();
  try {
    await setProductStatus(getDb(), ctx, productId, status);
    revalidatePath("/products");
    return { ok: true, message: status === "ACTIVE" ? "Product activated." : "Product deactivated — it will no longer be suggested." };
  } catch (err) {
    return fail(err);
  }
}

// ───────────── Simulator ─────────────

export async function runScenarioAction(leadId: string, scenarioKey: string): Promise<Result> {
  const { ctx } = await requireSession();
  let id: string;
  try {
    ({ conversationId: id } = await runSimulation(getDb(), ctx, leadId, { scenarioKey }));
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/conversations");
  redirect(`/conversations/${id}?new=1`);
}

export async function runCustomAction(leadId: string, inputs: unknown): Promise<Result> {
  const { ctx } = await requireSession();
  const parsed = customInputsSchema.safeParse(inputs);
  if (!parsed.success) return { ok: false, message: "The conversation needs at least one customer reply." };
  let id: string;
  try {
    ({ conversationId: id } = await runSimulation(getDb(), ctx, leadId, { customInputs: parsed.data }));
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/conversations");
  redirect(`/conversations/${id}?new=1`);
}

// ───────────── Review ─────────────

export async function submitReviewAction(conversationId: string, raw: unknown): Promise<Result> {
  const { ctx } = await requireSession();
  const parsed = reviewInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid review." };
  try {
    await submitReview(getDb(), ctx, conversationId, parsed.data);
    revalidatePath(`/conversations/${conversationId}`);
    revalidatePath("/conversations");
    return { ok: true, message: "Review saved and logged." };
  } catch (err) {
    return fail(err);
  }
}
