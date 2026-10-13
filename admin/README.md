# ClickMart Admin

The control panel for the people who run the shop. React 19 + TypeScript + Vite + Tailwind v4 + TanStack Query, the same stack as the storefront. It uses the `/api/v1/admin/*` endpoints of the existing backend, so there is one source of truth for products, stock, offers and orders.

## Run

```bash
# 1. backend (see ../backend/README.md): API on :3000, data in Supabase
cd ../backend && npm run dev   # needs backend/.env with your SUPABASE_URL and SUPABASE_SERVICE_KEY (see ../backend/README.md)

# 2. admin on http://localhost:5175
cd ../admin && npm install && npm run dev
```

Sign in with an admin account.

The dev server proxies `/api` and `/uploads` to the backend, so no CORS setup is needed locally. For production, build with `VITE_API_URL=https://api.yourdomain.com npm run build`, and add the admin's origin to `CORS_ORIGINS` in the backend.

## What it does

| Section | Who | What you can do |
|---|---|---|
| Dashboard | all (revenue panels: admin) | Orders to pack/ship, low and out-of-stock alerts, revenue chart, top products, sales by category |
| Orders | all | Filter by status, search, full order view, move through Confirm → Packed → Shipped (courier + tracking no.) → Delivered, cancel, mark returned, print invoice. Refunds: admin |
| Products | all (delete: admin) | Create and edit with photos, pack sizes (price, MRP, opening stock), nutrition, bestseller flag, hide/show; bulk show/hide/bestseller/price change |
| Inventory | all | Live stock per pack size, add/remove or set exact count with a reason, full change history, low-stock filter |
| Categories | all | Categories and subcategories, reorder, hide, delete empty ones |
| Offers | all | Automatic sale prices by percent or flat amount, for categories or products, scheduled with start/end dates |
| Coupons | admin | Percent, flat or free-shipping codes with minimum order, caps, usage limits and dates |
| Banners | all | Home page hero/promo banners with images, schedule and order |
| Reviews | all | Approve, reject or delete customer reviews |
| Customers | all (block: admin) | Search, order history, saved addresses |
| My account | all | Change your name and password (other devices are signed out); forgot-password emails a reset link |
| Team, Settings, Activity log | admin | Add staff, shipping fee and free-shipping threshold, COD on/off, audit trail |

Sessions: a short-lived access token is kept in memory and a rotating refresh token lives in an httpOnly cookie, so a page refresh keeps you signed in without storing secrets in localStorage.
