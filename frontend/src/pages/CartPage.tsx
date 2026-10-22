import { Link } from 'react-router-dom'
import { OrderSummary } from '../components/cart/OrderSummary.tsx'
import { CartIcon, ShieldIcon, TrashIcon, TruckIcon } from '../components/icons.tsx'
import { Container } from '../components/layout/Container.tsx'
import { ProductCard } from '../components/product/ProductCard.tsx'
import { ProductMedia } from '../components/product/ProductMedia.tsx'
import { Breadcrumbs } from '../components/ui/Breadcrumbs.tsx'
import { EmptyState, Stepper } from '../components/ui/Primitives.tsx'
import { QuantityInput } from '../components/ui/QuantityInput.tsx'
import { useCart } from '../context/CartContext.tsx'
import { useAuth } from '../context/AuthContext.tsx'
import { useDeliveryLocation } from '../context/LocationContext.tsx'
import { useProducts } from '../lib/catalog.ts'
import { discountPercent, formatPrice } from '../lib/money.ts'
import { useDocumentTitle } from '../lib/useDocumentTitle.ts'

export function CartPage() {
  useDocumentTitle('Your Cart', { noindex: true })
  const { user } = useAuth()
  const { lines, count, total, pricing, quoteError, reloadQuote, updateQty, confirmRemove } = useCart()
  const { location: delivery } = useDeliveryLocation()
  const popular = useProducts({ sort: 'popular', pageSize: 12 })
  const suggestions = (popular.data?.items ?? []).filter((product) => product.inStock && !lines.some((line) => line.productId === product.id)).slice(0, 4)

  return (
    <div className="bg-canvas pb-24 lg:pb-0">
      <Container className="py-8 sm:py-10">
        <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Cart' }]} />
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-3xl font-extrabold tracking-tight">
            Your cart{' '}
            {count > 0 && <span className="text-lg font-bold text-muted">({count} {count === 1 ? 'item' : 'items'})</span>}
          </h1>
          <div className="w-full max-w-sm">
            <Stepper steps={['Cart', 'Details', 'Payment']} current={0} />
          </div>
        </div>

        {count === 0 ? (
          <div className="mt-10">
            <EmptyState
              icon={<CartIcon className="size-9" />}
              title="Your cart is empty"
              text="Looks like you have not picked any pouches yet. Our bestsellers are a great place to start."
              action={{ to: '/shop', label: 'Start shopping' }}
            />
          </div>
        ) : lines.length === 0 ? (
          <div className="grid min-h-60 place-items-center px-6 text-center">
            {quoteError ? (
              <div>
                <p className="font-semibold text-rose-600">{quoteError}</p>
                <button type="button" onClick={reloadQuote} className="btn btn-accent mt-4">
                  Try again
                </button>
              </div>
            ) : (
              <span className="motion-spin block size-10 rounded-full border-4 border-brand-soft border-t-brand" role="status" aria-label="Loading your cart" />
            )}
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="space-y-4">
              {delivery && (
                <p className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-white px-4 py-3 text-sm">
                  <span className="text-muted">Delivering to</span>
                  <span className="font-extrabold">{delivery.city ? `${delivery.city} ` : ''}{delivery.pin}</span>
                </p>
              )}
              <ul className="stagger space-y-4">
                {lines.map((line) => {
                  const off = discountPercent(line.unitPrice, line.mrp)
                  return (
                    <li key={line.key} className="card flex gap-4 p-4 sm:gap-5 sm:p-5">
                      <Link to={`/product/${line.slug}`} className="size-24 shrink-0 overflow-hidden rounded-2xl bg-canvas sm:size-32">
                        <ProductMedia name={line.name} image={line.image} art={line.art} className="size-full" />
                      </Link>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <Link to={`/product/${line.slug}`} className="block truncate text-base font-extrabold hover:text-brand sm:text-lg">
                              {line.name}
                            </Link>
                            <p className="mt-1 inline-block rounded-full bg-canvas px-2.5 py-0.5 text-xs font-bold text-muted">{line.size}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => confirmRemove(line.variantId, `${line.name} (${line.size})`)}
                            aria-label={`Remove ${line.name}`}
                            className="grid size-9 shrink-0 place-items-center rounded-full text-muted transition hover:bg-rose-50 hover:text-rose-600"
                          >
                            <TrashIcon className="size-[18px]" />
                          </button>
                        </div>
                        <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-3">
                          <QuantityInput
                            value={line.quantity}
                            min={0}
                            max={Math.max(1, line.stock)}
                            onChange={(quantity) => (quantity < 1 ? confirmRemove(line.variantId, `${line.name} (${line.size})`) : updateQty(line.variantId, quantity))}
                          />
                          <div className="text-right">
                            <p className="text-lg font-extrabold">{formatPrice(line.lineTotal)}</p>
                            {off > 0 && (
                              <p className="text-xs text-muted">
                                <span className="line-through">{formatPrice(line.mrp * line.quantity)}</span>{' '}
                                <span className="font-bold text-success">{off}% off</span>
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4 text-sm">
                  <TruckIcon className="size-6 text-brand" />
                  <p><span className="font-extrabold">Packed fresh</span> <span className="text-muted">and dispatched within 48 hours.</span></p>
                </div>
                <div className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4 text-sm">
                  <ShieldIcon className="size-6 text-brand" />
                  <p><span className="font-extrabold">Secure payments</span> <span className="text-muted">with easy 7-day returns.</span></p>
                </div>
              </div>
              <Link to="/shop" className="inline-flex text-sm font-bold text-brand hover:underline">
                ← Continue shopping
              </Link>
            </div>
            <OrderSummary showCheckout />
          </div>
        )}

        {count > 0 && (
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 p-4 shadow-[0_-10px_30px_-12px_rgb(21_32_51/0.2)] backdrop-blur lg:hidden">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted">{count} {count === 1 ? 'item' : 'items'}</p>
                <p className="text-lg font-extrabold">{pricing ? '…' : formatPrice(total)}</p>
              </div>
              <Link
                to={user ? '/checkout' : '/login'}
                state={user ? undefined : { from: '/checkout' }}
                className="btn btn-accent btn-lg"
              >
                Checkout
              </Link>
            </div>
          </div>
        )}

        {suggestions.length > 0 && (
          <section className="mt-16">
            <h2 className="text-2xl font-extrabold tracking-tight">{lines.length ? 'Complete your pantry' : 'Popular right now'}</h2>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
              {suggestions.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </section>
        )}
      </Container>
    </div>
  )
}
