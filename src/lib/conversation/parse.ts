/**
 * Deterministic understanding of customer utterances (English, Hindi in Latin
 * script, and Hinglish). Used by the simulator to decide what to ask next and
 * by the mock extractor to build the need profile. Pure functions, no I/O.
 *
 * These are intentionally conservative: if nothing clear is said, they return
 * null and the field stays Unknown. They never guess.
 */
import type { PurposeKey } from "@/lib/product-meta";

const norm = (t: string) =>
  ` ${t.toLowerCase().replace(/[’']/g, "'").replace(/[^\p{L}\p{N}₹.,?' -]/gu, " ").replace(/\s+/g, " ")} `;

/** Punctuation-free form for intent detection ("Yes, sure." → " yes sure "). */
const words = (t: string) => ` ${t.toLowerCase().replace(/[’']/g, "'").replace(/[^\p{L}\p{N}' ]/gu, " ").replace(/\s+/g, " ").trim()} `;

const has = (t: string, list: string[]) => list.some((w) => t.includes(w));

// ───────────── Amount ─────────────

export interface AmountMatch {
  min: number;
  max: number;
  approximate: boolean;
  phrase: string;
}

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  fifteen: 15, twenty: 20, twentyfive: 25, thirty: 30, forty: 40, fifty: 50,
  ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chhe: 6, saat: 7, aath: 8, nau: 9, das: 10,
  pachas: 50, pachaas: 50, bees: 20,
};

const UNIT = /(lakh|lakhs|lac|lacs|lakh rupees|crore|crores|cr|thousand|hazaar|hazar|k)\b/;

function unitMultiplier(u: string): number {
  if (u.startsWith("cr")) return 1_00_00_000;
  if (u.startsWith("la")) return 1_00_000;
  if (u === "k" || u.startsWith("th") || u.startsWith("ha")) return 1_000;
  return 1;
}

function toNum(token: string): number | null {
  const cleaned = token.replace(/,/g, "");
  if (/^\d+(\.\d+)?$/.test(cleaned)) return parseFloat(cleaned);
  return WORD_NUMBERS[token] ?? null;
}

export function parseAmount(text: string): AmountMatch | null {
  const t = norm(text);
  const approximate = has(t, [" around ", " about ", " roughly ", " maybe ", " approx", " lagbhag ", " kareeb ", " karib ", " tak ", " something like ", " probably "]);
  const num = "(\\d[\\d,]*(?:\\.\\d+)?|[a-z]+)";
  const range = new RegExp(`${num}\\s*(?:-|to|se|or|aur|–)\\s*${num}\\s*${UNIT.source}`);
  const single = new RegExp(`(?:₹\\s*)?${num}\\s*${UNIT.source}`);
  const rupees = /₹\s*(\d[\d,]*)|(\d[\d,]{3,})\s*(?:rupees|rs|inr)/;

  let m = t.match(range);
  if (m) {
    const a = toNum(m[1]);
    const b = toNum(m[2]);
    if (a !== null && b !== null) {
      const mult = unitMultiplier(m[3]);
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      return { min: Math.round(lo * mult), max: Math.round(hi * mult), approximate: true, phrase: m[0].trim() };
    }
  }
  m = t.match(single);
  if (m) {
    const a = toNum(m[1]);
    if (a !== null) {
      const v = Math.round(a * unitMultiplier(m[2]));
      return { min: v, max: v, approximate, phrase: m[0].trim() };
    }
  }
  m = t.match(rupees);
  if (m) {
    const v = parseInt((m[1] ?? m[2]).replace(/,/g, ""), 10);
    if (v >= 1000) return { min: v, max: v, approximate, phrase: m[0].trim() };
  }
  return null;
}

// ───────────── Timeline ─────────────

export interface TimelineMatch {
  label: string;
  withinDays: number | null;
  phrase: string;
}

