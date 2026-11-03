import { z } from "zod";
import { SOURCE_TYPES } from "@/db/enums";

/**
 * The structured credit-need profile (PRD §7.5). Every field carries its value,
 * confidence, source type and the transcript segment that supports it.
 * An Unknown field has value null, confidence null and no evidence — always.
 */
export const fieldSchema = z
  .object({
    value: z.string().nullable(),
    confidence: z.number().min(0).max(1).nullable(),
    sourceType: z.enum(SOURCE_TYPES),
    /** `seq` of the supporting transcript segment. */
    evidenceSeq: z.number().int().nonnegative().nullable(),
    evidenceText: z.string().nullable(),
    note: z.string().optional(),
  })
  .superRefine((f, ctx) => {
    if (f.sourceType === "UNKNOWN" && (f.value !== null || f.evidenceSeq !== null)) {
      ctx.addIssue({ code: "custom", message: "Unknown fields must not carry a value or evidence" });
    }
    if (f.sourceType !== "UNKNOWN" && (f.value === null || f.evidenceSeq === null)) {
      ctx.addIssue({ code: "custom", message: "Known fields need a value and transcript evidence" });
    }
  });
export type ProfileField = z.infer<typeof fieldSchema>;

export const PROFILE_FIELDS = [
  "purpose",
  "amount",
  "timeline",
  "loanCategory",
  "businessContext",
  "preferredLanguage",
  "interest",
  "callbackTime",
] as const;
export type ProfileFieldName = (typeof PROFILE_FIELDS)[number];

export const FIELD_LABELS: Record<ProfileFieldName, string> = {
  purpose: "Credit purpose",
  amount: "Amount or range",
  timeline: "Desired timeline",
  loanCategory: "Loan category",
  businessContext: "Business context",
  preferredLanguage: "Preferred language",
  interest: "Stated interest",
  callbackTime: "Preferred callback time",
};

/** Fields whose absence is reported as missing information. */
export const CORE_FIELDS: ProfileFieldName[] = ["purpose", "amount", "timeline"];

export const needProfileSchema = z.object({
  fields: z.object(
    Object.fromEntries(PROFILE_FIELDS.map((f) => [f, fieldSchema])) as Record<ProfileFieldName, typeof fieldSchema>,
  ),
  questions: z.array(z.object({ topic: z.string(), evidenceSeq: z.number().int(), evidenceText: z.string() })),
  data: z.object({
    purposeKey: z.string().nullable(),
    amountMin: z.number().nullable(),
    amountMax: z.number().nullable(),
    timelineDays: z.number().nullable(),
  }),
  flags: z.object({
    followUpRequested: z.boolean(),
    optedOut: z.boolean(),
    humanRequested: z.boolean(),
  }),
  missing: z.array(z.string()),
});
export type NeedProfile = z.infer<typeof needProfileSchema>;

export const UNKNOWN: ProfileField = {
  value: null,
  confidence: null,
  sourceType: "UNKNOWN",
  evidenceSeq: null,
  evidenceText: null,
};
