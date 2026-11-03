/**
 * Synthetic demo content: catalogue, leads and pre-run simulations.
 * Everything here is fictional. Phone numbers use a reserved-looking +91 90000
 * prefix and do not belong to real people.
 */
import { eq } from "drizzle-orm";
import { runSimulation, submitReview } from "@/lib/conversations";
import { createProduct, type ProductInput } from "@/lib/products";
import type { TenantContext } from "@/lib/tenant";
import type { Db } from "./client";
import { leads, users } from "./schema";

const DISCLAIMER =
  "All loans are subject to the lender's credit assessment, documentation and policies. Rates and terms are shared only by an authorised team member.";
const PROHIBITED =
  "Do not promise approval or eligibility. Do not quote rates or fees unless listed as approved. Do not ask for OTPs, PINs, passwords or card details.";

export const DEMO_PRODUCTS: ProductInput[] = [
  {
    name: "Kaveri Machinery Loan",
    category: "Equipment Loan",
    approvedDescription:
      "Term loan for small businesses buying new or used machinery and equipment, such as sewing, printing or food-processing machines.",
    eligibilityWording: "Available to registered small businesses operating for at least one year, subject to assessment.",
    disclaimers: DISCLAIMER,
    prohibitedStatements: PROHIBITED,
    attributes: { purposes: ["MACHINERY"], minAmount: 1_00_000, maxAmount: 50_00_000, minTenureMonths: 12, maxTenureMonths: 60, customerSegment: "SME" },
  },
  {
    name: "Kaveri Working Capital Line",
    category: "Working Capital",
    approvedDescription: "Short-term working capital for inventory purchases, supplier payments and day-to-day business operations.",
    eligibilityWording: "For businesses with at least six months of transaction history, subject to assessment.",
    disclaimers: DISCLAIMER,
    prohibitedStatements: PROHIBITED,
    attributes: { purposes: ["WORKING_CAPITAL", "INVENTORY"], minAmount: 50_000, maxAmount: 25_00_000, minTenureMonths: 3, maxTenureMonths: 24, customerSegment: "SME" },
  },
  {
    name: "Kaveri Business Growth Loan",
    category: "Business Loan",
    approvedDescription: "Term loan for opening a new outlet, expanding premises, renovation or other planned business growth.",
    eligibilityWording: "For businesses operating for at least two years, subject to assessment.",
    disclaimers: DISCLAIMER,
    prohibitedStatements: PROHIBITED,
    attributes: { purposes: ["EXPANSION", "RENOVATION", "MACHINERY"], minAmount: 5_00_000, maxAmount: 1_00_00_000, minTenureMonths: 12, maxTenureMonths: 84, customerSegment: "SME" },
  },
  {
    name: "Kaveri Micro Enterprise Loan",
    category: "Micro Enterprise Loan",
    approvedDescription: "Small-ticket loan for micro businesses to buy stock, tools or small equipment.",
    eligibilityWording: "For micro businesses, subject to assessment.",
    disclaimers: DISCLAIMER,
    prohibitedStatements: PROHIBITED,
    attributes: { purposes: ["INVENTORY", "MACHINERY", "WORKING_CAPITAL"], minAmount: 25_000, maxAmount: 5_00_000, minTenureMonths: 6, maxTenureMonths: 36, customerSegment: "SME" },
  },
  {
    name: "Kaveri Personal Loan",
    category: "Personal Loan",
    approvedDescription: "Unsecured personal loan for education, medical, wedding, home renovation or other personal needs.",
    eligibilityWording: "For salaried or self-employed individuals, subject to assessment.",
    disclaimers: DISCLAIMER,
    prohibitedStatements: PROHIBITED,
    attributes: { purposes: ["EDUCATION", "MEDICAL", "WEDDING", "HOME_RENOVATION", "TRAVEL", "DEBT_CONSOLIDATION"], minAmount: 50_000, maxAmount: 15_00_000, minTenureMonths: 12, maxTenureMonths: 60, customerSegment: "INDIVIDUAL" },
  },
];

