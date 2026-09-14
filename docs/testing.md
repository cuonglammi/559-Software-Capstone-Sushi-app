# Requirement coverage and acceptance checks

The proposal's functional scope is implemented using Django form endpoints and service tests rather than a separate REST frontend and Newman/Vitest tooling. Django tests provide equivalent business-rule and request/response coverage; Playwright provides browser regression coverage. The repository does not claim a completed production security or WCAG certification.

| Proposal requirements | Implementation | Automated coverage |
| --- | --- | --- |
| FR-A1–A4 | Staff sign-in, password policy/change, 15-minute idle expiry | Login, role, password, hash, idle/poll, throttle tests |
| FR-P1–P2 | Profile view and full-name update | Profile persistence and privilege-injection tests; browser profile edit |
| FR-D1, D3; FR-U9 | Tables, capacity, server-owned sessions, AYCE and timestamps | Session validation and unique active-table constraint |
| FR-D2; FR-U1–U4 | Menu categories, descriptions, price, optional image URL and bundled illustration, availability, search/filter/sort | Menu query and SQL injection tests; browser filtering |
| FR-D4–D5; FR-U5–U8 | Session cart, quantities 1–10, notes, price snapshots, order submission and confirmation | Cart calculation/edit/remove, invalid quantity, snapshot, idempotency, escaped notes, browser order flow |
| FR-U10–U11 | Active sessions with orders and controlled closure | Role checks, open-order guard, closed-session rejection; browser closure |
| FR-U12–U14 | Kitchen queue, five-second polling, sequential preparation/completion | Transition rules/item status, browser live arrival and completion |
| NFR-1 | Friendly form/error pages, saved cart after failed checkout, server exception logs | Failed checkout retains cart and hides exception details |
| NFR-2–NFR-4 | Parameterized ORM, salted PBKDF2, auto-escaping and CSP | Injection inputs, hashing, escaped notes, header assertions |
| NFR-5–NFR-6 | Production HTTPS redirect, secure cookies, CSRF and database sessions | Redirect/cookie assertions, deployment checks, CSRF rejection and idle tests |
| NFR-7–NFR-9 | High-contrast palette, visible focus, labels, scalable type, responsive layouts | Playwright viewport and 200% text-scale tests; manual visual checks |

## Explicit design decisions

- AYCE makes all menu items zero-priced for that session; stored menu prices support regular dining. The seed includes the proposal's California Roll, Salmon Nigiri, and Green Tea.
- A table cannot close while orders are pending/in progress. The app shows a recoverable message instead of abandoning kitchen work.
- `Cancelled` is represented in the schema but has no customer cancellation action; the proposal's required actions only specify preparation and completion.
- External payment and delivery are excluded. There is no tax, tip, or billing calculation.
- Order-item preparation status follows the containing order. Independent per-item completion is not part of the specified workflow.
- Customer links are shared secrets; reopening a table creates a new link. No customer identity information is collected.

## Before deployment acceptance

- Run the full suite against the production-compatible PostgreSQL version.
- Verify HTTPS redirect and cookie attributes on the actual deployed hostname.
- Run an authenticated OWASP ZAP scan against a test deployment, including both staff roles and a table link. Resolve findings before restaurant use. No scan has been claimed from local unit tests.
- Run axe-core on login, profile, menu, cart, server, and kitchen screens, then manually check keyboard/focus order, contrast, long notes, text zoom and real tablet orientations. Viewport assertions do not alone prove WCAG conformance.
- Exercise simultaneous submissions/closure on PostgreSQL under anticipated traffic. SQLite cannot validate PostgreSQL locking behavior.
- Confirm table link handling with restaurant staff, provision unique accounts, and verify backups and recovery procedures.

## HTTP surface

Staff: `/login/`, POST `/logout/`, `/profile/`, `/profile/password/`, `/tables/`, `/tables/new/`, POST `/tables/<id>/close/`, `/kitchen/`, POST `/kitchen/<id>/status/`.

Customer: `/table/<token>/`, POST `add/<item>/`, `cart/`, POST `cart/<item>/`, POST `checkout/`, `order/<id>/` relative to the table URL.

JSON: GET `/api/queue/` requires a staff login. Background requests send `X-Background-Poll: 1` so polling does not defeat idle expiry.
