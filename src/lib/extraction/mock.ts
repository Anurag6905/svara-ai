import type { Outcome } from "@/lib/conversation/engine";
import {
  detectBusinessContext,
  detectCallbackTime,
  detectHindi,
  detectPurpose,
  detectQuestion,
  inferCategory,
  parseAmount,
  parseTimeline,
} from "@/lib/conversation/parse";
import { formatINR, PURPOSES } from "@/lib/products";
import { CORE_FIELDS, FIELD_LABELS, UNKNOWN, type NeedProfile, type ProfileField } from "./schema";

export interface SegmentLike {
  seq: number;
  speaker: "AI" | "CUSTOMER" | "SYSTEM";
  text: string;
}

export const MOCK_EXTRACTION_VERSION = "mock-rules-1.0";

const stated = (value: string, confidence: number, seg: SegmentLike, note?: string): ProfileField => ({
  value,
  confidence,
  sourceType: "CUSTOMER_STATED",
  evidenceSeq: seg.seq,
  evidenceText: seg.text,
  ...(note ? { note } : {}),
});

const inferred = (value: string, confidence: number, seg: SegmentLike, note: string): ProfileField => ({
  value,
  confidence,
  sourceType: "AI_INFERRED",
  evidenceSeq: seg.seq,
  evidenceText: seg.text,
  note,
});

/**
 * Deterministic extractor. Reads only CUSTOMER segments, takes the first clear
 * statement of each field, and leaves anything not said as Unknown.
 * AI turns are never used as evidence of what the customer wants.
 */
export function extractMock(segments: SegmentLike[], outcome: Outcome | null): NeedProfile {
  const customer = segments.filter((s) => s.speaker === "CUSTOMER");
  const fields = {
    purpose: UNKNOWN,
    amount: UNKNOWN,
    timeline: UNKNOWN,
    loanCategory: UNKNOWN,
    businessContext: UNKNOWN,
    preferredLanguage: UNKNOWN,
    interest: UNKNOWN,
    callbackTime: UNKNOWN,
  };
  const data = { purposeKey: null as string | null, amountMin: null as number | null, amountMax: null as number | null, timelineDays: null as number | null };
  const questions: NeedProfile["questions"] = [];

  // Find the AI question each customer turn was answering, so a callback time
  // isn't mistaken for a funding timeline.
  const askedBefore = (seg: SegmentLike) => {
    const prev = [...segments].reverse().find((s) => s.seq < seg.seq && s.speaker === "AI");
    return prev?.text.toLowerCase() ?? "";
  };
  const isCallbackAnswer = (seg: SegmentLike) => /callback|better time|call ke liye|kab call|samay/.test(askedBefore(seg));

  for (const seg of customer) {
    if (fields.purpose.sourceType === "UNKNOWN") {
      const p = detectPurpose(seg.text);
      if (p) {
        fields.purpose = stated(PURPOSES[p.key], 0.86, seg, `Matched “${p.phrase}”`);
        data.purposeKey = p.key;
        fields.loanCategory = inferred(inferCategory(p.key), 0.7, seg, "Inferred from the stated purpose — confirm with the customer");
      }
    }
    if (fields.amount.sourceType === "UNKNOWN") {
      const a = parseAmount(seg.text);
      if (a) {
        const value = a.min === a.max ? formatINR(a.min) : `${formatINR(a.min)} – ${formatINR(a.max)}`;
        fields.amount = stated(a.approximate ? `${value} (approximate)` : value, a.approximate ? 0.78 : 0.92, seg, `Parsed “${a.phrase}”`);
        data.amountMin = a.min;
        data.amountMax = a.max;
      }
    }
    if (fields.timeline.sourceType === "UNKNOWN" && !isCallbackAnswer(seg)) {
      const t = parseTimeline(seg.text);
      if (t) {
        fields.timeline = stated(t.label, 0.82, seg, `Parsed “${t.phrase}”`);
        data.timelineDays = t.withinDays;
      }
    }
    if (fields.businessContext.sourceType === "UNKNOWN") {
      const b = detectBusinessContext(seg.text);
      if (b) fields.businessContext = stated(b.replace(/^\w/, (c) => c.toUpperCase()), 0.75, seg, "Volunteered by the customer");
    }
    if (fields.callbackTime.sourceType === "UNKNOWN" && isCallbackAnswer(seg)) {
      const c = detectCallbackTime(seg.text);
      if (c) fields.callbackTime = stated(c.replace(/^\w/, (x) => x.toUpperCase()), 0.85, seg);
    }
    const q = detectQuestion(seg.text);
    if (q && !questions.some((x) => x.topic === q.topic)) {
      questions.push({ topic: q.topic, evidenceSeq: seg.seq, evidenceText: seg.text });
    }
  }

  const hindiSeg = customer.find((s) => detectHindi(s.text));
  if (hindiSeg) {
    fields.preferredLanguage = inferred("Hindi / Hinglish", 0.8, hindiSeg, "Customer replied in Hindi/Hinglish — language not explicitly requested");
  } else if (customer[0]) {
    fields.preferredLanguage = inferred("English", 0.6, customer[0], "Customer replied in English — language not explicitly requested");
  }

  // Interest is what the customer said at the end of the call, mapped from the outcome.
  const last = customer[customer.length - 1];
  const interestByOutcome: Partial<Record<Outcome, string>> = {
    INTERESTED_FOLLOW_UP: "Interested — wants a team member to follow up",
    EXPLORING: "Exploring — declined a follow-up for now",
    NOT_INTERESTED: "Not interested",
    CALLBACK_REQUESTED: "Asked to be called back later",
    OPTED_OUT: "Asked not to be contacted again",
    HUMAN_REVIEW_REQUIRED: "Asked to speak with a person",
  };
  if (outcome && last && interestByOutcome[outcome]) {
    fields.interest = stated(interestByOutcome[outcome]!, 0.9, last);
  }

  const missing = CORE_FIELDS.filter((f) => fields[f].sourceType === "UNKNOWN").map((f) => FIELD_LABELS[f]);

  return {
    fields,
    questions,
    data,
    flags: {
      followUpRequested: outcome === "INTERESTED_FOLLOW_UP" || outcome === "CALLBACK_REQUESTED",
      optedOut: outcome === "OPTED_OUT",
      humanRequested: outcome === "HUMAN_REVIEW_REQUIRED",
    },
    missing,
  };
}
