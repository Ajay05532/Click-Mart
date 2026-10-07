import { Link } from 'react-router-dom'
import { formatPrice } from '../../lib/money.ts'
import { formatDateTime, loadOrderRecords, stageIndex, trackingStages } from '../../lib/orders.ts'
import { ProductMedia } from '../product/ProductMedia.tsx'
import { Badge } from '../ui/Primitives.tsx'
import { ProgressBar } from './TrackingTimeline.tsx'

export function OrderList() {
  const orders = loadOrderRecords()
  return (
    <ul className="stagger space-y-5">
            {orders.map((order) => {
              const stage = stageIndex(order.placedAt)
              return (
                <li key={order.id} className="card overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-canvas/60 px-5 py-4 sm:px-6">
                    <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
                      <div>
                        <p className="text-[11px] font-bold tracking-wider text-muted uppercase">Order</p>
                        <p className="font-extrabold text-brand">{order.id}</p>
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
                    <Badge tone={stage === 4 ? 'success' : 'brand'}>{trackingStages[stage].label}</Badge>
                  </div>
                  <div className="p-5 sm:p-6">
                    <div className="flex flex-wrap items-center gap-3">
                      {order.lines.slice(0, 4).map((line) => (
                        <span key={`${line.name}-${line.size}`} className="size-16 overflow-hidden rounded-xl bg-canvas ring-1 ring-line">
                          <ProductMedia name={line.name} image={line.image} art={line.art} className="size-full" />
                        </span>
                      ))}
                      {order.lines.length > 4 && <span className="text-sm font-bold text-muted">+{order.lines.length - 4} more</span>}
                      <p className="ml-1 min-w-0 flex-1 truncate text-sm text-muted">{order.lines.map((line) => line.name).join(', ')}</p>
                    </div>
                    <div className="mt-6">
                      <ProgressBar stage={stage} />
                    </div>
                    <div className="mt-6 flex flex-wrap gap-3">
                      <Link to={`/track/${order.id}`} className="btn btn-brand btn-sm">
                        Track order
                      </Link>
                      <Link to={`/order/${order.id}`} className="btn btn-outline btn-sm">
                        View details
                      </Link>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
  )
}
