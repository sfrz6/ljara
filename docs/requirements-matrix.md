# Requirements matrix

Source of truth: `Ijara-Proposal.pdf` (text in `docs/proposal.txt`). Status: **Done**, **Partial** (works, with a stated limit) or **Deferred** (deliberately not in this validation build). "Tested" refers to the Vitest suites in `tests/` and the Playwright journeys in `e2e/`.

## Acceptance criteria (CR-14)

| Ref | Requirement | Status | Where | Tested |
| --- | --- | --- | --- | --- |
| 14.1 | Record a payment in 60 seconds, no training | Done | Cheques queue: one tap "Mark collected" on a due cheque; manual cash or transfer on the contract schedule | workflows.test |
| 14.2 | Collected cheque produces a numbered receipt sent to the tenant | Done | `domain/cheques.ts collectCheque`, `payments.ts recordPayment`, message `receipt_issued` | workflows.test |
| 14.3 | Bounced cheque on the manager dashboard immediately | Done | `bounceCheque` (urgent in-app alert), dashboard banner | workflows.test, e2e |
| 14.4 | Request, cost, owner statement with no re-entry | Done | `maintenance.ts logCost` auto-posts; `statements.ts` reads posted costs | workflows.test |
| 14.5 | Move-out to inspection to approval to available | Done | `contracts.ts completeMoveOut`, `maintenance.ts performInspection / decideInspection` | workflows.test |
| 14.6 | Statement for any range, correct totals, Arabic and English PDF | Done | `statements.ts`, `lib/pdf/documents.ts`, `/api/pdf/statement/[id]` | finance.test, workflows.test; PDFs checked visually |
| 14.7 | Every screen in Arabic with correct RTL | Done | `src/i18n` (types enforce key parity), logical CSS, flipped icons | e2e (RTL switch), screenshot review at 320 and 390px |
| 14.8 | A role cannot open another role's screen | Done | `domain/permissions.ts`, `requireStaff(permission)`, server actions | isolation.test, e2e role walls |
| 14.9 | Tenant: OTP, sign in, request with photo, watch status | Done | `/portal/*`, `domain/auth.ts`, `domain/portal.ts` | auth.test, e2e |
| 14.10 | Tenant cannot reach another tenant's record, even by changing the URL | Done | Portal reads anchored on session tenant; file and PDF routes check ownership | isolation.test, e2e |

## Client requirements (CR-1 to CR-12)

| Ref | Requirement | Status | Notes |
| --- | --- | --- | --- |
| 2.1 to 2.6 | Four staff roles, owner without login, tenant portal | Done | Permission matrix in `permissions.ts` |
| 2.7 | Data isolation enforced on the server | Done | Scoped queries plus tests. Postgres row-level security is **Deferred** (README lists it) |
| 3.1 to 3.3 | Buildings, units, filter by status | Done | Units list filters rented, vacant, under inspection |
| 4.1, 4.2 | Tenant and contract records | Done | ID document, signed contract upload |
| 4.3 | No registration workflow | Done | Sanad reference field only |
| 4.4 | Security cheque held, never income | Done | Separate table, no schedule item, payment or receipt; tested |
| 4.5 | Expiry alert; renew and move-out as one decision | Done | Contract detail banner, daily job alert, single decision card |
| 5.1, 5.2 | ID number sign in, office-created tenants, OTP activation and reset | Done | OTP fixed to 123456 in demo mode, single source `lib/demo.ts` |
| 5.3 to 5.6 | Portal: requests with photo, status, contract, schedule, receipts, phone first | Done | Statuses received, assigned, in progress, completed |
| 6.1 | Full cheque set in one entry generates the schedule | Done | Contract wizard |
| 6.2 | Reminder to tenant and alert to staff | Done | Daily job (`jobs.ts`), also runnable from Messages |
| 6.3, 6.4 | One-click collected or bounced; gap-free per owner receipts | Done | Counter row lock; concurrency and rollback tested (see README note on PGlite) |
| 6.5 | Collected against outstanding per building and unit | Done | Dashboard per building; building page; unit rows |
| 6.6 | No bank integration | Done | None built |
| 7.1 to 7.6 | Maintenance flow, costs by category, repeat failures | Done | Repeat-failure view is per unit and category (building shown), not a separate per-building rollup (**Partial**) |
| 8.1 to 8.5 | Owner statements, frequencies, PDF in both languages | Done | Share to WhatsApp and download recorded in audit |
| 9.1 to 9.4 | Notifications, channel fallback, log, idempotency | Done | Providers simulated by design |
| 10.1 | Manager can correct records, every correction audited | **Partial** | Owners, buildings, units, tenants, contract reference and documents, maintenance cost, receipts (void and credit note) are correctable. Contract dates and rent are corrected by cancelling an upcoming contract or recording a renewal, not by direct edit |
| 10.2, 10.3 | Commission per owner including zero; Arabic and English | Done | |
| 11.1 to 11.3 | Three state machines exactly as written | Done | `machines.ts`, tested exhaustively |
| 12.1 to 12.6 | Baisa integers, payout rule, receipts, phones, credentials, language | Done | `lib/money.ts`, `finance.ts`, `lib/phone.ts`, `lib/password.ts` |

