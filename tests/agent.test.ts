import { afterEach, describe, expect, it, vi } from "vitest";
import { nextAgentReply, signTurn, verifyTurn, type CatalogueItem } from "@/lib/agent/llm-agent";
import { DEMO_PRODUCTS } from "@/db/seed-demo";

const ctx = { lenderName: "Kaveri Capital", enquiryLabel: "business loan enquiry", firstName: "Vijay" };
const catalogue: CatalogueItem[] = DEMO_PRODUCTS.map((p) => ({
  name: p.name, category: p.category, approvedDescription: p.approvedDescription,
  eligibilityWording: p.eligibilityWording ?? null, disclaimers: p.disclaimers ?? null,
  prohibitedStatements: p.prohibitedStatements ?? null, attributes: p.attributes,
}));
const greet = { speaker: "AI" as const, text: "Hello, I'm an automated voice assistant…" };

function geminiReturns(reply: string, end = false, outcome = "IN_PROGRESS") {
  vi.stubEnv("GEMINI_API_KEY", "test");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ reply, end_call: end, outcome }) }] } }] }))));
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("LLM agent guardrails", () => {
  it("ends on opt-out without calling the model", async () => {
    geminiReturns("Sure, let me tell you more!");
    const r = await nextAgentReply(ctx, catalogue, [greet, { speaker: "CUSTOMER", text: "please don't call me again" }], { startHindi: false });
    expect(r).toMatchObject({ ended: true, outcome: "OPTED_OUT", source: "guardrail" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("hands off when the customer asks for a person", async () => {
    const r = await nextAgentReply(ctx, catalogue, [greet, { speaker: "CUSTOMER", text: "I want to speak to a real person" }], { startHindi: false });
    expect(r.outcome).toBe("HUMAN_REVIEW_REQUIRED");
  });

  it("uses the model's reply when it is safe", async () => {
    geminiReturns("The Kaveri Machinery Loan may be relevant — it covers equipment from ₹1 lakh to ₹50 lakh. What's the machine for?");
    const r = await nextAgentReply(ctx, catalogue, [greet, { speaker: "CUSTOMER", text: "which loan is for machines?" }], { startHindi: false });
    expect(r.source).toBe("gemini");
    expect(r.ended).toBe(false);
  });

  it.each([
    "Great news, you are eligible for this loan!",
    "Our rate is 11.5% per annum.",
    "Please share the OTP you just received.",
  ])("blocks an unsafe model reply: %s", async (bad) => {
    geminiReturns(bad);
    const r = await nextAgentReply(ctx, catalogue, [greet, { speaker: "CUSTOMER", text: "tell me more" }], { startHindi: false });
    expect(r.source).toBe("guardrail");
    expect(r.text).not.toContain(bad);
  });

  it("falls back to the script when the model fails", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("quota", { status: 429 })));
    const r = await nextAgentReply(ctx, catalogue, [greet, { speaker: "CUSTOMER", text: "yes go ahead" }], { startHindi: false });
    expect(r.source).toBe("script");
    expect(r.text).toMatch(/use the loan for/);
  });

  it("signs turns so a browser can't edit the transcript", () => {
    const sig = signTurn("call-1", 2, "hello");
    expect(verifyTurn("call-1", 2, "hello", sig)).toBe(true);
    expect(verifyTurn("call-1", 2, "hello!", sig)).toBe(false);
    expect(verifyTurn("call-1", 3, "hello", sig)).toBe(false);
  });
});