const NAMES = [
  "Meena", "Arjun", "Farah", "Suresh", "Lakshmi", "Vikram", "Neha", "Rahul", "Sunita", "Kiran",
  "Deepak", "Asha", "Manoj", "Pooja", "Ravi", "Shabana", "Anil", "Geeta", "Sanjay", "Nisha",
  "Prakash", "Rekha", "Tarun", "Usha", "Harish", "Kavita", "Imtiaz", "Seema", "Gopal", "Divya",
  "Ramesh", "Jyoti", "Ajay", "Sneha", "Mohan", "Anjali", "Naveen", "Priti", "Sameer", "Rupa",
  "Vinod", "Swati", "Ashok", "Bhavna", "Rajesh", "Lata", "Karan", "Madhu", "Yusuf", "Archana",
  "Dinesh", "Pallavi", "Om", "Rashmi", "Sachin", "Komal", "Hemant", "Leela", "Zoya", "Bharat",
];
const SOURCES = ["Website enquiry form", "Branch walk-in callback request", "Partner DSA referral", "Mobile app enquiry", "Existing customer request"];
const CATEGORIES = ["Equipment Loan", "Working Capital", "Business Loan", "Micro Enterprise Loan", "Personal Loan"];
const LANGS = ["Hindi", "English", "Hinglish", "Marathi"];

/** Small deterministic PRNG so the demo looks the same after every reset. */
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
}

export function buildDemoLeads(organisationId: string, prefix: string, count: number, seed = 7) {
  const r = rng(seed);
  const rows: (typeof leads.$inferInsert)[] = [];
  for (let i = 0; i < count; i++) {
    const n = i + 1;
    const day = 1 + Math.floor(r() * 30);
    const date = `2026-10-${String(day).padStart(2, "0")}`;
    const roll = r();
    // ~72% fully permissioned; the rest show each kind of gap the gate blocks.
    const permission =
      roll < 0.72
        ? { permissionStatus: "GRANTED" as const, permissionTimestamp: `${date}T${10 + (n % 8)}:${String(n % 60).padStart(2, "0")}:00+05:30`, permissionSource: SOURCES[n % SOURCES.length], permissionReference: `CONSENT-${prefix}-${String(10000 + n * 37)}`, doNotCallStatus: "CLEAR" as const }
        : roll < 0.8
          ? { permissionStatus: "PENDING" as const, permissionTimestamp: null, permissionSource: SOURCES[n % SOURCES.length], permissionReference: null, doNotCallStatus: "CLEAR" as const }
          : roll < 0.87
            ? { permissionStatus: "GRANTED" as const, permissionTimestamp: `${date}T12:00:00+05:30`, permissionSource: SOURCES[n % SOURCES.length], permissionReference: null, doNotCallStatus: "CLEAR" as const }
            : roll < 0.94
              ? { permissionStatus: "GRANTED" as const, permissionTimestamp: `${date}T15:20:00+05:30`, permissionSource: SOURCES[n % SOURCES.length], permissionReference: `CONSENT-${prefix}-${10000 + n}`, doNotCallStatus: "REGISTERED" as const }
              : { permissionStatus: "MISSING" as const, permissionTimestamp: null, permissionSource: null, permissionReference: null, doNotCallStatus: "UNKNOWN" as const };
    const allowed = permission.permissionStatus === "GRANTED" && permission.permissionReference && permission.permissionTimestamp && permission.doNotCallStatus === "CLEAR";
    rows.push({
      organisationId,
      externalLeadId: `${prefix}-2026-${String(n).padStart(4, "0")}`,
      firstName: NAMES[(i + seed) % NAMES.length],
      phoneNumber: `+919000${String(seed % 10)}${String(10000 + n * 13).slice(-5)}`,
      category: i < 4 ? CATEGORIES[[0, 4, 1, 2][i]] : CATEGORIES[Math.floor(r() * CATEGORIES.length)],
      source: SOURCES[Math.floor(r() * SOURCES.length)],
      enquiryDate: date,
      preferredLanguage: i === 0 ? "Hindi" : LANGS[Math.floor(r() * LANGS.length)],
      ...permission,
      status: allowed ? "READY_FOR_TEST" : "NEEDS_REVIEW",
      isSynthetic: true,
    });
  }
  // The first four leads are the scripted demo personas: always permissioned.
  for (let i = 0; i < Math.min(4, rows.length); i++) {
    Object.assign(rows[i], {
      permissionStatus: "GRANTED",
      permissionTimestamp: "2026-10-20T11:02:00+05:30",
      permissionSource: "Website enquiry form",
      permissionReference: `CONSENT-${prefix}-DEMO-${i + 1}`,
      doNotCallStatus: "CLEAR",
      status: "READY_FOR_TEST",
    });
  }
  return rows;
}

