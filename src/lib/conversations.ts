import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import {
  conversations,
  evidence,
  leads,
  needProfiles,
  organisations,
  productMatches,
  products,
  reviews,
  transcriptSegments,
  users,
  type LeadStatus,
} from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { assertCan } from "@/lib/auth/rbac";
import { OUTCOMES, runConversation, type CustomerInput, type Outcome } from "@/lib/conversation/engine";
import { getScenario } from "@/lib/conversation/scenarios";
import { getExtractionProvider } from "@/lib/extraction/provider";
import { needProfileSchema, PROFILE_FIELDS, type NeedProfile } from "@/lib/extraction/schema";
import { getLead, recordOptOut, setLeadStatus } from "@/lib/leads";
import { matchProducts, type MatchOutcome } from "@/lib/matching";
import { listProducts } from "@/lib/products";
import { buildSummary } from "@/lib/summary";
import { NotFoundError, type TenantContext } from "@/lib/tenant";
import { ValidationError } from "@/lib/users";

export const OUTCOME_TO_LEAD_STATUS: Record<Outcome, LeadStatus> = {
  INTERESTED_FOLLOW_UP: "INTERESTED",
  EXPLORING: "CONTACTED",
  NOT_INTERESTED: "NOT_INTERESTED",
  UNREACHABLE: "UNREACHABLE",
  CALLBACK_REQUESTED: "FOLLOW_UP_REQUESTED",
  OPTED_OUT: "OPTED_OUT",
  HUMAN_REVIEW_REQUIRED: "HUMAN_REVIEW_REQUIRED",
};

const ENQUIRY_LABELS: Record<string, string> = {
  "Personal Loan": "personal loan enquiry",
  "Working Capital": "working capital loan enquiry",
  "Equipment Loan": "equipment loan enquiry",
  "Micro Enterprise Loan": "business loan enquiry",
  "Business Loan": "business loan enquiry",
};

export const customInputsSchema = z
  .array(z.object({ text: z.string().max(500), interrupt: z.boolean().optional() }))
  .min(1)
  .max(30);

/**
 * Runs a SIMULATED conversation for a lead and stores transcript, profile,
 * matches and summary. Refuses any lead that fails the contact gate.
 */
export async function runSimulation(
  db: Db,
  ctx: TenantContext,
  leadId: string,
  input: { scenarioKey: string } | { customInputs: CustomerInput[] },
  opts: { now?: Date } = {},
) {
  assertCan(ctx.role, "simulator.run");
  const lead = await getLead(db, ctx, leadId);
  if (!lead.gate.allowed) {
    throw new ValidationError(`This lead can't enter a calling workflow: ${lead.gate.reasons.join("; ")}.`);
  }
  let inputs: CustomerInput[];
  let scenario: string;
  if ("scenarioKey" in input) {
    const s = getScenario(input.scenarioKey);
    if (!s) throw new ValidationError("Unknown scenario.");
    inputs = s.inputs;
    scenario = s.key;
  } else {
    inputs = customInputsSchema.parse(input.customInputs);
    scenario = "custom";
  }

  const [org] = await db.select().from(organisations).where(eq(organisations.id, ctx.organisationId));
  const run = runConversation(
    {
      lenderName: org.shortName,
      enquiryLabel: ENQUIRY_LABELS[lead.category ?? ""] ?? "loan enquiry",
      firstName: lead.firstName,
    },
    inputs,
    { startHindi: lead.preferredLanguage === "Hindi" },
  );
  const outcome: Outcome = run.outcome ?? "HUMAN_REVIEW_REQUIRED";

  const startedAt = opts.now ?? new Date();
  const [conv] = await db
    .insert(conversations)
    .values({
      organisationId: ctx.organisationId,
      leadId: lead.id,
      mode: "SIMULATION",
      scenario,
      status: "AWAITING_REVIEW",
      outcome,
      startedAt,
      endedAt: new Date(startedAt.getTime() + run.durationMs),
      language: run.language,
      provider: "simulator",
      createdByUserId: ctx.userId,
    })
    .returning();

  const segRows = await db
    .insert(transcriptSegments)
    .values(
      run.turns.map((t, i) => ({
        organisationId: ctx.organisationId,
        conversationId: conv.id,
        seq: i,
        speaker: t.speaker,
        text: t.interrupted ? `${t.text} [interrupted]` : t.text,
        timestampMs: t.timestampMs,
        confidence: t.speaker === "CUSTOMER" ? 0.95 : null,
      })),
    )
    .returning();

  const provider = getExtractionProvider();
  const { profile, version } = await provider.extract(
    segRows.map((s) => ({ seq: s.seq, speaker: s.speaker, text: s.text })),
    outcome,
  );
  await storeProfile(db, ctx, conv.id, profile, version, segRows);

  const catalogue = await listProducts(db, ctx, { activeOnly: true });
  const match = matchProducts(profile, catalogue);
  await storeMatches(db, ctx, conv.id, match);

  // Lead status follows the outcome; opt-out goes through the one-way path.
  if (outcome === "OPTED_OUT") await recordOptOut(db, ctx, lead.id, "CUSTOMER_REQUEST_IN_CONVERSATION");
  else await setLeadStatus(db, ctx, lead.id, OUTCOME_TO_LEAD_STATUS[outcome]);

  await recordAudit(db, ctx, {
    action: "simulation.run",
    entityType: "conversation",
    entityId: conv.id,
    metadata: { scenario, outcome, extraction: version, matches: match.matches.length },
  });
  return { conversationId: conv.id, outcome };
}

