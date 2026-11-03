"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { organisations } from "@/db/schema";
import { assertCan } from "@/lib/auth/rbac";
import { requireSession } from "@/lib/auth/session";
import { enquiryLabelFor, OUTCOMES, runConversation, type Outcome } from "@/lib/conversation/engine";
import { runSimulation, sanitiseName } from "@/lib/conversations";
import { llmConfigured, nextAgentReply, signTurn, verifyTurn, type AgentTurn } from "@/lib/agent/llm-agent";
import { getLead } from "@/lib/leads";
import { listProducts } from "@/lib/products";

const turnSchema = z.object({
  speaker: z.enum(["AI", "CUSTOMER", "SYSTEM"]),
  text: z.string().max(800),
  sig: z.string().max(100).optional(),
});
const historySchema = z.array(turnSchema).min(1).max(60);
const OUTCOME_KEYS = Object.keys(OUTCOMES) as [Outcome, ...Outcome[]];

async function context(leadId: string, callerName?: string) {
  const { ctx } = await requireSession();
  assertCan(ctx.role, "simulator.run");
  const db = getDb();
  const lead = await getLead(db, ctx, leadId);
  if (!lead.gate.allowed) throw new Error(`This lead can't be contacted: ${lead.gate.reasons.join("; ")}.`);
  const [org] = await db.select().from(organisations).where(eq(organisations.id, ctx.organisationId));
  const products = await listProducts(db, ctx, { activeOnly: true });
  const engineCtx = {
    lenderName: org.shortName,
    enquiryLabel: enquiryLabelFor(lead.category),
    firstName: (callerName && sanitiseName(callerName)) || lead.firstName,
  };
  return { ctx, db, lead, engineCtx, products };
}

/** Verifies every AI turn was produced by this server for this call. */
function verifyHistory(callId: string, history: AgentTurn[]) {
  return history.every((t, i) => t.speaker !== "AI" || verifyTurn(callId, i, t.text, t.sig));
}

export async function startAgentCallAction(leadId: string, callerName?: string) {
  try {
    const { engineCtx, lead } = await context(leadId, callerName);
    const callId = crypto.randomUUID();
    // The opening line is fixed: it always discloses that this is an automated assistant.
    const greeting = runConversation(engineCtx, [], { startHindi: lead.preferredLanguage === "Hindi" }).turns[0].text;
    return { ok: true as const, callId, smart: llmConfigured(), greeting: { speaker: "AI" as const, text: greeting, sig: signTurn(callId, 0, greeting) } };
  } catch (err) {
    return { ok: false as const, message: (err as Error).message };
  }
}

export async function agentReplyAction(callId: string, leadId: string, callerName: string | undefined, rawHistory: unknown) {
  const parsed = historySchema.safeParse(rawHistory);
  if (!parsed.success || !z.string().uuid().safeParse(callId).success) return { ok: false as const, message: "Invalid call state." };
  const history = parsed.data;
  if (!verifyHistory(callId, history)) return { ok: false as const, message: "Call transcript could not be verified. Start a new call." };
  try {
    const { engineCtx, lead, products } = await context(leadId, callerName);
    const reply = await nextAgentReply(
      engineCtx,
      products.map((p) => ({ name: p.name, category: p.category, approvedDescription: p.approvedDescription, eligibilityWording: p.eligibilityWording, disclaimers: p.disclaimers, prohibitedStatements: p.prohibitedStatements, attributes: p.attributes })),
      history,
      { startHindi: lead.preferredLanguage === "Hindi" },
    );
    const index = history.length;
    return {
      ok: true as const,
      turn: { speaker: "AI" as const, text: reply.text, sig: signTurn(callId, index, reply.text) },
      ended: reply.ended,
      outcome: reply.outcome,
      outcomeSig: reply.ended && reply.outcome ? signTurn(callId, index, reply.text, reply.outcome) : null,
      source: reply.source,
    };
  } catch (err) {
    return { ok: false as const, message: (err as Error).message };
  }
}

export async function saveAgentCallAction(
  callId: string,
  leadId: string,
  rawHistory: unknown,
  final: { outcome: Outcome | null; outcomeSig: string | null } | null,
) {
  const parsed = historySchema.safeParse(rawHistory);
  if (!parsed.success) return { ok: false as const, message: "Nothing to save yet." };
  const history = parsed.data;
  if (!verifyHistory(callId, history)) return { ok: false as const, message: "Call transcript could not be verified." };
  // The outcome counts only if the server signed it; otherwise the customer hung up mid-call.
  let outcome: Outcome = "HUMAN_REVIEW_REQUIRED";
  const lastIndex = history.length - 1;
  const last = history[lastIndex];
  if (final?.outcome && z.enum(OUTCOME_KEYS).safeParse(final.outcome).success && last?.speaker === "AI" && final.outcomeSig) {
    if (verifyTurn(callId, lastIndex, last.text, final.outcomeSig, final.outcome)) outcome = final.outcome;
  }
  let id: string;
  try {
    const { ctx, db } = await context(leadId);
    ({ conversationId: id } = await runSimulation(db, ctx, leadId, {
      verifiedAgentTurns: history.map((t) =>
        t.speaker === "CUSTOMER" && !t.text.trim() ? { speaker: "SYSTEM" as const, text: "[no response from customer]" } : { speaker: t.speaker, text: t.text },
      ),
      outcome,
      provider: llmConfigured() ? `gemini:${process.env.GEMINI_MODEL || "gemini-2.5-flash"}` : "script",
    }));
  } catch (err) {
    return { ok: false as const, message: (err as Error).message };
  }
  revalidatePath("/conversations");
  redirect(`/conversations/${id}?new=1`);
}
