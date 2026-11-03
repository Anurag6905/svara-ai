import { describe, expect, it } from "vitest";
import { runConversation } from "@/lib/conversation/engine";
import { getScenario } from "@/lib/conversation/scenarios";
import { extractMock } from "@/lib/extraction/mock";
import { needProfileSchema, PROFILE_FIELDS } from "@/lib/extraction/schema";
import { MATCH_LABEL, matchProducts } from "@/lib/matching";
import { DEMO_PRODUCTS } from "@/db/seed-demo";

const ctx = { lenderName: "Kaveri Capital", enquiryLabel: "business loan enquiry" };
const catalogue = DEMO_PRODUCTS.map((p, i) => ({ id: `p${i}`, name: p.name, category: p.category, attributes: p.attributes }));

function profileFor(key: string) {
  const r = runConversation(ctx, getScenario(key)!.inputs);
  const segments = r.turns.map((t, seq) => ({ seq, speaker: t.speaker, text: t.text }));
  return { profile: extractMock(segments, r.outcome), segments };
}

describe("extraction", () => {
  it("captures purpose, amount and timeline with customer evidence", () => {
    const { profile, segments } = profileFor("interested_hinglish");
    expect(needProfileSchema.safeParse(profile).success).toBe(true);
    expect(profile.data.purposeKey).toBe("MACHINERY");
    expect(profile.data.amountMin).toBe(500000);
    expect(profile.data.amountMax).toBe(800000);
    expect(profile.fields.timeline.value).toBe("Within 2 months");
    expect(profile.fields.callbackTime.value).toMatch(/kal shaam/i);
    expect(profile.questions.map((q) => q.topic)).toContain("Interest rate");
    for (const f of PROFILE_FIELDS) {
      const seq = profile.fields[f].evidenceSeq;
      if (seq !== null) expect(segments[seq].speaker).toBe("CUSTOMER");
    }
  });

  it("keeps unknown values unknown", () => {
    const { profile } = profileFor("unclear");
    expect(profile.fields.amount).toMatchObject({ value: null, sourceType: "UNKNOWN", confidence: null, evidenceSeq: null });
    expect(profile.missing).toContain("Amount or range");
  });

  it("labels the loan category as AI-inferred, never customer-stated", () => {
    const { profile } = profileFor("exploring");
    expect(profile.fields.loanCategory.sourceType).toBe("AI_INFERRED");
  });

  it("does not mistake a callback time for a funding timeline", () => {
    const { profile } = profileFor("callback");
    expect(profile.fields.timeline.sourceType).toBe("UNKNOWN");
    expect(profile.fields.callbackTime.value).toMatch(/tomorrow/i);
  });

  it("rejects a profile that claims a value without evidence", () => {
    const { profile } = profileFor("exploring");
    const bad = { ...profile, fields: { ...profile.fields, amount: { ...profile.fields.amount, evidenceSeq: null } } };
    expect(needProfileSchema.safeParse(bad).success).toBe(false);
  });
});

describe("matching", () => {
  it("returns Insufficient information when no purpose was stated", () => {
    const m = matchProducts(profileFor("not_interested").profile, catalogue);
    expect(m.status).toBe("INSUFFICIENT_INFORMATION");
    expect(m.matches).toHaveLength(0);
    expect(m.label).toBe(MATCH_LABEL);
  });

  it("suggests at most three products, each approved for the stated purpose", () => {
    const m = matchProducts(profileFor("interested_hinglish").profile, catalogue);
    expect(m.status).toBe("MATCHES");
    expect(m.matches.length).toBeLessThanOrEqual(3);
    for (const r of m.matches) {
      const p = catalogue.find((c) => c.id === r.productId)!;
      expect(p.attributes.purposes).toContain("MACHINERY");
      expect(r.reasons[0]).toMatch(/approved purpose/);
    }
    expect(m.matches[0].productName).toBe("Kaveri Machinery Loan");
  });

  it("flags an amount above the product's approved maximum as a conflict", () => {
    const { profile } = profileFor("interested_hinglish");
    const big = { ...profile, data: { ...profile.data, amountMin: 9_00_000, amountMax: 9_00_000 } };
    const micro = matchProducts(big, catalogue).matches.find((r) => r.productName === "Kaveri Micro Enterprise Loan");
    expect(micro?.status).toBe("PARTIAL_MATCH");
    expect(micro?.conflicts.join()).toMatch(/above/);
  });

  it("reports missing amount instead of assuming one", () => {
    const m = matchProducts(profileFor("unclear").profile, catalogue);
    expect(m.matches.every((r) => r.missing.some((x) => /Amount not stated/.test(x)))).toBe(true);
  });

  it("returns no clear match when no active product covers the purpose", () => {
    const m = matchProducts(profileFor("personal_education").profile, catalogue.filter((c) => c.category !== "Personal Loan"));
    expect(m.status).toBe("NO_CLEAR_MATCH");
  });
});