async function storeProfile(
  db: Db,
  ctx: TenantContext,
  conversationId: string,
  profile: NeedProfile,
  version: string,
  segRows: { id: string; seq: number }[],
) {
  const segIdBySeq = new Map(segRows.map((s) => [s.seq, s.id]));
  const [row] = await db
    .insert(needProfiles)
    .values({
      organisationId: ctx.organisationId,
      conversationId,
      purpose: profile.fields.purpose.value,
      amountRange: profile.fields.amount.value,
      timeline: profile.fields.timeline.value,
      interestStatus: profile.fields.interest.value,
      callbackTime: profile.fields.callbackTime.value,
      preferencesJson: JSON.stringify({ profile }),
      missingFieldsJson: JSON.stringify(profile.missing),
      extractionVersion: version,
    })
    .returning();

  const evRows: (typeof evidence.$inferInsert)[] = PROFILE_FIELDS.map((name) => {
    const f = profile.fields[name];
    return {
      organisationId: ctx.organisationId,
      needProfileId: row.id,
      fieldName: name,
      transcriptSegmentId: f.evidenceSeq !== null ? segIdBySeq.get(f.evidenceSeq) ?? null : null,
      evidenceText: f.evidenceText,
      sourceType: f.sourceType,
      confidence: f.confidence,
    };
  });
  for (const q of profile.questions) {
    evRows.push({
      organisationId: ctx.organisationId,
      needProfileId: row.id,
      fieldName: `question:${q.topic}`,
      transcriptSegmentId: segIdBySeq.get(q.evidenceSeq) ?? null,
      evidenceText: q.evidenceText,
      sourceType: "CUSTOMER_STATED",
      confidence: 0.85,
    });
  }
  await db.insert(evidence).values(evRows);
}

async function storeMatches(db: Db, ctx: TenantContext, conversationId: string, match: MatchOutcome) {
  if (match.matches.length === 0) {
    await db.insert(productMatches).values({
      organisationId: ctx.organisationId,
      conversationId,
      productId: null,
      matchStatus: match.status,
      explanation: match.message,
      missingInformationJson: "[]",
    });
    return;
  }
  await db.insert(productMatches).values(
    match.matches.map((m) => ({
      organisationId: ctx.organisationId,
      conversationId,
      productId: m.productId,
      matchStatus: m.status,
      explanation: JSON.stringify({ reasons: m.reasons, conflicts: m.conflicts }),
      missingInformationJson: JSON.stringify(m.missing),
    })),
  );
}

// ───────────── Reads ─────────────

export async function listConversations(
  db: Db,
  ctx: TenantContext,
  opts: { status?: "AWAITING_REVIEW" | "REVIEWED"; leadId?: string } = {},
) {
  assertCan(ctx.role, "leads.view");
  const conds = [eq(conversations.organisationId, ctx.organisationId)];
  if (opts.status) conds.push(eq(conversations.status, opts.status));
  if (opts.leadId) conds.push(eq(conversations.leadId, opts.leadId));
  return db
    .select({
      id: conversations.id,
      status: conversations.status,
      outcome: conversations.outcome,
      scenario: conversations.scenario,
      mode: conversations.mode,
      startedAt: conversations.startedAt,
      endedAt: conversations.endedAt,
      language: conversations.language,
      leadId: leads.id,
      leadName: leads.firstName,
      leadExternalId: leads.externalLeadId,
      leadCategory: leads.category,
      purpose: needProfiles.purpose,
      amount: needProfiles.amountRange,
    })
    .from(conversations)
    .innerJoin(leads, eq(leads.id, conversations.leadId))
    .leftJoin(needProfiles, eq(needProfiles.conversationId, conversations.id))
    .where(and(...conds))
    .orderBy(desc(conversations.startedAt));
}

