import { useState, type ReactNode } from 'react'
import { SalesChart } from '../../components/admin/SalesChart.tsx'
import { StatusBadge } from '../../components/admin/StatusBadge.tsx'
import { ProductMedia } from '../../components/product/ProductMedia.tsx'
import { customers, seedOrders } from '../../data/admin.ts'
import { categories, featuredPack, products } from '../../data/products.ts'
import { coupons } from '../../data/promotions.ts'
import { reviews } from '../../data/reviews.ts'
import { formatNumber, formatPrice } from '../../lib/money.ts'
import { loadPlacedOrders } from '../../lib/orders.ts'

function Panel({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
      {title && <h2 className="mb-4 font-semibold">{title}</h2>}
      {children}
    </section>
  )
}

export function ProductsAdminPage() {
  const [query, setQuery] = useState('')
  const list = products.filter((product) => product.name.toLowerCase().includes(query.toLowerCase()))

  return (
    <Panel>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search products"
        className="mb-4 h-10 w-full max-w-xs rounded-lg border border-line px-3 text-sm"
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-muted">
            <tr>
              <th className="pb-3 font-medium">Product</th>
              <th className="pb-3 font-medium">Category</th>
              <th className="pb-3 font-medium">Price</th>
              <th className="pb-3 font-medium">Stock</th>
              <th className="pb-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {list.map((product) => (
              <tr key={product.id} className="border-t border-line">
                <td className="py-3">
                  <span className="flex items-center gap-3">
                    <span className="size-10 overflow-hidden rounded-lg bg-canvas">
                      <ProductMedia name={product.name} image={product.image} art={product.art} className="size-full" />
                    </span>
                    {product.name}
                  </span>
                </td>
                <td className="capitalize">{product.category}</td>
                <td>{formatPrice(featuredPack(product).price)}</td>
                <td>{product.stock}</td>
                <td>{product.inStock ? 'In stock' : 'Out of stock'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

export function OrdersAdminPage() {
  const orders = [...loadPlacedOrders(), ...seedOrders]
  return (
    <Panel>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-muted">
            <tr>
              <th className="pb-3 font-medium">Order</th>
              <th className="pb-3 font-medium">Customer</th>
              <th className="pb-3 font-medium">Items</th>
              <th className="pb-3 font-medium">Amount</th>
              <th className="pb-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="border-t border-line">
                <td className="py-3 font-semibold">{order.id}</td>
                <td>{order.customer}</td>
                <td className="max-w-xs truncate">{order.items}</td>
                <td>{formatPrice(order.amount)}</td>
                <td>
                  <StatusBadge status={order.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

export function CategoriesAdminPage() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {categories.map((category) => {
        const count = products.filter((product) => product.category === category.id).length
        return (
          <article key={category.id} className="rounded-2xl border border-line bg-white p-5 shadow-sm">
            <h2 className="font-semibold">{category.name}</h2>
            <p className="mt-1 text-sm text-muted">{category.tagline}</p>
            <p className="mt-2 text-xs text-muted">{category.subcategories.map((item) => item.name).join(' · ')}</p>
            <p className="mt-3 text-sm font-medium text-brand">{count} products</p>
          </article>
        )
      })}
    </div>
  )
}

export function CustomersAdminPage() {
  return (
    <Panel>
      <table className="w-full text-left text-sm">
        <thead className="text-muted">
          <tr>
            <th className="pb-3 font-medium">Customer</th>
            <th className="pb-3 font-medium">City</th>
            <th className="pb-3 font-medium">Orders</th>
            <th className="pb-3 font-medium">Spent</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((customer) => (
            <tr key={customer.name} className="border-t border-line">
              <td className="py-3">{customer.name}</td>
              <td>{customer.city}</td>
              <td>{customer.orders}</td>
              <td>{formatPrice(customer.spent)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  )
}

export function CouponsAdminPage() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {coupons.map((coupon) => (
        <article key={coupon.code} className="rounded-2xl border border-dashed border-brand bg-white p-5 shadow-sm">
          <p className="text-lg font-bold tracking-wide text-brand">{coupon.code}</p>
          <p className="mt-2 text-sm text-muted">{coupon.label}</p>
          <p className="mt-3 text-sm font-medium">
            {coupon.type === 'percent' ? `${coupon.value}% off` : 'Shipping waived'}
          </p>
        </article>
      ))}
    </div>
  )
}

export function ReviewsAdminPage() {
  return (
    <div className="space-y-3">
      {reviews.map((review) => (
        <article key={review.id} className="rounded-2xl border border-line bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">
              {review.name} <span className="font-normal text-muted">· {review.city}</span>
            </p>
            <span className="text-sm text-amber-600">{review.rating} / 5</span>
          </div>
          <p className="mt-2 text-sm text-muted">{review.comment}</p>
        </article>
      ))}
    </div>
  )
}

export function BannersAdminPage() {
  const [banners, setBanners] = useState([
    { id: 'hero', title: 'Premium Dry Fruits for a Healthier You', active: true },
    { id: 'offer', title: 'Healthy Snacking Made Simple — 15% off', active: true },
  ])

  return (
    <div className="space-y-3">
      {banners.map((banner) => (
        <article key={banner.id} className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-white p-5 shadow-sm">
          <div>
            <p className="font-semibold">{banner.title}</p>
            <p className="text-sm text-muted">{banner.active ? 'Visible on the homepage' : 'Hidden'}</p>
          </div>
          <button
            type="button"
            onClick={() =>
              setBanners((current) =>
                current.map((item) => (item.id === banner.id ? { ...item, active: !item.active } : item)),
              )
            }
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              banner.active ? 'bg-emerald-50 text-emerald-700' : 'bg-canvas text-muted'
            }`}
          >
            {banner.active ? 'Active' : 'Paused'}
          </button>
        </article>
      ))}
    </div>
  )
}

export function AnalyticsAdminPage() {
  const totalSold = products.reduce((sum, product) => sum + product.sold, 0)
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <article className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm text-muted">Units sold</p>
          <p className="mt-2 text-2xl font-bold">{formatNumber(totalSold)}</p>
        </article>
        <article className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm text-muted">Active products</p>
          <p className="mt-2 text-2xl font-bold">{products.filter((product) => product.inStock).length}</p>
        </article>
        <article className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm text-muted">Categories</p>
          <p className="mt-2 text-2xl font-bold">{categories.length}</p>
        </article>
      </div>
      <Panel title="Sales Overview">
        <SalesChart />
      </Panel>
    </div>
  )
}

export function SettingsAdminPage() {
  const [saved, setSaved] = useState(false)
  return (
    <form
      className="max-w-xl rounded-2xl border border-line bg-white p-5 shadow-sm"
      onSubmit={(event) => {
        event.preventDefault()
        setSaved(true)
      }}
    >
      <label className="block text-sm">
        Store name
        <input defaultValue="ClickMart" className="mt-1 h-10 w-full rounded-lg border border-line px-3" />
      </label>
      <label className="mt-4 block text-sm">
        Support email
        <input defaultValue="hello@clickmart.com" className="mt-1 h-10 w-full rounded-lg border border-line px-3" />
      </label>
      <label className="mt-4 block text-sm">
        Free shipping above (₹)
        <input defaultValue="499" className="mt-1 h-10 w-full rounded-lg border border-line px-3" />
      </label>
      <button type="submit" className="mt-5 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white">
        Save settings
      </button>
      {saved && <p className="mt-3 text-sm text-success">Settings saved on this device.</p>}
    </form>
  )
}
