import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatPrice } from '../../lib/money.ts'
import { formatDateTime, formatDay, isEnded, stageOf, statusLabel, trackingStages, useMyOrders, type ApiOrder, type OrderStatus } from '../../lib/orders.ts'
import { CheckIcon } from '../icons.tsx'
import { ProductMedia } from '../product/ProductMedia.tsx'
import { Badge } from '../ui/Primitives.tsx'

type Filter = 'all' | 'active' | 'delivered' | 'ended'
const PAGE = 5
const LINES = 2

const groupOf = (order: ApiOrder): Exclude<Filter, 'all'> => (isEnded(order.status) ? 'ended' : order.status === 'DELIVERED' ? 'delivered' : 'active')
const filters: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'In progress' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'ended', label: 'Cancelled' },
]

export function OrderList() {
  const query = useMyOrders()
  const [filter, setFilter] = useState<Filter>('all')
  const [shown, setShown] = useState(PAGE)

  if (query.isLoading) {
    return (
      <div className="space-y-3" aria-busy="true">
        {[0, 1, 2].map((index) => (
          <div key={index} className="card h-36 animate-pulse" />
        ))}
      </div>
    )
  }
  if (query.isError) {
    return (
      <div className="card px-6 py-12 text-center">
        <p className="font-extrabold">We could not load your orders</p>
        <button type="button" onClick={() => void query.refetch()} className="btn btn-brand btn-sm mt-4">
          Try again
        </button>
      </div>
    )
  }

  const orders = query.data ?? []
  const counts = { all: orders.length, active: 0, delivered: 0, ended: 0 }
  for (const order of orders) counts[groupOf(order)] += 1
  const visible = filter === 'all' ? orders : orders.filter((order) => groupOf(order) === filter)
  const page = visible.slice(0, shown)

  return (
    <div>
      <div role="tablist" aria-label="Filter orders" className="no-scrollbar -mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1">
        {filters
          .filter((item) => item.id === 'all' || counts[item.id] > 0)
          .map((item) => {
            const active = filter === item.id
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setFilter(item.id)
                  setShown(PAGE)
                }}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold transition ${active ? 'bg-ink text-white' : 'bg-white text-ink-soft ring-1 ring-line hover:ring-brand/40'}`}
              >
                {item.label}
                <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${active ? 'bg-white/20' : 'bg-canvas text-muted'}`}>{counts[item.id]}</span>
              </button>
            )
          })}
      </div>

      {page.length === 0 ? (
        <p className="card px-6 py-10 text-center text-sm text-muted">No orders here.</p>
      ) : (
        <ul className="space-y-3">
          {page.map((order) => (
            <li key={order.id}>{isEnded(order.status) ? <EndedOrder order={order} /> : <OrderCard order={order} />}</li>
          ))}
        </ul>
      )}

      {visible.length > shown && (
        <button type="button" onClick={() => setShown((value) => value + PAGE)} className="btn btn-outline mt-4 w-full">
          Show more orders ({visible.length - shown} more)
        </button>
      )}
    </div>
  )
}

function Thumbs({ order, size = 'size-12' }: { order: ApiOrder; size?: string }) {
  const lines = order.items.slice(0, 3)
  return (
    <span className="flex shrink-0 -space-x-3">
      {lines.map((line, index) => (
        <span key={`${line.name}-${line.size}`} className={`${size} overflow-hidden rounded-xl bg-canvas ring-2 ring-white`} style={{ zIndex: 3 - index }}>
          <ProductMedia name={line.name} image={line.image} art={line.art ?? 'mix'} className="size-full" />
        </span>
      ))}
    </span>
  )
}

const itemCount = (order: ApiOrder) => order.items.reduce((sum, line) => sum + line.quantity, 0)

/** A cancelled or returned order: one compact row, with the reason. */
function EndedOrder({ order }: { order: ApiOrder }) {
  const last = [...order.events].reverse().find((event) => isEnded(event.status))
  const failedPayment = order.paymentStatus === 'FAILED' || /payment/i.test(last?.note ?? '')
  const reason = failedPayment ? 'Payment was not completed, so nothing was charged.' : last?.note || statusLabel[order.status]
  const first = order.items[0]
  const more = order.items.length - 1
  return (
    <Link to={`/order/${order.code}`} className="card flex items-center gap-3 p-3 transition hover:border-brand/30 sm:gap-4 sm:p-4">
      <span className="opacity-60 grayscale">
        <Thumbs order={order} size="size-11" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-extrabold text-ink">{order.code}</span>
          <Badge tone="accent">{statusLabel[order.status]}</Badge>
          <span className="text-xs text-muted">{formatDateTime(order.placedAt)}</span>
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted">
          {first ? `${first.name} ${first.size}${more > 0 ? ` +${more} more` : ''} · ` : ''}
          {reason}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-sm font-extrabold text-muted tabular-nums line-through decoration-1">{formatPrice(order.total)}</span>
        <span className="text-xs font-bold text-brand">Details ›</span>
      </span>
    </Link>
  )
}