/** Pre-run conversations so the review queue and analytics have content. */
const PRE_RUN: { leadIndex: number; scenario: string; review?: "ACCEPTED" | "CORRECTED" | "FOLLOW_UP_SCHEDULED" }[] = [
  { leadIndex: 4, scenario: "exploring", review: "ACCEPTED" },
  { leadIndex: 5, scenario: "callback", review: "FOLLOW_UP_SCHEDULED" },
  { leadIndex: 6, scenario: "not_interested", review: "ACCEPTED" },
  { leadIndex: 7, scenario: "unclear", review: "CORRECTED" },
  { leadIndex: 8, scenario: "opt_out" },
  { leadIndex: 9, scenario: "interested_hinglish" },
  { leadIndex: 10, scenario: "silence_interrupt_human" },
  { leadIndex: 11, scenario: "personal_education" },
  { leadIndex: 12, scenario: "exploring" },
  { leadIndex: 13, scenario: "callback" },
];

export async function seedDemoContent(db: Db, orgIds: { primary: string; secondary: string }) {
  const [admin] = await db.select().from(users).where(eq(users.email, "priya.admin@kaveri.demo"));
  const [agent] = await db.select().from(users).where(eq(users.email, "ananya.agent@kaveri.demo"));
  const [nbAdmin] = await db.select().from(users).where(eq(users.email, "kavya.admin@northbridge.demo"));
  const adminCtx: TenantContext = { userId: admin.id, organisationId: orgIds.primary, role: "ORG_ADMIN" };
  const agentCtx: TenantContext = { userId: agent.id, organisationId: orgIds.primary, role: "AGENT" };
  const nbCtx: TenantContext = { userId: nbAdmin.id, organisationId: orgIds.secondary, role: "ORG_ADMIN" };

  for (const p of DEMO_PRODUCTS) await createProduct(db, adminCtx, p);
  await createProduct(db, nbCtx, {
    ...DEMO_PRODUCTS[1],
    name: "Northbridge SME Working Capital",
    approvedDescription: "Working capital facility for small businesses (second demo tenant).",
  });

  const kaveriLeads = await db.insert(leads).values(buildDemoLeads(orgIds.primary, "KC", 60, 7)).returning();
  await db.insert(leads).values(buildDemoLeads(orgIds.secondary, "NB", 12, 3));

  const base = Date.now() - 1000 * 60 * 60 * 30;
  for (const [i, run] of PRE_RUN.entries()) {
    const lead = kaveriLeads[run.leadIndex];
    // Make sure the pre-run personas are callable.
    await db
      .update(leads)
      .set({ permissionStatus: "GRANTED", permissionTimestamp: "2026-10-18T10:00:00+05:30", permissionSource: "Website enquiry form", permissionReference: `CONSENT-KC-PRE-${i}`, doNotCallStatus: "CLEAR", status: "READY_FOR_TEST" })
      .where(eq(leads.id, lead.id));
    const { conversationId } = await runSimulation(db, agentCtx, lead.id, { scenarioKey: run.scenario }, { now: new Date(base + i * 1000 * 60 * 47) });
    if (run.review) {
      await submitReview(db, agentCtx, conversationId, {
        outcome: run.review,
        correctedSummary: "",
        nextAction: run.review === "FOLLOW_UP_SCHEDULED" ? "Call back tomorrow after 11 am to continue." : "",
        followUpAt: run.review === "FOLLOW_UP_SCHEDULED" ? "2026-11-04T11:30" : "",
        fieldCorrections: run.review === "CORRECTED" ? { amount: "₹1 lakh – ₹2 lakh (confirmed on follow-up)" } : {},
        matchDecisions: {},
      });
    }
  }
}
