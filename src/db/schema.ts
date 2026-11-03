/**
 * SVARA AI data model (PRD §11).
 *
 * Every tenant-owned table carries `organisationId`. Child tables that are
 * normally reached through a parent (transcript segments, evidence) ALSO carry
 * it, so any query can be scoped by organisation without a join. This makes
 * tenant isolation a property of every query, not of careful joins.
 *
 * Dialect: SQLite (libSQL) for the local demo. See ASSUMPTIONS.md for the
 * PostgreSQL migration path.
 */
import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);

export * from "./enums";
import {
  DNC_STATUSES,
  LEAD_STATUSES,
  PERMISSION_STATUSES,
  ROLES,
  SOURCE_TYPES,
  USER_STATUSES,
} from "./enums";

// ───────────────────────── Tenancy & users ─────────────────────────

export const organisations = sqliteTable("organisations", {
  id: id(),
  name: text("name").notNull(),
  shortName: text("short_name").notNull(),
  institutionType: text("institution_type").notNull(), // e.g. "NBFC", "Bank"
  isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
});

export const users = sqliteTable(
  "users",
  {
    id: id(),
    organisationId: text("organisation_id")
      .notNull()
      .references(() => organisations.id),
    name: text("name").notNull(),
    email: text("email").notNull(),
    title: text("title"),
    role: text("role", { enum: ROLES }).notNull(),
    status: text("status", { enum: USER_STATUSES }).notNull().default("ACTIVE"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("users_email_unique").on(t.email),
    index("users_org_idx").on(t.organisationId),
  ],
);

// ───────────────────────── Product catalogue ─────────────────────────

export const products = sqliteTable(
  "products",
  {
    id: id(),
    organisationId: text("organisation_id")
      .notNull()
      .references(() => organisations.id),
    name: text("name").notNull(),
    category: text("category").notNull(),
    approvedDescription: text("approved_description").notNull(),
    /** JSON: amount/tenure ranges, purposes, approved fees — only if supplied by lender. */
    attributesJson: text("attributes_json").notNull().default("{}"),
    eligibilityWording: text("eligibility_wording"),
    disclaimers: text("disclaimers"),
    prohibitedStatements: text("prohibited_statements"),
    status: text("status", { enum: ["ACTIVE", "INACTIVE"] })
      .notNull()
      .default("ACTIVE"),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [index("products_org_idx").on(t.organisationId)],
);

// ───────────────────────── Leads & permissions ─────────────────────────

export const leads = sqliteTable(
  "leads",
  {
    id: id(),
    organisationId: text("organisation_id")
      .notNull()
      .references(() => organisations.id),
    externalLeadId: text("external_lead_id").notNull(),
    firstName: text("first_name"),
    phoneNumber: text("phone_number").notNull(),
    category: text("category"),
    source: text("source").notNull(),
    enquiryDate: text("enquiry_date"),
    preferredLanguage: text("preferred_language"),
    permissionStatus: text("permission_status", { enum: PERMISSION_STATUSES })
      .notNull()
      .default("MISSING"),
    permissionTimestamp: text("permission_timestamp"),
    permissionSource: text("permission_source"),
    permissionReference: text("permission_reference"),
    doNotCallStatus: text("do_not_call_status", { enum: DNC_STATUSES })
      .notNull()
      .default("UNKNOWN"),
    status: text("status", { enum: LEAD_STATUSES })
      .notNull()
      .default("IMPORTED"),
    isSynthetic: integer("is_synthetic", { mode: "boolean" })
      .notNull()
      .default(true),
    importBatchId: text("import_batch_id"),
    createdAt: createdAt(),
  },
  (t) => [
    index("leads_org_idx").on(t.organisationId),
    index("leads_org_status_idx").on(t.organisationId, t.status),
    uniqueIndex("leads_org_external_unique").on(
      t.organisationId,
      t.externalLeadId,
    ),
    index("leads_org_phone_idx").on(t.organisationId, t.phoneNumber),
  ],
);

// ───────────────────────── Conversations ─────────────────────────

export const conversations = sqliteTable(
  "conversations",
  {
    id: id(),
    organisationId: text("organisation_id")
      .notNull()
      .references(() => organisations.id),
    leadId: text("lead_id")
      .notNull()
      .references(() => leads.id),
    mode: text("mode", { enum: ["SIMULATION", "LIVE"] })
      .notNull()
      .default("SIMULATION"),
    scenario: text("scenario"),
    status: text("status").notNull(),
    outcome: text("outcome"),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    endedAt: integer("ended_at", { mode: "timestamp_ms" }),
    language: text("language"),
    provider: text("provider").notNull().default("mock"),
    createdByUserId: text("created_by_user_id").references(() => users.id),
  },
  (t) => [
    index("conversations_org_idx").on(t.organisationId),
    index("conversations_lead_idx").on(t.leadId),
  ],
);

export const transcriptSegments = sqliteTable(
  "transcript_segments",
  {
    id: id(),
    organisationId: text("organisation_id")
      .notNull()
      .references(() => organisations.id),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id),
    seq: integer("seq").notNull(),
    speaker: text("speaker", { enum: ["AI", "CUSTOMER", "SYSTEM"] }).notNull(),
    text: text("text").notNull(),
    /** Offset from conversation start, ms. */
    timestampMs: integer("timestamp_ms").notNull(),
    confidence: real("confidence"),
  },
  (t) => [index("segments_conversation_idx").on(t.conversationId)],
);

export const needProfiles = sqliteTable(
  "need_profiles",
  {
    id: id(),
    organisationId: text("organisation_id")
      .notNull()
      .references(() => organisations.id),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id),
    purpose: text("purpose"),
    amountRange: text("amount_range"),
    timeline: text("timeline"),
    preferencesJson: text("preferences_json").notNull().default("{}"),
    interestStatus: text("interest_status"),
    callbackTime: text("callback_time"),
    missingFieldsJson: text("missing_fields_json").notNull().default("[]"),
    extractionVersion: text("extraction_version").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("need_profiles_conversation_idx").on(t.conversationId)],
);

