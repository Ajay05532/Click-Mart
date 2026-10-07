import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { BoxIcon } from '../components/icons.tsx'
import { Container } from '../components/layout/Container.tsx'
import { ProgressBar, TrackingTimeline } from '../components/order/TrackingTimeline.tsx'
import { ProductMedia } from '../components/product/ProductMedia.tsx'
import { Breadcrumbs } from '../components/ui/Breadcrumbs.tsx'
import { formatPrice } from '../lib/money.ts'
import { estimatedDelivery, loadOrderRecords, trackingStages, trackOrder } from '../lib/orders.ts'
import { useDocumentTitle } from '../lib/useDocumentTitle.ts'

export function TrackPage() {
  useDocumentTitle('Track Order')
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [value, setValue] = useState(id)
  const [, setTick] = useState(0)

  // Re-evaluate progress while the page is open so the timeline advances live.
  useEffect(() => {
    const timer = window.setInterval(() => setTick((tick) => tick + 1), 10000)
    return () => window.clearInterval(timer)
  }, [])

  const tracked = id ? trackOrder(id) : undefined
  const recent = loadOrderRecords().slice(0, 3)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const next = value.trim().toUpperCase()
    if (next) navigate(`/track/${next}`)
  }

  return (
    <div className="bg-canvas">
      <div className="bg-gradient-to-br from-brand-dark via-brand to-[#1d56b8] text-white">
        <Container className="py-10 sm:py-14">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Track your order</h1>
          <p className="mt-2 max-w-lg text-white/75">Enter the order ID from your confirmation to see exactly where your pouches are.</p>
          <form onSubmit={submit} className="mt-6 flex max-w-xl flex-col gap-3 sm:flex-row">
            <input
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="e.g. ORD-1048"
              aria-label="Order ID"
              className="field h-14! border-transparent! text-base! sm:flex-1 font-bold tracking-wider uppercase placeholder:font-medium placeholder:normal-case placeholder:tracking-normal"
            />
            <button type="submit" className="btn btn-accent btn-lg">
              Track
            </button>
          </form>
          <p className="mt-3 text-xs text-white/60">Try ORD-1046 (shipped) or ORD-1048 (delivered) to preview.</p>
        </Container>
      </div>

      <Container className="py-8 sm:py-10">
        {!id && (
          <div>
            {recent.length > 0 ? (
              <>
                <h2 className="text-lg font-extrabold">Your recent orders</h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  {recent.map((order) => (
                    <Link key={order.id} to={`/track/${order.id}`} className="card p-5 transition hover:-translate-y-0.5 hover:shadow-lift">
                      <p className="text-sm font-extrabold text-brand">{order.id}</p>
                      <p className="mt-1 text-sm text-muted">
                        {order.lines.length} item{order.lines.length > 1 ? 's' : ''} · {formatPrice(order.total)}
                      </p>
                    </Link>
                  ))}
                </div>
              </>
            ) : (
              <div className="card mx-auto max-w-lg px-6 py-12 text-center">
                <div className="mx-auto grid size-16 place-items-center rounded-full bg-brand-soft text-brand">
                  <BoxIcon className="size-8" />
                </div>
                <p className="mt-4 font-extrabold">Where is my order?</p>
                <p className="mt-1 text-sm text-muted">Your order ID starts with ORD- and is in your confirmation page and email.</p>
              </div>
            )}
          </div>
        )}

        {id && !tracked && (
          <div className="card mx-auto max-w-lg px-6 py-12 text-center">
            <p className="text-lg font-extrabold">No order found for “{id}”</p>
            <p className="mt-2 text-sm text-muted">Double check the ID, it looks like ORD-1234.</p>
          </div>
        )}

        {tracked && (
          <div className="motion-page">
            <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Track order', to: '/track' }, { label: tracked.record.id }]} />
            <div className="mt-5 grid items-start gap-6 lg:grid-cols-[1.2fr_1fr]">
              <section className="card p-6 sm:p-8">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="eyebrow">Order {tracked.record.id}</p>
                    <h2 className="mt-1 text-2xl font-extrabold">
                      {tracked.cancelled ? 'Order cancelled' : tracked.stage === 4 ? 'Delivered' : trackingStages[tracked.stage].label}
                    </h2>
                  </div>
                  {!tracked.cancelled && tracked.stage < 4 && (
                    <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-bold text-success">Arriving by {estimatedDelivery(tracked.record)}</p>
                  )}
                </div>
                <div className="mt-6">
                  <ProgressBar stage={tracked.stage} cancelled={tracked.cancelled} />
                </div>
                <div className="mt-10">
                  {tracked.cancelled ? (
                    <p className="rounded-2xl bg-rose-50 p-4 text-sm font-semibold text-rose-700">This order was cancelled. Any payment will be refunded in 5–7 working days.</p>
                  ) : (
                    <TrackingTimeline record={tracked.record} stage={tracked.stage} />
                  )}
                </div>
              </section>

              <div className="space-y-6">
                <section className="card p-5 sm:p-6">
                  <h2 className="text-lg font-extrabold">Shipment</h2>
                  <ul className="mt-4 space-y-3">
                    {tracked.record.lines.map((line) => (
                      <li key={`${line.name}-${line.size}`} className="flex items-center gap-3">
                        <span className="size-14 shrink-0 overflow-hidden rounded-xl bg-canvas ring-1 ring-line">
                          <ProductMedia name={line.name} image={line.image} art={line.art} className="size-full" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold">{line.name}</span>
                          <span className="text-xs text-muted">{line.size} · Qty {line.quantity}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-5 flex justify-between border-t border-dashed border-line pt-4 text-sm font-extrabold">
                    <span>Order total</span>
                    <span>{formatPrice(tracked.record.total)}</span>
                  </div>
                </section>
                <section className="card p-5 sm:p-6">
                  <h2 className="text-lg font-extrabold">Delivering to</h2>
                  <p className="mt-3 text-sm font-bold">{tracked.record.customer}</p>
                  <p className="mt-1 text-sm leading-6 text-muted">
                    {tracked.record.address}
                    {tracked.record.city && `, ${tracked.record.city}`} {tracked.record.pin}
                  </p>
                </section>
                <div className="flex gap-3">
                  <Link to={`/order/${tracked.record.id}`} className="btn btn-outline flex-1">
                    Order details
                  </Link>
                  <Link to="/contact" className="btn btn-soft flex-1">
                    Need help?
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}
      </Container>
    </div>
  )
}
