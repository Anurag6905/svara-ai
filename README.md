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
| `LLM_PROVIDER` | `mock` | From Milestone 5. `mock` keeps the demo working offline |

## Project layout

```
src/
  app/            Next.js routes. (app)/ = signed-in area; actions/ = server actions
  components/     UI primitives (ui.tsx), sidebar, brand
  db/             Drizzle schema, enums, client, migrations runner, seed data
  lib/            Domain logic: auth (rbac, sessions), audit, users, tenant context
drizzle/          SQL migrations (generated with `npm run db:generate`)
scripts/          db-reset, ensure-db
tests/            Vitest suites
```

**Rules every module follows:** all reads and writes go through `lib/*` service functions
that take a `TenantContext` and filter by `organisationId`; permissions are checked
server-side with `assertCan`; critical actions call `recordAudit`, which redacts
sensitive values.

See `BUILD_STATUS.md` for progress and `ASSUMPTIONS.md` for open decisions.
