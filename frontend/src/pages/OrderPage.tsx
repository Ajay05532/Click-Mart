import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { CardIcon, CashIcon, CheckIcon, CopyIcon, MailIcon, PhoneIcon, PinIcon, QrIcon, ReceiptIcon } from '../components/icons.tsx'
import { Container } from '../components/layout/Container.tsx'
import { ProductMedia } from '../components/product/ProductMedia.tsx'
import { OrderHelp } from '../components/support/OrderHelp.tsx'
import { EmptyState } from '../components/ui/Primitives.tsx'
import { useAuth } from '../context/AuthContext.tsx'
import { formatPrice } from '../lib/money.ts'
import { formatDateTime, formatDay, isEnded, openInvoice, paymentLabel, stageOf, statusLabel, trackingStages, useOrder, type ApiOrder, type OrderStatus } from '../lib/orders.ts'
import { useDocumentTitle } from '../lib/useDocumentTitle.ts'

const stepLabels = ['Placed', 'Packed', 'Shipped', 'On the way', 'Delivered']

export function OrderPage() {
  const { id = '' } = useParams()
  const location = useLocation()
  const { user, loading } = useAuth()
  const state = location.state as { order?: ApiOrder } | null
  const justPlaced = state?.order && state.order.code.toLowerCase() === id.toLowerCase() ? state.order : undefined
  const fetched = useOrder(id, !justPlaced)
  const order = justPlaced ?? fetched.data
  const [copied, setCopied] = useState(false)
  useDocumentTitle(order ? `Order ${order.code}` : 'Your order', { noindex: true })

  if (!order) {
    if (loading || fetched.isLoading) {
      return (
        <div className="grid min-h-[50vh] place-items-center">
          <span className="motion-spin block size-10 rounded-full border-4 border-brand-soft border-t-brand" role="status" aria-label="Loading your order" />
        </div>
      )
    }
    return (
      <Container className="py-16">
        <EmptyState
          icon={<ReceiptIcon className="size-9" />}
          title={user ? 'We could not find that order' : 'Log in to see this order'}
          text={user ? 'Check the order ID in your confirmation, or look through your recent orders.' : 'Orders are private. Log in to see this one in My orders.'}
          action={user ? { to: '/orders', label: 'My orders' } : { to: '/login', label: 'Log in' }}
        />
      </Container>
    )
  }

  const fresh = !!justPlaced
  const paid = order.paymentStatus === 'PAID'
  const ended = isEnded(order.status)
  const failed = order.paymentStatus === 'FAILED'
  const first = order.customer.name.trim().split(/\s+/)[0] || 'there'
  const count = order.items.reduce((sum, line) => sum + line.quantity, 0)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(order.code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }
  const invoice = () => (user ? openInvoice(order.code).catch(() => window.print()) : window.print())

  const headline = ended
    ? `This order was ${order.status === 'CANCELLED' ? 'cancelled' : 'returned'}`
    : failed
      ? 'Payment did not go through'
      : order.status === 'DELIVERED'
        ? 'Delivered'
        : fresh
          ? `${first}, arriving ${formatDay(order.estimatedDelivery)}`
          : `Arriving ${formatDay(order.estimatedDelivery)}`

  const note = failed
    ? 'The order was not charged. You can place it again from your cart.'
    : ended
      ? 'Stock has been released. The receipt of this order is below.'
      : order.paymentMethod === 'COD'
        ? `Pay ${formatPrice(order.total)} in cash or UPI when it arrives.`
        : order.customer.email
          ? `A receipt is on its way to ${order.customer.email}.`
          : "We'll pack this fresh and update you at every step."

  return (
    <div className="bg-canvas">
      <Container className="py-8 sm:py-12">
        <div className="mx-auto max-w-5xl">
          {user && (
            <Link to="/orders" className="text-sm font-bold text-brand">
              ← My orders
            </Link>
          )}

          <header className="mt-5 flex flex-wrap items-end justify-between gap-6">
            <div className="min-w-0">
              <p className={`inline-flex items-center gap-2 text-xs font-extrabold tracking-[0.16em] uppercase ${ended || failed ? 'text-rose-700' : 'text-success'}`}>
                <span className={`grid size-5 place-items-center rounded-full text-white ${ended || failed ? 'bg-rose-600' : 'bg-success'}`}>
                  {ended || failed ? '!' : <CheckIcon className="size-3" />}
                </span>
                {ended ? statusLabel[order.status] : failed ? 'Payment failed' : fresh ? 'Order confirmed' : statusLabel[order.status]}
              </p>
              <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">{headline}</h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted">{note}</p>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-3xl font-extrabold tabular-nums">{formatPrice(order.total)}</p>
              <p className="mt-1 text-sm font-bold text-muted">{paid ? 'Paid' : order.paymentMethod === 'COD' ? 'Pay on delivery' : statusLabel[order.status]}</p>
            </div>
          </header>

          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <button type="button" onClick={() => void copy()} className="inline-flex items-center gap-2 font-bold">
              <span className="text-muted">Order</span>
              <span className="font-mono tracking-wide">{order.code}</span>
              <CopyIcon className="size-4 text-muted" />
              <span className="text-xs font-bold text-success" aria-live="polite">{copied ? 'Copied' : ''}</span>
            </button>
            <span className="text-muted">Placed {formatDateTime(order.placedAt)}</span>
            {!ended && !failed && <span className="text-muted">{order.address.city}, {order.address.state}</span>}
          </div>

          {!user && fresh && !ended && (
            <p className="mt-5 rounded-2xl border border-line bg-white px-5 py-4 text-sm text-ink-soft">
              Save this order ID. <Link to="/login?mode=register" className="font-bold text-brand">Create an account</Link> to see every order in one place.
            </p>
          )}

          {!ended && <Milestone status={order.status} />}

          <div className="mt-5 grid items-start gap-5 lg:grid-cols-3">
            <section className="card overflow-hidden lg:col-span-2">
              <div className="flex items-center justify-between px-5 pt-5 sm:px-6">
                <h2 className="text-sm font-extrabold tracking-wide text-muted uppercase">Items</h2>
                <p className="text-sm font-semibold text-muted">{count} {count === 1 ? 'item' : 'items'}</p>
              </div>
              <ul className="divide-y divide-line px-5 sm:px-6">
                {order.items.map((line) => {
                  const row = (
                    <>
                      <span className="size-16 shrink-0 overflow-hidden rounded-2xl bg-canvas ring-1 ring-line">
                        <ProductMedia name={line.name} image={line.image} art={line.art ?? 'mix'} className="size-full" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-extrabold">{line.name}</span>
                        <span className="mt-0.5 block text-xs text-muted">{line.size} · Qty {line.quantity}</span>
                      </span>
                      <span className="text-sm font-extrabold tabular-nums">{formatPrice(line.unitPrice * line.quantity)}</span>
                    </>
                  )
                  return (
                    <li key={`${line.name}-${line.size}`}>
                      {line.slug ? (
                        <Link to={`/product/${line.slug}`} className="flex items-center gap-4 py-4 transition hover:opacity-80">
                          {row}
                        </Link>
                      ) : (
                        <div className="flex items-center gap-4 py-4">{row}</div>
                      )}
                    </li>
                  )
                })}
              </ul>
              <dl className="space-y-2.5 border-t border-line px-5 py-5 text-sm sm:px-6">
                <Row label="Subtotal" value={formatPrice(order.subtotal)} />
                {order.offerDiscount > 0 && <Row label="Offers" value={`−${formatPrice(order.offerDiscount)}`} tone="good" />}
                {order.discount > 0 && <Row label={order.couponCode ? `Coupon ${order.couponCode}` : 'Discount'} value={`−${formatPrice(order.discount)}`} tone="good" />}
                <Row label="Delivery" value={order.shipping === 0 ? 'Free' : formatPrice(order.shipping)} tone={order.shipping === 0 ? 'good' : undefined} />
                <div className="flex items-center justify-between border-t border-line pt-3 text-base font-extrabold">
                  <dt>{paid ? 'Total paid' : order.paymentMethod === 'COD' ? 'Pay on delivery' : 'Total'}</dt>
                  <dd className="tabular-nums">{formatPrice(order.total)}</dd>
                </div>
              </dl>
            </section>

            <aside className="space-y-4">
              <section className="card divide-y divide-line">
                <div className="p-5">
                  <h2 className="text-xs font-extrabold tracking-[0.14em] text-muted uppercase">Deliver to</h2>
                  <p className="mt-3 font-extrabold">{order.customer.name}</p>
                  <p className="mt-2 flex gap-2 text-sm leading-6 text-ink-soft">
                    <PinIcon className="mt-1 size-4 shrink-0 text-brand" />
                    <span className="min-w-0 break-words">{order.address.line}, {order.address.city}, {order.address.state} {order.address.pin}</span>
                  </p>
                  {order.customer.phone && (
                    <p className="mt-2 flex items-center gap-2 text-sm text-ink-soft">
                      <PhoneIcon className="size-4 shrink-0 text-brand" />
                      {formatPhone(order.customer.phone)}
                    </p>
                  )}
                  {order.customer.email && (
                    <p className="mt-2 flex items-center gap-2 text-sm text-ink-soft">
                      <MailIcon className="size-4 shrink-0 text-brand" />
                      <span className="min-w-0 break-all">{order.customer.email}</span>
                    </p>
                  )}
                </div>
                <div className="p-5">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-xs font-extrabold tracking-[0.14em] text-muted uppercase">Payment</h2>
                    <StatusPill order={order} paid={paid} />
                  </div>
                  <p className="mt-3 flex items-center gap-2 font-extrabold">
                    <PayIcon method={order.paymentMethod} />
                    {order.payment?.detail || paymentLabel[order.paymentMethod]}
                  </p>
                  {(order.carrier || order.trackingNumber) && (
                    <p className="mt-3 text-sm text-muted">
                      {order.carrier ?? 'Courier'}{order.trackingNumber ? ` · ${order.trackingNumber}` : ''}
                    </p>
                  )}
                  <div className="mt-4 flex flex-col gap-2 print:hidden">
                    <button type="button" onClick={() => void invoice()} className="btn btn-outline w-full">
                      <ReceiptIcon className="size-4" /> Download invoice
                    </button>
                    <Link to="/shop" className="btn btn-brand w-full">
                      Continue shopping
                    </Link>
                  </div>
                </div>
              </section>

            </aside>
          </div>

          {user && <OrderHelp order={order} />}
        </div>
      </Container>
    </div>
  )
}

