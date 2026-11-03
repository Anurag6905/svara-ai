import { describe, expect, it } from "vitest";
import { assertCan, can, ForbiddenError, PERMISSIONS } from "@/lib/auth/rbac";

describe("role permissions", () => {
  it("gives the org admin every permission", () => {
    for (const p of PERMISSIONS) expect(can("ORG_ADMIN", p)).toBe(true);
  });

  it("keeps the analyst read-only", () => {
    expect(can("ANALYST", "leads.view")).toBe(true);
    expect(can("ANALYST", "leads.import")).toBe(false);
    expect(can("ANALYST", "simulator.run")).toBe(false);
    expect(can("ANALYST", "reviews.write")).toBe(false);
    expect(can("ANALYST", "products.manage")).toBe(false);
  });

  it("only lets admins and managers approve pilot batches", () => {
    expect(can("MANAGER", "leads.approve_pilot")).toBe(true);
    expect(can("AGENT", "leads.approve_pilot")).toBe(false);
  });

  it("only lets admins edit the catalogue and users", () => {
    for (const role of ["MANAGER", "AGENT", "ANALYST"] as const) {
      expect(can(role, "products.manage")).toBe(false);
      expect(can(role, "users.manage")).toBe(false);
    }
  });

  it("assertCan throws ForbiddenError", () => {
    expect(() => assertCan("AGENT", "users.manage")).toThrow(ForbiddenError);
  });
});