export function parseTimeline(text: string): TimelineMatch | null {
  const t = norm(text);
  const n = "(\\d+|one|two|three|four|five|six|ek|do|teen|char|chaar|paanch|chhe)";
  const rules: [RegExp, (m: RegExpMatchArray) => TimelineMatch][] = [
    [/\b(immediately|urgent|urgently|asap|right away|this week|is hafte|turant|jaldi)\b/, (m) => ({ label: "Immediately / this week", withinDays: 7, phrase: m[0] })],
    [new RegExp(`\\b(?:in|within|next|agle)?\\s*${n}\\s*(weeks?|hafte|hafton)\\b`), (m) => {
      const k = toNum(m[1]) ?? 1;
      return { label: `Within ${k} week${k > 1 ? "s" : ""}`, withinDays: k * 7, phrase: m[0].trim() };
    }],
    [new RegExp(`\\b(?:in|within|next|agle)?\\s*${n}\\s*(months?|mahine|mahino|mahinon)\\b`), (m) => {
      const k = toNum(m[1]) ?? 1;
      return { label: `Within ${k} month${k > 1 ? "s" : ""}`, withinDays: k * 30, phrase: m[0].trim() };
    }],
    [/\b(this month|isi mahine|is mahine|month end)\b/, (m) => ({ label: "This month", withinDays: 30, phrase: m[0] })],
    [/\b(next month|agle mahine)\b/, (m) => ({ label: "Next month", withinDays: 60, phrase: m[0] })],
    [/\b(before|after) (diwali|holi|eid|christmas|the festival|festive season)\b/, (m) => ({ label: `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2].replace(/^the /, "")}`, withinDays: null, phrase: m[0] })],
    [/\b(next year|early next year|agle saal)\b/, (m) => ({ label: "Next year", withinDays: 365, phrase: m[0] })],
    [/\b(in a few months|kuch mahine|couple of months)\b/, (m) => ({ label: "In a few months", withinDays: 120, phrase: m[0] })],
  ];
  for (const [re, make] of rules) {
    const m = t.match(re);
    if (m) return make(m);
  }
  return null;
}

// ───────────── Purpose ─────────────

const PURPOSE_RULES: [PurposeKey, string[]][] = [
  ["MACHINERY", ["machine", "machinery", "equipment", "silai", "sewing", "oven", "printer", "tools", "auzaar"]],
  ["INVENTORY", ["stock", "inventory", "maal", "raw material", "goods for", "saamaan"]],
  ["WORKING_CAPITAL", ["working capital", "pay suppliers", "suppliers", "salaries", "salary to staff", "cash flow", "kaam chalane", "daily expenses", "operations"]],
  ["EXPANSION", ["expand", "expansion", "second location", "new branch", "new shop", "new outlet", "nayi dukaan", "badhana", "bada karna"]],
  ["RENOVATION", ["renovate", "renovation", "repair the shop", "shop repair", "dukaan ki repair", "interiors"]],
  ["VEHICLE_COMMERCIAL", ["truck", "tempo", "delivery van", "commercial vehicle", "auto rickshaw"]],
  ["MEDICAL", ["medical", "hospital", "surgery", "treatment", "ilaaj", "operation for"]],
  ["EDUCATION", ["education", "college fees", "school fees", "tuition", "padhai", "course fees", "admission"]],
  ["WEDDING", ["wedding", "marriage", "shaadi", "shadi"]],
  ["HOME_RENOVATION", ["home renovation", "house repair", "ghar ki repair", "ghar banwana", "renovate my house"]],
  ["DEBT_CONSOLIDATION", ["consolidate", "existing loans", "credit card dues", "close my other loan"]],
  ["TRAVEL", ["travel", "trip", "vacation", "holiday abroad"]],
];

export interface PurposeMatch {
  key: PurposeKey;
  phrase: string;
}

export function detectPurpose(text: string): PurposeMatch | null {
  const t = words(text);
  for (const [key, list] of PURPOSE_RULES) {
    const w = list.find((x) => t.includes(x));
    if (w) {
      if (key === "RENOVATION" && has(t, ["home", "house", "ghar"])) return { key: "HOME_RENOVATION", phrase: w };
      return { key, phrase: w };
    }
  }
  return null;
}

/** Category is an AI inference from purpose — always labelled AI-inferred. */
export function inferCategory(purpose: PurposeKey): string {
  switch (purpose) {
    case "MACHINERY":
      return "Equipment Loan";
    case "INVENTORY":
    case "WORKING_CAPITAL":
      return "Working Capital";
    case "EXPANSION":
    case "RENOVATION":
    case "VEHICLE_COMMERCIAL":
      return "Business Loan";
    default:
      return "Personal Loan";
  }
}

// ───────────── Intents ─────────────

export const isSilence = (text: string) => text.trim() === "" || /^\[(silence|no response)\]$/i.test(text.trim());

export function detectOptOut(text: string): boolean {
  const t = words(text);
  return has(t, [
    "don't call", "do not call", "dont call", "stop calling", "never call", "remove my number",
    "delete my number", "opt out", "unsubscribe", "call mat karna", "call mat karo", "phone mat karna",
    "dobara call mat", "number hata", "take me off", "not call me again",
  ]);
}

