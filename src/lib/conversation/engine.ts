/**
 * Simulated voice-agent dialogue manager. Pure and deterministic: given the
 * same customer turns it always produces the same AI turns, so the server can
 * replay any conversation and never has to trust AI text sent by a browser.
 *
 * Guardrails built into the script (PRD §8):
 *  - opens by disclosing it is an automated assistant and naming the lender
 *  - asks one question at a time
 *  - stops immediately on opt-out or refusal
 *  - never quotes rates, eligibility or approval; never asks for OTP/PIN/passwords
 *  - offers a human at every exit
 */
import {
  detectAffirm,
  detectBusy,
  detectCallbackTime,
  detectDeny,
  detectHindi,
  detectHumanRequest,
  detectNotInterested,
  detectOptOut,
  detectPurpose,
  detectQuestion,
  detectUnsure,
  isSilence,
  parseAmount,
  parseTimeline,
} from "./parse";

export type Stage = "CONSENT" | "PURPOSE" | "AMOUNT" | "TIMELINE" | "HANDOFF" | "CALLBACK_TIME" | "ENDED";

export const OUTCOMES = {
  INTERESTED_FOLLOW_UP: "Interested — human follow-up",
  EXPLORING: "Exploring",
  NOT_INTERESTED: "Not interested",
  UNREACHABLE: "Unreachable",
  CALLBACK_REQUESTED: "Callback requested",
  OPTED_OUT: "Opted out",
  HUMAN_REVIEW_REQUIRED: "Human review required",
} as const;
export type Outcome = keyof typeof OUTCOMES;

export interface Turn {
  speaker: "AI" | "CUSTOMER" | "SYSTEM";
  text: string;
  timestampMs: number;
  /** True when the customer started speaking before this AI turn finished. */
  interrupted?: boolean;
}

export interface CustomerInput {
  text: string;
  /** Customer talks over the previous AI turn. */
  interrupt?: boolean;
}

export interface EngineContext {
  lenderName: string;
  enquiryLabel: string; // e.g. "business loan enquiry"
  firstName?: string | null;
}

interface State {
  stage: Stage;
  hindi: boolean;
  retries: number;
  silences: number;
  have: { purpose: boolean; amount: boolean; timeline: boolean };
  askedUnsure: { amount: boolean; timeline: boolean };
  callbackMode: "FOLLOW_UP" | "BUSY" | null;
  outcome: Outcome | null;
}