export interface StoredProfile {
  profile: NeedProfile;
  corrections: Partial<Record<string, { value: string | null; by: string; at: string }>>;
}

export async function getConversationDetail(db: Db, ctx: TenantContext, conversationId: string) {
  assertCan(ctx.role, "leads.view");
  const [conv] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.organisationId, ctx.organisationId)));
  if (!conv) throw new NotFoundError("Conversation");
  const lead = await getLead(db, ctx, conv.leadId);
  const segments = await db
    .select()
    .from(transcriptSegments)
    .where(and(eq(transcriptSegments.conversationId, conv.id), eq(transcriptSegments.organisationId, ctx.organisationId)))
    .orderBy(asc(transcriptSegments.seq));
  const [profileRow] = await db
    .select()
    .from(needProfiles)
    .where(and(eq(needProfiles.conversationId, conv.id), eq(needProfiles.organisationId, ctx.organisationId)));
  const stored = profileRow ? (JSON.parse(profileRow.preferencesJson) as Partial<StoredProfile>) : null;
  const profile = stored?.profile ? needProfileSchema.parse(stored.profile) : null;
  const corrections = stored?.corrections ?? {};

  const matchRows = await db
    .select({ match: productMatches, product: products })
    .from(productMatches)
    .leftJoin(products, eq(products.id, productMatches.productId))
    .where(and(eq(productMatches.conversationId, conv.id), eq(productMatches.organisationId, ctx.organisationId)));

  const reviewRows = await db
    .select({ review: reviews, reviewer: users.name })
    .from(reviews)
    .innerJoin(users, eq(users.id, reviews.reviewerUserId))
    .where(and(eq(reviews.conversationId, conv.id), eq(reviews.organisationId, ctx.organisationId)))
    .orderBy(desc(reviews.reviewedAt));

  const matches = matchRows.map(({ match, product }) => {
    let reasons: string[] = [];
    let conflicts: string[] = [];
    if (match.productId) {
      try {
        ({ reasons, conflicts } = JSON.parse(match.explanation));
      } catch {
        reasons = [match.explanation];
      }
    }
    return {
      id: match.id,
      productId: match.productId,
      productName: product?.name ?? null,
      productCategory: product?.category ?? null,
      productDisclaimer: product?.disclaimers ?? null,
      status: match.matchStatus,
      message: match.productId ? null : match.explanation,
      reasons,
      conflicts,
      missing: JSON.parse(match.missingInformationJson) as string[],
      humanReviewStatus: match.humanReviewStatus,
    };
  });

  const summary = profile
    ? buildSummary(profile, conv.outcome as Outcome, {
        status: matches[0]?.productId ? "MATCHES" : "INSUFFICIENT_INFORMATION",
        matches: matches
          .filter((m) => m.productId)
          .map((m) => ({ productId: m.productId!, productName: m.productName ?? "", status: "POSSIBLE_MATCH", reasons: [], conflicts: [], missing: [] })),
        message: "",
        label: "Suggested for human review — not an eligibility or approval decision.",
      })
    : null;

  return {
    conversation: conv,
    lead,
    segments,
    profile,
    profileMeta: profileRow ? { id: profileRow.id, extractionVersion: profileRow.extractionVersion } : null,
    corrections,
    matches,
    reviews: reviewRows,
    latestReview: reviewRows[0] ?? null,
    summary,
    outcomeLabel: conv.outcome ? OUTCOMES[conv.outcome as Outcome] : "—",
  };
}

// ───────────── Review ─────────────

export const REVIEW_OUTCOMES = {
  ACCEPTED: "Accepted — brief is accurate",
  CORRECTED: "Accepted with corrections",
  FOLLOW_UP_SCHEDULED: "Follow-up scheduled",
  ESCALATED: "Escalated to a senior team member",
  CLOSED: "Closed — no further action",
} as const;
export type ReviewOutcome = keyof typeof REVIEW_OUTCOMES;

