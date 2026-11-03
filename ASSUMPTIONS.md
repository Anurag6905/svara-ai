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