function Milestone({ status }: { status: OrderStatus }) {
  const stage = stageOf({ status, events: [] })
  const doneAll = status === 'DELIVERED'
  const current = trackingStages[doneAll ? 4 : stage]
  return (
    <section className="card mt-8 px-4 py-5 sm:px-8" aria-label="Delivery progress">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-extrabold">{current?.label}</p>
        <p className="text-sm text-muted">{current?.note}</p>
      </div>
      <div className="relative">
        <div className="absolute top-3 right-[8%] left-[8%] h-0.5 rounded-full bg-line" />
        <div className="absolute top-3 left-[8%] h-0.5 rounded-full bg-brand" style={{ width: `${((doneAll ? 4 : stage) / 4) * 84}%` }} />
        <ol className="relative grid grid-cols-5">
          {trackingStages.map((item, index) => {
            const filled = index <= stage
            const active = index === stage && !doneAll
            return (
              <li key={item.key} className="flex flex-col items-center text-center">
                <span className={`grid size-6 place-items-center rounded-full text-[10px] font-extrabold ${filled ? `bg-brand text-white ${active ? 'ring-4 ring-brand-soft' : ''}` : 'bg-white text-muted ring-1 ring-line'}`}>
                  {filled ? <CheckIcon className="size-3.5" /> : index + 1}
                </span>
                <span className={`mt-2 text-[11px] font-bold sm:text-xs ${index <= stage ? 'text-ink' : 'text-muted'}`}>{stepLabels[index]}</span>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}

function PayIcon({ method }: { method: ApiOrder['paymentMethod'] }) {
  const Icon = method === 'UPI' ? QrIcon : method === 'COD' ? CashIcon : CardIcon
  return <Icon className="size-5 text-brand" />
}

function StatusPill({ order, paid }: { order: ApiOrder; paid: boolean }) {
  const label = paid
    ? 'Paid'
    : order.paymentMethod === 'COD'
      ? 'Pay on delivery'
      : order.paymentStatus === 'REFUNDED'
        ? 'Refunded'
        : order.paymentStatus === 'FAILED'
          ? 'Failed'
          : 'Pending'
  const tone = paid || order.paymentStatus === 'REFUNDED' ? 'bg-emerald-50 text-success' : order.paymentStatus === 'FAILED' ? 'bg-rose-50 text-rose-700' : 'bg-orange-50 text-accent-dark'
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${tone}`}>{label}</span>
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'good' }) {
  return (
    <div className={`flex justify-between gap-4 ${tone === 'good' ? 'font-semibold text-success' : ''}`}>
      <dt className={tone ? '' : 'text-muted'}>{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  )
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '').slice(-10)
  if (digits.length !== 10) return value
  return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`
}
