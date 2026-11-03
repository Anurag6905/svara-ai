# SVARA AI --- Product Requirements Document (PRD)

**Version:** 1.0 \| **For:** Claude Code \| **Market:** India \|
**Stage:** Discovery / MVP

## 1. Product summary

SVARA AI is a voice-AI-assisted lead qualification platform for banks
and NBFCs. It contacts only lender-approved, permissioned leads through
an approved workflow, understands the customer's stated credit
requirement, structures the information, and prepares a useful handoff
for the lender's sales team.

**One-line product:** Turn permitted lending conversations into
structured customer needs, actionable lead insights and better-prepared
sales follow-ups.

SVARA is not a lender, underwriting engine, credit bureau or loan
approval system. It does not approve or reject loans, promise
eligibility, or make final financial recommendations. The lender owns
its product catalogue, customer permissions, compliance obligations and
final decisions.

## 2. Problem hypothesis

Lending teams may spend significant time calling enquiries, repeating
discovery questions, identifying genuine interest, recording notes and
arranging follow-ups. Customer requirements may be captured
inconsistently, and useful context may be lost between calls or agents.

These are hypotheses---not proven facts. Validate them through
interviews before presenting them as established market problems.

## 3. Target market and users

**Initial paying customer:** Indian banks and NBFCs with active lending
sales/contact-centre teams.

**Potential buyers:** Head of Lending Sales, Head of Contact Centre,
Head of Sales Operations, Digital Lending Business Head,
technology/product leaders.

**Daily users:** Telecallers, relationship managers, team leaders, sales
operations analysts.

**End customer:** A person who has enquired about a loan, requested a
callback, or whose contact may lawfully be used for the specific
communication.

**Recommended beachhead:** Qualifying existing, permissioned
personal-loan or business-loan enquiries. Select one category with the
first design partner. Do not start with cold mass calling, collections
or every loan type.

## 4. Core differentiation --- Credit-Need Intelligence

Do not build or position SVARA as merely another AI dialler. The central
product layer should understand and structure the customer's stated
credit need.

For each conversation SVARA should: 1. Capture the customer's stated
purpose for seeking credit. 2. Capture approximate amount/range and
desired timeline, if volunteered. 3. Record preferences, questions,
concerns and requested follow-up. 4. Distinguish customer-stated facts
from AI inferences and unknown information. 5. Link extracted fields to
transcript evidence or timestamps. 6. Compare the need with the lender's
configured, bank-approved product catalogue. 7. Explain why a product
may be relevant and what information is missing. 8. Send the profile and
summary to a human for review.

**Positioning principles** - Need-first, not product-first. -
Evidence-backed extraction. - Transparent uncertainty; never invent
missing details. - Human-reviewed product suggestions, not automated
eligibility decisions. - Hindi and English first; expand only after real
speech-quality testing. - Lender-controlled product catalogue, scripts,
disclaimers and escalation rules.

This is a proposed differentiation to validate---not a claim that
competitors do not offer similar capabilities.

## 5. MVP goals and non-goals

### MVP goals

-   Secure demo workspace with role-based access.
-   Import synthetic or approved test leads by CSV.
-   Record permission metadata and block records that fail required
    checks.
-   Configure lender-approved sample loan products.
-   Run a clearly labelled conversation simulation.
-   Generate transcript, structured credit-need profile and concise
    summary.
-   Show evidence and confidence for extracted fields.
-   Suggest up to three catalogue matches using transparent rules, or
    say "Insufficient information".
-   Let a human review, correct, assign follow-up and export results.
-   Show basic operational and customer-experience analytics.

### Not in MVP

-   Real autonomous production calling or dialler integration.
-   Loan underwriting, credit scoring, approval or rejection.
-   Final product suitability or financial advice.
-   Collections or debt recovery.
-   KYC/document verification or payment processing.
-   Scraping, buying or enriching phone-number lists.
-   Deep integrations with multiple bank CRMs.
-   Any promise of eligibility, approval, rate or savings.

## 6. Main workflow

1.  Lender user signs in.
2.  Admin configures approved product information and required
    disclosures.
3.  User imports leads using a CSV template.
4.  System validates fields and permission metadata; blocked records
    cannot enter a calling workflow.
5.  User reviews the batch and tests a simulated conversation.
6.  An authorised user approves any future pilot batch.
7.  In a future approved deployment, the AI truthfully identifies itself
    and the lender, explains the purpose, respects refusal/opt-out and
    offers human follow-up.
8.  Conversation is transcribed and structured.
9.  Need profile is compared with the lender's approved catalogue.
10. Sales user reviews transcript, evidence, summary, match explanation
    and next action.
11. User exports or routes the record for human follow-up.

