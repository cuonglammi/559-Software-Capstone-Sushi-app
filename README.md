# Sakura Table · Sushi Order Application

A restaurant ordering application based on the Milestone 4 proposal. Servers open dining sessions, guests order from a table-specific menu, and kitchen staff prepare and complete orders. Built with Django 5.2, server-rendered HTML, and a relational database.

## Run locally

Requires Python 3.13 or 3.14. SQLite is included with Python; production uses PostgreSQL.

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export DJANGO_DEBUG=true
python manage.py migrate
```

Create demo accounts and sample menu/table records using a password you choose:

```sh
read -s DEMO_STAFF_PASSWORD
export DEMO_STAFF_PASSWORD
python manage.py seed_demo
unset DEMO_STAFF_PASSWORD
python manage.py runserver
```

Open http://127.0.0.1:8000. Sign in as `server01` or `kitchen01` with the password supplied above. It must contain at least eight characters, uppercase, lowercase, a number, and a special character. The seed command preserves existing accounts and does not reset passwords. Do not seed shared demo accounts into a real restaurant deployment.

To maintain staff accounts, tables, and menu availability, create an administrator with `python manage.py createsuperuser`, then visit `/admin/`. Assign each staff account its appropriate restaurant role. Operational history is read-only in admin.

## Try the workflow

1. Sign in as a server. Start a table session, choose a table, enter the guest count, and optionally enable AYCE.
2. Open the customer menu link on a separate table device or private browser window. Treat this link as a bearer credential: anyone holding it can order for that dining session.
3. Search, filter, and sort the menu; add quantities and optional notes; edit the cart and send it to the kitchen.
4. Sign in as kitchen staff in a separate browser context. New orders appear within five seconds. Start preparation, then complete the order.
5. Return to the server dashboard and close the table session. Outstanding orders must be completed first. Closed-session links cannot submit new orders.

Menu prices are in CAD. AYCE sessions charge zero per menu item; the restaurant settles any AYCE cover charge separately. Order totals are item totals, not tax-inclusive bills. There is no delivery or online payment integration.

## Tests

```sh
pip install -r requirements-dev.txt
python manage.py test ordering.tests
playwright install chromium
RUN_BROWSER_TESTS=1 python manage.py test
pip-audit -r requirements.txt
python manage.py makemigrations --check --dry-run
```

The backend suite covers authentication, role isolation, profile and password changes, timeout, table capacity, menu queries, pricing, quantity limits, duplicate submission, state transitions, closure, CSRF, SQL injection attempts, XSS escaping, and error recovery. Browser tests cover the complete workflow, live updates, profile editing, 320px/mobile/tablet layouts, and 200% text scaling. The browser suite requires Chromium process-launch permission.

CI uses PostgreSQL 17 and runs both suites, dependency auditing, migration checks, and Django deployment checks. See [testing and requirement coverage](docs/testing.md) for scope and remaining deployment verification.

## Architecture and security

- Django ORM, migrations, database-backed sessions, and salted PBKDF2 password hashes.
- Server and kitchen routes enforce roles. Customers use an unguessable UUID table-session link without registration.
- Session keys rotate at login; idle staff sessions expire after 15 minutes. Background queue polling does not extend staff activity.
- Five failed sign-in attempts per username in a 15-minute window cause temporary throttling.
- All form mutations use POST and CSRF tokens. Auto-escaped templates, a Content Security Policy, and a same-origin referrer policy protect rendered content and table-link privacy.
- Production defaults require a secret key, HTTPS redirects, secure/HttpOnly session cookies, and HSTS. `DJANGO_DEBUG=true` is only for local development.
- Orders snapshot names/prices. Transactional services and PostgreSQL row locks serialize submission, closure, and preparation changes. A unique active-session constraint prevents duplicate table use. SQLite is for local single-user development, not production concurrency.
- Menu results are grouped by category; sorting applies within each group. Repeated additions of the same dish combine quantities and use the most recent notes.
- The queue uses five-second polling. The other dashboards and order confirmation have explicit refresh links.

## Deployment

`render.yaml` is a proposed Render web service/PostgreSQL blueprint; it has not been deployed. It provisions paid resources, so review the plans before applying it.

Production configuration:

- `DJANGO_DEBUG=false`
- `DJANGO_SECRET_KEY`: long, randomly generated secret
- `DATABASE_URL`: PostgreSQL connection URL
- `DJANGO_ALLOWED_HOSTS`: your hostnames, comma-separated (Render's external hostname is included automatically)
- `TRUST_PROXY=true` only when a trusted reverse proxy overwrites `X-Forwarded-Proto`
- `CSRF_TRUSTED_ORIGINS`: full HTTPS origins if an additional trusted origin is needed

The build collects static assets, the pre-deploy step applies migrations, and Gunicorn serves the application. Create staff and menu data through the admin after deployment. Configure database backups, log retention, monitoring, and expired-session cleanup (`python manage.py clearsessions`) for ongoing operation.

Before real use, perform the deployed HTTPS/security scan and complete the accessibility acceptance checks in `docs/testing.md`.