export function detectHumanRequest(text: string): boolean {
  const t = words(text);
  return has(t, [
    "speak to a person", "talk to a person", "real person", "human", "speak to someone", "talk to someone",
    "insaan se baat", "kisi se baat", "manager se baat", "complaint", "fraud", "this is harassment",
  ]);
}

export function detectNotInterested(text: string): boolean {
  const t = words(text);
  return has(t, [
    "not interested", "no thanks", "no thank you", "don't need", "dont need", "nahi chahiye", "zaroorat nahi",
    "already took a loan", "no need",
  ]);
}

export function detectBusy(text: string): boolean {
  const t = words(text);
  return has(t, [
    "call later", "call me later", "busy", "driving", "in a meeting", "not a good time", "baad mein", "abhi nahi",
    "later please", "call back", "callback",
  ]);
}

export function detectAffirm(text: string): boolean {
  const t = words(text);
  if (has(t, [" no ", " nahi ", " nahin ", " not ", " nope "])) return false;
  return has(t, [" yes ", " yeah ", " haan ", " han ", " ha ", " sure ", " ok ", " okay ", " theek ", " thik ", " please ", " go ahead ", " boliye ", " bolo ", " ji "]);
}

export function detectDeny(text: string): boolean {
  const t = words(text);
  return has(t, [" no ", " nahi ", " nahin ", " not now", " not right now", " nope ", " just exploring", " abhi nahi"]);
}

export function detectUnsure(text: string): boolean {
  const t = words(text);
  return has(t, ["not sure", "don't know", "dont know", "no idea", "pata nahi", "maloom nahi", "decide nahi", "haven't decided"]);
}

export function detectCallbackTime(text: string): string | null {
  const t = words(text);
  const m =
    t.match(/\b(tomorrow|kal|today|aaj|monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekend)\b[^.?]*/) ??
    t.match(/\b(after|before|around)\s+\d{1,2}(\s*(am|pm|baje))?[^.?]*/) ??
    t.match(/\b(morning|afternoon|evening|subah|dopahar|shaam|any time|anytime)\b[^.?]*/) ??
    t.match(/\b\d{1,2}\s*(am|pm|baje)\b[^.?]*/);
  if (!m) return null;
  return m[0]
    .replace(/\b(works for me|works|would be good|would be best|is fine|is good|please|chalega|theek rahega|theek hai)\b.*$/, "")
    .trim()
    .replace(/\s+/g, " ") || null;
}

export function detectBusinessContext(text: string): string | null {
  const t = words(text);
  const m =
    t.match(/\b(?:i run|i own|i have|we run|we have|my)\s+(?:a\s+|an\s+)?([a-z]+(?:\s[a-z]+)?)\s+(business|shop|store|unit|company|bakery|workshop|boutique)\b/) ??
    t.match(/\bmera\s+([a-z]+)\s+(?:ka\s+)?(business|dukaan|kaam|shop)\b/) ??
    t.match(/\b(tailoring|kirana|bakery|boutique|garment|textile|printing|restaurant|salon|pharmacy|hardware)\s*(business|shop|store|unit)?\b/);
  if (!m) return null;
  return m[0].trim();
}

export const CONCERN_TOPICS: [string, string[]][] = [
  ["Interest rate", ["interest", "rate", "byaaj", "byaj", "roi"]],
  ["Documents required", ["document", "papers", "kagaz", "kaagaz", "gst", "itr"]],
  ["Processing time", ["how long", "kitna time", "kitne din", "how many days", "processing time"]],
  ["Fees and charges", ["fee", "charges", "hidden"]],
  ["Credit score", ["cibil", "credit score", "score"]],
  ["Collateral", ["collateral", "security", "guarantee", "girvi"]],
];

export function detectQuestion(text: string): { topic: string } | null {
  const t = words(text);
  for (const [topic, list] of CONCERN_TOPICS) {
    if (has(t, list) && (text.includes("?") || has(t, [" kitna ", " kya ", " what ", " how ", " will ", " do i ", " need "]))) {
      return { topic };
    }
  }
  return null;
}

const HINDI_MARKERS = [
  " hai ", " hain ", " mujhe ", " mera ", " meri ", " chahiye ", " nahi ", " kya ", " karna ", " mein ", " lena ", " leni ",
  " haan ", " boliye ", " ji ", " kal ", " baje ", " mahine ", " lagbhag ", " dijiye ", " karwa ", " dukaan ", " paise ",
];

/** True when the utterance is Hindi or Hinglish (romanised or Devanagari). */
export function detectHindi(text: string): boolean {
  if (/[ऀ-ॿ]/.test(text)) return true;
  const t = words(text);
  return HINDI_MARKERS.filter((w) => t.includes(w)).length >= 1;
}
