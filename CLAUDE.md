# ClickMart

Online dry-fruits store for India: customer storefront, admin dashboard, REST API.

> **Keep this file current.** Update it in the same turn whenever you add or change a feature, route, script, env var, convention, port, dependency or known gap, and whenever a decision is made. Move finished items out of "Next up". Do not let it drift from the code.

## Layout

| Folder | What | Stack | Port |
|---|---|---|---|
| `frontend/` | Customer storefront | React 19, TS, Vite, Tailwind v4, react-router 7 | 5173 |
| `admin/` | Admin / staff dashboard | Same stack + TanStack Query | 5175 |
| `backend/` | REST API used by both | Express 5 on plain JavaScript (no TypeScript, no build), Supabase (PostgreSQL via REST + SQL functions), Zod, JWT | 3000 |
| `PLAN.md` | Original roadmap (phases, data model, decisions) | | |

Admin and storefront both talk to the one backend. There is intentionally no separate admin server.

## Commands

```bash
# backend (cd backend). Data is in Supabase: fill backend/.env (SUPABASE_URL, SUPABASE_SERVICE_KEY, JWT_*, PASSWORD_PEPPER)
# one-time: paste backend/supabase/schema.sql into the Supabase SQL Editor. It alters the hosted project in place.
# each later change: also paste the matching file in backend/supabase/migrations/ (schema.sql stays the full copy).
npm run dev                     # node --watch src/server.js, http://localhost:3000
npm test                        # 9 unit tests (password/JWT/HTTPS), no database or Docker needed
npm start                       # node src/server.js (no build step)
# Render (root directory `backend`): Build `npm install`, Start `npm start`. See `render.yaml`.

# frontend / admin (cd frontend | admin)
npm run dev | npm run build | npm run lint
```

