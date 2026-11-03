/** Enum constants shared by server and client code (no DB imports here). */

export const ROLES = ["ORG_ADMIN", "MANAGER", "AGENT", "ANALYST"] as const;
export type Role = (typeof ROLES)[number];

export const USER_STATUSES = ["ACTIVE", "INVITED", "DEACTIVATED"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const LEAD_STATUSES = [
  "IMPORTED",
  "NEEDS_REVIEW",
  "READY_FOR_TEST",
  "APPROVED_FOR_PILOT",
  "CONTACTED",
  "INTERESTED",
  "NOT_INTERESTED",
  "FOLLOW_UP_REQUESTED",
  "UNREACHABLE",
  "OPTED_OUT",
  "HUMAN_REVIEW_REQUIRED",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const PERMISSION_STATUSES = [
  "GRANTED",
  "PENDING",
  "MISSING",
  "REVOKED",
] as const;
export type PermissionStatus = (typeof PERMISSION_STATUSES)[number];

export const DNC_STATUSES = ["CLEAR", "REGISTERED", "UNKNOWN"] as const;
export type DncStatus = (typeof DNC_STATUSES)[number];

export const SOURCE_TYPES = [
  "CUSTOMER_STATED",
  "AI_INFERRED",
  "UNKNOWN",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];
