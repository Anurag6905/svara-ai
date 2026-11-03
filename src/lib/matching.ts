import type { NeedProfile } from "@/lib/extraction/schema";
import { formatINR, PURPOSES, type ProductAttributes, type PurposeKey } from "@/lib/products";

export const MATCH_LABEL = "Suggested for human review — not an eligibility or approval decision.";

export interface MatchableProduct {
  id: string;
  name: string;
  category: string;
  attributes: ProductAttributes | null;
}

export interface MatchResult {
  productId: string;
  productName: string;
  status: "POSSIBLE_MATCH" | "PARTIAL_MATCH";
  reasons: string[];
  conflicts: string[];
  missing: string[];
}

export interface MatchOutcome {
  status: "MATCHES" | "INSUFFICIENT_INFORMATION" | "NO_CLEAR_MATCH";
  matches: MatchResult[];
  message: string;
  label: typeof MATCH_LABEL;
}

/**
 * Deterministic, explainable rules (PRD §7.6). A product is only suggested when
 * the customer's stated purpose is one the lender approved it for. Amount is
 * checked against the approved range; anything unknown is reported as missing,
 * never assumed. There is no scoring of the customer.
 */
export function matchProducts(profile: NeedProfile, catalogue: MatchableProduct[]): MatchOutcome {
  const purpose = profile.data.purposeKey as PurposeKey | null;
  if (!purpose || profile.fields.purpose.sourceType === "UNKNOWN") {
    return {
      status: "INSUFFICIENT_INFORMATION",
      matches: [],
      message: "Insufficient information — the customer's credit purpose wasn't stated, so no product can be suggested. Route to a human.",
      label: MATCH_LABEL,
    };
  }

  const { amountMin, amountMax, timelineDays } = profile.data;
  const results: (MatchResult & { rank: number })[] = [];

  for (const p of catalogue) {
    const a = p.attributes;
    if (!a || !a.purposes.includes(purpose)) continue;
    const reasons = [`Customer stated purpose “${PURPOSES[purpose]}”, which is an approved purpose for this product.`];
    const conflicts: string[] = [];
    const missing: string[] = [];
    const range = `${formatINR(a.minAmount)} – ${formatINR(a.maxAmount)}`;

    if (amountMin === null || amountMax === null) {
      missing.push(`Amount not stated — approved range is ${range}.`);
    } else if (amountMin > a.maxAmount) {
      conflicts.push(`Stated amount (${formatINR(amountMin)}+) is above this product's approved maximum of ${formatINR(a.maxAmount)}.`);
    } else if (amountMax < a.minAmount) {
      conflicts.push(`Stated amount (up to ${formatINR(amountMax)}) is below this product's approved minimum of ${formatINR(a.minAmount)}.`);
    } else if (amountMax > a.maxAmount || amountMin < a.minAmount) {
      reasons.push(`Stated range partly overlaps the approved range of ${range}.`);
      conflicts.push("Part of the stated range falls outside the approved range.");
    } else {
      reasons.push(`Stated amount falls within the approved range of ${range}.`);
    }
    if (timelineDays === null && profile.fields.timeline.sourceType === "UNKNOWN") {
      missing.push("Desired timeline not stated.");
    }
    if (profile.fields.businessContext.sourceType === "UNKNOWN" && a.customerSegment === "SME") {
      missing.push("Business details not discussed — the team will need to confirm the business type.");
    }

    const fullAmountConflict = conflicts.some((c) => c.includes("above") || c.includes("below"));
    const status: MatchResult["status"] = conflicts.length === 0 && missing.length === 0 ? "POSSIBLE_MATCH" : "PARTIAL_MATCH";
    const rank = (fullAmountConflict ? 2 : 0) + (conflicts.length ? 1 : 0) + missing.length * 0.5;
    results.push({ productId: p.id, productName: p.name, status, reasons, conflicts, missing, rank });
  }

  results.sort((x, y) => x.rank - y.rank || x.productName.localeCompare(y.productName));
  const top = results.slice(0, 3).map(({ rank: _rank, ...r }) => r);

  if (top.length === 0) {
    return {
      status: "NO_CLEAR_MATCH",
      matches: [],
      message: `No active product in the catalogue is approved for “${PURPOSES[purpose]}”. Route to a human for review.`,
      label: MATCH_LABEL,
    };
  }
  return {
    status: "MATCHES",
    matches: top,
    message: `${top.length} catalogue product${top.length > 1 ? "s" : ""} may be relevant to the customer's stated need.`,
    label: MATCH_LABEL,
  };
}
