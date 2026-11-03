# SVARA AI — Demo MVP

Credit-need intelligence for bank and NBFC lending-sales teams. SVARA structures what a
customer said about their credit need, links every field to transcript evidence, suggests
lender-approved products with the reason for each, and hands a brief to a human reviewer.

> **Demo only.** Synthetic data and simulated conversations. No live calls are placed.
> This software is not compliant or production-ready and is not an underwriting,
> credit-scoring or loan-approval system.

## Run it locally (Windows, macOS or Linux)

Requires **Node.js 20.9 or newer** (check with `node -v`).

```bash
npm install
npm run dev
```

Open http://localhost:3000. The first `npm run dev` creates `data/svara.db` and fills it
with fictional demo data. Pick a demo user on the sign-in screen.

| Command | What it does |
|---|---|
| `npm run dev` | Start the app (creates the demo database on first run) |
| `npm run db:reset` | Wipe and re-seed the demo database — use before every demo |
| `npm run check` | Lint + type check + tests |
| `npm test` | Tests only |
| `npm run build && npm start` | Production mode — requires `SESSION_SECRET` in `.env.local` |

## What's in the demo

| Area | What it does |
|---|---|
| **Leads** | Synthetic leads, CSV import with row-level validation and duplicate detection, a server-enforced permission gate, permanent opt-out suppression, pilot-batch approval |
| **Product catalogue** | Lender-approved products: purposes, amount and tenure ranges, disclaimers, prohibited statements |
| **Simulator** | 8 scripted scenarios plus "play the customer". English, Hindi and Hinglish; silence, interruption, questions, opt-out, escalation |
| **Credit-need profile** | Each field has a value, confidence, source (customer-stated, AI-inferred or unknown) and linked transcript evidence |
| **Matching** | Deterministic rules; up to 3 suggestions with reasons, conflicts and gaps, or "Insufficient information" |
| **Review & export** | A human edits the summary, corrects fields, rates suggestions and sets follow-ups; every change is audited; CSV export masks phone numbers |
| **Analytics** | Outcomes, leads by status, stated purposes, missing information, opt-outs, escalations, reviewer corrections |

See `DEMO_SCRIPT.md` for the 5-minute lender walkthrough.

## Demo users

| User | Organisation | Role |
|---|---|---|
| Priya Nair | Kaveri Capital Finance (Demo NBFC) | Organisation Admin |
| Rohan Mehta | Kaveri Capital Finance | Manager |
| Ananya Kulkarni | Kaveri Capital Finance | Agent |
| Imran Shaikh | Kaveri Capital Finance | Read-only Analyst |
| Kavya Iyer | Northbridge Bank (Demo) | Organisation Admin — second tenant, proves isolation |

## Environment variables

Copy `.env.example` to `.env.local`. Everything is optional for local development.

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `file:./data/svara.db` | SQLite database file |
| `SESSION_SECRET` | dev fallback | Signs session cookies. **Required** in production mode |
| `LLM_PROVIDER` | `mock` | `mock` keeps the demo working offline. `anthropic` uses `ANTHROPIC_API_KEY`, and falls back to the mock if the output fails validation |

## Project layout

```
src/
  app/            Next.js routes. (app)/ = signed-in area; actions/ = server actions
  components/     UI primitives (ui.tsx), sidebar, brand
  db/             Drizzle schema, enums, client, migrations runner, seed data
  lib/            Domain logic: auth, audit, users, leads, products, conversations,
                  conversation/ (parser, dialogue engine, scenarios), extraction/
                  (schema, mock, provider), matching, summary, exports, analytics
drizzle/          SQL migrations (generated with `npm run db:generate`)
scripts/          db-reset, ensure-db
tests/            Vitest suites
```

**Rules every module follows:** all reads and writes go through `lib/*` service functions
that take a `TenantContext` and filter by `organisationId`; permissions are checked
server-side with `assertCan`; critical actions call `recordAudit`, which redacts
sensitive values.

See `BUILD_STATUS.md` for progress and `ASSUMPTIONS.md` for open decisions.
