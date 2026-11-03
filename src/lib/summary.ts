import type { Outcome } from "@/lib/conversation/engine";
import { OUTCOMES } from "@/lib/conversation/engine";
import type { NeedProfile } from "@/lib/extraction/schema";
import type { MatchOutcome } from "@/lib/matching";

/** Builds the human-readable brief strictly from extracted, evidenced fields. */
export function buildSummary(profile: NeedProfile, outcome: Outcome | null, match: MatchOutcome) {
  const f = profile.fields;
  const v = (x: { value: string | null }) => x.value;

  if (profile.flags.optedOut) {
    return {
      text: "The customer asked not to be contacted again. The lead has been suppressed. No further outreach.",
      nextAction: "None — opted out. Do not contact.",
    };
  }

  const parts: string[] = [];
  if (v(f.purpose)) {
    parts.push(`Customer is seeking credit for ${v(f.purpose)!.toLowerCase()}${v(f.businessContext) ? ` (${v(f.businessContext)!.toLowerCase()})` : ""}.`);
  } else {
    parts.push("The customer did not state a credit purpose.");
  }
  const need: string[] = [];
  if (v(f.amount)) need.push(`amount ${v(f.amount)}`);
  if (v(f.timeline)) need.push(`timeline ${v(f.timeline)!.toLowerCase()}`);
  if (need.length) parts.push(`Stated ${need.join(", ")}.`);
  if (profile.missing.length) parts.push(`Not stated: ${profile.missing.join(", ").toLowerCase()}.`);
  if (profile.questions.length) parts.push(`Asked about: ${profile.questions.map((q) => q.topic.toLowerCase()).join(", ")}.`);
  if (outcome) parts.push(`Outcome: ${OUTCOMES[outcome].toLowerCase()}${v(f.callbackTime) ? `, callback ${v(f.callbackTime)!.toLowerCase()}` : ""}.`);

  let nextAction: string;
  switch (outcome) {
    case "INTERESTED_FOLLOW_UP":
      nextAction = `Call back${v(f.callbackTime) ? ` ${v(f.callbackTime)!.toLowerCase()}` : ""}; confirm ${profile.missing.length ? profile.missing.join(", ").toLowerCase() + " and " : ""}walk through ${match.matches[0]?.productName ?? "relevant products"} using approved terms.`;
      break;
    case "CALLBACK_REQUESTED":
      nextAction = `Call back${v(f.callbackTime) ? ` ${v(f.callbackTime)!.toLowerCase()}` : ""} to continue the conversation.`;
      break;
    case "HUMAN_REVIEW_REQUIRED":
      nextAction = "Customer asked for a person — a team member should call back promptly.";
      break;
    case "EXPLORING":
      nextAction = "No follow-up requested. Keep the brief on file; do not re-contact without a new request.";
      break;
    case "NOT_INTERESTED":
      nextAction = "Close the enquiry. Do not re-contact for this enquiry.";
      break;
    case "UNREACHABLE":
      nextAction = "Customer could not be reached. Retry only within the lender's approved contact policy.";
      break;
    default:
      nextAction = "Review the conversation.";
  }
  return { text: parts.join(" "), nextAction };
}
