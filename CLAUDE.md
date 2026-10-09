# ClickMart

Online dry-fruits store for India: customer storefront, admin dashboard, REST API.

> **Keep this file current.** Update it in the same turn whenever you add or change a feature, route, script, env var, convention, port, dependency or known gap, and whenever a decision is made. Move finished items out of "Next up". Do not let it drift from the code.

## Layout

| Folder | What | Stack | Port |
|---|---|---|---|
| `frontend/` | Customer storefront | React 19, TS, Vite, Tailwind v4, react-router 7 | 5173 |
| `admin/` | Admin / staff dashboard | Same stack + TanStack Query | 5175 |
| `backend/` | REST API used by both | Express 5, TS, Supabase (PostgreSQL via REST + SQL functions), Zod, JWT | 3000 |
| `PLAN.md` | Original roadmap (phases, data model, decisions) | | |

Admin and storefront both talk to the one backend. There is intentionally no separate admin server.

## Commands

```bash
# backend (cd backend). Data is in Supabase: fill backend/.env (SUPABASE_URL, SUPABASE_SERVICE_KEY, JWT_*, SEED_ADMIN_PASSWORD)
# one-time (and again after schema changes): paste backend/supabase/schema.sql into the Supabase SQL Editor. It alters the hosted project in place.
npm run db:seed                 # loads frontend/src/data catalogue, coupons, banners, admin, demo orders into the project in .env
npm run dev                     # tsx watch, http://localhost:3000
npm test                        # 32 tests (flow.test.ts + auth/JWT/HTTPS suites), ALWAYS against .env.test (local Docker stack), refuses real projects
npm run db:local:reset          # fresh local stand-in for Supabase (Postgres + PostgREST + gateway on :54321); Docker must be running
NODE_ENV=test npm run db:seed   # seed the local stack; NODE_ENV=test npx tsx src/server.ts runs the API against it
npm run typecheck | npm run build

# frontend / admin (cd frontend | admin)
npm run dev | npm run build | npm run lint
```

Dev admin login: `admin@clickmart.com` / `SEED_ADMIN_PASSWORD` in `backend/.env` (`Admin@12345` locally). Demo customers: `<firstname>@example.com` / `Customer@123`.

## Current status

