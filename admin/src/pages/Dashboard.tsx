import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.ts'
import { useAuth } from '../auth.tsx'
import { useCategories } from '../hooks.ts'
import { inr, num, timeAgo } from '../format.ts'
import type { Order, OrderStatus } from '../types.ts'
import { Badge, Card, ErrorState, Thumb } from '../ui.tsx'
import { OrderStatusBadge } from './Orders.tsx'

type Analytics = {
  rangeDays: number
  revenue: number
  orders: number
  averageOrderValue: number
  couponDiscountGiven: number
  today: { revenue: number; orders: number }
  newCustomers: number
  ordersByStatus: Record<string, number>
  daily: { day: string; revenue: number; orders: number }[]
  topProducts: { name: string; units: number; revenue: number }[]
  revenueByCategory: { category: string; revenue: number }[]
  lowStock: { variantId: string; product: string; size: string; stock: number }[]
  topCoupons: { code: string; usedCount: number }[]
}
type Summary = {
  ordersNeedingAction: number
  toPack: number
  toShip: number
  outOfStock: number
  lowStock: number
  supportNeedingReply: number
}

const flow: { status: OrderStatus; label: string }[] = [
  { status: 'PLACED', label: 'New' },
  { status: 'CONFIRMED', label: 'To pack' },
  { status: 'PACKED', label: 'To ship' },
  { status: 'SHIPPED', label: 'Shipped' },
  { status: 'OUT_FOR_DELIVERY', label: 'On the way' },
  { status: 'DELIVERED', label: 'Delivered' },
]

export function DashboardPage() {
  const { isAdmin, can, user } = useAuth()
  const [days, setDays] = useState(30)
  const summary = useQuery({ queryKey: ['summary'], queryFn: () => api<Summary>('/admin/summary') })
  const analytics = useQuery({ queryKey: ['analytics', days], queryFn: () => api<Analytics>('/admin/analytics', { query: { days } }), enabled: isAdmin })
  const categories = useCategories()
  const recent = useQuery({ queryKey: ['orders', 'recent'], queryFn: () => api<{ items: Order[] }>('/admin/orders', { query: { pageSize: 6 } }) })
  const categoryName = (id: string) => categories.data?.find((item) => item.id === id)?.name ?? 'Uncategorised'

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-extrabold tracking-tight">Welcome back, {user?.name.split(' ')[0] ?? 'there'}</h1>
          <p className="text-xs text-muted">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}</p>
        </div>
        {isAdmin && <Range days={days} onChange={setDays} />}
      </header>

      <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-3">
          {isAdmin && analytics.isLoading && <div className="h-44 animate-pulse rounded-2xl bg-white ring-1 ring-line" />}
          {isAdmin && analytics.error && (
            <Card>
              <ErrorState error={analytics.error} retry={() => void analytics.refetch()} />
            </Card>
          )}
          {analytics.data && <Performance data={analytics.data} />}
          {analytics.data && <Pipeline counts={analytics.data.ordersByStatus} />}
          <Recent orders={recent.data?.items} loading={recent.isLoading} />
        </div>

        <aside className="space-y-3">
          <Attention summary={summary.data} showTickets={can('support')} />
          {analytics.data && <TopProducts products={analytics.data.topProducts} />}
          {analytics.data && <Categories rows={analytics.data.revenueByCategory} nameOf={categoryName} />}
          {analytics.data && <Coupons coupons={analytics.data.topCoupons} saved={analytics.data.couponDiscountGiven} />}
          {analytics.data && <Stock items={analytics.data.lowStock} />}
        </aside>
      </div>
    </div>
  )
}

function Range({ days, onChange }: { days: number; onChange: (days: number) => void }) {
  return (
    <div className="flex rounded-full bg-white p-0.5 ring-1 ring-line" role="group" aria-label="Date range">
      {[7, 30, 90].map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={days === option}
          onClick={() => onChange(option)}
          className={`rounded-full px-3 py-1 text-xs font-bold ${days === option ? 'bg-ink text-white' : 'text-muted hover:text-ink'}`}
        >
          {option} days
        </button>
      ))}
    </div>
  )
}

