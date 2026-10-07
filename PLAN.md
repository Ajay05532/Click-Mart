# ClickMart: Backend + Admin Dashboard Plan

## 1. Where we are today

| Area | State |
|---|---|
| Storefront | React 19 + Vite + Tailwind v4. All data (products, categories, coupons, reviews) is hard-coded in `frontend/src/data/*`. |
| State | Cart, wishlist, user and orders live in `localStorage`. There is no real login. |
| Admin UI | `/admin/*` pages exist (dashboard, products, categories, orders, customers, coupons, reviews, banners, analytics, settings) but are **read-only** and use seed data. |
| Backend | `backend/src/index.js` is an Express 5 skeleton with only `/health`. |
| Payments / tracking | Simulated in the browser (demo clock for tracking, fake payment overlay). |

Goal: replace the local data with a real API and database, and make the admin dashboard fully functional so a store owner can run the shop without touching code.

## 2. Recommended stack

| Concern | Choice | Why |
|---|---|---|
| Runtime / API | Node 22 + **Express 5** (already installed) | No rewrite. Keep ESM. |
| Language | Move backend to **TypeScript** | Share types with the frontend. |
| Database | **PostgreSQL** | Relational data (orders, stock, coupons) needs transactions. |
| ORM / migrations | **Prisma** | Typed queries, easy migrations and seeding. |
| Validation | **Zod** (shared schemas) | One schema validates the API and the forms. |
| Auth | Email + password (argon2), **JWT access token + httpOnly refresh cookie**, roles | Stateless, safe from XSS token theft. |
| Images | **Cloudinary** (or S3) with signed uploads | Admin uploads product photos without the server storing files. |
| Payments | **Razorpay** (UPI, cards, netbanking, COD flag) | Best fit for the Indian market, matches the current checkout. |
| Email / SMS | Resend or SES for email, MSG91 for SMS | Order confirmation and shipping updates. |
| Frontend data | **TanStack Query** | Caching, loading and error states, optimistic updates. |
| Jobs | **BullMQ + Redis** (phase 4) | Emails, low-stock alerts, abandoned carts. |
| Hosting | API on Railway/Render/Fly, DB on Neon/Supabase, frontend on Vercel/Netlify | Cheap and simple to start. |

## 3. Data model (Prisma, core tables)

- **User**: id, name, email, phone, passwordHash, `role` (CUSTOMER | ADMIN | STAFF), createdAt
- **Address**: userId, name, phone, line, city, state, pin, isDefault
- **Category**: id, name, slug, image, tagline, parentId (supports hundreds of categories and subcategories), sortOrder, isActive
- **Product**: id, slug, name, categoryId, blurb, description, highlights[], nutrition (JSON), image(s), isActive, isBestseller, ratingAvg, ratingCount
- **ProductVariant** (the pack sizes): productId, size (100g, 250g…), sku, **price**, **mrp**, **stock**, lowStockAt, isActive
- **StockMovement**: variantId, delta, reason (SALE | RESTOCK | ADJUSTMENT | RETURN), orderId?, userId, createdAt (full audit trail of stock changes)
- **Coupon**: code, type (PERCENT | FLAT | FREE_SHIPPING), value, minOrder, maxDiscount, startsAt, endsAt, usageLimit, perUserLimit, appliesTo (all / categories / products), isActive
- **Sale / Offer**: name, discountType, value, startsAt, endsAt, targets (products or categories), badge text. Drives the On Sale page and automatic price cuts.
- **Banner**: title, subtitle, image, link, placement (HERO | PROMO), sortOrder, startsAt, endsAt, isActive
- **Cart / CartItem**: persisted for logged-in users, merged with the guest cart on login
- **Wishlist**: userId, productId
- **Order**: id (ORD-xxxx), userId?, guest email/phone, address snapshot, subtotal, discount, shipping, tax, total, couponCode, `status`, `paymentStatus`, paymentMethod, createdAt
- **OrderItem**: orderId, variantId, name/size/price **snapshot**, quantity
- **OrderEvent**: orderId, status, note, createdAt (this becomes the real tracking timeline, replacing the demo clock)
- **Payment**: orderId, provider, providerOrderId, providerPaymentId, amount, status, rawPayload
- **Review**: productId, userId, rating, comment, status (PENDING | APPROVED | REJECTED), createdAt
- **Setting**: key/value store (store name, contact, free-shipping threshold, shipping fee, tax rate, support email)
- **AuditLog**: actorId, action, entity, entityId, diff, createdAt

