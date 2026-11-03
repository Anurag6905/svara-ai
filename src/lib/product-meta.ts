/** Client-safe product constants and schemas (no database imports). */
import { z } from "zod";

/**
 * Credit purposes SVARA can recognise in a conversation. Products declare
 * which of these they are approved for; matching compares the two.
 */
export const PURPOSES = {
  MACHINERY: "Machinery or equipment purchase",
  WORKING_CAPITAL: "Working capital / day-to-day operations",
  INVENTORY: "Stock or inventory purchase",
  EXPANSION: "Business expansion or new premises",
  RENOVATION: "Shop or premises renovation",
  VEHICLE_COMMERCIAL: "Commercial vehicle",
  MEDICAL: "Medical expenses",
  EDUCATION: "Education",
  WEDDING: "Wedding",
  HOME_RENOVATION: "Home renovation",
  DEBT_CONSOLIDATION: "Consolidating existing loans",
  TRAVEL: "Travel",
} as const;
export type PurposeKey = keyof typeof PURPOSES;
export const PURPOSE_KEYS = Object.keys(PURPOSES) as PurposeKey[];

export const productAttributesSchema = z
  .object({
    purposes: z.array(z.enum(PURPOSE_KEYS as [PurposeKey, ...PurposeKey[]])).min(1, "Select at least one approved purpose"),
    minAmount: z.coerce.number().int().min(0),
    maxAmount: z.coerce.number().int().positive(),
    minTenureMonths: z.coerce.number().int().min(1).optional(),
    maxTenureMonths: z.coerce.number().int().min(1).optional(),
    customerSegment: z.enum(["SME", "INDIVIDUAL"]),
    /** Only if supplied and approved by the lender. Never inferred. */
    approvedRateText: z.string().trim().max(120).optional(),
    approvedFeeText: z.string().trim().max(120).optional(),
  })
  .refine((a) => a.maxAmount >= a.minAmount, {
    message: "Maximum amount must be at least the minimum amount",
    path: ["maxAmount"],
  })
  .refine((a) => !a.minTenureMonths || !a.maxTenureMonths || a.maxTenureMonths >= a.minTenureMonths, {
    message: "Maximum tenure must be at least the minimum tenure",
    path: ["maxTenureMonths"],
  });
export type ProductAttributes = z.infer<typeof productAttributesSchema>;


export function formatINR(amount: number): string {
  if (amount >= 1_00_00_000) return `₹${+(amount / 1_00_00_000).toFixed(2)} crore`;
  if (amount >= 1_00_000) return `₹${+(amount / 1_00_000).toFixed(2)} lakh`;
  return `₹${amount.toLocaleString("en-IN")}`;
}
