import Papa from "papaparse";
import type { Db } from "@/db/client";
import { recordAudit } from "@/lib/audit";
import { assertCan } from "@/lib/auth/rbac";
import { effectiveValue, getConversationDetail, listConversations, REVIEW_OUTCOMES, type ReviewOutcome } from "@/lib/conversations";
import { MATCH_LABEL } from "@/lib/matching";
import type { TenantContext } from "@/lib/tenant";

/**
 * CSV of conversation results (PRD §7.9). Phone numbers are masked; the full
 * number never leaves through an export in the demo.
 */
export async function exportResultsCsv(db: Db, ctx: TenantContext, opts: { reviewedOnly?: boolean } = {}) {
  assertCan(ctx.role, "exports.download");
  const list = await listConversations(db, ctx, opts.reviewedOnly ? { status: "REVIEWED" } : {});
  const rows: Record<string, string>[] = [];
  for (const c of list) {
    const d = await getConversationDetail(db, ctx, c.id);
    const p = d.profile;
    const v = (f: Parameters<typeof effectiveValue>[2]) => (p ? effectiveValue(p, d.corrections, f) ?? "" : "");
    const r = d.latestReview?.review;
    rows.push({
      lead_id: d.lead.externalLeadId,
      first_name: d.lead.firstName ?? "",
      phone_masked: `XXXXXX${d.lead.phoneNumber.slice(-4)}`,
      lead_status: d.lead.status,
      conversation_mode: d.conversation.mode,
      conversation_date: d.conversation.startedAt.toISOString(),
      ai_outcome: d.outcomeLabel,
      purpose: v("purpose"),
      amount: v("amount"),
      timeline: v("timeline"),
      loan_category: v("loanCategory"),
      business_context: v("businessContext"),
      callback_time: v("callbackTime"),
      questions: p?.questions.map((q) => q.topic).join("; ") ?? "",
      missing_information: p?.missing.join("; ") ?? "",
      fields_corrected_by_human: Object.keys(d.corrections).join("; "),
      suggested_products: d.matches.filter((m) => m.productName).map((m) => `${m.productName} (${m.humanReviewStatus.toLowerCase()})`).join("; "),
      match_note: d.matches.find((m) => !m.productId)?.message ?? MATCH_LABEL,
      summary: r?.correctedSummary ?? d.summary?.text ?? "",
      review_status: d.conversation.status,
      review_outcome: r ? REVIEW_OUTCOMES[r.outcome as ReviewOutcome] ?? r.outcome : "",
      reviewer: d.latestReview?.reviewer ?? "",
      next_action: r?.nextAction ?? d.summary?.nextAction ?? "",
      follow_up_at: r?.followUpAt ?? "",
      opted_out: d.lead.status === "OPTED_OUT" ? "yes" : "no",
    });
  }
  await recordAudit(db, ctx, { action: "export.results", entityType: "export", metadata: { rows: rows.length, reviewedOnly: !!opts.reviewedOnly } });
  return Papa.unparse(rows.length ? rows : [{ note: "No conversations to export yet" }]);
}
