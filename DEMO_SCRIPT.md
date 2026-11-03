# SVARA AI — 5-minute lender demo script

Before every demo: `npm run db:reset`, then `npm run dev` and open http://localhost:3000.
Say up front: **"Everything you'll see is synthetic data and simulated conversations. No real calls are placed."**

## 1. The problem (30 s) — Overview
Sign in as **Rohan Mehta (Manager)**.
"Your callers capture 'interested' in a spreadsheet and the next person asks the same questions again. SVARA turns each conversation into a structured, evidenced brief — and a person reviews every one."
Point at **Product boundaries**: not underwriting, no approval promises, no calls without permission, opt-outs are permanent.

## 2. Permission first (60 s) — Leads → Import CSV
- Drop `public/sample-leads-with-errors.csv`.
- Show row-level errors (bad phone, missing source, bad date), the duplicate, and the **three valid rows that are blocked** (pending permission, DND-registered, DND unchecked).
- "Nothing enters a calling workflow without a complete permission record. That's enforced on the server, not just hidden in the UI."
- Import, then filter Leads by **Blocked only**.

## 3. A real-feeling conversation (90 s) — Simulator
- Pick **Rekha** (prefers Hindi). Choose **Play the customer**.
- Type: `Haan boliye` → `Mera tailoring ka business hai, do silai machines leni hain` → `lagbhag 5 se 8 lakh, interest rate kitna hoga?` → `do mahine mein` → `haan` → `kal shaam 6 baje ke baad`.
- Call out: AI disclosed it's automated and named the lender; it switched to Hinglish; it **refused to quote a rate**; one question at a time.
- Save & analyse.

## 4. The brief (60 s) — Conversation page
- Every field: value, **Customer-stated / AI-inferred / Unknown**, confidence, and a link to the exact transcript line (click one).
- Product matches carry the reason, conflicts, gaps — and the label **"Suggested for human review — not an eligibility or approval decision."**
- Correct a field, mark a product relevant, schedule a follow-up, save. Open **Audit log** to show it was recorded.

## 5. Opt-out & quality (30 s)
- Simulator → scripted **Opt-out mid-call**. The call stops at once; the lead is suppressed and disappears from the simulator.
- **Analytics**: opt-outs, escalations, reviewer corrections sit next to volume.

## Close (30 s)
"We want to run this against one workflow of yours — fresh SME enquiries or dormant leads — with your scripts, your catalogue and your compliance team's sign-off, and measure cost per sales-accepted lead against your current process."

## Questions you will get
- *"Is this live?"* No. Simulation only. Telephony, speech-to-text and text-to-speech sit behind adapter interfaces for a later, approved pilot.
- *"Does it use an LLM?"* The demo runs on deterministic rules so it works offline. An optional LLM extractor (`LLM_PROVIDER=anthropic`) is validated against the same schema and discarded if it cites evidence that doesn't exist.
- *"Is it compliant?"* We don't claim that. Compliance is a design constraint here; a pilot needs your legal, compliance and infosec review.
