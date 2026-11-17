# Sushi Order Application

Web-based in-restaurant ordering system (Software Capstone). Customers browse a
digital menu and order from their table; Servers manage table sessions; Kitchen
Staff work a live order queue.

## Run it

```bash
npm install
npm start
```

Then open http://localhost:3000.

- **Staff login:** `/login.html` — seeded test accounts: `server01` / `Srvr@123` (Server) and `kitchen01` / `Kitch3n@123` (Kitchen Staff).
- **Server dashboard:** open a table session (guest count + AYCE), see active sessions and their orders, close sessions.
- **Customer menu:** table-specific URL `/t/<tableNumber>` (e.g. `/t/12`) — works only while that table has an active session. Search, filter by category, sort, cart with quantities (1-10) and notes, submit to kitchen.
- **Kitchen queue:** `/kitchen.html` — live queue (auto-refresh), Pending → In Progress → Completed, with validated transitions.
- **Profile:** `/profile.html` — view role, update full name, change password (policy enforced).

## Tests

```bash
npm test
```

Vitest unit tests cover UT-01 to UT-05 from the Milestone 4 testing plan
(password policy, idle timeout, cart totals/quantities, menu search/filter/sort,
order status transitions).

## Stack and design

- **Backend:** Node.js + Express, REST APIs under `/api`.
- **Database:** SQLite via Node's built-in `node:sqlite`, prepared statements
  everywhere (NFR-2). Schema follows the Milestone 4 ERD: `UserAccount`,
  `RestaurantTable`, `TableSession`, `CustomerOrder`, `MenuCategory`,
  `MenuItem`, `OrderItem` (junction). The DB file lives in `data/` and is
  seeded on first start.
- **Auth:** bcrypt-hashed passwords with salt (NFR-3), session regeneration on
  login, HttpOnly/SameSite cookies, 15-minute idle timeout enforced server-side
  (FR-A4, NFR-6).
- **Security:** helmet CSP headers; all dynamic text rendered with
  `textContent`, never HTML injection (NFR-4); HTTPS redirect when deployed
  behind a TLS-terminating proxy such as Render (NFR-5).
- **Accessibility/responsive:** rem-based sizing, labeled controls, visible
  focus, AA-contrast palette, layouts from 320px up (NFR-7 to NFR-9).

## Deployment (Render)

Set `NODE_ENV=production` and `SESSION_SECRET` in Render's environment. The
app listens on `PORT`. For the proposed Render Postgres setup, the SQLite data
layer in `src/db.js` is the single integration point to swap for `pg`.
