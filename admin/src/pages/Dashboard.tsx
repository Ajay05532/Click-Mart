import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.ts'
import { useAuth } from '../auth.tsx'
import { dateTime, inr, label, num } from '../format.ts'
import type { Order } from '../types.ts'
import { Badge, Card, ErrorState, PageHeader, PageLoader, Select, Table, Td } from '../ui.tsx'
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
type Summary = { ordersNeedingAction: number; toPack: number; toShip: number; outOfStock: number; lowStock: number }

export function DashboardPage() {
  const { isAdmin, user } = useAuth()
  const [days, setDays] = useState(30)
  const summary = useQuery({ queryKey: ['summary'], queryFn: () => api<Summary>('/admin/summary') })
  const analytics = useQuery({ queryKey: ['analytics', days], queryFn: () => api<Analytics>('/admin/analytics', { query: { days } }), enabled: isAdmin })
  const recent = useQuery({ queryKey: ['orders', 'recent'], queryFn: () => api<{ items: Order[] }>('/admin/orders', { query: { pageSize: 6 } }) })

  return (
    <>
      <PageHeader
        title={`Welcome back, ${user?.name.split(' ')[0] ?? 'there'}`}
        subtitle="Here is what is happening in your store."
        actions={isAdmin && <Select value={days} onChange={(event) => setDays(Number(event.target.value))} aria-label="Date range" className="!w-40"><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></Select>}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Action to="/orders?status=CONFIRMED" tone="orange" title="To pack" value={summary.data?.toPack} hint="Confirmed orders waiting" />
        <Action to="/orders?status=PACKED" tone="blue" title="To ship" value={summary.data?.toShip} hint="Packed, add tracking" />
        <Action to="/inventory?filter=low" tone="orange" title="Low stock" value={summary.data?.lowStock} hint="Running out soon" />
        <Action to="/inventory?filter=out" tone="red" title="Out of stock" value={summary.data?.outOfStock} hint="Not purchasable" />
      </div>

      {isAdmin && (
        <>
          {analytics.isLoading ? <PageLoader /> : analytics.error ? <Card className="mt-6"><ErrorState error={analytics.error} retry={() => void analytics.refetch()} /></Card> : analytics.data && <AdminStats data={analytics.data} />}
        </>
      )}

      <Card className="mt-6">
        <div className="flex items-center justify-between px-5 pt-5">
          <h2 className="font-extrabold">Recent orders</h2>
          <Link to="/orders" className="text-xs font-bold text-brand">View all →</Link>
        </div>
        <Table head={['Order', 'Customer', 'Total', 'Status', 'Placed']} className="mt-2">
          {recent.data?.items.map((order) => (
            <tr key={order.id} className="hover:bg-canvas/60">
              <Td><Link to={`/orders?open=${order.id}`} className="font-bold text-brand">{order.code}</Link></Td>
              <Td>{order.customer.name}</Td>
              <Td className="font-semibold">{inr(order.total)}</Td>
              <Td><OrderStatusBadge status={order.status} /></Td>
              <Td className="text-muted">{dateTime(order.placedAt)}</Td>
            </tr>
          ))}
        </Table>
        {recent.isLoading && <PageLoader />}
      </Card>
    </>
  )
}

