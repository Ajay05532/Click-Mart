import { useState } from 'react'
import { Link } from 'react-router-dom'
import { SalesChart } from '../../components/admin/SalesChart.tsx'
import { StatusBadge } from '../../components/admin/StatusBadge.tsx'
import { seedOrders } from '../../data/admin.ts'
import { products } from '../../data/products.ts'
import { formatNumber, formatPrice } from '../../lib/money.ts'
import { loadPlacedOrders } from '../../lib/orders.ts'

const stats = [
  { label: 'Revenue', value: '₹2,48,750', change: '+12.4% vs last month' },
  { label: 'Total Orders', value: '487', change: '+8.2% vs last month' },
  { label: 'Customers', value: '1,236', change: '+5.1% vs last month' },
  { label: 'Avg. Order Value', value: '₹511', change: 'This month' },
]

export function DashboardPage() {
  const [orders] = useState(() => [...loadPlacedOrders(), ...seedOrders].slice(0, 5))
  const lowStock = products.filter((product) => product.stock > 0 && product.stock <= 12)
  const top = [...products].sort((a, b) => b.sold - a.sold).slice(0, 5)
  const maxSold = top[0]?.sold ?? 1

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <article key={stat.label} className="rounded-2xl border border-line bg-white p-5 shadow-sm">
            <p className="text-sm text-muted">{stat.label}</p>
            <p className="mt-2 text-2xl font-bold">{stat.value}</p>
            <p className="mt-1 text-xs font-medium text-success">{stat.change}</p>
          </article>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Sales Overview</h2>
            <span className="text-xs text-muted">Last 12 months</span>
          </div>
          <div className="mt-4">
            <SalesChart />
          </div>
        </section>
        <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Recent Orders</h2>
            <Link to="/admin/orders" className="text-xs font-semibold text-brand">
              View all
            </Link>
          </div>
          <ul className="mt-4 divide-y divide-line">
            {orders.map((order) => (
              <li key={order.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <p className="font-semibold">{order.id}</p>
                  <p className="text-muted">{order.customer}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{formatPrice(order.amount)}</p>
                  <StatusBadge status={order.status} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Low Stock Alert</h2>
          <ul className="mt-4 space-y-3">
            {lowStock.map((product) => (
              <li key={product.id} className="flex items-center justify-between text-sm">
                <span>
                  {product.name} ({product.featuredSize})
                </span>
                <span className="font-semibold text-rose-600">{product.stock} left</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Top Products</h2>
          <ul className="mt-4 space-y-3">
            {top.map((product) => (
              <li key={product.id}>
                <div className="flex justify-between text-sm">
                  <span>{product.name}</span>
                  <span className="text-muted">{formatNumber(product.sold)} sold</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-canvas">
                  <div className="h-2 rounded-full bg-brand" style={{ width: `${(product.sold / maxSold) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
