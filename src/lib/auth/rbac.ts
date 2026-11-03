import type { Role } from "@/db/enums";

/**
 * Permission model (PRD §7.1). Roles are coarse; permissions are what code checks.
 * Add a permission here before using it — `can()` is typed against this list.
 */
export const PERMISSIONS = [
  "users.manage",
  "audit.view",
  "products.view",
  "products.manage",
  "leads.view",
  "leads.import",
  "leads.approve_pilot",
  "simulator.run",
  "reviews.write",
  "exports.download",
  "analytics.view",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ORG_ADMIN: PERMISSIONS,
  MANAGER: [
    "audit.view",
    "products.view",
    "leads.view",
    "leads.import",
    "leads.approve_pilot",
    "simulator.run",
    "reviews.write",
    "exports.download",
    "analytics.view",
  ],
  AGENT: ["products.view", "leads.view", "simulator.run", "reviews.write"],
  ANALYST: ["products.view", "leads.view", "analytics.view", "exports.download"],
};

export const ROLE_LABELS: Record<Role, string> = {
  ORG_ADMIN: "Organisation Admin",
  MANAGER: "Manager",
  AGENT: "Agent",
  ANALYST: "Read-only Analyst",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  ORG_ADMIN: "Manages users, product catalogue and all workspace settings.",
  MANAGER: "Imports leads, approves pilot batches, reviews and exports.",
  AGENT: "Runs simulations and reviews conversation profiles.",
  ANALYST: "Views leads, products and analytics. Cannot change records.",
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function permissionsFor(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

export class ForbiddenError extends Error {
  constructor(permission: Permission) {
    super(`Not permitted: ${permission}`);
    this.name = "ForbiddenError";
  }
}

export function assertCan(role: Role, permission: Permission): void {
  if (!can(role, permission)) throw new ForbiddenError(permission);
}