- **Backend: done** (phases 0-4 of PLAN.md). Auth, catalogue, offers, coupons, cart/wishlist/addresses, checkout, payments (mock + Razorpay code), orders and tracking, admin API, analytics, audit log.
- **Admin: done**, uses the real API. Dashboard, orders, products, inventory, categories, offers, coupons, banners, reviews, customers, team, settings, activity log.
- **Login system (JWT): done for storefront AND admin.** Storefront: `frontend/src/lib/api.ts` + `context/AuthContext.tsx` (in-memory access token, httpOnly refresh cookie restored on load, auto refresh+retry on 401), pages `/login` (login/register tabs), `/forgot-password`, `/reset-password`. `RequireAuth` guards `/checkout`, `/order/:id`, `/orders`, `/settings`, `/account`. Cart, shop, and product pages stay public. Track Order stays public but needs the order ID plus the phone or email on the order. `POST /checkout` requires a customer token. Admin: `/login`, `/forgot-password`, `/reset-password`, `/account`. Password reset uses the `PasswordReset` table, created by `schema.sql`.
- **Storefront is connected to the API (browser-tested end to end on the local stack):** catalogue, search, filters (server-side), product pages, reviews (moderated), offers/On Sale, coupons, banners and shipping settings come from the API; cart is server-priced (`POST /cart/quote`) and syncs to the account (`/me/cart`, merged on login); wishlist syncs (`/me/wishlist`); real checkout (`POST /checkout`), payment (mock gateway in dev; Razorpay Checkout code in `lib/razorpay.ts`, untested without keys) and `/payments/verify`; order confirmation, My Orders, live tracking (guest needs ORD id + phone/email), addresses (`/me/addresses`). The old demo `/admin/*` pages and local order storage were removed from the storefront; the real admin is `admin/`.
- **Payments, saved methods, history, addresses: done.** Storefront: Settings → *Saved payments* (UPI IDs and cards, server-backed, default switch, expired-card flag), *Payment history* (all attempts incl. failed + refunds, filters), *Addresses* (label Home/Work/Other, landmark, make default). Checkout: saved-address picker (+ "save this address"), saved UPI/card picker (saved card asks for CVV only), "Save for next time". Order page and admin order drawer show what was paid with. API: `/me/payment-methods` (GET, POST, PATCH `:id`, DELETE `:id`), `/me/payments` (history), `POST /me/addresses/:id/default`; code in `backend/src/routes/wallet.ts`; frontend hooks and card helpers in `frontend/src/lib/wallet.ts`.
- **Supabase**: the API uses the hosted project in `backend/.env` (`SUPABASE_URL` + `SUPABASE_SERVICE_KEY`). `backend/supabase/schema.sql` is the only SQL file. Tables are not in `public`; they live in `account`, `catalog`, `marketing`, `sales`, `payment`, and `ops`. The API picks the schema in `src/lib/db.ts` (`from('Product')` → `catalog`). Business functions stay in `public` so `rpc()` can call them. `schema.sql` sets `search_path` with `public` first before `CREATE FUNCTION`; if `account` is first, the new function is created in `account` and PostgREST keeps calling the old `public` copy. After pasting `schema.sql`, the user must expose those six schemas under Project Settings → Data API → Exposed schemas (include `payment`; the SQL also sets `pgrst.db_schemas` on `authenticator`). Then `npm run db:seed`. Optional staff login: set `SEED_STAFF_EMAIL` / `SEED_STAFF_PASSWORD` and re-seed, or add the person from Admin → Team.

### Next up
1. Paste `backend/supabase/schema.sql` into the Supabase SQL Editor for the project in `backend/.env`, then seed and smoke-test that project.
2. Storefront leftovers: notification/language prefs are local; `data/reviews.ts` still holds static testimonials for the home page.
3. Real payments: set `PAYMENT_PROVIDER=razorpay` + keys, point Razorpay webhook at `/api/v1/payments/webhook`.
4. Production extras: SMTP (`SMTP_URL`), Cloudinary/S3 for uploads (currently local `backend/uploads`), courier integration (Shiprocket), Sentry, CI.

## Backend notes

