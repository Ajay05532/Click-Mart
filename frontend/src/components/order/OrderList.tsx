import { Link } from 'react-router-dom'
import { formatPrice } from '../../lib/money.ts'
import { formatDateTime, formatDay, isEnded, stageOf, statusLabel, trackingStages, useMyOrders, type ApiOrder, type OrderStatus } from '../../lib/orders.ts'
import { CheckIcon } from '../icons.tsx'
import { ProductMedia } from '../product/ProductMedia.tsx'
import { Badge } from '../ui/Primitives.tsx'

export function OrderList() {
  const query = useMyOrders()
  if (query.isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        {[0, 1].map((index) => (
          <div key={index} className="card h-64 animate-pulse" />
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
  return (
    <ul className="space-y-4">
      {orders.map((order) => {
        const count = order.items.reduce((sum, line) => sum + line.quantity, 0)
        const ended = isEnded(order.status)
        return (
          <li key={order.id} className="card overflow-hidden">
            <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-extrabold text-brand">{order.code}</p>
                  <Badge tone={order.status === 'DELIVERED' ? 'success' : ended ? 'accent' : 'brand'}>{statusLabel[order.status]}</Badge>
                </div>
                <p className="mt-1 text-sm text-muted">
                  Placed {formatDateTime(order.placedAt)}
                  {!ended && order.status !== 'DELIVERED' && <> · Arriving {formatDay(order.estimatedDelivery)}</>}
                  {' · '}{count} {count === 1 ? 'item' : 'items'}
                </p>
              </div>
              <p className="text-lg font-extrabold tabular-nums">{formatPrice(order.total)}</p>
            </div>

            <div className="grid lg:grid-cols-[minmax(0,1fr)_16.5rem]">
              <ul className="divide-y divide-line px-5 sm:px-6">
                {order.items.map((line) => (
                  <li key={`${line.name}-${line.size}`} className="flex items-center gap-4 py-3.5">
                    <span className="size-14 shrink-0 overflow-hidden rounded-xl bg-canvas ring-1 ring-line">
                      <ProductMedia name={line.name} image={line.image} art={line.art ?? 'mix'} className="size-full" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-extrabold">{line.name}</span>
                      <span className="text-xs text-muted">{line.size} · Qty {line.quantity}</span>
                    </span>
                    <span className="text-sm font-extrabold tabular-nums">{formatPrice(line.unitPrice * line.quantity)}</span>
                  </li>
                ))}
              </ul>
              <div className="border-t border-line px-5 py-4 sm:px-6 lg:border-t-0 lg:border-l">
                <p className="text-[11px] font-bold tracking-wider text-muted uppercase">Timeline</p>
                <OrderTimeline order={order} />
              </div>
            </div>

            <div className="flex flex-wrap gap-3 border-t border-line px-5 py-4 sm:px-6">
              <Link to={`/order/${order.code}`} className="btn btn-brand btn-sm">
                View order
              </Link>
              <Link to={`/help/new?order=${order.code}`} className="btn btn-outline btn-sm">
                Get help
              </Link>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function OrderTimeline({ order }: { order: ApiOrder }) {
  const stage = stageOf(order)
  const ended = isEnded(order.status)
  const past = order.events.length > 0 ? order.events : [{ status: 'PLACED' as OrderStatus, note: 'Order placed', at: order.placedAt }]
  const upcoming = ended ? [] : trackingStages.filter((_, index) => index > stage)
  const rows = [
    ...past.map((event) => ({
      key: `${event.status}-${event.at}`,
      label: statusLabel[event.status],
      note: event.note && event.note !== statusLabel[event.status] ? event.note : '',
      at: event.at,
      state: event.status === order.status ? 'current' : 'done',
      ended: event.status === 'CANCELLED' || event.status === 'RETURNED',
    })),
    ...upcoming.map((step) => ({
      key: step.key,
      label: step.label,
      note: '',
      at: '',
      state: 'later' as const,
      ended: false,
    })),
  ]
  return (
    <ol className="mt-3">
      {rows.map((row, index) => {
        const last = index === rows.length - 1
        const done = row.state !== 'later'
        return (
          <li key={row.key} className="relative flex gap-3 pb-3.5 last:pb-0">
            {!last && <span className={`absolute top-4 bottom-0 left-[7px] w-px ${done ? 'bg-brand/40' : 'bg-line'}`} />}
            <span className={`relative z-10 mt-0.5 grid size-4 shrink-0 place-items-center rounded-full ${row.ended ? 'bg-rose-600 text-white' : row.state === 'current' ? 'bg-brand text-white ring-4 ring-brand-soft' : done ? 'bg-brand text-white' : 'bg-white ring-1 ring-line'}`}>
              {done ? <CheckIcon className="size-2.5" /> : <span className="size-1.5 rounded-full bg-line" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-3">
                <span className={`text-sm font-bold ${done ? 'text-ink' : 'text-muted'}`}>{row.label}</span>
                {row.at && <time className="shrink-0 text-[11px] font-semibold text-muted">{formatDateTime(row.at)}</time>}
              </span>
              {row.note && <span className="mt-0.5 block text-xs leading-5 text-muted">{row.note}</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
