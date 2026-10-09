# ClickMart storefront

React 19 + TypeScript + Vite + Tailwind v4 + TanStack Query. All data comes from the backend API (`../backend`).

```bash
npm install
npm run dev        # http://localhost:5173, proxies /api to http://localhost:3000
```

Start the backend first (see `../backend/README.md`). For production set `VITE_API_URL` to the API's public URL and `VITE_ADMIN_URL` to the admin app.

Guests can browse, shop and check out; logged-in customers also get saved addresses, order history, a synced cart and wishlist.
