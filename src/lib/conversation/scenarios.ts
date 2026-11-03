import type { CustomerInput } from "./engine";

export interface Scenario {
  key: string;
  title: string;
  description: string;
  tags: string[];
  inputs: CustomerInput[];
}

/** Scripted customer behaviour for the simulator. All content is fictional. */
export const SCENARIOS: Scenario[] = [
  {
    key: "interested_hinglish",
    title: "Interested — tailoring business (Hinglish)",
    description: "Customer needs sewing machines, switches to Hinglish, asks about the interest rate, wants a callback.",
    tags: ["Interested", "Code-switching", "Question"],
    inputs: [
      { text: "Haan ji, boliye." },
      { text: "Mera tailoring ka business hai, mujhe do nayi silai machines leni hain." },
      { text: "Lagbhag 5 se 8 lakh. Interest rate kitna hoga?" },
      { text: "Do mahine mein chahiye." },
      { text: "Haan, please team se call karwa dijiye." },
      { text: "Kal shaam 6 baje ke baad." },
    ],
  },
  {
    key: "exploring",
    title: "Exploring — bakery expansion",
    description: "Customer is weighing a second outlet, gives an approximate amount, declines a callback for now.",
    tags: ["Exploring", "English"],
    inputs: [
      { text: "Yes, I have a few minutes." },
      { text: "I'm thinking about expanding my bakery to a second location." },
      { text: "Not fixed yet, maybe around 15 lakh." },
      { text: "Probably early next year." },
      { text: "Not right now, I'm just exploring options." },
    ],
  },
  {
    key: "not_interested",
    title: "Not interested",
    description: "Customer declines at the start. The assistant closes politely without pushing.",
    tags: ["Not interested"],
    inputs: [{ text: "No, I'm not interested, thank you." }],
  },
  {
    key: "callback",
    title: "Callback requested — customer is driving",
    description: "Customer can't talk and asks to be called back at a specific time.",
    tags: ["Callback"],
    inputs: [{ text: "I'm driving right now, can you call me later?" }, { text: "Tomorrow after 11 am." }],
  },
  {
    key: "unclear",
    title: "Unclear answers — kirana stock",
    description: "First answer is unclear, so the assistant clarifies once. The timeline is volunteered early; the amount stays Unknown because the customer isn't sure.",
    tags: ["Unclear", "Unknown stays unknown"],
    inputs: [
      { text: "Yes okay." },
      { text: "Hmm, it's a bit complicated actually." },
      { text: "Stock for my kirana store before Diwali." },
      { text: "I don't know exactly, depends on prices." },
      { text: "Yes please." },
      { text: "Any time in the afternoon." },
    ],
  },
  {
    key: "opt_out",
    title: "Opt-out mid-call",
    description: "Customer asks not to be called again. The assistant stops immediately and the lead is suppressed.",
    tags: ["Opt-out", "Hard stop"],
    inputs: [
      { text: "Yes, what is it?" },
      { text: "Actually, please don't call me again. Remove my number." },
      { text: "(this turn is never reached — the call has ended)" },
    ],
  },
  {
    key: "silence_interrupt_human",
    title: "Silence, interruption, asks for a person",
    description: "No answer at first, then the customer talks over the assistant and later asks for a human.",
    tags: ["Silence", "Interruption", "Escalation"],
    inputs: [
      { text: "" },
      { text: "Sorry, network issue. Yes, go ahead." },
      { text: "Working capital — I need to pay my suppliers.", interrupt: true },
      { text: "2 lakh." },
      { text: "This month itself, it's urgent." },
      { text: "Can I speak to a real person directly?" },
    ],
  },
  {
    key: "personal_education",
    title: "Personal loan — college fees",
    description: "A personal-loan enquiry for education, useful to show matching against a different product.",
    tags: ["Interested", "Personal"],
    inputs: [
      { text: "Yes, sure." },
      { text: "It's for my daughter's college fees." },
      { text: "Around 3 lakh rupees." },
      { text: "Next month." },
      { text: "Yes please." },
      { text: "Saturday morning works." },
    ],
  },
];

export function getScenario(key: string) {
  return SCENARIOS.find((s) => s.key === key) ?? null;
}
