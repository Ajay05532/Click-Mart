import { useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { BoxIcon } from '../components/icons.tsx'
import { Container } from '../components/layout/Container.tsx'
import { ProgressBar, TrackingTimeline } from '../components/order/TrackingTimeline.tsx'
import { ProductMedia } from '../components/product/ProductMedia.tsx'
import { Breadcrumbs } from '../components/ui/Breadcrumbs.tsx'
import { useAuth } from '../context/AuthContext.tsx'
import { ApiError, api } from '../lib/api.ts'
import { formatPrice } from '../lib/money.ts'
import { formatDay, isEnded, statusLabel, toTrackView, useMyOrders, type ApiOrder, type TrackView } from '../lib/orders.ts'
import { useDocumentTitle } from '../lib/useDocumentTitle.ts'

export function TrackPage() {
  useDocumentTitle('Track Order')
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const contact = params.get('contact') ?? ''
  const [code, setCode] = useState(id)
  const [who, setWho] = useState(contact)
  const mine = useMyOrders()

  const justPlaced = (location.state as { order?: ApiOrder } | null)?.order
  const query = useQuery({
    queryKey: ['track', id.toUpperCase(), contact, user?.id],
    enabled: id.length > 0,
    retry: false,
    refetchInterval: 30_000, // pick up status changes while the page is open
    queryFn: async (): Promise<TrackView | null> => {
      if (justPlaced && justPlaced.code.toUpperCase() === id.toUpperCase() && !contact) return toTrackView(justPlaced)
      if (contact) return api<{ order: TrackView }>(`/track/${encodeURIComponent(id)}`, { query: { contact } }).then((result) => result.order)
      if (user) {
        try {
          return toTrackView((await api<{ order: ApiOrder }>(`/orders/${encodeURIComponent(id)}`)).order)
        } catch (error) {
          if (!(error instanceof ApiError) || (error.status !== 404 && error.status !== 403)) throw error
        }
      }
      return null // needs the phone number or email
    },
  })
  const view = query.data ?? undefined
  const needsContact = id && !query.isLoading && !view && !contact
  const notFound = id && contact && query.isError

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const next = code.trim().toUpperCase()
    if (!next) return
    const search = who.trim() ? `?contact=${encodeURIComponent(who.trim())}` : ''
    navigate(`/track/${next}${search}`)
  }

  return (
    <div className="bg-canvas">
      <div className="bg-gradient-to-br from-brand-dark via-brand to-[#1d56b8] text-white">
        <Container className="py-10 sm:py-14">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Track your order</h1>
          <p className="mt-2 max-w-lg text-white/75">Enter your order ID and the phone number or email you used, and see exactly where your pouches are.</p>
          <form onSubmit={submit} className="mt-6 grid max-w-2xl gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="Order ID, e.g. ORD-1048" aria-label="Order ID" className="field h-14! border-transparent! text-base! font-bold tracking-wider uppercase placeholder:font-medium placeholder:normal-case placeholder:tracking-normal" />
            <input value={who} onChange={(event) => setWho(event.target.value)} placeholder={user ? 'Phone or email (optional)' : 'Phone or email'} aria-label="Phone number or email" className="field h-14! border-transparent! text-base!" />
            <button type="submit" className="btn btn-accent btn-lg">
              Track
            </button>
          </form>
        </Container>
      </div>

      <Container className="py-8 sm:py-10">
        {!id && (
          <div>
            {(mine.data?.length ?? 0) > 0 ? (
              <>
                <h2 className="text-lg font-extrabold">Your recent orders</h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  {mine.data!.slice(0, 3).map((order) => (
                    <Link key={order.id} to={`/track/${order.code}`} className="card p-5 transition hover:-translate-y-0.5 hover:shadow-lift">
                      <p className="text-sm font-extrabold text-brand">{order.code}</p>
                      <p className="mt-1 text-sm text-muted">
                        {order.items.length} item{order.items.length > 1 ? 's' : ''} · {formatPrice(order.total)}
                      </p>
                      <p className="mt-2 text-xs font-bold text-ink">{statusLabel[order.status]}</p>
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
                <p className="mt-1 text-sm text-muted">Your order ID starts with ORD- and is on your confirmation page and email.</p>
              </div>
            )}
          </div>
        )}

        {id && query.isLoading && (
          <div className="grid min-h-40 place-items-center">
            <span className="motion-spin block size-10 rounded-full border-4 border-brand-soft border-t-brand" role="status" aria-label="Finding your order" />
          </div>
        )}

        {needsContact && (
          <div className="card mx-auto max-w-lg px-6 py-12 text-center">
            <p className="text-lg font-extrabold">One more detail, please</p>
            <p className="mt-2 text-sm text-muted">
              Enter the phone number or email on order <span className="font-bold">{id.toUpperCase()}</span> above so we can confirm it is yours.
              {!user && (
                <>
                  {' '}
                  Or <Link to="/login" state={{ from: `/track/${id}` }} className="font-bold text-brand">log in</Link>.
                </>
              )}
            </p>
          </div>
        )}

        {notFound && (
          <div className="card mx-auto max-w-lg px-6 py-12 text-center">
            <p className="text-lg font-extrabold">We could not find that order</p>
            <p className="mt-2 text-sm text-muted">Check the order ID (it looks like ORD-1234) and the phone number or email you used when ordering.</p>
          </div>
        )}

        {view && (
          <div className="motion-page">
            <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Track order', to: '/track' }, { label: view.code }]} />
            <div className="mt-5 grid items-start gap-6 lg:grid-cols-[1.2fr_1fr]">
              <section className="card p-6 sm:p-8">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="eyebrow">Order {view.code}</p>
                    <h2 className="mt-1 text-2xl font-extrabold">{statusLabel[view.status]}</h2>
                  </div>
                  {!isEnded(view.status) && view.status !== 'DELIVERED' && (
                    <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-bold text-success">Arriving by {formatDay(view.estimatedDelivery)}</p>
                  )}
                </div>
                <div className="mt-6">
                  <ProgressBar status={view.status} events={view.events} />
                </div>
                {(view.trackingNumber || view.carrier) && (
                  <p className="mt-6 rounded-xl bg-canvas px-4 py-3 text-sm">
                    <span className="text-muted">{view.carrier ?? 'Courier'} tracking number:</span> <span className="font-extrabold">{view.trackingNumber}</span>
                  </p>
                )}
                <div className="mt-10">
                  {isEnded(view.status) && (
                    <p className="mb-8 rounded-2xl bg-rose-50 p-4 text-sm font-semibold text-rose-700">
                      {view.status === 'CANCELLED' ? 'This order was cancelled. Any payment will be refunded in 5–7 working days.' : 'This order was returned to us.'}
                    </p>
                  )}
                  <TrackingTimeline view={view} />
                </div>
              </section>

              <div className="space-y-6">
                <section className="card p-5 sm:p-6">
                  <h2 className="text-lg font-extrabold">Shipment</h2>
                  <ul className="mt-4 space-y-3">
                    {view.items.map((line) => (
                      <li key={`${line.name}-${line.size}`} className="flex items-center gap-3">
                        <span className="size-14 shrink-0 overflow-hidden rounded-xl bg-canvas ring-1 ring-line">
                          <ProductMedia name={line.name} image={line.image} art={line.art ?? 'mix'} className="size-full" />
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
                    <span>{formatPrice(view.total)}</span>
                  </div>
                </section>
                <section className="card p-5 sm:p-6">
                  <h2 className="text-lg font-extrabold">Delivering to</h2>
                  <p className="mt-3 text-sm text-muted">{view.name ? `${view.name}, ` : ''}{view.city}</p>
                </section>
                <div className="flex gap-3">
                  {user && (
                    <Link to={`/order/${view.code}`} className="btn btn-outline flex-1">
                      Order details
                    </Link>
                  )}
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