- Entry: `src/server.ts` -> `src/app.ts`. Routes in `src/routes` (`admin/` split into catalog, marketing, operations). Business logic in `src/lib` (`pricing.ts`, `orders.ts`, `payments.ts`). Data access: `src/lib/db.ts` (supabase-js client with the service key + helpers `rows/one/maybe/count/exec/rpc`, and `toHttpError` mapping DB errors/`RAISE EXCEPTION` tags to HTTP errors).
- API prefix `/api/v1`. Errors are `{ error, details? }`. Zod errors become 400 with `details[{path,message}]`.
- **Money rules (do not weaken):** prices/offers/coupons/shipping are recomputed server-side at checkout; stock is reserved inside the `create_order` SQL function (`UPDATE ... WHERE stock >= qty` under row locks); payment is confirmed only via HMAC-verified `/payments/verify` or the signed webhook (raw body, mounted before `express.json`); order lines snapshot name/size/price; tracking needs order ID + matching phone/email.
- Roles: `STAFF` = orders, products, stock, offers, banners, reviews. `ADMIN` also = coupons, refunds, analytics, settings, team, audit, delete product.
- Online orders unpaid for 30 min are cancelled and stock restored (sweep in `server.ts`).
- Refresh tokens rotate; the old token stays valid for 30 s (grace) so an interrupted refresh can retry. Logout revokes immediately.
- Auth rate limits (src/app.ts): only FAILED log-ins/registrations count (20/15 min/IP), refresh has its own 300 limit (every page load refreshes), forgot-password 8. Keep refresh out of the strict limiter.
- **Password storage:** `src/lib/passwords.ts`: `v2$` + bcrypt(12) over HMAC-SHA256(password, `PASSWORD_PEPPER`). Legacy plain-bcrypt hashes verify and are re-hashed on login. Never log/return hashes; never change or lose `PASSWORD_PEPPER` (required env, >= 32 chars; the user's `.env` got a generated one). All hashing must go through `passwords.ts` (seed, staff creation, reset, register).
- Production transport: `middleware/https.ts` redirects/refuses plain HTTP, HSTS via helmet, JWT pinned to HS256 + issuer `clickmart`.
- Seed account: `SEED_ADMIN_NAME/EMAIL/PASSWORD` in `.env` = Ajay Singh `ajaysingh.asimap99@gmail.com` (ADMIN, weak 6-char password 123456 at the user's request; seed prints a warning; user told to change it). Not yet run on the real Supabase project.
- Password-reset emails link to `STORE_URL` (customers) or `ADMIN_URL` (staff); with no `SMTP_URL` they are printed in the API console.
- JWT secrets must be >= 16 chars (the user's `.env` had a 13-char `JWT_ACCESS_SECRET` that made the API refuse to start).
- Order codes are `ORD-<number>` (autoincrement `Order.number`, seeded demo orders are 1044-1048).
- Catalogue shape: `Brand` → `Category` tree → `Product` (HSN, GST %, origin, ingredients) → `ProductVariant` (SKU, barcode, weight, price, MRP, stock) and `ProductImage`. Offer/coupon targets live in `OfferProduct`, `OfferCategory`, `CouponProduct`, `CouponCategory`; the `categoryIds`/`productIds` arrays are a copy those SQL functions keep up to date. `Shipment` and `Refund` record fulfilment and money sent back.
- People: `account.Login` is the only sign-in row (email, password hash, role `CUSTOMER` | `STAFF` | `ADMIN`, blocked, last login). Name and phone live on exactly one profile: `Customer` (buyers), `Staff` (shop managers), or `Admin` (full access). The `Person` view joins them for reads. Changing role moves the profile (`src/lib/account.ts`). Orders, addresses, cart and reviews still point at the login id. Staff sign in at the admin app (`admin/`, port 5175).
- **`payment` schema** owns all money data: `Payment` (every attempt = payment history), `Refund`, `SavedPayment` (saved UPI/cards) and `WebhookEvent` (log of signed gateway notifications, unique per `provider`+`eventId`; a redelivered handled event is acknowledged and skipped, a FAILED one is retried). `schema.sql` moves older `sales.Payment`/`sales.Refund`/`account.SavedPayment` into it. Enums `PaymentStatus`/`PaymentMethod`/`RefundStatus` stay in `sales`. Because PostgREST can't embed across schemas, `sales.Order` keeps a text snapshot `paymentDetail` (shown on order pages) and payment lookups are separate queries (`/me/payments`, admin order detail). Admin: `GET /admin/payments/webhooks` (ADMIN) lists the webhook log.
- **Card safety rule (do not weaken):** the full card number and CVV never reach the API or the DB. The browser reduces a card to brand + last 4 + expiry + name (`savedCardBody` in `lib/wallet.ts`) before saving; `SavedPayment` (account schema) has no column for more. `checkout` takes `paymentDetail` (`savedPaymentId` | `upiId` | `cardBrand`+`cardLast4` | `bank`), which `resolvePaymentDetail` in `lib/orders.ts` turns into display columns on `Payment` (`detail`, `upiId`, `cardBrand`, `cardLast4`, `bank`, `savedPaymentId`, `failureReason`, `paidAt`). With real Razorpay the card is typed in Razorpay's own window; our saved cards are display labels only (`gatewayToken` is reserved for Razorpay token ids, not wired yet). Saving a method happens from the browser after a successful payment.
- Defaults (one per customer) switch through SQL functions `set_default_address` / `set_default_payment`, never two separate updates.
- **PostgREST cannot embed across schemas** (e.g. `sales.CartItem` → `catalog.ProductVariant` fails with "Could not find a relationship"). Embed only within one schema, or query the second table separately (see `loadCart` in `routes/me.ts`). `ORDER_SELECT` now also embeds `payments:Payment(...)` (same schema); the admin order detail uses `ORDER_BASE` + full payments.
- Offers (`Offer`) are automatic sale prices; coupons (`Coupon`) are codes at checkout. Variant `price` is the base selling price, `mrp` the struck-through price; storefront price = best active offer applied to `price`.
- Payments default to `PAYMENT_PROVIDER=mock` (`/payments/mock/pay` simulates the gateway, disabled in production).
- **Supabase REST has no multi-statement transactions.** Anything that must be atomic (create order, stock adjust, mark paid, fail payment, status change, refund, analytics) is a plpgsql function in `schema.sql` section 11, called via `rpc()`. When adding such logic, write a function, grant it to `service_role` only (the file revokes execute from PUBLIC/anon/authenticated for all functions), and map its `RAISE EXCEPTION '<TAG>'` in `toHttpError`.
- Columns are quoted camelCase (`"createdAt"`); timestamps are `timestamptz` and arrive as ISO strings. supabase-js can't `increment`; use SQL functions. PostgREST caps rows at 1000 per request. Embeds with two FKs to the same table need a hint (`Category!categoryId(*)`).
- Image uploads go to four public Supabase Storage buckets: `product-images` (items), `category-images`, `banner-images`, and `profile-images` (customer, staff, and admin). `POST /admin/uploads` takes `purpose` `product` | `category` | `banner`. `POST /me/avatar` stores a profile photo. The local stack falls back to `backend/uploads/<bucket>/`. Create the buckets by re-running `schema.sql` section 15 (or the short bucket SQL). Profile photos need the `avatarUrl` column from the same file.
- The storefront reads the catalogue from the API and refreshes it about every 15 seconds, and again when the customer comes back to the tab. A hidden product (`isActive` false) disappears from the shop. Seeded photos under `/images/` stay on the storefront; new photos are full Storage URLs.
- **Express 5 + @types/express:** `req.params.x` is `string | string[]`; wrap in `String(...)`.
- **After changing the schema:** edit `supabase/schema.sql` only (it is re-runnable: `CREATE TABLE IF NOT EXISTS` plus `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`). The user pastes that file into the Supabase SQL Editor. Do not add a second SQL file.
- `backend/supabase/local/nginx.conf` (gateway for the local Docker stack, `/rest/v1` → PostgREST) was missing and was recreated on 2026-10-09; it is untracked like the rest of `supabase/local`. If Docker made it a directory, delete the directory and recreate the file.
- Tests (`src/tests/flow.test.ts`) create and clean up their own data; they need the seeded admin on the local stack, and assert `SUPABASE_URL` is localhost before running.

## Frontend (storefront) notes

- Brand: blue `#123a86`, orange `#f47b20`, font Plus Jakarta Sans. Design tokens + shared classes (`.btn`, `.btn-accent`, `.card`, `.field`, `.eyebrow`) are in `src/index.css`; the shared classes are in `@layer components` so Tailwind utilities (e.g. `hidden`, `lg:hidden`) can override them. Keep it that way.
- Tailwind v4: important modifier is a **suffix** (`h-14!`), not a prefix.
- Routes: `/`, `/shop`, `/sale`, `/product/:slug`, `/cart`, `/checkout` (3 steps: Cart, Details, Payment), `/order/:id`, `/orders`, `/track/:id?`, `/wishlist`, `/settings` (+ `/account`), `/login`, content pages. Legacy `/admin/*` demo pages still exist in this app but the real admin is `admin/`.
- Header is a single row (logo, Shop mega-menu, On Sale, Best Sellers, Track Order, pill search, icons). No price next to the cart icon (user request). Home is reached via the logo.
- Vite proxies `/api` and `/uploads` to the backend (set `VITE_PROXY_TARGET` to change; production uses `VITE_API_URL`). Auth redirects only follow in-app paths (`safeNext`).
- Test card `4000 0000 0000 0002` always declines in the demo checkout (also a saved card ending 0002, or a UPI ID starting `fail@`). Card numbers must pass the Luhn check; `4111 1111 1111 1111` works.
- Browser-stored state (guests only; logged-in users sync to the server): `clickmart-cart-v2` (`[{variantId, quantity}]`), `clickmart-coupon`, `clickmart-wishlist-v2`, `clickmart-address` (guest checkout memory), `clickmart-prefs`.
- Data layer: `lib/api.ts` (fetch + JWT refresh), `lib/catalog.ts` (React Query hooks: `useProducts`, `useProduct`, `useCategories`, `useOffers`, `useActiveCoupons`, `useStoreSettings`, ...), `lib/orders.ts` (order types, tracking stages, hooks). Product ids are UUIDs; carts/orders use `packs[].variantId`. Starting catalogue/seed data now lives in `backend/scripts/seed-data/`, not the storefront.
- One product, many pack sizes. The shop and the homepage show one card per size (name includes the size). Every card opens the same `/product/:slug?size=` page with that size selected. Wishlist and cart suggestions stay one card per product.

## Admin notes

- `src/api.ts`: access token in memory, rotating refresh cookie, one automatic retry on 401. Vite proxies `/api` and `/uploads` to the backend (set `VITE_PROXY_TARGET` to change) so no CORS needed in dev. Production: build with `VITE_API_URL` and add the origin to backend `CORS_ORIGINS`.
- UI kit in `src/ui.tsx` (Button, Field, Modal, Drawer, Table, Tabs, toasts via `useUi()`, `ImageUpload`). Writes go through `useAction` in `src/hooks.ts` (toast + query invalidation).
- `tsconfig` has `erasableSyntaxOnly`: no enums or constructor parameter properties.
- Seeded catalogue images live in the storefront's `public/`; admin shows them via `VITE_STOREFRONT_URL` (default `http://localhost:5173`).
- Pages gated to admins use `<AdminOnly>`; the sidebar hides them for staff. Staff and admins can add categories, brands, products (pack sizes, price, stock, GST), offers, banners, and stock adjustments. Coupons, refunds, settings, team, and the audit log stay admin-only.
- Brands: `admin/src/pages/Brands.tsx` and `POST/PATCH/DELETE /admin/brands`. The product form can also create a brand inline.

## Conventions

- Match surrounding code style; TypeScript strict everywhere; no new dependencies without a reason.
- Currency is whole rupees (integers). Format with `Intl` `en-IN`.
- Never put the Supabase `service_role` key or any secret in the frontends or in git (`.env` is ignored; `.env.example` is committed).
- Verify UI changes in the browser and run the relevant tests/typecheck before calling work done.

## Decisions log

- 2026-10: Admin is a separate React app reusing the existing backend, not a second backend.
- 2026-10: Razorpay is the intended gateway; mock gateway for dev.
- 2026-10-08: Replaced Prisma with supabase-js (REST) at the user's request: they supply only SUPABASE_URL + service key, no DB password. Atomic operations moved into SQL functions. Local Docker PostgREST stack used for tests so the real project is never touched.
- 2026-10: Local Docker Postgres runs on host port 5433 (PostgREST gateway on 54321).
- 2026-10-08: Shop tables live in Postgres schemas `account`, `catalog`, `marketing`, `sales`, and `ops`, not in `public`. `schema.sql` moves existing public tables into those schemas.
- 2026-10-09: All payment data moved into its own `payment` schema (Payment, Refund, SavedPayment, WebhookEvent) at the user's request. Saved methods are metadata only; payment history is read from `payment."Payment"`.
- 2026-10-08: One `Login` table for every role. Buyer details are `Customer`, managers are `Staff`, full-access accounts are `Admin`. The old combined `User` row is renamed to `Login` and name/phone are copied into the matching profile.
