# ClickMart API

Express 5 + TypeScript + Prisma (PostgreSQL). Implements Phases 0–4 of `../PLAN.md`.

## Run it

```bash
cp .env.example .env        # then set the JWT secrets and SEED_ADMIN_PASSWORD
docker compose up -d        # Postgres on localhost:5433
npm install
npm run db:migrate          # create tables
npm run db:seed             # catalogue from frontend/src/data, coupons, banners, admin, demo orders
npm run dev                 # http://localhost:3000
npm test                    # 17 integration tests against the real database
```

Dev admin login (from `.env`): `admin@clickmart.com` / the value of `SEED_ADMIN_PASSWORD`.

## Money rules enforced server-side

- Prices, offers, coupons and shipping are recomputed from the database at checkout. Client totals are never trusted.
- Stock is reserved with a conditional `UPDATE ... WHERE stock >= qty` inside the order transaction (no overselling). Cancel, failed payment and the 30-minute unpaid-order sweep restore it.
- Payment is confirmed only by an HMAC-verified callback or webhook. Confirmation is idempotent.
- Order lines snapshot name, size and price, so catalogue edits never change old orders.
- Tracking requires the order ID **and** the phone or email on the order.
- Roles: `STAFF` runs products, stock, orders, offers, banners and reviews. `ADMIN` additionally owns coupons, refunds, analytics, settings, staff accounts and the audit log.

## API (`/api/v1`)

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register, login, refresh, logout, change-password` (access token in body, rotating refresh token in an httpOnly cookie) |
| Catalogue | `GET /products` (category, sub, q, minPrice, maxPrice, size, availability, onSale, sort, page), `GET /products/:slug`, `GET /categories`, `GET /offers`, `GET /coupons/active`, `GET /banners`, `GET /settings/public`, `POST /cart/quote` |
| Reviews | `GET/POST /products/:slug/reviews` (new reviews are held for moderation) |
| Account | `GET/PATCH /me`, `/me/addresses`, `/me/wishlist`, `/me/cart` |
| Orders | `POST /checkout`, `GET /orders`, `GET /orders/:code`, `POST /orders/:code/cancel`, `GET /orders/:code/invoice`, `GET /track/:code?contact=` |
| Payments | `POST /payments/verify`, `/payments/fail`, `/payments/webhook` (raw body, signed), `/payments/mock/pay` (dev only) |
| Admin | `/admin/products`, `/variants/:id/stock`, `/inventory`, `/categories`, `/offers`, `/coupons`, `/banners`, `/reviews`, `/orders` (+ `/status`, `/refund`, `/invoice`), `/customers`, `/settings`, `/staff`, `/audit`, `/analytics`, `/summary`, `/uploads` |

## Payments

`PAYMENT_PROVIDER=mock` (default) simulates a gateway so the full flow works without keys: `POST /checkout` returns `payment.providerOrderId`, the storefront calls `/payments/mock/pay` to get a signed payment id, then `/payments/verify`.
Set `PAYMENT_PROVIDER=razorpay` with `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` for real orders, signature checks and refunds. Point Razorpay's webhook at `/api/v1/payments/webhook` and set `PAYMENT_WEBHOOK_SECRET` to the same secret.

## Not done yet

- Storefront and admin UI still read local data. Next step is replacing `frontend/src/data/*` with these endpoints (TanStack Query) and wiring the admin pages.
- Image uploads go to local `uploads/`. Swap `POST /admin/uploads` for Cloudinary/S3 in production.
- Email is logged to the console until `SMTP_URL` is set.
- Courier integration (Shiprocket etc.): status and tracking number are entered by hand in the admin for now.