function Action({ to, title, value, hint, tone }: { to: string; title: string; value?: number; hint: string; tone: 'orange' | 'blue' | 'red' }) {
  const colors = { orange: 'bg-orange-50 text-orange-700', blue: 'bg-brand-soft text-brand', red: 'bg-rose-50 text-rose-700' }
  return (
    <Link to={to} className="rounded-2xl border border-line/80 bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:border-brand/20 hover:shadow-pop">
      <p className="text-xs font-bold tracking-wider text-muted uppercase">{title}</p>
      <p className="mt-2 flex items-center gap-3 text-3xl font-extrabold">
        {value ?? '–'}
        {value ? <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${colors[tone]}`}>Action</span> : null}
      </p>
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </Link>
  )
}

function AdminStats({ data }: { data: Analytics }) {
  const max = Math.max(1, ...data.daily.map((day) => day.revenue))
  const catMax = Math.max(1, ...data.revenueByCategory.map((row) => row.revenue))
  const stats = [
    { title: 'Revenue', value: inr(data.revenue), hint: `${inr(data.today.revenue)} today` },
    { title: 'Orders', value: num(data.orders), hint: `${data.today.orders} today` },
    { title: 'Average order', value: inr(data.averageOrderValue), hint: `${inr(data.couponDiscountGiven)} in coupons` },
    { title: 'New customers', value: num(data.newCustomers), hint: `in ${data.rangeDays} days` },
  ]
  return (
    <>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title} className="p-5">
            <p className="text-xs font-bold tracking-wider text-muted uppercase">{stat.title}</p>
            <p className="mt-2 text-2xl font-extrabold">{stat.value}</p>
            <p className="mt-1 text-xs text-muted">{stat.hint}</p>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card className="p-5">
          <h2 className="font-extrabold">Revenue</h2>
          <div className="mt-6 flex h-56 items-end gap-[3px]" role="img" aria-label="Daily revenue bar chart">
            {data.daily.map((day) => (
              <div key={day.day} className="group relative flex h-full flex-1 items-end">
                <div className="w-full rounded-t bg-brand/80 transition group-hover:bg-accent" style={{ height: `${Math.max(day.revenue ? 3 : 1, (day.revenue / max) * 100)}%` }} />
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-lg bg-ink px-2 py-1 text-[11px] font-bold whitespace-nowrap text-white group-hover:block">
                  {new Date(day.day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {inr(day.revenue)} · {day.orders} orders
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-muted">
            <span>{new Date(data.daily[0]!.day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
            <span>Today</span>
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="font-extrabold">Orders by status</h2>
          <ul className="mt-4 space-y-2.5">
            {Object.entries(data.ordersByStatus).map(([status, count]) => (
              <li key={status} className="flex items-center justify-between text-sm">
                <span className="text-ink-soft">{label(status)}</span>
                <span className="font-bold">{count}</span>
              </li>
            ))}
            {Object.keys(data.ordersByStatus).length === 0 && <li className="text-sm text-muted">No orders in this period.</li>}
          </ul>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="p-5">
          <h2 className="font-extrabold">Top products</h2>
          <ul className="mt-4 space-y-3">
            {data.topProducts.map((product, index) => (
              <li key={product.name} className="flex items-center gap-3 text-sm">
                <span className="grid size-6 place-items-center rounded-full bg-canvas text-[11px] font-extrabold">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate font-semibold">{product.name}</span>
                <span className="text-xs text-muted">{product.units} sold</span>
                <span className="font-bold">{inr(product.revenue)}</span>
              </li>
            ))}
            {data.topProducts.length === 0 && <li className="text-sm text-muted">No sales yet.</li>}
          </ul>
        </Card>
        <Card className="p-5">
          <h2 className="font-extrabold">Revenue by category</h2>
          <ul className="mt-4 space-y-3">
            {data.revenueByCategory.map((row) => (
              <li key={row.category} className="text-sm">
                <div className="flex justify-between"><span className="font-semibold capitalize">{row.category}</span><span className="font-bold">{inr(row.revenue)}</span></div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-canvas"><div className="h-full rounded-full bg-accent" style={{ width: `${(row.revenue / catMax) * 100}%` }} /></div>
              </li>
            ))}
            {data.revenueByCategory.length === 0 && <li className="text-sm text-muted">No sales yet.</li>}
          </ul>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between"><h2 className="font-extrabold">Low stock</h2><Link to="/inventory?filter=low" className="text-xs font-bold text-brand">Manage →</Link></div>
          <ul className="mt-4 space-y-2.5">
            {data.lowStock.map((item) => (
              <li key={item.variantId} className="flex items-center justify-between text-sm">
                <span className="min-w-0 truncate font-semibold">{item.product} <span className="font-normal text-muted">{item.size}</span></span>
                <Badge tone={item.stock === 0 ? 'red' : 'orange'}>{item.stock === 0 ? 'Out' : `${item.stock} left`}</Badge>
              </li>
            ))}
            {data.lowStock.length === 0 && <li className="text-sm text-muted">Everything is well stocked.</li>}
          </ul>
        </Card>
      </div>
    </>
  )
}
