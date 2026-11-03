import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  OUTCOMES,
  runConversation,
  type CustomerInput,
  type EngineContext,
  type Outcome,
} from "@/lib/conversation/engine";
import { detectHumanRequest, detectOptOut, isSilence } from "@/lib/conversation/parse";
import { formatINR, PURPOSES, type ProductAttributes } from "@/lib/product-meta";

/**
 * LLM sales-assistant brain (Gemini). The model writes the replies; the code
 * keeps the hard rules:
 *  - opt-out and "talk to a person" are detected deterministically and end the call
 *  - every reply is screened for forbidden content before it is spoken
 *  - any failure falls back to the deterministic script, so a call never breaks
 *  - each AI turn is HMAC-signed so the saved transcript can't be edited in the browser
 */

export interface AgentTurn {
  speaker: "AI" | "CUSTOMER" | "SYSTEM";
  text: string;
  sig?: string;
}

export interface CatalogueItem {
  name: string;
  category: string;
  approvedDescription: string;
  eligibilityWording: string | null;
  disclaimers: string | null;
  prohibitedStatements: string | null;
  attributes: ProductAttributes | null;
}

export interface AgentReply {
  text: string;
  ended: boolean;
  outcome: Outcome | null;
  source: "gemini" | "script" | "guardrail";
}

export function llmConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

// ───────────── Signing ─────────────

function secret() {
  return process.env.SESSION_SECRET ?? "svara-local-demo-secret-change-me";
}

export function signTurn(callId: string, index: number, text: string, outcome: Outcome | null = null) {
  return createHmac("sha256", secret()).update(`${callId}|${index}|${outcome ?? ""}|${text}`).digest("base64url");
}

export function verifyTurn(callId: string, index: number, text: string, sig: string | undefined, outcome: Outcome | null = null) {
  if (!sig) return false;
  const a = Buffer.from(sig);
  const b = Buffer.from(signTurn(callId, index, text, outcome));
  return a.length === b.length && timingSafeEqual(a, b);
}

// ───────────── Guardrails ─────────────