For the first build, use simulation and synthetic data only. No live
calls.

## 7. Functional requirements

### 7.1 Authentication and roles

Roles: Organisation Admin, Manager, Agent, Read-only Analyst. Users can
only access their organisation's records. Admin can invite/deactivate
users and assign roles. Log important actions.

### 7.2 Product catalogue

Each organisation can manage: - Product name and category - Approved
description - Product attributes and amount/tenure ranges where
approved - Current approved fees/rates only if explicitly supplied -
Eligibility wording supplied by lender - Required disclaimers and
prohibited statements - Active/inactive status and last-updated date

This is reference information, not an underwriting engine. Never infer
eligibility from incomplete conversation data.

### 7.3 Lead management

-   CSV upload, downloadable template and row-level validation.
-   Required fields: lead ID, phone, lead source and permission
    metadata.
-   Optional fields: first name, loan category, enquiry date, preferred
    language.
-   Deduplicate records.
-   Statuses: Imported, Needs Review, Ready for Test, Approved for
    Pilot, Contacted, Interested, Not Interested, Follow-up Requested,
    Unreachable, Opted Out, Human Review Required.
-   Opted-out records are suppressed. Do not silently override an
    opt-out.
-   Store permission status, timestamp, source and evidence reference.

Suggested CSV headers:
`lead_id,first_name,phone_number,loan_category,lead_source,enquiry_date,preferred_language,permission_status,permission_timestamp,permission_source,permission_reference,do_not_call_status`

Use synthetic data during development.

### 7.4 Conversation simulator

-   Simulated customer and AI turns, with a visible "SIMULATION" label.
-   Scenario library: interested, exploring, not interested, callback
    requested, unclear answer, opt-out.
-   Handle silence, interruption, unclear answers and language changes
    in the simulation.
-   Capture conversation state and outcome.
-   Offer human handoff/callback as an outcome.
-   Stop immediately on refusal or opt-out.

Keep future speech-to-text, text-to-speech and telephony providers
behind replaceable interfaces. Do not implement live telephony in the
MVP.

### 7.5 Structured credit-need profile

Capture only what the customer states: - Credit purpose - Amount or
amount range - Desired timeline - Loan category - Preferred language -
Preferred callback time - Relevant employment/business context only if
volunteered and needed - Questions and concerns - Stated interest -
Missing information - Follow-up request and opt-out status

Each field must contain: value, confidence, transcript
evidence/timestamp, source type (Customer-stated / AI-inferred /
Unknown), and human-reviewed flag. Never guess unknown values or infer
sensitive traits.

### 7.6 Product matching

-   Use deterministic, explainable rules against the lender's configured
    catalogue.
-   Return up to three possible matches, or "Insufficient information".
-   Show the customer-stated needs and catalogue attributes that support
    each suggestion.
-   Show missing information and conflicts.
-   Label every result: **"Suggested for human review --- not an
    eligibility or approval decision."**
-   Do not rank customers by creditworthiness or make approval
    predictions.
-   If no clear match exists, route to human review.

### 7.7 Summary and human review

Summary fields: - Enquiry reason - Stated need, amount and timeline -
Questions/concerns - Interest status as expressed by customer -
Follow-up request - Suggested human next action - Opt-out/escalation
flags

Summary must be grounded in transcript. Human edits are auditable. Agent
can accept, correct, mark follow-up or escalate.

### 7.8 Dashboard and analytics

Show: - Leads by status - Simulations completed (separate from any
future live calls) - Interested / not interested / follow-up requested -
Opt-outs and human-review queue - Common stated loan purposes -
Missing-information frequency - Average simulated conversation duration

Include quality indicators: opt-outs, complaints, incorrect information,
extraction corrections and escalations. Do not optimise only for call
volume or conversion.

### 7.9 Export

CSV export of lead, structured profile, summary, match explanation,
review status and next action. Design internal interfaces to support
future CRM APIs, but do not build integrations in MVP.

## 8. Conversation design

Prototype opening: "Hello, I'm an automated voice assistant calling on
behalf of \[Lender Name\] about your \[loan enquiry\]. Is this a
convenient time to speak? I can note your requirements and, if you wish,
arrange for a member of the lender's team to follow up."

This is placeholder copy only. The lender and its legal/compliance team
must approve all live-call wording and disclosures.

Example questions, one at a time: - What are you looking to use the loan
for? - Do you have an approximate amount in mind? - When are you hoping
to arrange the funds? - Would you prefer to speak with a team member? -
Is there a convenient time for a callback?

Never ask for OTPs, passwords, PINs, full card details or bank login
credentials.

Possible outcomes: Interested---human follow-up; Exploring; Not
interested; Unreachable; Callback requested; Opted out; Human review
required.

## 9. Compliance, privacy and trust