function Performance({ data }: { data: Analytics }) {
  const daily = data.daily ?? []
  const max = Math.max(1, ...daily.map((day) => day.revenue))
  const metrics = [
    { label: 'Orders', value: num(data.orders), hint: `${data.today.orders} today` },
    { label: 'Average', value: inr(data.averageOrderValue), hint: 'per order' },
    { label: 'New customers', value: num(data.newCustomers), hint: `${data.rangeDays} days` },
  ]
  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <div className="border-b border-line p-4 lg:border-r lg:border-b-0">
          <p className="text-[11px] font-bold tracking-wider text-muted uppercase">Revenue</p>
          <p className="mt-1 text-2xl font-extrabold tracking-tight tabular-nums">{inr(data.revenue)}</p>
          <p className="mt-1 text-xs text-muted">{inr(data.today.revenue)} today</p>
        </div>
        <div className="p-4">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[11px] font-bold tracking-wider text-muted uppercase">Last {data.rangeDays} days</p>
            <p className="text-[11px] text-muted">{daily.filter((day) => day.orders > 0).length} days with a sale</p>
          </div>
          <div className="mt-3 flex h-24 items-end gap-px" role="img" aria-label="Daily revenue">
            {daily.map((day) => (
              <div key={day.day} className="group relative flex h-full flex-1 items-end">
                <div
                  className={`w-full rounded-t ${day.revenue ? 'bg-brand' : 'bg-canvas'} transition group-hover:bg-accent`}
                  style={{ height: `${Math.max(day.revenue ? 8 : 2, (day.revenue / max) * 100)}%` }}
                />
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-lg bg-ink px-2 py-1 text-[11px] font-bold whitespace-nowrap text-white group-hover:block">
                  {new Date(day.day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {inr(day.revenue)} · {day.orders} orders
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <dl className="grid grid-cols-3 divide-x divide-line border-t border-line">
        {metrics.map((metric) => (
          <div key={metric.label} className="px-4 py-3">
            <dt className="text-[11px] font-bold tracking-wider text-muted uppercase">{metric.label}</dt>
            <dd className="mt-0.5 text-sm font-extrabold tabular-nums">{metric.value}</dd>
            <dd className="text-[11px] text-muted">{metric.hint}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}

function Pipeline({ counts }: { counts: Record<string, number> }) {
  const ended = (counts.CANCELLED ?? 0) + (counts.RETURNED ?? 0)
  return (
    <Card className="px-3 py-3">
      <div className="mb-2 flex items-center justify-between gap-3 px-1">
        <h2 className="text-sm font-extrabold">Order pipeline</h2>
        {ended > 0 && <p className="text-[11px] text-muted">{ended} cancelled or returned</p>}
      </div>
      <ol className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
        {flow.map((step) => {
          const count = counts[step.status] ?? 0
          return (
            <li key={step.status}>
              <Link to={`/orders?status=${step.status}`} className="block rounded-xl bg-canvas px-2 py-2 text-center transition hover:bg-brand-soft">
                <span className="block text-base font-extrabold tabular-nums">{count}</span>
                <span className="block text-[11px] font-bold text-muted">{step.label}</span>
              </Link>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}

function Recent({ orders, loading }: { orders?: Order[]; loading: boolean }) {
  return (
    <Card>
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-sm font-extrabold">Recent orders</h2>
        <Link to="/orders" className="text-xs font-bold text-brand">View all</Link>
      </div>
      {loading && <div className="h-24 animate-pulse border-t border-line bg-canvas/60" />}
      {!loading && (orders?.length ?? 0) === 0 && <p className="border-t border-line px-4 py-6 text-sm text-muted">No orders yet.</p>}
      <ul className="divide-y divide-line border-t border-line">
        {orders?.map((order) => {
          const lines = order.items ?? []
          const first = lines[0]
          const extra = lines.length - 1
          return (
            <li key={order.id}>
              <Link to={`/orders?open=${order.id}`} className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-canvas/70">
                <Thumb src={first?.image} name={first?.name ?? order.code} size="size-9" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-extrabold text-brand">{order.code}</span>
                    <OrderStatusBadge status={order.status} />
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted">
                    {order.customer.name}
                    {first ? ` · ${first.name}` : ''}
                    {extra > 0 ? ` +${extra}` : ''}
                    {order.address.city ? ` · ${order.address.city}` : ''}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block text-sm font-extrabold tabular-nums">{inr(order.total)}</span>
                  <span className="text-[11px] text-muted">{timeAgo(order.placedAt)}</span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

function Attention({ summary, showTickets }: { summary?: Summary; showTickets: boolean }) {
  const rows = [
    { to: '/orders?status=PLACED', label: 'New orders', value: summary ? summary.ordersNeedingAction - summary.toPack : undefined, hint: 'Just placed' },
    { to: '/orders?status=CONFIRMED', label: 'Ready to pack', value: summary?.toPack, hint: 'Confirmed' },
    { to: '/orders?status=PACKED', label: 'Ready to ship', value: summary?.toShip, hint: 'Add a tracking number' },
    { to: '/inventory?filter=low', label: 'Low stock', value: summary?.lowStock, hint: 'Reorder soon' },
    { to: '/inventory?filter=out', label: 'Out of stock', value: summary?.outOfStock, hint: 'Hidden from buyers' },
    ...(showTickets ? [{ to: '/support?view=needsReply', label: 'Tickets waiting', value: summary?.supportNeedingReply, hint: 'Needs a reply' }] : []),
  ]
  return (
    <Card className="p-3">
      <h2 className="px-1 text-sm font-extrabold">Needs attention</h2>
      <ul className="mt-1">
        {rows.map((row) => (
          <li key={row.to}>
            <Link to={row.to} className="flex items-center gap-2 rounded-lg px-1 py-1.5 transition hover:bg-canvas">
              <span className={`grid size-7 place-items-center rounded-lg text-xs font-extrabold tabular-nums ${row.value ? 'bg-brand-soft text-brand' : 'bg-canvas text-muted'}`}>
                {row.value ?? '–'}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold">{row.label}</span>
                <span className="block text-[11px] text-muted">{row.hint}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function TopProducts({ products }: { products: Analytics['topProducts'] }) {
  const max = Math.max(1, ...products.map((product) => product.revenue))
  return (
    <Card className="p-3">
      <h2 className="px-1 text-sm font-extrabold">Top products</h2>
      {products.length === 0 ? (
        <p className="px-1 py-3 text-xs text-muted">No sales in this period.</p>
      ) : (
        <ul className="mt-2 space-y-2 px-1">
          {products.slice(0, 5).map((product) => (
            <li key={product.name}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="min-w-0 truncate font-semibold">{product.name}</span>
                <span className="shrink-0 text-xs font-bold tabular-nums">{inr(product.revenue)}</span>
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-canvas">
                <div className="h-full rounded-full bg-brand" style={{ width: `${(product.revenue / max) * 100}%` }} />
              </div>
              <p className="mt-0.5 text-[11px] text-muted">{product.units} sold</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function Categories({ rows, nameOf }: { rows: Analytics['revenueByCategory']; nameOf: (id: string) => string }) {
  const max = Math.max(1, ...rows.map((row) => row.revenue))
  return (
    <Card className="p-3">
      <h2 className="px-1 text-sm font-extrabold">By category</h2>
      {rows.length === 0 ? (
        <p className="px-1 py-3 text-xs text-muted">No sales in this period.</p>
      ) : (
        <ul className="mt-2 space-y-2 px-1">
          {rows.slice(0, 4).map((row) => (
            <li key={row.category} className="text-sm">
              <div className="flex justify-between gap-2">
                <span className="min-w-0 truncate font-semibold">{nameOf(row.category)}</span>
                <span className="font-bold tabular-nums">{inr(row.revenue)}</span>
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-canvas">
                <div className="h-full rounded-full bg-accent" style={{ width: `${(row.revenue / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function Coupons({ coupons, saved }: { coupons: Analytics['topCoupons']; saved: number }) {
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-extrabold">Coupons</h2>
        <Link to="/coupons" className="text-xs font-bold text-brand">Manage</Link>
      </div>
      <p className="px-1 pt-1 text-[11px] text-muted">{inr(saved)} given away in this period</p>
      {coupons.length === 0 ? (
        <p className="px-1 py-2 text-xs text-muted">No coupon has been used yet.</p>
      ) : (
        <ul className="mt-2">
          {coupons.slice(0, 4).map((coupon) => (
            <li key={coupon.code} className="flex items-center justify-between px-1 py-1 text-sm">
              <span className="font-bold tracking-wide">{coupon.code}</span>
              <span className="text-xs text-muted">{coupon.usedCount} used</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function Stock({ items }: { items: Analytics['lowStock'] }) {
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-extrabold">Stock watch</h2>
        <Link to="/inventory?filter=low" className="text-xs font-bold text-brand">Inventory</Link>
      </div>
      {items.length === 0 ? (
        <p className="px-1 py-3 text-xs text-muted">Every pack is well stocked.</p>
      ) : (
        <ul className="mt-2 space-y-1.5 px-1">
          {items.slice(0, 5).map((item) => (
            <li key={item.variantId} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">
                <span className="font-semibold">{item.product}</span> <span className="text-muted">{item.size}</span>
              </span>
              <Badge tone={item.stock === 0 ? 'red' : 'orange'}>{item.stock === 0 ? 'Out' : `${item.stock} left`}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
