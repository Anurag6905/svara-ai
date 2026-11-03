import { describe, expect, it } from "vitest";
import { runConversation } from "@/lib/conversation/engine";
import { parseAmount, parseTimeline, detectPurpose, detectOptOut } from "@/lib/conversation/parse";
import { SCENARIOS } from "@/lib/conversation/scenarios";

const ctx = { lenderName: "Kaveri Capital", enquiryLabel: "business loan enquiry", firstName: "Meena" };

describe("parsing", () => {
  it.each([
    ["5 se 8 lakh", 500000, 800000],
    ["around 15 lakh", 1500000, 1500000],
    ["₹50,000", 50000, 50000],
    ["1.5 crore", 15000000, 15000000],
    ["between 2 to 3 lakh", 200000, 300000],
  ])("parses amount %s", (text, min, max) => {
    expect(parseAmount(text)).toMatchObject({ min, max });
  });
  it("does not invent an amount", () => {
    expect(parseAmount("I don't know exactly")).toBeNull();
    expect(parseAmount("do nayi machines")).toBeNull();
  });
  it("parses timelines", () => {
    expect(parseTimeline("do mahine mein")?.withinDays).toBe(60);
    expect(parseTimeline("within three weeks")?.withinDays).toBe(21);
    expect(parseTimeline("it's urgent")?.withinDays).toBe(7);
  });
  it("detects purposes in English and Hinglish", () => {
    expect(detectPurpose("mujhe silai machines leni hain")?.key).toBe("MACHINERY");
    expect(detectPurpose("stock for my kirana store")?.key).toBe("INVENTORY");
    expect(detectPurpose("processing fees kitni hai")).toBeNull();
  });
  it("detects opt-outs", () => {
    expect(detectOptOut("Please don't call me again")).toBe(true);
    expect(detectOptOut("dobara call mat karna")).toBe(true);
    expect(detectOptOut("call me tomorrow")).toBe(false);
  });
});

describe("dialogue engine guardrails", () => {
  it("discloses it is automated and names the lender in the first turn", () => {
    const r = runConversation(ctx, []);
    expect(r.turns[0].text).toMatch(/automated voice assistant/);
    expect(r.turns[0].text).toMatch(/Kaveri Capital/);
  });

  it("stops immediately on opt-out and ignores later turns", () => {
    const r = runConversation(ctx, [{ text: "Yes" }, { text: "Remove my number, don't call me again" }, { text: "I need 5 lakh" }]);
    expect(r.outcome).toBe("OPTED_OUT");
    expect(r.turns.filter((t) => t.speaker === "CUSTOMER")).toHaveLength(2);
    expect(r.turns[r.turns.length - 1].speaker).toBe("AI");
  });

  it("never asks for credentials or promises approval in any scenario", () => {
    for (const s of SCENARIOS) {
      const r = runConversation(ctx, s.inputs);
      for (const t of r.turns.filter((x) => x.speaker === "AI")) {
        expect(t.text).not.toMatch(/\b(otp|pin|password|cvv|card number)\b/i);
        expect(t.text).not.toMatch(/\b(you are eligible|approved for|guarantee)\b/i);
      }
    }
  });

  it("deflects rate questions without quoting a rate", () => {
    const r = runConversation(ctx, [{ text: "yes" }, { text: "machine leni hai" }, { text: "What is the interest rate?" }]);
    const last = r.turns[r.turns.length - 1].text;
    expect(last).toMatch(/not able to quote|nahi de sakti/);
    expect(last).not.toMatch(/\d+(\.\d+)?\s*%/);
  });

  it("ends as unreachable after two silences", () => {
    expect(runConversation(ctx, [{ text: "" }, { text: "" }]).outcome).toBe("UNREACHABLE");
  });

  it("is deterministic", () => {
    const s = SCENARIOS[0];
    expect(runConversation(ctx, s.inputs)).toEqual(runConversation(ctx, s.inputs));
  });

  it("produces the expected outcome for every scripted scenario", () => {
    const expected: Record<string, string> = {
      interested_hinglish: "INTERESTED_FOLLOW_UP",
      exploring: "EXPLORING",
      not_interested: "NOT_INTERESTED",
      callback: "CALLBACK_REQUESTED",
      unclear: "INTERESTED_FOLLOW_UP",
      opt_out: "OPTED_OUT",
      silence_interrupt_human: "HUMAN_REVIEW_REQUIRED",
      personal_education: "INTERESTED_FOLLOW_UP",
    };
    for (const s of SCENARIOS) expect(runConversation(ctx, s.inputs).outcome, s.key).toBe(expected[s.key]);
  });
});

describe("real-speech phrasings", () => {
  it("understands 'within a month' and an implicit yes via a callback time", () => {
    const r = runConversation(ctx, [
      { text: "Yes, tell me" },
      { text: "I want to buy a new oven for my bakery" },
      { text: "around 4 lakh" },
      { text: "within a month" },
      { text: "tomorrow evening after 6" },
    ]);
    expect(r.outcome).toBe("INTERESTED_FOLLOW_UP");
  });
});