There is no seed data and no seed script (removed 2026-10-13 at the user's request). Never add one back, and never commit sample accounts, products or orders. Catalogue, banners, coupons and staff are created from the admin app.

## Current status

- **Backend: done** (phases 0-4 of PLAN.md). Auth, catalogue, offers, coupons, cart/wishlist/addresses, checkout, payments (mock + Razorpay code), orders and tracking, admin API, analytics, audit log.
- **Admin: done**, uses the real API. Dashboard, orders, products, inventory, categories, offers, coupons, banners, reviews, customers, team, settings, activity log.
- **Login system (JWT): done for storefront AND admin.** Storefront: `frontend/src/lib/api.ts` + `context/AuthContext.tsx` (in-memory access token, httpOnly refresh cookie restored on load, auto refresh+retry on 401), pages `/login` (login/register tabs), `/forgot-password`, `/reset-password`. `RequireAuth` guards `/checkout`, `/order/:id`, `/orders`, `/settings`, `/account`. Cart, shop, and product pages stay public. Track Order stays public but needs the order ID plus the phone or email on the order. `POST /checkout` requires a customer token. Admin: `/login`, `/forgot-password`, `/reset-password`, `/account`. Password reset uses the `PasswordReset` table, created by `schema.sql`.
- **Storefront is connected to the API:** catalogue, search, filters (server-side), product pages, reviews (moderated), offers/On Sale, coupons, banners and shipping settings come from the API; cart is server-priced (`POST /cart/quote`) and syncs to the account (`/me/cart`, merged on login); wishlist syncs (`/me/wishlist`); real checkout (`POST /checkout`), payment (mock gateway in dev; Razorpay Checkout code in `lib/razorpay.ts`, untested without keys) and `/payments/verify`; order confirmation, My Orders, live tracking (guest needs ORD id + phone/email), addresses (`/me/addresses`). The old demo `/admin/*` pages and local order storage were removed from the storefront; the real admin is `admin/`.
- **Payments, saved methods, history, addresses: done.** Storefront: Settings → *Saved payments* (UPI IDs and cards, server-backed, default switch, expired-card flag), *Payment history* (all attempts incl. failed + refunds, filters), *Addresses* (`/settings?tab=address`) is a form: name, mobile, PIN (fills city, state and locality), street, landmark, Home/Work/Other, and default. **Use my current location** fills those fields from the browser location. There is no map on this page. Saved cards sit under the form. The header "Deliver to" picker still uses the map and only saves the delivery PIN. Checkout: saved-address picker (+ "save this address"), saved UPI/card picker (saved card asks for CVV only), "Save for next time". Order page and admin order drawer show what was paid with. API: `/me/payment-methods` (GET, POST, PATCH `:id`, DELETE `:id`), `/me/payments` (history), `POST /me/addresses/:id/default`; code in `backend/src/routes/wallet.js`; frontend hooks and card helpers in `frontend/src/lib/wallet.ts`.
- **Delivery location ("Set PIN" in the header): done.** Click it to open a map picker (`frontend/src/components/location/LocationPicker.tsx`, lazy-loaded so MapLibre stays out of the main bundle): search an area/street/6-digit PIN, "Use my current location", saved addresses (signed in), or drag the map under the fixed pin; the address is reverse-looked-up and **Confirm** saves it. State lives in `context/LocationContext.tsx` (`useDeliveryLocation()`), helpers in `lib/location.ts`. Guests: `localStorage` `clickmart-location`. Signed-in: saved in `account."DeliveryLocation"` (one row per login: pin, city, state, area, label, lat, lng) via `GET/PUT/DELETE /me/location` (`backend/src/routes/location.js`); on login the server copy wins, or the guest pick is pushed up if the account has none; on logout it is forgotten. Free providers, no keys: map = **MapLibre GL + OpenFreeMap** (OSM data); geocoding = **OSM Nominatim**, proxied by our API at public `GET /geo/search?q=`, `/geo/reverse?lat&lng`, `/geo/pin/:pin` (Nominatim needs a User-Agent, 1 req/s and caching, so browsers never call it directly). Needs `schema.sql` re-pasted for the new table. MapLibre's CSS sets `.maplibregl-map{position:relative}`, so the map div sits in an `absolute inset-0` wrapper, and the worker is set with `setWorkerUrl(...?url)` for Vite.
- **Supabase**: the API uses the hosted project in `backend/.env` (`SUPABASE_URL` + `SUPABASE_SERVICE_KEY`). `backend/supabase/schema.sql` is the full database. Each new table or column also gets its own paste-ready file in `backend/supabase/migrations/`. Tables are not in `public`; they live in `account`, `catalog`, `marketing`, `sales`, `payment`, and `ops`. The API picks the schema in `src/database/db.js` (`from('Product')` → `catalog`). Business functions stay in `public` so `rpc()` can call them. `schema.sql` sets `search_path` with `public` first before `CREATE FUNCTION`; if `account` is first, the new function is created in `account` and PostgREST keeps calling the old `public` copy. After pasting `schema.sql`, the user must expose those six schemas under Project Settings → Data API → Exposed schemas (include `payment`; the SQL also sets `pgrst.db_schemas` on `authenticator`).

### Next up
0. Production `backend/.env` is trimmed to the keys the API reads (no SUPABASE_PUBLISHABLE_KEY). Fill the `CHANGE-ME` domains (also in `frontend/.env` and `admin/.env`, which hold `VITE_API_URL` etc. and are gitignored; Vite bakes them in at build time) and the live `RAZORPAY_KEY_ID/SECRET`, set `SMTP_URL`. The old dev file is kept only outside the repo. 
1. Paste these into the Supabase SQL Editor: `backend/supabase/migrations/2026-10-12-delivery-location.sql`, `backend/supabase/migrations/2026-10-12-payment-schema.sql`, and `backend/supabase/migrations/2026-10-12-review-images.sql` (adds `Review.images` and the `review-images` bucket). Also add `payment` under Project Settings → Data API → Exposed schemas if the API still says the schema is missing.
2. Storefront leftovers: notification/language prefs are local; `data/reviews.ts` still holds static testimonials for the home page.
3. Real payments: set `PAYMENT_PROVIDER=razorpay` + keys, point Razorpay webhook at `/api/v1/payments/webhook`.
4. Production extras: SMTP (`SMTP_URL`), Cloudinary/S3 for uploads (uploads already go to Supabase Storage), courier integration (Shiprocket), Sentry, CI.

## Backend notes

- Entry: `src/server.js` -> `src/app.js`. Routes in `src/routes` (`admin/` split into catalog, marketing, operations). Business logic in `src/services` (`pricing.js`, `orders.js`, `payments.js`, `auth.js`, `account.js`, `passwords.js`, `mailer.js`, `storage.js`, ...). Config/env in `src/config/env.js`, helpers in `src/utils` (`errors.js`, `serializers.js`, `slug.js`), middleware in `src/middleware`. Tests in `backend/tests/`. Data access: `src/database/db.js` (supabase-js client with the service key + helpers `rows/one/maybe/count/exec/rpc`, and `toHttpError` mapping DB errors/`RAISE EXCEPTION` tags to HTTP errors).
- API prefix `/api/v1`. Errors are `{ error, details? }`. Zod errors become 400 with `details[{path,message}]`.
- **Money rules (do not weaken):** prices/offers/coupons/shipping are recomputed server-side at checkout; stock is reserved inside the `create_order` SQL function (`UPDATE ... WHERE stock >= qty` under row locks); payment is confirmed only via HMAC-verified `/payments/verify` or the signed webhook (raw body, mounted before `express.json`); order lines snapshot name/size/price; tracking needs order ID + matching phone/email.
- Roles: `STAFF` = orders, products, stock, offers, banners, reviews. `ADMIN` also = coupons, refunds, analytics, settings, team, audit, delete product.
- Online orders unpaid for 30 min are cancelled and stock restored (sweep in `server.js`).
- Refresh tokens rotate; the old token stays valid for 30 s (grace) so an interrupted refresh can retry. Logout revokes immediately.
- Auth rate limits (src/app.js): only FAILED log-ins/registrations count (20/15 min/IP), refresh has its own 300 limit (every page load refreshes), forgot-password 8. Keep refresh out of the strict limiter.
- **Password storage:** `src/services/passwords.js`: `v2$` + bcrypt(12) over HMAC-SHA256(password, `PASSWORD_PEPPER`). Legacy plain-bcrypt hashes verify and are re-hashed on login. Never log/return hashes; never change or lose `PASSWORD_PEPPER` (required env, >= 32 chars; the user's `.env` got a generated one). All hashing must go through `services/passwords.js` (staff creation, reset, register).
- Refresh cookie `SameSite` comes from `COOKIE_SAMESITE` (`lax` default; `none` only when shop/admin and API are on different sites, e.g. both on `*.onrender.com`, which is a public suffix). Prefer custom domains under one site (shop.x.com, admin.x.com, api.x.com).
- Production transport: `middleware/https.js` redirects/refuses plain HTTP, HSTS via helmet, JWT pinned to HS256 + issuer `clickmart`.
- Password-reset emails link to `STORE_URL` (customers) or `ADMIN_URL` (staff); with no `SMTP_URL` they are printed in the API console.
- JWT secrets must be >= 16 chars (the user's `.env` had a 13-char `JWT_ACCESS_SECRET` that made the API refuse to start).
- Order codes are `ORD-<number>` (autoincrement `Order.number`).
- Catalogue shape: `Brand` → `Category` tree → `Product` (HSN, GST %, origin, ingredients) → `ProductVariant` (SKU, barcode, weight, price, MRP, stock) and `ProductImage`. Offer/coupon targets live in `OfferProduct`, `OfferCategory`, `CouponProduct`, `CouponCategory`; the `categoryIds`/`productIds` arrays are a copy those SQL functions keep up to date. `Shipment` and `Refund` record fulfilment and money sent back.
- People: `account.Login` is the only sign-in row (email, password hash, role `CUSTOMER` | `STAFF` | `ADMIN`, blocked, last login). Name and phone live on exactly one profile: `Customer` (buyers), `Staff` (shop managers), or `Admin` (full access). The `Person` view joins them for reads. Changing role moves the profile (`src/services/account.js`). Orders, addresses, cart and reviews still point at the login id. Staff sign in at the admin app (`admin/`, port 5175).
- **`payment` schema** owns all money data: `Payment` (every attempt = payment history), `Refund`, `SavedPayment` (saved UPI/cards) and `WebhookEvent` (log of signed gateway notifications, unique per `provider`+`eventId`; a redelivered handled event is acknowledged and skipped, a FAILED one is retried). `schema.sql` moves older `sales.Payment`/`sales.Refund`/`account.SavedPayment` into it. Enums `PaymentStatus`/`PaymentMethod`/`RefundStatus` stay in `sales`. Because PostgREST can't embed across schemas, `sales.Order` keeps a text snapshot `paymentDetail` (shown on order pages) and payment lookups are separate queries (`/me/payments`, admin order detail). Admin: `GET /admin/payments/webhooks` (ADMIN) lists the webhook log.
- **Card safety rule (do not weaken):** the full card number and CVV never reach the API or the DB. The browser reduces a card to brand + last 4 + expiry + name (`savedCardBody` in `lib/wallet.ts`) before saving; `SavedPayment` (account schema) has no column for more. `checkout` takes `paymentDetail` (`savedPaymentId` | `upiId` | `cardBrand`+`cardLast4` | `bank`), which `resolvePaymentDetail` in `services/orders.js` turns into display columns on `Payment` (`detail`, `upiId`, `cardBrand`, `cardLast4`, `bank`, `savedPaymentId`, `failureReason`, `paidAt`). With real Razorpay the card is typed in Razorpay's own window; our saved cards are display labels only (`gatewayToken` is reserved for Razorpay token ids, not wired yet). Saving a method happens from the browser after a successful payment.
- Defaults (one per customer) switch through SQL functions `set_default_address` / `set_default_payment`, never two separate updates.
- **PostgREST cannot embed across schemas** (e.g. `sales.CartItem` → `catalog.ProductVariant` fails with "Could not find a relationship"). Embed only within one schema, or query the second table separately (see `loadCart` in `routes/me.js`). `ORDER_SELECT` now also embeds `payments:Payment(...)` (same schema); the admin order detail uses `ORDER_BASE` + full payments.
- Offers (`Offer`) are automatic sale prices; coupons (`Coupon`) are codes at checkout. Variant `price` is the base selling price, `mrp` the struck-through price; storefront price = best active offer applied to `price`.
- Payments default to `PAYMENT_PROVIDER=mock` (`/payments/mock/pay` simulates the gateway, disabled in production).
- **Supabase REST has no multi-statement transactions.** Anything that must be atomic (create order, stock adjust, mark paid, fail payment, status change, refund, analytics) is a plpgsql function in `schema.sql` section 11, called via `rpc()`. When adding such logic, write a function, grant it to `service_role` only (the file revokes execute from PUBLIC/anon/authenticated for all functions), and map its `RAISE EXCEPTION '<TAG>'` in `toHttpError`.
- Columns are quoted camelCase (`"createdAt"`); timestamps are `timestamptz` and arrive as ISO strings. supabase-js can't `increment`; use SQL functions. PostgREST caps rows at 1000 per request. Embeds with two FKs to the same table need a hint (`Category!categoryId(*)`).
- Image uploads go to five public Supabase Storage buckets: `product-images` (items), `category-images`, `banner-images`, `profile-images` (customer, staff, and admin), and `review-images` (customer review photos). `POST /admin/uploads` takes `purpose` `product` | `category` | `banner`. `POST /me/avatar` stores a profile photo. `POST /products/:slug/review-images` stores review photos. Create the buckets by re-running `schema.sql` section 15, or paste `migrations/2026-10-12-review-images.sql` for the review bucket. Profile photos need the `avatarUrl` column from the same file.
- The storefront reads the catalogue from the API and refreshes it about every 15 seconds, and again when the customer comes back to the tab. A hidden product (`isActive` false) disappears from the shop. Older photos under `/images/` stay on the storefront; new photos are full Storage URLs.
- Express 5: `req.params.x` can be `string | string[]`; wrap in `String(...)`.
- **After changing the schema:** keep `supabase/schema.sql` the full, re-runnable copy (`CREATE TABLE IF NOT EXISTS` plus `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`). Also add a new file under `supabase/migrations/` with only the new statements, named `YYYY-MM-DD-short-name.sql`, and tell the user to paste that file into the Supabase SQL Editor. Do not run SQL against the hosted project.
- Tests: `tests/security.test.js` (+ `tests/setup.js` placeholder env). No Docker and no local database stack; the old integration suite was removed.

## Frontend (storefront) notes

- Brand: blue `#123a86`, orange `#f47b20`, font Plus Jakarta Sans. Design tokens + shared classes (`.btn`, `.btn-accent`, `.card`, `.field`, `.eyebrow`) are in `src/index.css`; the shared classes are in `@layer components` so Tailwind utilities (e.g. `hidden`, `lg:hidden`) can override them. Keep it that way.
- Tailwind v4: important modifier is a **suffix** (`h-14!`), not a prefix.
- Routes: `/`, `/shop`, `/sale`, `/product/:slug`, `/cart`, `/checkout` (3 steps: Cart, Details, Payment), `/order/:id`, `/orders`, `/track/:id?`, `/wishlist`, `/settings` (+ `/account`), `/login`, content pages. Legacy `/admin/*` demo pages still exist in this app but the real admin is `admin/`.
- Header is a single row (logo, Shop mega-menu, On Sale, Best Sellers, Track Order, pill search, icons). With a single category, that Shop menu lists the category's products (photo, name, size, price) and grade chips, instead of a category column. The home page has one "Shop the range" grid with All / On sale / Best sellers tabs (a tab is hidden when that list is empty) and a sale banner with a live countdown and copyable coupons. Several categories bring the name strip and circles back. No price next to the cart icon (user request). Home is reached via the logo. Hovering the profile opens Your Account: My Profile, Orders, Coupons (`/sale`), Saved Addresses, Wishlist, Notifications, and Logout. Wallet, rewards, membership, and gift cards are not in that menu. Adding an item shows a card ("added to cart" plus the new item count) and the header badge ticks up. Cart then checkout: saved addresses are picked first, otherwise the form starts from the header delivery PIN.
- Vite proxies `/api` and `/uploads` to the backend (set `VITE_PROXY_TARGET` to change; production uses `VITE_API_URL`). Auth redirects only follow in-app paths (`safeNext`).
- Test card `4000 0000 0000 0002` always declines in the demo checkout (also a saved card ending 0002, or a UPI ID starting `fail@`). Card numbers must pass the Luhn check; `4111 1111 1111 1111` works.
- Browser-stored state (guests only; logged-in users sync to the server): `clickmart-cart-v2` (`[{variantId, quantity}]`), `clickmart-coupon`, `clickmart-wishlist-v2`, `clickmart-address` (guest checkout memory), `clickmart-prefs`. The header cart, cart page, and checkout treat `count` (raw quantities) as whether the cart has items. Priced lines come from `POST /cart/quote`; until that returns, lines are filled from products already in the React Query cache so a cart with items is not shown as empty. Checkout sends the raw `items`, and the server prices them.
- Data layer: `lib/api.ts` (fetch + JWT refresh), `lib/catalog.ts` (React Query hooks: `useProducts`, `useProduct`, `useCategories`, `useOffers`, `useActiveCoupons`, `useStoreSettings`, ...), `lib/orders.ts` (order types, tracking stages, hooks). Product ids are UUIDs; carts/orders use `packs[].variantId`. 
- One product, many pack sizes. The shop shows one card per size (name includes the size). The homepage "Shop the range" shows one card per product, using the featured pack, so the same item is not repeated for every size. Every card opens the same `/product/:slug?size=` page with that size selected. Wishlist and cart suggestions stay one card per product. The product page shows every photo in `images` as a gallery, delivery details (header PIN, delivery by four working days, sold by ClickMart), and reviews. A signed-in customer can attach up to four JPG/PNG/WebP photos (`POST /products/:slug/review-images`, bucket `review-images`, stored on `Review.images`). Photos appear after the review is approved. Paste `backend/supabase/migrations/2026-10-12-review-images.sql` before customer photos will save.

## Admin notes

- `src/api.ts`: access token in memory, rotating refresh cookie, one automatic retry on 401. Vite proxies `/api` and `/uploads` to the backend (set `VITE_PROXY_TARGET` to change) so no CORS needed in dev. Production: build with `VITE_API_URL` and add the origin to backend `CORS_ORIGINS`.
- UI kit in `src/ui.tsx` (Button, Field, Modal, Drawer, Table, Tabs, toasts via `useUi()`, `ImageUpload`). Writes go through `useAction` in `src/hooks.ts` (toast + query invalidation).
- `tsconfig` has `erasableSyntaxOnly`: no enums or constructor parameter properties.
- Older catalogue images under `/images/` live in the storefront's `public/`; admin shows them via `VITE_STOREFRONT_URL` (default `http://localhost:5173`).
- Pages gated to admins use `<AdminOnly>`; the sidebar hides them for staff. Staff and admins can add categories, brands, products (pack sizes, price, stock, GST), offers, banners, and stock adjustments. Coupons, refunds, settings, team, and the audit log stay admin-only.
- Brands: `admin/src/pages/Brands.tsx` and `POST/PATCH/DELETE /admin/brands`. The product form can also create a brand inline.

## Conventions

- Match surrounding code style; TypeScript strict in frontend and admin (the backend is plain JavaScript); no new dependencies without a reason.
- Currency is whole rupees (integers). Format with `Intl` `en-IN`.
- Never put the Supabase `service_role` key or any secret in the frontends or in git (`.env` is ignored; `.env.example` is committed).
- Verify UI changes in the browser and run the relevant tests/typecheck before calling work done.

## Decisions log

- 2026-10: Admin is a separate React app reusing the existing backend, not a second backend.
- 2026-10: Razorpay is the intended gateway; mock gateway for dev.
- 2026-10-13: Backend converted from TypeScript to plain JavaScript (ESM, Node 22+) and Docker/local Postgres stack removed, at the user's request. Frontend and admin stay TypeScript. Old TS copy is not in the repo. Image uploads always go to Supabase Storage (no local `uploads/` fallback). Render: Build `npm install`, Start `npm start`.
- 2026-10-08: Replaced Prisma with supabase-js (REST) at the user's request: they supply only SUPABASE_URL + service key, no DB password. Atomic operations moved into SQL functions.
- 2026-10-08: Shop tables live in Postgres schemas `account`, `catalog`, `marketing`, `sales`, and `ops`, not in `public`. `schema.sql` moves existing public tables into those schemas.
- 2026-10-12: New SQL is written twice: the full statement stays in `schema.sql`, and the same new statement is also saved as its own file in `backend/supabase/migrations/` so it can be pasted on its own. First files: `2026-10-12-delivery-location.sql` and `2026-10-12-payment-schema.sql`.
- 2026-10-09: All payment data moved into its own `payment` schema (Payment, Refund, SavedPayment, WebhookEvent) at the user's request. Saved methods are metadata only; payment history is read from `payment."Payment"`.
- 2026-10-08: One `Login` table for every role. Buyer details are `Customer`, managers are `Staff`, full-access accounts are `Admin`. The old combined `User` row is renamed to `Login` and name/phone are copied into the matching profile.
