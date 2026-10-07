import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { CopyIcon, ReceiptIcon } from '../components/icons.tsx'
import { Container } from '../components/layout/Container.tsx'
import { ProgressBar } from '../components/order/TrackingTimeline.tsx'
import { ProductMedia } from '../components/product/ProductMedia.tsx'
import { EmptyState } from '../components/ui/Primitives.tsx'
import { formatPrice } from '../lib/money.ts'
import { estimatedDelivery, trackOrder } from '../lib/orders.ts'
import { useDocumentTitle } from '../lib/useDocumentTitle.ts'

export function OrderPage() {
  const { id = '' } = useParams()
  const location = useLocation()
  const fresh = (location.state as { fresh?: boolean } | null)?.fresh === true
  const tracked = trackOrder(id)
  const [copied, setCopied] = useState(false)
  useDocumentTitle(tracked ? `Order ${tracked.record.id}` : 'Order not found')

  if (!tracked) {
    return (
      <Container className="py-16">
        <EmptyState
          icon={<ReceiptIcon className="size-9" />}
          title="We could not find that order"
          text="Check the order ID in your confirmation, or look through your recent orders."
          action={{ to: '/orders', label: 'My orders' }}
        />
      </Container>
    )
  }

  const { record, stage } = tracked
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(record.id)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="bg-canvas">
      <Container className="py-10 sm:py-14">
        <div className="mx-auto max-w-3xl">
          <div className="card relative overflow-hidden px-6 py-10 text-center sm:px-10">
            <div className="pointer-events-none absolute -top-24 left-1/2 size-72 -translate-x-1/2 rounded-full bg-success/10 blur-3xl" />
            <span className="motion-pop relative mx-auto grid size-20 place-items-center rounded-full bg-success text-white shadow-[0_12px_30px_-8px_rgb(21_128_61/0.6)]">
              <svg viewBox="0 0 24 24" className="size-10" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path className="motion-draw" d="m5 12.5 4.5 4.5L19 7.5" />
              </svg>
            </span>
            <h1 className="relative mt-6 text-3xl font-extrabold tracking-tight">
              {fresh ? 'Thank you, your order is confirmed!' : `Order ${record.id}`}
            </h1>
            <p className="relative mx-auto mt-3 max-w-md text-sm leading-6 text-muted">
              {record.email ? `A confirmation has been sent to ${record.email}. ` : ''}
              We will pack your pouches fresh and keep you posted at every step.
            </p>
            <button
              type="button"
              onClick={() => void copy()}
              className="relative mt-5 inline-flex items-center gap-2 rounded-full border border-dashed border-line bg-canvas px-4 py-2 text-sm font-bold transition hover:border-brand"
            >
              Order ID <span className="font-extrabold text-brand">{record.id}</span>
              <CopyIcon className="size-4 text-muted" />
              {copied && <span className="text-xs text-success">Copied</span>}
            </button>
            <div className="relative mx-auto mt-8 max-w-xl text-left">
              <ProgressBar stage={stage} cancelled={tracked.cancelled} />
            </div>
            <div className="relative mt-8 flex flex-wrap justify-center gap-3">
              <Link to={`/track/${record.id}`} className="btn btn-brand btn-lg">
                Track order
              </Link>
              <Link to="/shop" className="btn btn-outline btn-lg">
                Continue shopping
              </Link>
            </div>
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-[1.3fr_1fr]">
            <section className="card p-5 sm:p-6">
              <h2 className="text-lg font-extrabold">Items ({record.lines.reduce((sum, line) => sum + line.quantity, 0)})</h2>
              <ul className="mt-4 divide-y divide-line">
                {record.lines.map((line) => (
                  <li key={`${line.name}-${line.size}`} className="flex items-center gap-4 py-3.5 first:pt-0 last:pb-0">
                    <span className="size-16 shrink-0 overflow-hidden rounded-xl bg-canvas ring-1 ring-line">
                      <ProductMedia name={line.name} image={line.image} art={line.art} className="size-full" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-extrabold">{line.name}</span>
                      <span className="text-xs text-muted">
                        {line.size} · Qty {line.quantity}
                      </span>
                    </span>
                    <span className="text-sm font-extrabold">{formatPrice(line.unitPrice * line.quantity)}</span>
                  </li>
                ))}
              </ul>
              <dl className="mt-5 space-y-2.5 border-t border-dashed border-line pt-5 text-sm">
                <Row label="Subtotal" value={formatPrice(record.subtotal)} />
                {record.discount > 0 && <Row label={`Discount (${record.coupon})`} value={`−${formatPrice(record.discount)}`} tone="success" />}
                <Row label="Delivery" value={record.shipping === 0 ? 'FREE' : formatPrice(record.shipping)} tone={record.shipping === 0 ? 'success' : undefined} />
                <div className="flex justify-between border-t border-line pt-3 text-base font-extrabold">
                  <dt>{record.payment.paid ? 'Total paid' : 'Total to pay'}</dt>
                  <dd>{formatPrice(record.total)}</dd>
                </div>
              </dl>
            </section>

            <div className="space-y-6">
              <section className="card p-5 sm:p-6">
                <h2 className="text-lg font-extrabold">Delivery</h2>
                <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-bold text-success">Arriving by {estimatedDelivery(record)}</p>
                <p className="mt-4 text-sm font-extrabold">{record.customer}</p>
                <p className="mt-1 text-sm leading-6 text-muted">
                  {record.address}
                  {record.city && `, ${record.city}`}
                  {record.state && `, ${record.state}`} {record.pin}
                </p>
                {record.phone && <p className="mt-1 text-sm text-muted">+91 {record.phone}</p>}
              </section>
              <section className="card p-5 sm:p-6">
                <h2 className="text-lg font-extrabold">Payment</h2>
                <p className="mt-3 text-sm font-bold">{record.payment.method}</p>
                {record.payment.detail && <p className="text-sm text-muted">{record.payment.detail}</p>}
                <p className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-extrabold ${record.payment.paid ? 'bg-emerald-50 text-success' : 'bg-orange-50 text-accent-dark'}`}>
                  {record.payment.paid ? `Paid · ${record.payment.ref}` : 'Pay on delivery'}
                </p>
              </section>
              <button type="button" onClick={() => window.print()} className="btn btn-outline w-full print:hidden">
                <ReceiptIcon className="size-4" /> Download invoice
              </button>
            </div>
          </div>
        </div>
      </Container>
    </div>
  )
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'success' }) {
  return (
    <div className={`flex justify-between ${tone === 'success' ? 'text-success' : ''}`}>
      <dt className={tone ? '' : 'text-muted'}>{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  )
}