export const evidence = sqliteTable(
  "evidence",
  {
    id: id(),
    organisationId: text("organisation_id")
      .notNull()
      .references(() => organisations.id),
    needProfileId: text("need_profile_id")
      .notNull()
      .references(() => needProfiles.id),
    fieldName: text("field_name").notNull(),
    transcriptSegmentId: text("transcript_segment_id").references(
      () => transcriptSegments.id,
    ),
    evidenceText: text("evidence_text"),
    sourceType: text("source_type", { enum: SOURCE_TYPES }).notNull(),
    confidence: real("confidence"),
    humanReviewed: integer("human_reviewed", { mode: "boolean" })
      .notNull()
      .default(false),
  },
  (t) => [index("evidence_profile_idx").on(t.needProfileId)],
);

export const productMatches = sqliteTable(
  "product_matches",
  {
    id: id(),
    organisationId: text("organisation_id")
      .notNull()
      .references(() => organisations.id),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id),
    productId: text("product_id").references(() => products.id),
    matchStatus: text("match_status").notNull(),
    explanation: text("explanation").notNull(),
    missingInformationJson: text("missing_information_json")
      .notNull()
      .default("[]"),
    humanReviewStatus: text("human_review_status")
      .notNull()
      .default("PENDING"),
  },
  (t) => [index("matches_conversation_idx").on(t.conversationId)],
);

export const reviews = sqliteTable(
  "reviews",
  {
    id: id(),
    organisationId: text("organisation_id")
      .notNull()
      .references(() => organisations.id),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id),
    reviewerUserId: text("reviewer_user_id")
      .notNull()
      .references(() => users.id),
    correctedSummary: text("corrected_summary"),
    outcome: text("outcome").notNull(),
    nextAction: text("next_action"),
    followUpAt: text("follow_up_at"),
    reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("reviews_conversation_idx").on(t.conversationId)],
);

// ───────────────────────── Audit ─────────────────────────

export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: id(),
    organisationId: text("organisation_id")
      .notNull()
      .references(() => organisations.id),
    userId: text("user_id").references(() => users.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    timestamp: integer("timestamp", { mode: "timestamp_ms" }).notNull(),
    /** Never contains phone numbers or transcript text — see lib/audit.ts. */
    redactedMetadataJson: text("redacted_metadata_json").notNull().default("{}"),
  },
  (t) => [index("audit_org_time_idx").on(t.organisationId, t.timestamp)],
);

export type Organisation = typeof organisations.$inferSelect;
export type User = typeof users.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type Product = typeof products.$inferSelect;
export type AuditEvent = typeof auditEvents.$inferSelect;
