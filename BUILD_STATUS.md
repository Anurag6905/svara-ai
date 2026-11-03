# Build status

_Last updated: 3 Nov 2026_

All eight PRD milestones are built for the demo. This is **not** production-ready or compliant.

| # | Milestone | Status |
|---|---|---|
| M0 | Foundation, design system, docs, checks | ✅ |
| M1 | App shell, mock auth, demo orgs, 4 roles, tenant scoping, audit log | ✅ |
| M2 | Leads, synthetic records, CSV import & validation, permission gate, opt-out suppression | ✅ |
| M3 | Product catalogue editor | ✅ |
| M4 | Conversation simulator (8 scenarios + interactive) | ✅ |
| M5 | Evidence-backed structured need profile, provider interface | ✅ |
| M6 | Transparent rule-based product matching | ✅ |
| M7 | Human review, outcomes, follow-ups, CSV export | ✅ |
| M8 | Analytics, critical tests, demo script | ✅ |

## PRD acceptance criteria (§12)

| # | Criterion | Status | Where |
|---|---|---|---|
| 1 | Admin can sign in and access a demo organisation | ✅ | Sign-in |
| 2 | Import synthetic CSV with row-level errors | ✅ | Leads → Import · `tests/leads-csv` |
| 3 | Leads missing permission metadata are blocked | ✅ | `checkContactGate` · `tests/workflow` |
| 4 | Admin can configure sample products | ✅ | Product catalogue |
| 5 | Clearly labelled simulated conversation | ✅ | Simulator, conversation pages, analytics |
| 6 | Need-profile fields have evidence and confidence | ✅ | Conversation page · `tests/extraction-matching` |
| 7 | Unknown data remains unknown | ✅ | Schema rule + tests |
| 8 | Matching gives an explanation or "Insufficient information" | ✅ | `lib/matching` |
| 9 | Every match labelled as requiring human review | ✅ | Conversation page, export |
| 10 | Human can edit summary, record outcome, set follow-up | ✅ | Review form |
| 11 | Export reviewed results to CSV | ✅ | Review queue → Export |
| 12 | Opt-out visible and cannot be silently overridden | ✅ | One-way service path · `tests/workflow` |
| 13 | Tenant data is isolated | ✅ | `tests/tenant-isolation`, `tests/workflow` |
| 14 | Critical actions are audit logged | ✅ | Audit log |
| 15 | Tests: permission blocking, tenant isolation, schema validation, matching | ✅ | 61 tests |

## Last check run

`npm run check`: lint ✅, typecheck ✅, 61/61 tests ✅. `npm run build` ✅. Browser walkthrough (import → simulate → review → export → analytics) with no console errors.

## Known limitations

- Demo sign-in only. A real deployment needs SSO.
- SQLite. Moving to Postgres is a schema port (ASSUMPTIONS A-03).
- No telephony, speech-to-text or text-to-speech. The engine is text-only, and voice providers would plug in behind adapters.
- The rule-based extractor covers common English and Hinglish phrasings. Real speech needs testing with real accents.
- Complaint tagging and the incorrect-information rate need live reviewer input; there is a placeholder in analytics.

## Next engineering steps (after design-partner feedback)

1. Replace the mock extractor with an LLM provider, and evaluate it on 100+ labelled transcripts.
2. Port to Postgres, add SSO, and deploy to a private staging environment.
3. Add speech adapters (STT/TTS) for recorded-audio demos. Live telephony stays out until there is written lender approval.