Order statuses: `PLACED → CONFIRMED → PACKED → SHIPPED → OUT_FOR_DELIVERY → DELIVERED`, plus `CANCELLED` and `RETURNED`.

## 4. API surface (REST, `/api/v1`)

**Public / customer**
- `GET /products` (filters: category, price, size, stock, sort, search, page), `GET /products/:slug`, `GET /categories`, `GET /offers`, `GET /banners`
- `POST /auth/register|login|refresh|logout`, `GET/PATCH /me`, `CRUD /me/addresses`
- `GET/PUT /cart`, `POST /cart/coupon`, `GET/POST/DELETE /wishlist`
- `POST /checkout` (validates stock and price server-side, creates Order and Razorpay order)
- `POST /payments/webhook` (Razorpay, verified by signature), `POST /payments/verify`
- `GET /orders`, `GET /orders/:id`, `GET /track/:id` (needs order ID + phone/email), `POST /orders/:id/cancel`
- `POST /products/:id/reviews`

**Admin** (role ADMIN or STAFF, prefix `/admin`)
- Products and variants: CRUD, bulk price update, CSV import/export, image upload signature, toggle active/bestseller
- **Stock**: `PATCH /variants/:id/stock` (set or adjust with a reason), low-stock list, stock history
- Categories: CRUD, reorder
- Offers, coupons, banners: CRUD, schedule, enable/disable
- Orders: list/filter/search, detail, **update status** (writes OrderEvent and emails the customer), refund, print invoice and packing slip
- Customers: list, detail with order history
- Reviews: approve / reject / reply
- Analytics: revenue by day/week/month, orders, AOV, top products, low stock, conversion, coupon usage
- Settings, staff accounts and roles, audit log

## 5. Admin dashboard (build on the existing `/admin` routes)

| Page | Capabilities |
|---|---|
| **Dashboard** | Today's revenue/orders/new customers, sales chart with date range, orders needing action, low-stock alerts, top sellers |
| **Products** | Searchable, filterable table; create/edit drawer with images, description, nutrition, **pack-size variants with price, MRP and stock**; bulk actions (activate, price change, delete); CSV import/export |
| **Inventory** | Stock per variant, inline edit, restock form, low-stock threshold, movement history, out-of-stock filter |
| **Categories** | Tree with drag-to-reorder, image, active toggle |
| **Offers & coupons** | Create percent/flat/free-shipping rules, pick products or categories, start/end dates, usage limits, live preview of the storefront price |
| **Banners** | Upload, schedule, order, placement preview |
| **Orders** | Status pipeline (kanban or table), filters, order detail with timeline and "Mark packed/shipped/delivered", tracking number, refund/cancel, invoice PDF |
| **Customers** | Search, lifetime value, order history, block |
| **Reviews** | Moderation queue |
| **Analytics** | Revenue, AOV, repeat rate, category/product performance, coupon performance, CSV export |
| **Settings** | Store info, shipping fee and free-shipping threshold, tax, payment toggles (enable/disable COD), staff and roles |

Cross-cutting: role-based menu (STAFF cannot see settings or finances), form validation with Zod, toasts, confirm dialogs for destructive actions, table pagination and URL-synced filters, audit log of every change.

## 6. Key rules the backend must enforce

