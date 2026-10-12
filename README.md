# Ijara

Property management for letting offices in Oman. Arabic first, English supported, mobile first.

> **This build is a Functional V1 Validation Environment.**
> WhatsApp, SMS, email and the payment gateway are **simulated**.
> The one-time code is **fixed to `123456`** in demo mode.
> The final contracted production implementation may use different infrastructure and real integrations.

Ijara covers the whole journey of a letting office: owners, buildings, units, tenants, contracts, post-dated cheques, rent schedules, receipts, maintenance, move-outs and inspections, owner statements, notifications, audit trail, staff and permissions. Everything is database backed and works end to end; nothing in the UI is a mock.

## Contents

1. [Quick start](#quick-start)
2. [Demo accounts and the fixed OTP](#demo-accounts-and-the-fixed-otp)
3. [Technology and architecture](#technology-and-architecture)
4. [Environment variables](#environment-variables)
5. [Neon, migrations and seeding](#neon-migrations-and-seeding)
6. [Deploying to Vercel](#deploying-to-vercel)
7. [Simulated integrations](#simulated-integrations)
8. [PWA behaviour](#pwa-behaviour)
9. [Project structure](#project-structure)
10. [Testing](#testing)
11. [Important domain rules](#important-domain-rules)
12. [Known limits of this validation build](#known-limits-of-this-validation-build)

## Quick start

Requires Node 20 or newer.

```bash
npm install
npm run dev
```

With no `DATABASE_URL`, Ijara uses an embedded Postgres (PGlite) stored in `.data/pglite`. It migrates itself and loads the fictional demo data on first start, so the app is usable immediately at http://localhost:3000. Only one process can use the embedded database at a time.

To start again from clean demo data: `npm run db:reset` (stop the dev server first).

## Demo accounts and the fixed OTP

All demo passwords are `Ijara-Demo-2026`. On the login screen, when `DEMO_MODE=true`, a discreet chooser fills the form for you. The chooser never appears when `DEMO_MODE` is not `true`.

| Role | Sign in with | Notes |
| --- | --- | --- |
| Platform administrator | `platform@ijara.demo` | Sees offices and counts only. No tenant or financial data. |
| Manager / Admin | `manager@alsahil.demo` | Full oversight of Al Sahil Property Management |
| Accounts / Cheque officer | `accounts@alsahil.demo` | Cheques, payments, receipts |
| Maintenance team | `maintenance@alsahil.demo` | Also `yousuf@alsahil.demo` |
| Contracts staff | `contracts@alsahil.demo` | Tenants, contracts, renewals, move-outs |
| Tenant (active) | ID card `12345678` | Portal at `/portal/login` |
| Tenant (not activated) | ID card `87654321` | Use `/portal/activate` and code `123456` |
| Second office (isolation check) | `manager@muscatgate.demo` | Cannot see Al Sahil data |

**OTP:** every demo OTP flow (tenant activation, password reset, staff two-factor, staff password reset) accepts `123456`. The value lives in one place, `src/lib/demo.ts`. The OTP screens behave like real ones: six boxes, resend timer, expiry, three attempts, rate limit per phone.

The seeded data is fictional and relative to the day it was loaded: paid, due and bounced cheques, vacant and occupied units, a unit under inspection and one awaiting approval, contracts expiring soon, open and completed maintenance, four owners (one with zero commission), five buildings, 32 units.

## Technology and architecture

| Concern | Choice | Why |
| --- | --- | --- |
| Framework | Next.js 16, App Router, React 19, TypeScript strict | Server components, server actions, runs well on Vercel |
| Database | PostgreSQL (Neon in the cloud, PGlite locally) | Exact integers, transactions, constraints, triggers |
| ORM | Drizzle | Schema and code cannot drift; migrations are reviewable SQL files |
| Money | Whole baisa integers (`bigint`), BigInt arithmetic for rates | No floating point anywhere in the money path |
| Auth | Own session layer: scrypt password hashes, hashed session tokens in the database, httpOnly cookies | Two separate identity surfaces (staff and tenants) as the proposal requires |
| UI | Tailwind CSS 4, Radix primitives, a custom design system | Accessible foundations, custom look |
| PDFs | HTML to PDF through headless Chromium (`puppeteer-core`, `@sparticuz/chromium` on Vercel) | Best Arabic shaping; IBM Plex Sans Arabic is embedded |
| Files | Postgres by default, Vercel Blob optional, behind one interface | Works everywhere, no extra service |
| Validation | Zod at every server action boundary | Typed, field level errors |
| Tests | Vitest (domain, database, security) and Playwright (browser) | Money and isolation are tested, not asserted |

Layers:

- `src/domain`: all business rules and calculations. Pure functions (`finance.ts`, `machines.ts`, `permissions.ts`) and services that take a database handle and a context (organisation, actor, role). Nothing in `domain` knows about React or HTTP.
- `src/app`: pages and server actions. Pages read through the domain layer; every mutation goes through `src/lib/action.ts`, which authenticates, checks the permission and validates before calling a service.
- `src/integrations`: the simulated messaging providers behind one interface.

**Multi-tenancy.** Every business table carries `org_id`; every service query filters by the organisation of the caller, which comes from the session, never from the request. A test asserts that every business table has an organisation column and that every service refuses another office's record IDs. Tenant portal reads are anchored on the session's tenant ID in the same way. See [limits](#known-limits-of-this-validation-build) regarding Postgres row-level security.

## Environment variables

See `.env.example` for the documented list.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string. Empty means embedded PGlite (local only). |
| `AUTH_SECRET` | Long random string. |
| `NEXT_PUBLIC_APP_URL` | Public base URL used in links inside messages. |
| `DEMO_MODE` / `NEXT_PUBLIC_DEMO_MODE` | `true` enables the fixed OTP, the demo account chooser and the simulated gateway controls. |
| `STORAGE_DRIVER` | `db` (default) or `blob`. |
| `BLOB_READ_WRITE_TOKEN` | Required when `STORAGE_DRIVER=blob`. |
| `CHROME_PATH` | Optional path to Chrome or Edge for local PDF generation. |
| `CRON_SECRET` | Protects `/api/cron/daily`. |

## Neon, migrations and seeding

1. Create a project at neon.tech. Copy the **pooled** connection string (the host contains `-pooler`).
2. Put it in `.env.local` as `DATABASE_URL`.
3. Apply migrations and load the demo data:

```bash
npm run db:setup
```

Or separately: `npm run db:migrate` and `npm run db:seed`. `db:seed` refuses to run on a database that already has data; `npm run db:seed -- --force` or `npm run db:reset` wipes and reloads (never run on a shared database).

Migrations live in `drizzle/`. `0000_init.sql` is generated from `src/db/schema.ts` by `npm run db:generate`. `0001_guarantees.sql` is hand written and holds guarantees the database enforces on its own: the append-only audit log, immutable receipts, money check constraints, and the unique indexes that prevent a double payment or two active contracts on one unit.

## Deploying to Vercel

1. Push the repository and import it in Vercel.
2. Set the environment variables above (`DATABASE_URL` from Neon, `AUTH_SECRET`, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`, `DEMO_MODE=true`, `NEXT_PUBLIC_DEMO_MODE=true`).
3. The build command is the default `vercel-build` script: it applies migrations when `DATABASE_URL` is set, then builds.
4. Load the demo data once from your machine with the same `DATABASE_URL`: `npm run db:seed`.
5. `vercel.json` registers a daily cron (`/api/cron/daily`) for cheque due dates, contract expiry alerts, rent reminders and held messages. The same job can be triggered by a manager from Messages, "Run daily job now".

Notes: uploaded files are stored in Postgres so nothing depends on the local file system. PDFs use `@sparticuz/chromium` on Vercel; `next.config.ts` includes the fonts and the browser binary in the PDF routes. Set the function region close to your Neon region.

## Simulated integrations

All outgoing messages go through `src/domain/notifications.ts` and the provider interface in `src/integrations/providers.ts`. Each message gets one delivery record with channel, status, recipient, attempt trail and idempotency key, visible in **Messages**. The tenant also gets an in-app copy.

- Channel order is WhatsApp, then SMS, then email. OTP codes are SMS only. Switch WhatsApp off in Settings to see every message arrive by SMS.
- The same idempotency key never sends twice.
- Quiet hours (optional) hold non-urgent tenant messages.
- Production replaces the three provider classes with Tamimah (SMS), Meta WhatsApp Business and Resend. The contract each provider must satisfy is documented at the top of `providers.ts`.

The online payment gateway is simulated by `/portal/pay/[id]`: the tenant pays, then in demo mode chooses Simulate success or Simulate failure. The business consequences are real: schedule item, payment, gap-free receipt, audit entry, dashboard and owner figures. Security cheques cannot be paid through this path.

## PWA behaviour

- Web app manifest, original icons (192, 512, maskable, Apple touch icon, SVG favicon), standalone display, theme colour.
- Service worker (`public/sw.js`): static assets cache first, page navigations network first with an offline screen, no caching of authenticated pages, API or uploads.
- iPhone: Safari has no install API, so after the second visit Ijara shows a short Share then Add to Home Screen instruction, at most once a month. Android shows the browser install prompt the same way.
- Safe areas are respected in the top bars, bottom navigation, drawers and sheets.

## Project structure

```
drizzle/            SQL migrations (generated + hand written guarantees)
e2e/                Playwright journeys (desktop and iPhone viewport)
public/             manifest icons, service worker
scripts/            migrate, seed, reset, asset generation, em dash check
src/app/            routes: (auth), (staff), (platform), portal, api
src/app/actions/    server actions grouped by area
src/components/     design system (ui/), shells, brand, status badges
src/db/             schema, client (Neon or PGlite), seed
src/domain/         business rules and services
src/i18n/           English and Arabic dictionaries (type checked for parity)
src/integrations/   simulated messaging providers
src/lib/            money, dates, phone, passwords, storage, PDF, sessions
tests/              Vitest suites
```

## Testing

```bash
npm run typecheck
npm run lint
npm test                # 96 Vitest tests, in-memory Postgres
npm run test:e2e        # Playwright with Microsoft Edge, desktop and iPhone viewports
npm run check:dashes    # fails if an em dash appears anywhere
npm run build
```

The Vitest suites cover money conversion, owner payout and gateway-fee modes, management fee rounding, security cheque exclusion, receipt numbering (including simultaneous issuance and rollback), void with credit note and immutability, the three state machines (illegal transitions refused), contract and renewal-cap behaviour, move-out to inspection to approval, simulated payment success and failure, OTP `123456` behaviour and lockout, organisation isolation, tenant isolation, role authorization, messaging idempotency and fallback, and CSV import (validation, atomicity, rollback). The receipt concurrency test uses the same row lock as production; PGlite serialises connections, so run it against Neon with `DATABASE_URL` to see true parallel sessions.

## Important domain rules

- **Money** is stored as whole baisa. `net to owner = rent collected - maintenance costs - management fee`, computed in exactly one function (`computeOwnerStatement`). Optional VAT line on the management fee, off by default.
- **Security cheques** are a separate table with no rent schedule item, payment or receipt. They cannot reach collected rent, the dashboard figure or owner payout, structurally.
- **Receipts** are numbered per owner from a counter row locked inside the issuing transaction: no gaps, no duplicates, rollback safe. Issued receipts are immutable (database trigger). Correction is void plus a credit note with the next number in the same series.
- **Unit lifecycle**: available, reserved, occupied, notice given, vacated, under inspection, inspected, approved by the manager, available. Only maintenance records the inspection; only the manager approves.
- **Maintenance**: submitted, seen, assigned, in progress, completed, cost logged, posted to the owner report. A request cannot close until a cost is recorded (zero allowed); the cost reaches owner statements automatically.
- **Cheques**: received, due, deposited, collected or bounced, follow-up, collected or written off. A bounced cheque raises an urgent alert and heads the manager dashboard.
- **Rent increase cap** is resolved unit, then owner, then office. Above the cap the renewal is warned and needs a manager reason, audited.
- **Tenants** see Upcoming, Due, Paid or Action needed only. A bounced cheque is shown as Action needed. Never costs, owner data, internal notes or the security cheque.
- **Nothing is ever deleted** from the interface: records are archived; the audit log is append only (database trigger).

## Known limits of this validation build

- Organisation isolation is enforced by scoped queries in the domain layer plus tests, not by Postgres row-level security. The proposal specifies RLS; the production implementation should add it as a second layer.
- Messaging, payment gateway and OTP are simulated as described above.
- No real-time push: the in-app bell updates on navigation and refresh.
- No Hijri dates, no virus scanning of uploads, no Grafana, backups or monitoring stack (infrastructure items for production).
- The organisation logo is stored and shown in settings; documents use the Ijara mark.