## Modules (M-01 to M-14)

| Module | Status | Notes |
| --- | --- | --- |
| M-01 Foundation, multi-tenancy | Done / Deferred | Organisation root on every table, per-office configuration, provisioning by signup and platform admin. Row-level security deferred |
| M-02 Identity and access | **Partial** | Roles, user invite, deactivate, role change, forced sign-out, signed-in device list, optional two-factor (simulated code), lockout, uniform failures: done. SSO and passkeys are V2 |
| M-03 Localisation and documents | Done | Per-user and per-office language, Arabic PDFs with embedded IBM Plex Sans Arabic, Western digits, Gregorian dates |
| M-04 Owners, buildings, units | Done | Per-owner commission, payout frequency, receipt series; rent cap at office, owner and unit level |
| M-05 Tenants and contracts | Done | Duplicate detection on normalised phone and ID; renewal cap warning with audited override |
| M-06 Data import | Done | Templates, mapping, preview, duplicates, atomic commit, history, rollback of latest |
| M-07 Cheques, schedule, receipts | Done | Includes scan upload on cheques, void and credit note, online payment behind a per-office switch |
| M-08 Maintenance | Done | See 7.x above |
| M-09 Owner reporting | Done | VAT line available, off by default; gateway fee modes A, B, C |
| M-10 Notifications | **Partial** | Fallback, idempotency, quiet hours, templates in both languages. Retry with backoff applies only to real providers (all simulated here). In-app updates on navigation, not real time |
| M-11 Dashboards, analytics | **Partial** | Four role dashboards. Platform analytics are counts and active users per office; no feature-usage events |
| M-12 Audit | **Partial** | Append-only (database trigger), per-record history, viewer with filters, elevated class for financial and security events. Telemetry, Grafana, alerting and backups are production infrastructure, **Deferred** |
| M-13 Tenant portal | Done | Per-office toggle for schedule visibility; security cheque never shown |
| M-14 Administration | Done | Office, finance, rent cap, gateway fee, VAT, receipt defaults, categories, channels, quiet hours, message wording, staff |

## Decisions in section 16

| Ref | Decision | Status |
| --- | --- | --- |
| D1 | Platform administrator role | Done, holds no operational permission |
| D5, D6, D7 | Open Arabic font, Western digits, Gregorian | Done |
| D8 | Search | Done, global search limited to what the role may open |
| D9 | Muscat time zone | Done |
| D11 | Retention periods | **Deferred** (documented, not enforced by jobs) |
| D12 | Upload limits and types | Done (10 MB, 5 photos, type sniffing); no virus scan, as stated |
| D13 | Security policy | Done (OTP 6 digits, 10 minutes, 3 attempts; 12 hour staff and 30 day tenant sessions; lockout after 5 for 15 minutes; password 10 characters) |
| D15 | Last write wins with a stale-record warning | **Partial**: last write wins; the stale warning is not shown. State transitions do use optimistic checks (`concurrent_change`) |
| D16 | Nothing permanently deleted | Done: archive everywhere; only an import rollback removes rows, and it is audited |
| G4 | Former tenants keep read access for 12 months | Done |
| G7 | Bounced alert in-app at once | Done |
| G8 | Files behind permission-checked links | Done (`/api/files/[id]`) |