This is a financial-services product. Compliance is a design constraint,
not a later feature. This PRD is not legal advice and does not establish
that any calling workflow is compliant.

Before using real customer data or making live calls: - Obtain written
approval from the lender's authorised business, legal, compliance,
information-security and procurement teams. - Have qualified Indian
counsel review applicable RBI requirements, TRAI/TCCCPR and DND rules,
telecom/provider requirements, privacy and data-protection obligations,
outsourcing/vendor requirements and lender policies. - Confirm lawful
basis and permission for each lead, purpose and communication channel. -
Use approved caller identity, routes, templates and disclosures. -
Provide a clear opt-out and honour it immediately. - Define retention,
deletion, access, residency and incident-response rules with the
lender. - Encrypt data in transit and at rest; enforce least-privilege
access and audit logs. - Do not use conversations to train shared models
unless expressly authorised and legally reviewed. - Redact sensitive
information from logs. - Escalate complaints, distress, disputes and
requests for a human. - Never mislead, pressure, conceal AI identity,
promise approval or quote unapproved terms.

## 10. Technical direction

Recommended simple stack: - Frontend: Next.js App Router + TypeScript +
Tailwind. - Backend: Next.js server routes for a small MVP, or FastAPI
if the team prefers Python. Do not create two backends without a clear
need. - Database: PostgreSQL. - ORM: Prisma for TypeScript or SQLAlchemy
for FastAPI. - AI: provider-agnostic LLM interface with schema-validated
structured output. - Matching: deterministic rules, not an opaque
model. - Speech/telephony: adapter interfaces only; no live integration
in MVP.

Suggested modules: `auth`, `organisations`, `users`, `products`,
`leads`, `permissions`, `conversations`, `transcripts`, `extraction`,
`matching`, `reviews`, `analytics`, `exports`, `audit`.

Engineering principles: - Tenant isolation from day one. - Server-side
validation and strict types. - Secrets in environment variables, never
frontend or Git. - Synthetic fixtures and seed data. - Migrations and
automated tests. - Logs must not expose customer-sensitive data. -
Loading, error and empty states. - All visible controls must work. - If
no AI key exists, deterministic mock responses must keep the demo
functional.

## 11. Initial data model

-   Organisation: `id, name, created_at`
-   User: `id, organisation_id, name, email, role, status, created_at`
-   Product:
    `id, organisation_id, name, category, approved_description, attributes_json, disclaimers, status, updated_at`
-   Lead:
    `id, organisation_id, first_name, phone_number, category, source, enquiry_date, preferred_language, permission_status, permission_timestamp, permission_source, permission_reference, do_not_call_status, status, created_at`
-   Conversation:
    `id, organisation_id, lead_id, mode, status, started_at, ended_at, language, provider`
-   TranscriptSegment:
    `id, conversation_id, speaker, text, timestamp, confidence`
-   NeedProfile:
    `id, conversation_id, purpose, amount_range, timeline, preferences_json, interest_status, callback_time, missing_fields_json, extraction_version`
-   Evidence:
    `id, need_profile_id, field_name, transcript_segment_id, evidence_text, source_type, confidence`
-   ProductMatch:
    `id, conversation_id, product_id, match_status, explanation, missing_information_json, human_review_status`
-   Review:
    `id, conversation_id, reviewer_user_id, corrected_summary, outcome, next_action, reviewed_at`
-   AuditEvent:
    `id, organisation_id, user_id, action, entity_type, entity_id, timestamp, redacted_metadata_json`

Enforce organisation scoping for all tenant data, foreign keys and
appropriate indexes.

## 12. Acceptance criteria

MVP demo is ready when: 1. Admin can sign in and access a demo
organisation. 2. User can import synthetic CSV and see row-level errors.
3. Leads missing required permission metadata are blocked from any
calling workflow. 4. Admin can configure sample lender products. 5. User
can run a clearly labelled simulated conversation. 6. Need profile
fields have evidence and confidence. 7. Unknown data remains unknown. 8.
Matching gives an explanation or "Insufficient information". 9. Every
match is labelled as requiring human review, not an eligibility
decision. 10. Human can edit summary, record outcome and set follow-up.
11. User can export reviewed results to CSV. 12. Opt-out status is
visible and cannot be silently overridden. 13. Tenant data is isolated.
14. Critical actions are audit logged. 15. Tests cover permission
blocking, tenant isolation, schema validation and matching rules.

## 13. Metrics to evaluate

-   Permission metadata completeness
-   Conversation completion rate (simulation and live reported
    separately)
-   Structured-field completion rate
-   Human correction rate
-   Summary acceptance rate
-   Percentage of profiles judged useful by sales staff
-   Time per lead compared with current process
-   Follow-up completion rate
-   Opt-out and complaint rates
-   Incorrect/unsupported statement rate
-   Human escalation rate
-   Product-match override rate

