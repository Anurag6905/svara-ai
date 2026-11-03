import { and, count, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { conversations, evidence, leads, needProfiles, productMatches, reviews } from "@/db/schema";
import { assertCan } from "@/lib/auth/rbac";
import type { Outcome } from "@/lib/conversation/engine";
import type { StoredProfile } from "@/lib/conversations";
import type { TenantContext } from "@/lib/tenant";

export async function getAnalytics(db: Db, ctx: TenantContext) {
  assertCan(ctx.role, "analytics.view");
  const org = ctx.organisationId;

  const leadRows = await db.select({ status: leads.status, n: count() }).from(leads).where(eq(leads.organisationId, org)).groupBy(leads.status);
  const convRows = await db.select().from(conversations).where(eq(conversations.organisationId, org));
  const profileRows = await db.select().from(needProfiles).where(eq(needProfiles.organisationId, org));
  const reviewRows = await db.select().from(reviews).where(eq(reviews.organisationId, org));
  const [reviewedEvidence] = await db
    .select({ n: count() })
    .from(evidence)
    .where(and(eq(evidence.organisationId, org), eq(evidence.humanReviewed, true)));
  const matchRows = await db.select().from(productMatches).where(eq(productMatches.organisationId, org));

  const sims = convRows.filter((c) => c.mode === "SIMULATION");
  const live = convRows.filter((c) => c.mode === "LIVE");
  const outcomes: Partial<Record<Outcome, number>> = {};
  for (const c of sims) if (c.outcome) outcomes[c.outcome as Outcome] = (outcomes[c.outcome as Outcome] ?? 0) + 1;

  const purposes = new Map<string, number>();
  const missing = new Map<string, number>();
  let corrections = 0;
  for (const p of profileRows) {
    if (p.purpose) purposes.set(p.purpose, (purposes.get(p.purpose) ?? 0) + 1);
    for (const m of JSON.parse(p.missingFieldsJson) as string[]) missing.set(m, (missing.get(m) ?? 0) + 1);
    try {
      corrections += Object.keys((JSON.parse(p.preferencesJson) as Partial<StoredProfile>).corrections ?? {}).length;
    } catch {
      /* ignore */
    }
  }

  const durations = sims.filter((c) => c.endedAt).map((c) => c.endedAt!.getTime() - c.startedAt.getTime());
  const avgDurationSec = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 1000) : 0;
  const decided = matchRows.filter((m) => m.productId && m.humanReviewStatus !== "PENDING");
  const rejected = decided.filter((m) => m.humanReviewStatus === "REJECTED").length;

  const leadsByStatus = Object.fromEntries(leadRows.map((r) => [r.status, r.n])) as Record<string, number>;
  const totalLeads = leadRows.reduce((a, r) => a + r.n, 0);

  return {
    totalLeads,
    leadsByStatus,
    simulations: sims.length,
    liveCalls: live.length,
    outcomes,
    awaitingReview: convRows.filter((c) => c.status === "AWAITING_REVIEW").length,
    reviewed: convRows.filter((c) => c.status === "REVIEWED").length,
    optOuts: leadsByStatus.OPTED_OUT ?? 0,
    escalations: (outcomes.HUMAN_REVIEW_REQUIRED ?? 0) + reviewRows.filter((r) => r.outcome === "ESCALATED").length,
    purposes: [...purposes.entries()].sort((a, b) => b[1] - a[1]),
    missing: [...missing.entries()].sort((a, b) => b[1] - a[1]),
    avgDurationSec,
    corrections,
    correctedFieldsReviewed: reviewedEvidence.n,
    summaryEdits: reviewRows.filter((r) => r.correctedSummary).length,
    matchDecisions: decided.length,
    matchOverrides: rejected,
    profiles: profileRows.length,
    complaints: 0,
  };
}