1. **Never trust the browser's prices.** Recompute subtotal, discount, shipping and total on the server from the database at checkout.
2. **Stock is decremented in a database transaction** at order time (and restored on cancellation or payment failure) to prevent overselling.
3. **Payment confirmation comes only from the webhook or signature verification**, never from the client redirect.
4. **Order items snapshot** name, price and size so later edits do not change old orders.
5. Coupon validity (dates, usage limit, minimum order, applicability) is checked server-side every time.
6. Admin routes require role checks. Rate limit auth and checkout. Use Helmet, CORS allow-list, and hashed passwords.
7. Track endpoint requires order ID plus the phone or email used, so order data is not guessable.

## 7. Phases

**Phase 0: Foundations (about 2 days)**
Convert backend to TypeScript, set up Postgres + Prisma, env config, error handling, Zod validation, logging, Docker compose for local DB, seed script that imports the current `frontend/src/data/*`.

**Phase 1: Catalogue API + admin products (about 1 week)**
Categories, products, variants, stock endpoints, image upload. Auth with roles and admin login. Frontend: replace `data/products.ts` with API calls (TanStack Query) and make Admin Products, Inventory and Categories fully editable.
*Done when:* an admin can add a product with photos and pack prices, change stock, and the storefront shows it immediately.

**Phase 2: Offers, coupons, banners (about 4 days)**
Offer and coupon engine, banners, On Sale page and home hero driven by the API, server-side coupon validation in cart.
*Done when:* creating a 20% sale on Almonds in the admin updates the shop and the On Sale page without a deploy.

**Phase 3: Customers, cart, checkout, orders (about 1.5 weeks)**
Real register/login, persisted cart and wishlist, addresses, server-priced checkout, Razorpay integration plus COD, order and OrderEvent tables, real tracking page, order emails. Admin Orders with status updates and refunds.
*Done when:* a customer can pay, receive a confirmation email, and watch the status change as an admin updates it.

**Phase 4: Insights and polish (about 1 week)**
Analytics queries, low-stock alerts, review moderation, CSV import/export, audit log, invoice PDFs, abandoned-cart emails, staff roles.

**Phase 5: Production readiness (about 3 days)**
Automated tests (API integration tests plus a few Playwright checkout flows), CI, error monitoring (Sentry), backups, rate limits, deploy pipelines, load test of checkout.

Rough total: **5 to 6 weeks** for one developer.

## 8. Suggested folder structure

```
backend/
  prisma/ schema.prisma, migrations/, seed.ts
  src/
    app.ts, server.ts, config/
    modules/
      auth/ users/ catalog/ inventory/ offers/ coupons/ banners/
      cart/ checkout/ orders/ payments/ reviews/ analytics/ settings/
        (each: routes.ts, controller.ts, service.ts, schema.ts)
    middleware/ auth, roles, validate, errors, rateLimit
    lib/ prisma, mailer, storage, razorpay, logger
packages/shared/   Zod schemas and types used by both apps
frontend/src/api/  typed client + TanStack Query hooks
frontend/src/pages/admin/  one folder per admin section
```

## 9. Decisions I need from you

1. **Database and hosting**: PostgreSQL via Neon/Supabase (recommended), or do you already have a preference or a server?
2. **Payments**: Razorpay (recommended for India), or Stripe/Cashfree? Is COD required at launch?
3. **Images**: Cloudinary (easiest) or S3?
4. **Admin users**: one owner account, or several staff with different permissions?
5. **Shipping**: manual status updates by the admin first, or integrate a courier API (Shiprocket/Delhivery) for automatic tracking?
6. **Scope**: do you want multi-warehouse stock, GST invoices and returns in the first release, or later?

## 10. Suggested first step

Start Phase 0 and Phase 1 together: set up Postgres + Prisma, seed it from the current product data, build auth and the Products/Inventory admin, and switch the storefront's shop and product pages to the API. That gives a working "admin changes a price, the site updates" loop quickly, and everything else builds on it.
