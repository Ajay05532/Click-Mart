import { Link } from 'react-router-dom'
import { formatPrice } from '../../lib/money.ts'
import { formatDateTime, isEnded, statusLabel, useMyOrders } from '../../lib/orders.ts'
import { ProductMedia } from '../product/ProductMedia.tsx'
import { Badge } from '../ui/Primitives.tsx'
import { ProgressBar } from './TrackingTimeline.tsx'

export function OrderList() {
  const query = useMyOrders()
  if (query.isLoading) {
    return (
      <div className="space-y-5" aria-busy="true">
        {[0, 1].map((index) => (
          <div key={index} className="card h-52 animate-pulse" />
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
    <ul className="stagger space-y-5">
      {orders.map((order) => (
        <li key={order.id} className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-canvas/60 px-5 py-4 sm:px-6">
            <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
              <div>
                <p className="text-[11px] font-bold tracking-wider text-muted uppercase">Order</p>
                <p className="font-extrabold text-brand">{order.code}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold tracking-wider text-muted uppercase">Placed</p>
                <p className="font-bold">{formatDateTime(order.placedAt)}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold tracking-wider text-muted uppercase">Total</p>
                <p className="font-bold">{formatPrice(order.total)}</p>
              </div>
            </div>
            <Badge tone={order.status === 'DELIVERED' ? 'success' : isEnded(order.status) ? 'accent' : 'brand'}>{statusLabel[order.status]}</Badge>
          </div>
          <div className="p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-3">
              {order.items.slice(0, 4).map((line) => (
                <span key={`${line.name}-${line.size}`} className="size-16 overflow-hidden rounded-xl bg-canvas ring-1 ring-line">
                  <ProductMedia name={line.name} image={line.image} art={line.art ?? 'mix'} className="size-full" />
                </span>
              ))}
              {order.items.length > 4 && <span className="text-sm font-bold text-muted">+{order.items.length - 4} more</span>}
              <p className="ml-1 min-w-0 flex-1 truncate text-sm text-muted">{order.items.map((line) => line.name).join(', ')}</p>
            </div>
            <div className="mt-6">
              <ProgressBar status={order.status} events={order.events} />
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to={`/track/${order.code}`} className="btn btn-brand btn-sm">
                Track order
              </Link>
              <Link to={`/order/${order.code}`} className="btn btn-outline btn-sm">
                View details
              </Link>
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}
