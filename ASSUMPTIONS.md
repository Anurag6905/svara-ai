# Assumptions and open decisions

Conservative choices made while building. Each one should be confirmed or changed by the
founders. **Status:** ✅ confirmed by founders · 🟡 assumption, needs input.

| ID | Assumption | Why | Status |
|---|---|---|---|
| A-01 | There is no existing codebase; the project starts from scratch. | Founders confirmed, 3 Nov 2026. | ✅ |
| A-02 | The demo is built around **SME / business-loan enquiries**. Personal loans can be added as catalogue products. | Founders chose it. It matches the Meena persona, and purpose and amount are richer to capture. | ✅ |
| A-03 | **SQLite (libSQL) + Drizzle ORM** for the demo, not PostgreSQL + Prisma. | Founders chose SQLite to avoid setup on Windows. Prisma's engine binaries couldn't be downloaded in the build environment, so Drizzle (pure JS) is used. Moving to Postgres means porting `src/db/schema.ts` to `drizzle-orm/pg-core` and regenerating migrations; query code stays largely the same. Estimate: about 1 day. | ✅ |
| A-04 | **Mock sign-in** by picking a demo user. No passwords. Sessions are HMAC-signed cookies with a 12-hour expiry. | The PRD asks for an "authentication mock". A real deployment needs the lender's SSO (OIDC/SAML). | 🟡 |
| A-05 | Four roles with the permission split in `src/lib/auth/rbac.ts`. Analysts can export but cannot change records. Agents cannot import leads or approve pilot batches. | The PRD names the roles but not their exact powers. | 🟡 Confirm with a design partner |
| A-06 | Every organisation must keep at least one active admin. Users cannot deactivate themselves. | Prevents an organisation from locking itself out. | 🟡 |
| A-07 | Invited users can sign in straight away in the demo and become Active on first sign-in. No email is sent. | No email infrastructure in the MVP. | 🟡 |
| A-08 | Audit metadata redacts any key containing phone, email, text, transcript, otp, password or pin. | PRD §9 says logs must not expose sensitive data. Over-redaction is safer than under-redaction. | 🟡 |
| A-09 | A second demo tenant ("Northbridge Bank (Demo)") is seeded. | It lets tenant isolation be shown and tested. | 🟡 |
| A-10 | Times are displayed in IST, using the en-IN locale. | Indian market. | 🟡 |
| A-11 | All organisation and person names in seed data are fictional. | PRD: never use real personal data. | ✅ |
| A-12 | UI is monochrome: white surfaces and black primary, with colour used only for status. | Founders asked for black and white, 3 Nov 2026. | ✅ |
| A-13 | A lead may enter the simulator only when permission is GRANTED, the timestamp, source and evidence reference are present, and DND is CLEAR. An UNKNOWN DND status blocks. | Conservative reading of PRD §7.3 and §9. | 🟡 Confirm with compliance |
| A-14 | Opt-out is one-way: no service path reverses it. | PRD: never silently override an opt-out. A documented re-consent flow may be needed later. | 🟡 |
| A-15 | Phone numbers are masked in every screen and export. | Data minimisation for a demo. | 🟡 |
| A-16 | Extraction defaults to deterministic rules (`mock-rules-1.0`). An optional LLM provider must pass schema validation and evidence checks, otherwise the mock is used. Safety flags always come from rules. | Demo must work offline; never trust an unvalidated model. | 🟡 |
| A-17 | Loan category and preferred language are labelled AI-inferred unless the customer states them. | PRD: distinguish stated facts from inferences. | ✅ |
| A-18 | Matching is purpose-first: a product is suggested only if the stated purpose is one it is approved for. Amount outside the range is a conflict, never a disqualifier that's hidden. | Explainable, not a ranking of the customer. | 🟡 |
| A-19 | Reviewer corrections are stored alongside the original extraction, never overwriting it. | Auditability. | ✅ |
| A-20 | Demo content: 5 Kaveri products, 60 Kaveri leads, 12 Northbridge leads, 10 pre-run conversations (4 reviewed). | Makes the queue and analytics meaningful on first open. | ✅ |