A pilot is promising only if users find profiles useful, extraction
quality is acceptable, customer experience is protected and the workflow
passes lender review. Do not invent conversion uplift claims before
measuring a baseline.

## 14. What the founders must do themselves

Claude Code can build software. It cannot validate the business, win
lender trust, secure permissions or make product decisions.

1.  Choose one starting loan category and one workflow.
2.  Interview 10--15 people: callers, team leaders, sales operations
    managers, contact-centre heads and lending sales heads.
3.  Map the current process from lead receipt to call, qualification,
    CRM entry and follow-up.
4.  Ask for ranges on lead volume, connect rate, qualification rate,
    agent time, follow-up rate and current tool costs.
5.  Find one design partner willing to review the prototype and share an
    anonymised workflow.
6.  Obtain authorised scripts, product catalogue details and rules from
    the partner; do not invent lender terms.
7.  Ask the partner's legal/compliance team and qualified counsel to
    review the proposed workflow before live use.
8.  Define pilot baseline and success criteria before testing.
9.  Test Hindi and English with varied accents and code-switching.
10. Validate pricing with buyers only after understanding their budget
    and procurement process.

Questions founders must answer: - Which exact loan category first? - Are
we qualifying fresh enquiries, abandoned applications or
customer-requested callbacks? - Who owns the budget? - What system is
the source of truth for leads? - What does "qualified lead" mean to this
lender? - What information is necessary---and what must never be
collected? - What is the current process costing? - What evidence would
make a lender trust the AI-generated profile? - What would block
compliance/procurement approval? - What measurable result would justify
paying for SVARA?

## 15. Suggested two-week founder sprint

  -----------------------------------------------------------------------
  When                    Founder action          Output
  ----------------------- ----------------------- -----------------------
  Days 1--2               Choose one loan         One-page problem
                          category and workflow   hypothesis

  Days 2--5               Contact 30--40 relevant Outreach tracker
                          professionals through   
                          alumni, referrals and   
                          LinkedIn                

  Days 4--9               Conduct 8--12           Interview notes and
                          interviews across       workflow map
                          users, managers and     
                          buyers                  

  Days 7--10              Identify repeated pain  Ranked problem list
                          points                  

  Days 10--12             Show prototype to 3--5  Feedback and usability
                          interviewees            notes

  Days 12--14             Seek a design partner   Pilot discussion
                          and agree next steps    
  -----------------------------------------------------------------------

Interview counts alone are not validation. Look for repeated evidence of
a costly problem, a clear buyer, access to the workflow and willingness
to test or pay.

## 16. Instructions for Claude Code

Act as the senior product engineer for SVARA AI.

### Start by

1.  Inspect the existing repository and report framework, structure and
    current state.
2.  Do not overwrite working code before understanding it.
3.  Convert this PRD into an implementation plan and task checklist.
4.  List ambiguities and conservative assumptions in `ASSUMPTIONS.md`.
5.  Create/update `README.md`, `PRD.md` and `BUILD_STATUS.md`.
6.  Build in small milestones; run lint, type checks and tests after
    each milestone.
7.  Use synthetic data and a polished demo experience.
8.  Do not add production telephony or live calling in this MVP.
9.  Never claim the product is compliant or production-ready.

### First build milestones

1.  App shell, authentication mock and demo organisation.
2.  Lead dashboard, synthetic records and CSV import/validation.
3.  Product catalogue editor.
4.  Conversation simulator with scenarios.
5.  Evidence-backed structured need profile.
6.  Transparent rule-based product matching.
7.  Human review, outcomes and CSV export.
8.  Basic analytics and critical tests.

### Design direction

Premium, trustworthy B2B fintech. Dark navy base, restrained cyan/blue
accents, clean typography, generous spacing, responsive desktop-first
dashboard, readable tables, clear statuses and useful empty states.
Avoid generic chatbot styling, excessive gradients and decorative
controls.

### Development rules

-   Prefer maintainable code over unnecessary infrastructure.
-   Use strict types and schema validation.
-   Keep AI calls behind a provider interface.
-   Use deterministic mocks if no API key is configured.
-   Never expose secrets.
-   Never use real personal data in seed files.
-   Add loading, error and empty states.
-   Document local setup and environment variables.

### At the end of each milestone, tell the founders

1.  What was built.
2.  How to run and test it.
3.  Assumptions made.
4.  Decisions requiring founder input.
5.  What founders must do outside the codebase next.
6.  The next recommended engineering milestone.

**Begin by inspecting the repository and proposing the implementation
plan. Do not generate the entire application in one pass.**
