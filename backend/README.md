# ClickMart API

Express 5 + TypeScript. Data lives in **Supabase** (PostgreSQL) and is reached through Supabase's REST API with `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`. No database password or connection string is needed.

## Set up with Supabase

1. **Create or update the tables.** Supabase dashboard → SQL Editor → paste all of [`supabase/schema.sql`](supabase/schema.sql) → Run. It is safe to run on the project you already have: missing tables are created, missing columns are added, and your products and orders stay. Then it installs the functions, security rules, report views, starter settings and the `product-images` bucket.
2. **Fill `backend/.env`** (copy `.env.example`): `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, two long random `JWT_*` secrets, and `SEED_ADMIN_PASSWORD`.
3. **Load the catalogue and admin account:** `npm install && npm run db:seed`
4. **Run:** `npm run dev` → http://localhost:3000

Key rules: the service key stays on the server only. Row Level Security is on for every table with no policies and the functions are executable by `service_role` only, so the public publishable/anon key can read and call nothing.

## Why some logic is in SQL functions

Supabase's REST API cannot run multi-step transactions. The steps that must be all-or-nothing live in Postgres functions (section 11 of `schema.sql`) that the API calls with `rpc`: `create_order` (reserves stock, claims the coupon, writes the order), `adjust_stock`, `mark_paid`, `fail_payment`, `change_order_status`, `finish_refund`, `expire_stale_orders`, plus `admin_analytics`, `customer_stats`, `order_status_counts`, `recompute_rating`. Locking is done by Postgres, so two shoppers can never buy the last pouch.

## Develop and test without touching your real project

`docker-compose.yml` runs a local stand-in for Supabase: Postgres + PostgREST behind a `/rest/v1` gateway on `http://localhost:54321`.

```bash
npm run db:local:reset   # fresh local database from supabase/schema.sql (needs Docker running)
npm test                 # 17 integration tests, always against .env.test (local stack only)
NODE_ENV=test npm run db:seed   # seed the local stack
```

`npm test` reads `.env.test` and refuses to run unless `SUPABASE_URL` is localhost, so tests can never write to a real project. To run the API itself against the local stack: `NODE_ENV=test npx tsx src/server.ts`.

## Login system (JWT)

- **Access token:** short-lived JWT (15 min), sent as `Authorization: Bearer`. The apps keep it in memory only.
- **Refresh token:** random, stored hashed in the database, delivered as an httpOnly SameSite cookie scoped to `/api/v1/auth`. Every page load calls `/auth/refresh` to restore the session; tokens rotate (the previous one stays valid for 30 s so an interrupted refresh can retry). Logout, password change/reset and blocking revoke them.
- **Passwords:** stored as `v2$` + bcrypt(cost 12) of `HMAC-SHA256(password, PASSWORD_PEPPER)`. Salted per user, slow to guess, and the pepper lives only in the server environment, so a stolen database alone cannot be cracked offline. Registration and reset require 8+ characters. Wrong email and wrong password give the same message and take the same time. Older plain-bcrypt hashes still work and are upgraded on the next login.
- **Keep `PASSWORD_PEPPER` safe:** generate with `openssl rand -hex 32`, back it up, never change it (changing it locks everyone out).
- **Transport:** in production every request must be HTTPS (plain GETs redirect, other methods get 426), HSTS is sent for 2 years, and cookies are `Secure`. JWTs are pinned to HS256 with an issuer check.
- **Seeded account:** `npm run db:seed` creates the admin from `SEED_ADMIN_NAME/EMAIL/PASSWORD` in `.env` (hash only; an existing account's password is never overwritten).
- **Forgot password:** `/auth/forgot-password` always answers the same way (no account discovery), emails a single-use link valid for 30 minutes (newer requests cancel older links); `/auth/reset-password` signs the user out everywhere. Links go to `STORE_URL` for customers and `ADMIN_URL` for staff.
- **Limits:** 20 failed log-ins/registrations per IP per 15 min, 8 reset requests, 300 refreshes.
- Dev: with no `SMTP_URL`, emails (including reset links) are printed in the API console.

## Money rules enforced server-side

- Prices, offers, coupons and shipping are recomputed from the database at checkout. Client totals are never trusted.
- Stock is reserved inside `create_order` (a conditional `UPDATE ... WHERE stock >= qty` under row locks). Cancel, failed payment and the 30-minute unpaid-order sweep restore it.
- Payment is confirmed only by an HMAC-verified callback or webhook, and is idempotent.
- Order lines snapshot name, size and price, so catalogue edits never change old orders.
- Tracking requires the order ID **and** the phone or email on the order.
- Roles: `STAFF` runs products, stock, orders, offers, banners and reviews. `ADMIN` also owns coupons, refunds, analytics, settings, staff accounts and the audit log.

## API (`/api/v1`)

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register, login, refresh, logout, change-password, forgot-password, reset-password` (15-minute access JWT in the body, kept in memory by the apps; rotating 30-day refresh token in an httpOnly cookie) |
| Catalogue | `GET /products` (category, sub, q, minPrice, maxPrice, size, availability, onSale, sort, page), `GET /products/:slug`, `GET /categories`, `GET /offers`, `GET /coupons/active`, `GET /banners`, `GET /settings/public`, `POST /cart/quote` |
| Reviews | `GET/POST /products/:slug/reviews` (new reviews are held for moderation) |
| Account | `GET/PATCH /me`, `/me/addresses`, `/me/wishlist`, `/me/cart` |
| Orders | `POST /checkout`, `GET /orders`, `GET /orders/:code`, `POST /orders/:code/cancel`, `GET /orders/:code/invoice`, `GET /track/:code?contact=` |
| Payments | `POST /payments/verify`, `/payments/fail`, `/payments/webhook` (raw body, signed), `/payments/mock/pay` (dev only) |
| Admin | `/admin/products`, `/variants/:id/stock`, `/inventory`, `/categories`, `/offers`, `/coupons`, `/banners`, `/reviews`, `/orders` (+ `/status`, `/refund`, `/invoice`), `/customers`, `/settings`, `/staff`, `/audit`, `/analytics`, `/summary`, `/uploads` |

## Payments

`PAYMENT_PROVIDER=mock` (default) simulates a gateway so the full flow works without keys: `POST /checkout` returns `payment.providerOrderId`, the storefront calls `/payments/mock/pay` to get a signed payment id, then `/payments/verify`. Set `PAYMENT_PROVIDER=razorpay` with `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` for real orders and refunds, and point Razorpay's webhook at `/api/v1/payments/webhook`.

## Not done yet

- Storefront and admin UI: the admin is connected; the storefront still reads local data.
- Email is logged to the console until `SMTP_URL` is set.
- Courier integration (Shiprocket etc.): status and tracking number are entered by hand in the admin.
