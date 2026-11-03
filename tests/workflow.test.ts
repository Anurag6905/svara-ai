import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { auditEvents, conversations, leads } from "@/db/schema";
import { getConversationDetail, listConversations, runSimulation, submitReview } from "@/lib/conversations";
import { exportResultsCsv } from "@/lib/exports";
import { getLead, importLeads, listLeads, setLeadStatus } from "@/lib/leads";
import { listProducts, updateProduct } from "@/lib/products";
import { NotFoundError, type TenantContext } from "@/lib/tenant";
import { ctxFor, setupTestDb } from "./helpers";

let db: Db;
let agent: TenantContext;
let analyst: TenantContext;
let admin: TenantContext;
let other: TenantContext;

beforeAll(async () => {
  ({ db } = await setupTestDb());
  agent = await ctxFor(db, "ananya.agent@kaveri.demo");
  analyst = await ctxFor(db, "imran.analyst@kaveri.demo");
  admin = await ctxFor(db, "priya.admin@kaveri.demo");
  other = await ctxFor(db, "kavya.admin@northbridge.demo");
}, 30_000);

async function callableLead(ctx: TenantContext) {
  const l = (await listLeads(db, ctx, { status: "READY_FOR_TEST" })).find((x) => x.gate.allowed);
  if (!l) throw new Error("no callable lead");
  return l;
}

describe("permission blocking", () => {
  it("refuses to simulate a lead without permission", async () => {
    const blocked = (await listLeads(db, agent, { status: "BLOCKED" })).find((l) => l.status !== "OPTED_OUT")!;
    await expect(runSimulation(db, agent, blocked.id, { scenarioKey: "exploring" })).rejects.toThrow(/can't enter a calling workflow/);
  });

  it("does not let an analyst run simulations or import leads", async () => {
    const l = await callableLead(admin);
    await expect(runSimulation(db, analyst, l.id, { scenarioKey: "exploring" })).rejects.toThrow(/Not permitted/);
    await expect(importLeads(db, analyst, "lead_id\n")).rejects.toThrow(/Not permitted/);
  });
});

describe("opt-out", () => {
  it("suppresses the lead, blocks re-simulation and cannot be overridden", async () => {
    const l = await callableLead(agent);
    const r = await runSimulation(db, agent, l.id, { scenarioKey: "opt_out" });
    expect(r.outcome).toBe("OPTED_OUT");
    const after = await getLead(db, agent, l.id);
    expect(after.status).toBe("OPTED_OUT");
    expect(after.gate.allowed).toBe(false);
    await expect(runSimulation(db, agent, l.id, { scenarioKey: "exploring" })).rejects.toThrow(/opted out/i);
    await expect(setLeadStatus(db, admin, l.id, "INTERESTED")).rejects.toThrow(/opted out/);
    await expect(
      submitReview(db, agent, r.conversationId, { outcome: "FOLLOW_UP_SCHEDULED", followUpAt: "2026-12-01", fieldCorrections: {}, matchDecisions: {} }),
    ).rejects.toThrow(/opted out/);
  });
});

describe("simulation → review → export", () => {
  it("stores transcript, profile, matches; corrections are audited; export masks phones", async () => {
    const l = await callableLead(agent);
    const { conversationId } = await runSimulation(db, agent, l.id, { scenarioKey: "interested_hinglish" });
    const d = await getConversationDetail(db, agent, conversationId);
    expect(d.conversation.mode).toBe("SIMULATION");
    expect(d.segments.length).toBeGreaterThan(5);
    expect(d.profile?.fields.purpose.sourceType).toBe("CUSTOMER_STATED");
    expect(d.matches.length).toBeGreaterThan(0);

    await submitReview(db, agent, conversationId, {
      outcome: "CORRECTED",
      correctedSummary: "Needs two sewing machines; confirm amount.",
      nextAction: "Call back",
      followUpAt: "",
      fieldCorrections: { amount: "₹6 lakh" },
      matchDecisions: { [d.matches[0].id]: "ACCEPTED" },
    });
    const after = await getConversationDetail(db, agent, conversationId);
    expect(after.conversation.status).toBe("REVIEWED");
    expect(after.corrections.amount?.value).toBe("₹6 lakh");
    expect(after.profile?.fields.amount.value).toMatch(/5 lakh/); // original kept
    const [ev] = await db.select().from(auditEvents).where(and(eq(auditEvents.action, "review.submit"), eq(auditEvents.entityId, conversationId)));
    expect(JSON.parse(ev.redactedMetadataJson).fieldsCorrected).toEqual(["amount"]);

    const csv = await exportResultsCsv(db, agent.role === "AGENT" ? admin : agent, { reviewedOnly: true });
    expect(csv).toContain("₹6 lakh");
    expect(csv).not.toMatch(/\+91\d{10}/);
  });
});

describe("tenant isolation (domain data)", () => {
  it("never returns another organisation's leads, products or conversations", async () => {
    const nbLeads = await listLeads(db, other);
    const kaveriLeads = await listLeads(db, admin);
    expect(nbLeads.every((l) => l.organisationId === other.organisationId)).toBe(true);
    expect(nbLeads.some((l) => kaveriLeads.some((k) => k.id === l.id))).toBe(false);
    expect((await listProducts(db, other)).every((p) => p.organisationId === other.organisationId)).toBe(true);
    expect(await listConversations(db, other)).toHaveLength(0);
  });

  it("refuses cross-tenant reads and writes by id", async () => {
    const kLead = await callableLead(admin);
    const [kConv] = await db.select().from(conversations).where(eq(conversations.organisationId, admin.organisationId));
    const [kProduct] = await listProducts(db, admin);
    await expect(getLead(db, other, kLead.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getConversationDetail(db, other, kConv.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(runSimulation(db, other, kLead.id, { scenarioKey: "exploring" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateProduct(db, other, kProduct.id, { ...kProduct, eligibilityWording: "", disclaimers: "", prohibitedStatements: "", attributes: kProduct.attributes! })).rejects.toBeInstanceOf(NotFoundError);
    const [still] = await db.select().from(leads).where(eq(leads.id, kLead.id));
    expect(still.organisationId).toBe(admin.organisationId);
  });
});
