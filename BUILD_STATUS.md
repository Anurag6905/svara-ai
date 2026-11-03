# Build status

_Last updated: 3 Nov 2026_

| # | Milestone | Status |
|---|---|---|
| M0 | Foundation: scaffold, design system, docs, checks | ✅ Done |
| M1 | App shell, mock auth, demo orgs, 4 roles, tenant scoping, audit log | ✅ Done |
| M2 | Leads, synthetic records, CSV import & validation, permission gating, opt-out suppression | ⏭ Next |
| M3 | Product catalogue editor | ⬜ |
| M4 | Conversation simulator with scenarios | ⬜ |
| M5 | Evidence-backed structured need profile | ⬜ |
| M6 | Transparent rule-based product matching | ⬜ |
| M7 | Human review, outcomes, CSV export | ⬜ |
| M8 | Analytics, critical tests, demo script | ⬜ |

## PRD acceptance criteria (§12)

| # | Criterion | Status |
|---|---|---|
| 1 | Admin can sign in and access a demo organisation | ✅ M1 |
| 2 | Import synthetic CSV with row-level errors | M2 |
| 3 | Leads missing permission metadata are blocked | M2 |
| 4 | Admin can configure sample products | M3 |
| 5 | Clearly labelled simulated conversation | M4 |
| 6 | Need-profile fields have evidence and confidence | M5 |
| 7 | Unknown data remains unknown | M5 |
| 8 | Matching gives an explanation or "Insufficient information" | M6 |
| 9 | Every match labelled as requiring human review | M6 |
| 10 | Human can edit summary, record outcome, set follow-up | M7 |
| 11 | Export reviewed results to CSV | M7 |
| 12 | Opt-out visible and cannot be silently overridden | M2 / M4 |
| 13 | Tenant data is isolated | ✅ M1 (users, audit) — extended to every new table in each milestone |
| 14 | Critical actions are audit logged | ✅ M1 (auth, users) — extended in each milestone |
| 15 | Tests: permission blocking, tenant isolation, schema validation, matching | Partial: 16 tests (RBAC, sessions, isolation, redaction) |

## Last check run

`npm run check`: lint ✅, typecheck ✅, 16/16 tests ✅. `npm run build` ✅.