const T = {
  open: (c: EngineContext, hi: boolean) =>
    hi
      ? `Namaste${c.firstName ? ` ${c.firstName} ji` : ""}, main ${c.lenderName} ki taraf se ek automated voice assistant bol rahi hoon, aapki ${c.enquiryLabel} ke baare mein. Kya abhi baat karne ka sahi samay hai? Main aapki zaroorat note kar sakti hoon, aur aap chahein to lender ki team ka koi sadasya aapse sampark karega.`
      : `Hello${c.firstName ? ` ${c.firstName}` : ""}, I'm an automated voice assistant calling on behalf of ${c.lenderName} about your ${c.enquiryLabel}. Is this a convenient time to speak? I can note your requirements and, if you wish, arrange for a member of the lender's team to follow up.`,
  askPurpose: (hi: boolean) =>
    hi ? "Dhanyavaad. Aap loan kis kaam ke liye lena chahte hain?" : "Thank you. What are you looking to use the loan for?",
  askAmount: (hi: boolean) =>
    hi ? "Samajh gayi. Kya aapke mann mein koi anumaanit rakam hai?" : "Understood. Do you have an approximate amount in mind?",
  askTimeline: (hi: boolean) =>
    hi ? "Theek hai. Aap yeh funds kab tak arrange karna chahte hain?" : "Thanks. When are you hoping to arrange the funds?",
  askHandoff: (hi: boolean) =>
    hi
      ? "Shukriya. Kya aap chahenge ki lender ki team ka koi sadasya aapse baat karke vikalp samjhaye?"
      : "Thank you. Would you like a member of the lender's team to call you to talk through the options?",
  askCallback: (hi: boolean) =>
    hi ? "Zaroor. Aapko call ke liye kaunsa samay theek rahega?" : "Of course. Is there a convenient time for a callback?",
  askCallbackBusy: (hi: boolean) =>
    hi ? "Koi baat nahi. Kab call karna theek rahega?" : "No problem at all. When would be a better time to call?",
  clarify: (stage: Stage, hi: boolean) => {
    const q: Record<string, [string, string]> = {
      PURPOSE: ["Sorry, I didn't quite catch that. Could you tell me briefly what the loan would be for — for example equipment, stock, or expanding your business?", "Maaf kijiye, main samajh nahi paayi. Kya aap bata sakte hain loan kis liye chahiye — jaise machine, stock, ya business badhane ke liye?"],
      AMOUNT: ["Sorry, could you give me a rough amount? A range is fine, or you can say you're not sure.", "Maaf kijiye, kya aap ek anumaanit rakam bata sakte hain? Range bhi chalegi, ya aap keh sakte hain ki pakka nahi pata."],
      TIMELINE: ["Sorry, roughly when would you need the funds? It's fine if you're not sure yet.", "Maaf kijiye, aapko funds lagbhag kab tak chahiye? Agar pakka nahi pata to bhi theek hai."],
      HANDOFF: ["Sorry — would you like someone from the lender's team to call you? Yes or no is fine.", "Maaf kijiye — kya aap chahenge ki team ka koi sadasya aapko call kare? Haan ya na bata dijiye."],
      CALLBACK_TIME: ["Sorry, what time would suit you for a callback?", "Maaf kijiye, call ke liye kaunsa samay theek rahega?"],
      CONSENT: ["Sorry, is now a good time to talk for two minutes?", "Maaf kijiye, kya abhi do minute baat ho sakti hai?"],
    };
    const pair = q[stage] ?? q.CONSENT;
    return hi ? pair[1] : pair[0];
  },
  noted: (hi: boolean) => (hi ? "Koi baat nahi, main ise khula chhod deti hoon." : "That's fine, I'll leave that open."),
  questionDeflect: (topic: string, hi: boolean) =>
    hi
      ? `Achha sawaal hai. Main ${topic.toLowerCase()} ke baare mein jaankari ya koi vaada nahi de sakti — lender ki team aapko approved terms batayegi. Maine aapka sawaal note kar liya hai.`
      : `That's a good question. I'm not able to quote or confirm anything about ${topic.toLowerCase()} — the lender's team will explain their approved terms. I've noted your question for them.`,
  helloSilence: (hi: boolean) => (hi ? "Hello, kya aap mujhe sun pa rahe hain?" : "Hello, can you hear me?"),
  endUnreachable: (hi: boolean) =>
    hi ? "Lagta hai connection mein dikkat hai. Main yeh call samaapt kar rahi hoon. Dhanyavaad." : "It seems we can't connect right now. I'll end the call here. Thank you.",
  endOptOut: (hi: boolean) =>
    hi
      ? "Bilkul, maine note kar liya hai ki aap dobara sampark nahi chahte. Aapko is vishay mein phir call nahi kiya jayega. Dhanyavaad, aapka din shubh ho."
      : "Of course. I've recorded that you don't want to be contacted again, and you won't receive further calls about this. Thank you, and have a good day.",
  endNotInterested: (hi: boolean) =>
    hi
      ? "Koi baat nahi, aapka samay dene ke liye dhanyavaad. Agar kabhi zaroorat ho to aap lender se seedhe sampark kar sakte hain."
      : "No problem at all — thank you for your time. If anything changes, you're welcome to contact the lender directly.",
  endExploring: (hi: boolean) =>
    hi
      ? "Bilkul samajh sakti hoon. Maine aapki jaankari note kar li hai. Jab bhi aap taiyaar hon, lender se sampark kar sakte hain. Dhanyavaad."
      : "Completely understood. I've noted what you shared, and you can reach the lender whenever you're ready. Thank you for your time.",
  endFollowUp: (when: string, hi: boolean) =>
    hi
      ? `Dhanyavaad. Maine call ka samay note kar liya hai — ${when}. Lender ki team ka ek sadasya aapse sampark karega. Kripya dhyaan dein, yeh call kisi loan ki manzoori ya eligibility ki pushti nahi hai.`
      : `Thank you. I've noted ${when}. A member of the lender's team will contact you. Please note this call doesn't confirm eligibility or approval for any loan.`,
  endHuman: (hi: boolean) =>
    hi
      ? "Zaroor. Main yeh baatcheet seedhe lender ki team ke ek sadasya ko bhej rahi hoon, jo aapse jald sampark karenge. Dhanyavaad."
      : "Of course. I'm passing this conversation straight to a member of the lender's team, who will contact you shortly. Thank you.",
};

