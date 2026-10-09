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
import { useProducts } from '../lib/catalog.ts'
import { discountPercent, formatPrice } from '../lib/money.ts'
import { useDocumentTitle } from '../lib/useDocumentTitle.ts'

export function CartPage() {
  useDocumentTitle('Your Cart')
  const { lines, count, pricing, updateQty, removeItem } = useCart()
  const popular = useProducts({ sort: 'popular', pageSize: 12 })
  const suggestions = (popular.data?.items ?? []).filter((product) => product.inStock && !lines.some((line) => line.productId === product.id)).slice(0, 4)

  return (
    <div className="bg-canvas">
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
        ) : lines.length === 0 && pricing ? (
          <div className="grid min-h-60 place-items-center">
            <span className="motion-spin block size-10 rounded-full border-4 border-brand-soft border-t-brand" role="status" aria-label="Loading your cart" />
          </div>
        ) : (
          <div className="mt-8 grid items-start gap-6 lg:grid-cols-[1fr_380px]">
            <div className="space-y-4">
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
                            onClick={() => removeItem(line.variantId)}
                            aria-label={`Remove ${line.name}`}
                            className="grid size-9 shrink-0 place-items-center rounded-full text-muted transition hover:bg-rose-50 hover:text-rose-600"
                          >
                            <TrashIcon className="size-[18px]" />
                          </button>
                        </div>
                        <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-3">
                          <QuantityInput value={line.quantity} max={Math.max(1, line.stock)} onChange={(quantity) => updateQty(line.variantId, quantity)} />
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