function OrderCard({ order }: { order: ApiOrder }) {
  const [allLines, setAllLines] = useState(false)
  const delivered = order.status === 'DELIVERED'
  const lines = allLines ? order.items : order.items.slice(0, LINES)
  const hidden = order.items.length - lines.length
  const count = itemCount(order)
  const deliveredAt = delivered ? [...order.events].reverse().find((event) => event.status === 'DELIVERED')?.at : undefined

  return (
    <article className="card overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 pt-4 sm:px-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/order/${order.code}`} className="font-extrabold text-brand hover:underline">
              {order.code}
            </Link>
            <Badge tone={delivered ? 'success' : 'brand'}>{statusLabel[order.status]}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted sm:text-sm">
            Placed {formatDateTime(order.placedAt)} · {count} {count === 1 ? 'item' : 'items'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg leading-tight font-extrabold tabular-nums">{formatPrice(order.total)}</p>
          <p className={`text-xs font-bold ${delivered ? 'text-success' : 'text-brand'}`}>
            {delivered ? (deliveredAt ? `Delivered ${formatDay(deliveredAt)}` : 'Delivered') : `Arriving ${formatDay(order.estimatedDelivery)}`}
          </p>
        </div>
      </header>

      <div className="mt-3 grid grid-cols-1 border-t border-line md:grid-cols-[minmax(0,1fr)_minmax(15rem,18rem)]">
        <div className="px-4 py-3 sm:px-5">
          <ul className="space-y-2.5">
            {lines.map((line) => (
              <li key={`${line.name}-${line.size}`} className="flex items-center gap-3">
                <span className="size-12 shrink-0 overflow-hidden rounded-xl bg-canvas ring-1 ring-line">
                  <ProductMedia name={line.name} image={line.image} art={line.art ?? 'mix'} className="size-full" />
                </span>
                <span className="min-w-0 flex-1">
                  {line.slug ? (
                    <Link to={`/product/${line.slug}`} className="block truncate text-sm font-extrabold hover:text-brand">
                      {line.name}
                    </Link>
                  ) : (
                    <span className="block truncate text-sm font-extrabold">{line.name}</span>
                  )}
                  <span className="text-xs text-muted">
                    {line.size} · Qty {line.quantity}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-bold tabular-nums">{formatPrice(line.unitPrice * line.quantity)}</span>
              </li>
            ))}
          </ul>
          {order.items.length > LINES && (
            <button type="button" onClick={() => setAllLines((value) => !value)} className="mt-2 text-xs font-bold text-brand hover:underline">
              {allLines ? 'Show fewer items' : `+${hidden} more ${hidden === 1 ? 'item' : 'items'}`}
            </button>
          )}
        </div>
        <div className="border-t border-line bg-canvas/50 px-4 py-3 sm:px-5 md:border-t-0 md:border-l">
          <OrderTimeline order={order} />
        </div>
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3 sm:px-5">
        <Link to={`/order/${order.code}`} className="btn btn-brand btn-sm">
          {delivered ? 'View order' : 'Track order'}
        </Link>
        <Link to={`/help/new?order=${order.code}`} className="btn btn-outline btn-sm">
          Get help
        </Link>
        {order.trackingNumber && <span className="ml-auto text-xs text-muted">{order.carrier ?? 'Courier'} · {order.trackingNumber}</span>}
      </footer>
    </article>
  )
}

/** What happened so far with times, then the next step only, so long histories stay short. */
function OrderTimeline({ order }: { order: ApiOrder }) {
  const stage = stageOf(order)
  const past = order.events.length > 0 ? order.events : [{ status: 'PLACED' as OrderStatus, note: null, at: order.placedAt }]
  const next = order.status === 'DELIVERED' ? undefined : trackingStages[stage + 1]
  const rows = [
    ...past.slice(-3).map((event) => ({ key: `${event.status}-${event.at}`, label: statusLabel[event.status], at: event.at, current: event.status === order.status, later: false })),
    ...(next ? [{ key: next.key, label: `Next: ${next.label}`, at: '', current: false, later: true }] : []),
  ]
  return (
    <ol>
      {past.length > 3 && <li className="mb-1.5 pl-7 text-[11px] text-muted">{past.length - 3} earlier updates</li>}
      {rows.map((row, index) => (
        <li key={row.key} className="relative flex gap-3 pb-3 last:pb-0">
          {index < rows.length - 1 && <span className={`absolute top-4 bottom-0 left-[7px] w-px ${row.later ? 'bg-line' : 'bg-brand/40'}`} />}
          <span className={`relative z-10 mt-0.5 grid size-4 shrink-0 place-items-center rounded-full ${row.later ? 'bg-white ring-1 ring-line' : row.current ? 'bg-brand text-white ring-4 ring-brand-soft' : 'bg-brand text-white'}`}>
            {row.later ? <span className="size-1.5 rounded-full bg-line" /> : <CheckIcon className="size-2.5" />}
          </span>
          <span className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3">
            <span className={`text-sm font-bold ${row.later ? 'text-muted' : 'text-ink'}`}>{row.label}</span>
            {row.at && <time className="text-[11px] font-semibold text-muted">{formatDateTime(row.at)}</time>}
          </span>
        </li>
      ))}
    </ol>
  )
}