export const reviewInputSchema = z.object({
  outcome: z.enum(Object.keys(REVIEW_OUTCOMES) as [ReviewOutcome, ...ReviewOutcome[]]),
  correctedSummary: z.string().trim().max(2000).optional().or(z.literal("")),
  nextAction: z.string().trim().max(500).optional().or(z.literal("")),
  followUpAt: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/, "Use a valid date")
    .optional()
    .or(z.literal("")),
  fieldCorrections: z.record(z.string(), z.string().trim().max(200)).default({}),
  matchDecisions: z.record(z.string(), z.enum(["ACCEPTED", "REJECTED", "PENDING"])).default({}),
});
export type ReviewInput = z.infer<typeof reviewInputSchema>;

export async function submitReview(db: Db, ctx: TenantContext, conversationId: string, input: ReviewInput) {
  assertCan(ctx.role, "reviews.write");
  const data = reviewInputSchema.parse(input);
  const detail = await getConversationDetail(db, ctx, conversationId);
  if (data.outcome === "FOLLOW_UP_SCHEDULED") {
    if (!data.followUpAt) throw new ValidationError("Choose a follow-up date.");
    if (detail.lead.status === "OPTED_OUT") throw new ValidationError("This customer opted out — a follow-up cannot be scheduled.");
  }

  // Field corrections: stored alongside the original extraction, never replacing it.
  const changed: string[] = [];
  if (detail.profile && detail.profileMeta) {
    const corrections = { ...detail.corrections };
    for (const [field, value] of Object.entries(data.fieldCorrections)) {
      if (!(PROFILE_FIELDS as readonly string[]).includes(field)) continue;
      const current = corrections[field]?.value ?? detail.profile.fields[field as keyof NeedProfile["fields"]].value;
      const next = value === "" ? null : value;
      if (next === current) continue;
      corrections[field] = { value: next, by: ctx.userId, at: new Date().toISOString() };
      changed.push(field);
    }
    if (changed.length) {
      await db
        .update(needProfiles)
        .set({ preferencesJson: JSON.stringify({ profile: detail.profile, corrections }) })
        .where(and(eq(needProfiles.id, detail.profileMeta.id), eq(needProfiles.organisationId, ctx.organisationId)));
      await db
        .update(evidence)
        .set({ humanReviewed: true })
        .where(and(eq(evidence.needProfileId, detail.profileMeta.id), inArray(evidence.fieldName, changed)));
    }
  }

  for (const [matchId, decision] of Object.entries(data.matchDecisions)) {
    if (!detail.matches.some((m) => m.id === matchId)) continue;
    await db
      .update(productMatches)
      .set({ humanReviewStatus: decision })
      .where(and(eq(productMatches.id, matchId), eq(productMatches.organisationId, ctx.organisationId)));
  }

  const [review] = await db
    .insert(reviews)
    .values({
      organisationId: ctx.organisationId,
      conversationId,
      reviewerUserId: ctx.userId,
      correctedSummary: data.correctedSummary || null,
      outcome: data.outcome,
      nextAction: data.nextAction || null,
      followUpAt: data.followUpAt || null,
      reviewedAt: new Date(),
    })
    .returning();

  await db
    .update(conversations)
    .set({ status: "REVIEWED" })
    .where(and(eq(conversations.id, conversationId), eq(conversations.organisationId, ctx.organisationId)));

  if (detail.lead.status !== "OPTED_OUT") {
    if (data.outcome === "FOLLOW_UP_SCHEDULED") await setLeadStatus(db, ctx, detail.lead.id, "FOLLOW_UP_REQUESTED");
    if (data.outcome === "ESCALATED") await setLeadStatus(db, ctx, detail.lead.id, "HUMAN_REVIEW_REQUIRED");
  }

  await recordAudit(db, ctx, {
    action: "review.submit",
    entityType: "conversation",
    entityId: conversationId,
    metadata: {
      outcome: data.outcome,
      fieldsCorrected: changed,
      summaryEdited: !!data.correctedSummary,
      matchDecisions: Object.keys(data.matchDecisions).length,
    },
  });
  return review;
}

/** The value a reviewer sees: their correction if any, otherwise the extraction. */
export function effectiveValue(
  profile: NeedProfile,
  corrections: StoredProfile["corrections"],
  field: (typeof PROFILE_FIELDS)[number],
) {
  return corrections[field] ? corrections[field]!.value : profile.fields[field].value;
}