function speakMs(text: string) {
  return 600 + text.split(/\s+/).length * 330;
}

export function runConversation(ctx: EngineContext, inputs: CustomerInput[], opts: { startHindi?: boolean } = {}) {
  const st: State = {
    stage: "CONSENT",
    hindi: !!opts.startHindi,
    retries: 0,
    silences: 0,
    have: { purpose: false, amount: false, timeline: false },
    askedUnsure: { amount: false, timeline: false },
    callbackMode: null,
    outcome: null,
  };
  const turns: Turn[] = [];
  let clock = 0;

  const ai = (text: string) => {
    turns.push({ speaker: "AI", text, timestampMs: clock });
    clock += speakMs(text) + 400;
  };
  const end = (outcome: Outcome, text: string) => {
    ai(text);
    st.outcome = outcome;
    st.stage = "ENDED";
  };
  const nextQuestion = (prefix = "") => {
    const p = prefix ? `${prefix} ` : "";
    if (!st.have.purpose) {
      st.stage = "PURPOSE";
      return ai(p + T.askPurpose(st.hindi));
    }
    if (!st.have.amount) {
      st.stage = "AMOUNT";
      return ai(p + T.askAmount(st.hindi));
    }
    if (!st.have.timeline) {
      st.stage = "TIMELINE";
      return ai(p + T.askTimeline(st.hindi));
    }
    st.stage = "HANDOFF";
    return ai(p + T.askHandoff(st.hindi));
  };

  ai(T.open(ctx, st.hindi));

  for (const input of inputs) {
    if (st.stage === "ENDED") break;
    const text = input.text ?? "";

    if (input.interrupt && turns.length && turns[turns.length - 1].speaker === "AI") {
      const last = turns[turns.length - 1];
      last.interrupted = true;
      clock = last.timestampMs + Math.round(speakMs(last.text) * 0.45);
    }

    if (isSilence(text)) {
      turns.push({ speaker: "SYSTEM", text: "[no response from customer]", timestampMs: clock });
      clock += 4000;
      st.silences += 1;
      if (st.silences >= 2) end("UNREACHABLE", T.endUnreachable(st.hindi));
      else ai(T.helloSilence(st.hindi));
      continue;
    }

    turns.push({ speaker: "CUSTOMER", text, timestampMs: clock });
    clock += speakMs(text) + 500;
    st.silences = 0;
    // Follow the customer's language: switch to Hinglish when they use it, and
    // back to English when they clearly reply in English.
    if (detectHindi(text)) st.hindi = true;
    else if (text.trim().split(/\s+/).length >= 3) st.hindi = false;

    // Hard stops first — these override every other intent.
    if (detectOptOut(text)) {
      end("OPTED_OUT", T.endOptOut(st.hindi));
      break;
    }
    if (detectHumanRequest(text)) {
      end("HUMAN_REVIEW_REQUIRED", T.endHuman(st.hindi));
      break;
    }
    if (detectNotInterested(text) && st.stage !== "HANDOFF") {
      end("NOT_INTERESTED", T.endNotInterested(st.hindi));
      break;
    }

    // Capture anything volunteered, regardless of the current question.
    const purpose = detectPurpose(text);
    const amount = parseAmount(text);
    const timeline = parseTimeline(text);
    const question = detectQuestion(text);
    const unsure = detectUnsure(text);
    if (purpose) st.have.purpose = true;
    if (amount) st.have.amount = true;
    if (timeline && st.stage !== "CALLBACK_TIME" && st.stage !== "CONSENT") st.have.timeline = true;

    const prefix = question ? T.questionDeflect(question.topic, st.hindi) : "";

    switch (st.stage) {
      case "CONSENT": {
        if (detectBusy(text)) {
          st.callbackMode = "BUSY";
          st.stage = "CALLBACK_TIME";
          const when = detectCallbackTime(text);
          if (when) end("CALLBACK_REQUESTED", T.endFollowUp(st.hindi ? when : `a callback ${when}`, st.hindi));
          else ai(T.askCallbackBusy(st.hindi));
        } else if (detectAffirm(text) || purpose || amount) {
          nextQuestion(prefix);
        } else if (detectDeny(text)) {
          end("NOT_INTERESTED", T.endNotInterested(st.hindi));
        } else if (st.retries < 1) {
          st.retries += 1;
          ai(T.clarify("CONSENT", st.hindi));
        } else {
          end("HUMAN_REVIEW_REQUIRED", T.endHuman(st.hindi));
        }
        break;
      }
      case "PURPOSE":
      case "AMOUNT":
      case "TIMELINE": {
        const field = st.stage === "PURPOSE" ? "purpose" : st.stage === "AMOUNT" ? "amount" : "timeline";
        if (st.have[field]) {
          st.retries = 0;
          nextQuestion(prefix);
        } else if (unsure && field !== "purpose") {
          // Customer explicitly doesn't know: record nothing, move on.
          st.askedUnsure[field] = true;
          st.have[field] = true;
          st.retries = 0;
          nextQuestion(`${prefix ? prefix + " " : ""}${T.noted(st.hindi)}`);
        } else if (question) {
          ai(`${prefix} ${field === "purpose" ? T.askPurpose(st.hindi) : field === "amount" ? T.askAmount(st.hindi) : T.askTimeline(st.hindi)}`);
        } else if (st.retries < 1) {
          st.retries += 1;
          ai(T.clarify(st.stage, st.hindi));
        } else {
          // Two unclear answers: leave the field unknown and move on rather than push.
          st.have[field] = true;
          st.retries = 0;
          nextQuestion(T.noted(st.hindi));
        }
        break;
      }
      case "HANDOFF": {
        if (detectAffirm(text) && !detectDeny(text)) {
          st.callbackMode = "FOLLOW_UP";
          const when = detectCallbackTime(text);
          if (when) end("INTERESTED_FOLLOW_UP", T.endFollowUp(st.hindi ? when : `a callback ${when}`, st.hindi));
          else {
            st.stage = "CALLBACK_TIME";
            ai(T.askCallback(st.hindi));
          }
        } else if (detectDeny(text) || detectNotInterested(text)) {
          end("EXPLORING", T.endExploring(st.hindi));
        } else if (question) {
          ai(`${prefix} ${T.askHandoff(st.hindi)}`);
        } else if (st.retries < 1) {
          st.retries += 1;
          ai(T.clarify("HANDOFF", st.hindi));
        } else {
          end("EXPLORING", T.endExploring(st.hindi));
        }
        break;
      }
      case "CALLBACK_TIME": {
        const when = detectCallbackTime(text);
        const outcome: Outcome = st.callbackMode === "BUSY" ? "CALLBACK_REQUESTED" : "INTERESTED_FOLLOW_UP";
        if (when) end(outcome, T.endFollowUp(st.hindi ? when : `a callback ${when}`, st.hindi));
        else if (st.retries < 1) {
          st.retries += 1;
          ai(T.clarify("CALLBACK_TIME", st.hindi));
        } else end(outcome, T.endFollowUp(st.hindi ? "aapki call ki request" : "your callback request", st.hindi));
        break;
      }
    }
  }

  return {
    turns,
    outcome: st.outcome,
    ended: st.stage === "ENDED",
    nextStage: st.stage,
    language: st.hindi ? "Hinglish" : "English",
    durationMs: clock,
  };
}

export type ConversationRun = ReturnType<typeof runConversation>;