const FORBIDDEN: [RegExp, string][] = [
  [/\b(otp|one[- ]time password|pin|password|cvv|card number|aadhaar number|pan number|net ?banking)\b/i, "credential request"],
  [/\b(you are|you're|you will be|aap)\s+(pre-?)?(approved|eligible)\b/i, "approval promise"],
  [/\b(guarantee|guaranteed|100% approval|definitely approved|sure ?shot)\b/i, "guarantee"],
  [/\b(cibil|credit score)\b.*\b(good|bad|enough|fine)\b/i, "credit judgement"],
];

function screen(reply: string, catalogue: CatalogueItem[]): string | null {
  for (const [re, why] of FORBIDDEN) if (re.test(reply)) return why;
  const rateAllowed = catalogue.some((p) => p.attributes?.approvedRateText);
  if (!rateAllowed && /\d+(\.\d+)?\s*(%|percent|pratishat)/i.test(reply)) return "unapproved rate";
  return null;
}

// ───────────── Prompt ─────────────

function describeCatalogue(catalogue: CatalogueItem[]) {
  return catalogue
    .map((p, i) => {
      const a = p.attributes;
      return [
        `${i + 1}. ${p.name} (${p.category})`,
        `   Approved description: ${p.approvedDescription}`,
        a ? `   Approved purposes: ${a.purposes.map((k) => PURPOSES[k]).join("; ")}` : "",
        a ? `   Amount range: ${formatINR(a.minAmount)} to ${formatINR(a.maxAmount)}` : "",
        a?.minTenureMonths && a?.maxTenureMonths ? `   Tenure: ${a.minTenureMonths} to ${a.maxTenureMonths} months` : "",
        a ? `   For: ${a.customerSegment === "SME" ? "small businesses" : "individuals"}` : "",
        a?.approvedRateText ? `   Approved rate wording (may be quoted exactly): ${a.approvedRateText}` : "   Rates/fees: NOT approved for quoting",
        p.eligibilityWording ? `   Eligibility wording (may be read out, never as a promise): ${p.eligibilityWording}` : "",
        p.disclaimers ? `   Required disclaimer: ${p.disclaimers}` : "",
        p.prohibitedStatements ? `   Never say: ${p.prohibitedStatements}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

function systemPrompt(ctx: EngineContext, catalogue: CatalogueItem[]) {
  return `You are SVARA, an automated voice assistant calling on behalf of ${ctx.lenderName}, an Indian lender, about the customer's ${ctx.enquiryLabel}. You are on a live phone call, so everything you write is spoken aloud.

YOUR GOAL, in this order:
1. Understand why the customer wants credit (purpose), roughly how much, and by when.
2. Answer their questions about the lender's products clearly and helpfully, like a good, respectful sales advisor — using ONLY the approved catalogue below.
3. When useful, say which catalogue product(s) may be relevant and why, framed as "may be relevant — a team member will confirm".
4. Offer a call back from a human team member and capture a convenient callback time. Then close politely and end the call.

STYLE: Warm, natural, concise. Max 2 short sentences (about 40 words) per reply. Ask only ONE question at a time. Reply in the customer's language: English, or Hinglish written in Latin script (never Devanagari). Use Indian number words like lakh and crore. No lists, no markdown, no emojis.

HARD RULES (never break these):
- You are an AI assistant. If asked, say so. Never pretend to be human.
- Use only facts in the catalogue. If something isn't there (exact documents, rates, fees, processing time, prepayment rules), say a team member will confirm the exact details. Never invent numbers.
- Never quote an interest rate or fee unless the catalogue gives "Approved rate wording"; then quote only that wording.
- Never say or imply the customer is approved, eligible or likely to be approved. Never judge their credit score or income. Approval is decided only by the lender's own process.
- Never ask for OTPs, PINs, passwords, card numbers, Aadhaar/PAN numbers or bank login details. Don't ask about income, religion, caste, health or family details.
- Don't pressure. If the customer isn't interested, thank them and end the call.
- If the customer wants to stop being contacted, confirm they won't be called again and end the call.
- If they ask for a human, complain, or seem distressed, say a team member will contact them and end the call.

APPROVED CATALOGUE:
${describeCatalogue(catalogue)}

OUTPUT: JSON only, with "reply" (what you say next), "end_call" (true only when this reply closes the call), and "outcome" — one of ${Object.keys(OUTCOMES).join(", ")} when end_call is true, otherwise "IN_PROGRESS".`;
}

const replySchema = z.object({
  reply: z.string().min(1).max(600),
  end_call: z.boolean(),
  outcome: z.string(),
});

async function callGemini(ctx: EngineContext, catalogue: CatalogueItem[], history: AgentTurn[]) {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const contents: { role: "user" | "model"; parts: { text: string }[] }[] = [
    { role: "user", parts: [{ text: "[The customer has answered the phone.]" }] },
  ];
  for (const t of history) {
    const role = t.speaker === "AI" ? "model" : "user";
    const text = t.speaker === "AI" ? JSON.stringify({ reply: t.text, end_call: false, outcome: "IN_PROGRESS" }) : t.text || "[no response — silence]";
    const last = contents[contents.length - 1];
    if (last.role === role) last.parts[0].text += `\n${text}`;
    else contents.push({ role, parts: [{ text }] });
  }

  const generationConfig: Record<string, unknown> = {
    temperature: 0.5,
    maxOutputTokens: 400,
    responseMimeType: "application/json",
    responseSchema: {
      type: "OBJECT",
      properties: {
        reply: { type: "STRING" },
        end_call: { type: "BOOLEAN" },
        outcome: { type: "STRING", enum: [...Object.keys(OUTCOMES), "IN_PROGRESS"] },
      },
      required: ["reply", "end_call", "outcome"],
    },
  };
  // Thinking adds latency on a live call; switch it off on Flash models that allow it.
  if (/flash/.test(model) && !/lite/.test(model)) generationConfig.thinkingConfig = { thinkingBudget: 0 };

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: systemPrompt(ctx, catalogue) }] }, contents, generationConfig }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  return replySchema.parse(json);
}

/** Deterministic script reply for the same customer turns — the safety net. */
function scriptReply(ctx: EngineContext, history: AgentTurn[], startHindi: boolean): AgentReply {
  const inputs: CustomerInput[] = history.filter((t) => t.speaker !== "AI").map((t) => ({ text: t.speaker === "SYSTEM" ? "" : t.text }));
  const run = runConversation(ctx, inputs, { startHindi });
  const last = [...run.turns].reverse().find((t) => t.speaker === "AI");
  return { text: last?.text ?? "Thank you for your time.", ended: run.ended, outcome: run.outcome, source: "script" };
}

const HARD_STOP = {
  optOut: "Of course. I've recorded that you don't want to be contacted again, and you won't receive further calls about this. Thank you, and have a good day.",
  human: "Of course. I'm passing this conversation to a member of the lender's team, who will contact you shortly. Thank you.",
};

export async function nextAgentReply(
  ctx: EngineContext,
  catalogue: CatalogueItem[],
  history: AgentTurn[],
  opts: { startHindi: boolean },
): Promise<AgentReply> {
  const lastCustomer = [...history].reverse().find((t) => t.speaker === "CUSTOMER");
  // Hard stops never depend on the model.
  if (lastCustomer && detectOptOut(lastCustomer.text)) return { text: HARD_STOP.optOut, ended: true, outcome: "OPTED_OUT", source: "guardrail" };
  if (lastCustomer && detectHumanRequest(lastCustomer.text)) return { text: HARD_STOP.human, ended: true, outcome: "HUMAN_REVIEW_REQUIRED", source: "guardrail" };
  const silences = history.slice(-3).filter((t) => t.speaker !== "AI" && isSilence(t.speaker === "SYSTEM" ? "" : t.text)).length;
  if (silences >= 2) return { text: "It seems we can't connect right now. I'll end the call here. Thank you.", ended: true, outcome: "UNREACHABLE", source: "guardrail" };
  if (history.filter((t) => t.speaker === "AI").length >= 18) {
    return { text: "Thank you for your time. A member of the lender's team will follow up with you.", ended: true, outcome: "HUMAN_REVIEW_REQUIRED", source: "guardrail" };
  }

  if (!llmConfigured()) return scriptReply(ctx, history, opts.startHindi);

  try {
    const r = await callGemini(ctx, catalogue, history);
    const problem = screen(r.reply, catalogue);
    if (problem) {
      console.warn(`[agent] reply blocked by guardrail: ${problem}`);
      return {
        text: "I'm not able to confirm that on this call, but a member of the lender's team can explain the approved details. Is there anything else about your requirement I can note for them?",
        ended: false,
        outcome: null,
        source: "guardrail",
      };
    }
    const outcome = r.end_call && r.outcome in OUTCOMES ? (r.outcome as Outcome) : null;
    return { text: r.reply.trim(), ended: r.end_call, outcome: r.end_call ? outcome ?? "EXPLORING" : null, source: "gemini" };
  } catch (err) {
    console.warn("[agent] Gemini unavailable, using script:", (err as Error).message);
    return scriptReply(ctx, history, opts.startHindi);
  }
}
