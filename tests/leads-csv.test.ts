import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkContactGate, csvTemplate, maskPhone, normalisePhone, validateLeadCsv } from "@/lib/leads";

const empty = { leadIds: new Set<string>(), phones: new Set<string>() };
const sample = fs.readFileSync(path.join(__dirname, "../public/sample-leads-with-errors.csv"), "utf8");

describe("CSV validation", () => {
  it("accepts the downloadable template", () => {
    const r = validateLeadCsv(csvTemplate(), empty);
    expect(r.headerErrors).toEqual([]);
    expect(r.valid).toHaveLength(1);
    expect(r.valid[0].gate.allowed).toBe(true);
    expect(r.valid[0].values.status).toBe("READY_FOR_TEST");
  });

  it("rejects files missing required columns", () => {
    const r = validateLeadCsv("first_name,phone_number\nA,9876500001\n", empty);
    expect(r.headerErrors[0]).toMatch(/lead_id/);
    expect(r.valid).toHaveLength(0);
  });

  it("reports row-level errors, duplicates and blocked rows in the sample file", () => {
    const r = validateLeadCsv(sample, empty);
    expect(r.totalRows).toBe(9);
    const byRow = Object.fromEntries(r.issues.map((i) => [i.row, i]));
    expect(byRow[5].messages.join()).toMatch(/phone number/); // bad phone
    expect(byRow[6].messages.join()).toMatch(/lead source/); // missing required source
    expect(byRow[7].messages.length).toBeGreaterThanOrEqual(2); // bad date + bad permission
    expect(byRow[8].kind).toBe("duplicate");
    const blocked = r.valid.filter((v) => !v.gate.allowed).map((v) => v.values.externalLeadId);
    expect(blocked).toEqual(expect.arrayContaining(["DEMO-IMP-003", "DEMO-IMP-004", "DEMO-IMP-009"]));
    expect(r.valid.filter((v) => v.gate.allowed).map((v) => v.values.externalLeadId)).toEqual(["DEMO-IMP-001", "DEMO-IMP-002"]);
  });

  it("flags duplicates against existing workspace leads", () => {
    const r = validateLeadCsv(csvTemplate(), { leadIds: new Set(["KC-2026-0001"]), phones: new Set() });
    expect(r.issues[0].kind).toBe("duplicate");
  });
});

describe("contact gate", () => {
  const ok = {
    permissionStatus: "GRANTED" as const,
    permissionTimestamp: "2026-10-01T10:00:00+05:30",
    permissionSource: "Web",
    permissionReference: "REF-1",
    doNotCallStatus: "CLEAR" as const,
    status: "READY_FOR_TEST" as const,
  };
  it("allows a complete permission record", () => expect(checkContactGate(ok).allowed).toBe(true));
  it.each([
    ["pending permission", { permissionStatus: "PENDING" as const }],
    ["missing evidence reference", { permissionReference: null }],
    ["missing timestamp", { permissionTimestamp: null }],
    ["DNC registered", { doNotCallStatus: "REGISTERED" as const }],
    ["DNC unknown", { doNotCallStatus: "UNKNOWN" as const }],
    ["opted out", { status: "OPTED_OUT" as const }],
  ])("blocks %s", (_label, patch) => {
    expect(checkContactGate({ ...ok, ...patch }).allowed).toBe(false);
  });
});

describe("phone handling", () => {
  it("normalises Indian mobile formats", () => {
    expect(normalisePhone("+91 98765 43210")).toBe("+919876543210");
    expect(normalisePhone("09876543210")).toBe("+919876543210");
    expect(normalisePhone("12345")).toBeNull();
    expect(normalisePhone("5876543210")).toBeNull();
  });
  it("masks all but the last four digits", () => expect(maskPhone("+919876543210")).toBe("+91 ••••• •3210"));
});
