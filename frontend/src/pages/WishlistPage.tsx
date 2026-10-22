import { Link } from 'react-router-dom'
import { HeartIcon } from '../components/icons.tsx'
import { Container } from '../components/layout/Container.tsx'
import { ProductCard } from '../components/product/ProductCard.tsx'
import { Breadcrumbs } from '../components/ui/Breadcrumbs.tsx'
import { EmptyState } from '../components/ui/Primitives.tsx'
import { useAuth } from '../context/AuthContext.tsx'
import { useCart } from '../context/CartContext.tsx'
import { useNotice } from '../context/NoticeContext.tsx'
import { useWishlist } from '../context/WishlistContext.tsx'
import { featuredPack, useProducts, useProductsByIds } from '../lib/catalog.ts'
import { useDocumentTitle } from '../lib/useDocumentTitle.ts'

export function WishlistPage() {
  useDocumentTitle('Wishlist', { noindex: true })
  const wishlist = useWishlist()
  const { addItem } = useCart()
  const { user } = useAuth()
  const notify = useNotice()
  const savedQuery = useProductsByIds(wishlist.ids)
  const saved = (savedQuery.data ?? []).filter((product) => wishlist.ids.includes(product.id))
  const best = useProducts({ bestseller: true, pageSize: 8 })
  const suggestions = (best.data?.items ?? []).filter((p) => !wishlist.ids.includes(p.id)).slice(0, 4)
  const addAll = () => {
    const ready = saved.filter((p) => p.inStock)
    ready.forEach((p) => addItem(featuredPack(p).variantId, 1, p.name, true))
    const skipped = saved.length - ready.length
    notify({
      title: `${ready.length} ${ready.length === 1 ? 'item' : 'items'} added to cart`,
      text: skipped ? `${skipped} sold-out ${skipped === 1 ? 'item was' : 'items were'} left in your wishlist.` : undefined,
      actions: [
        { label: 'View cart', to: '/cart' },
        { label: 'Checkout', to: '/checkout', primary: true },
      ],
    })
  }

  return (
    <div className="bg-canvas">
      <Container className="py-8 sm:py-12">
        <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Wishlist' }]} />
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">My wishlist</h1>
            <p className="mt-1 text-sm text-muted">{wishlist.ids.length} saved {wishlist.ids.length === 1 ? 'item' : 'items'}</p>
          </div>
          {saved.length > 0 && (
            <div className="flex gap-3">
              <button type="button" onClick={() => wishlist.clear()} className="btn btn-outline btn-sm">
                Clear all
              </button>
              <button type="button" onClick={addAll} className="btn btn-accent btn-sm">
                Add all to cart
              </button>
            </div>
          )}
        </div>

        {!user && wishlist.ids.length > 0 && (
          <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-brand/15 bg-brand-soft/70 p-4 sm:flex-row sm:items-center">
            <p className="min-w-0 flex-1 text-sm text-ink-soft">
              <span className="font-extrabold text-brand">Saved on this device only.</span> Log in to keep your wishlist on your phone and computer.
            </p>
            <Link to="/login" state={{ from: '/wishlist' }} className="btn btn-brand btn-sm shrink-0">
              Log in
            </Link>
          </div>
        )}

        {wishlist.ids.length === 0 ? (
          <div className="mt-10">
            <EmptyState
              icon={<HeartIcon className="size-9" />}
              title="Your wishlist is empty"
              text="Tap the heart on any product to save it here for later."
              action={{ to: '/shop', label: 'Discover products' }}
            />
          </div>
        ) : (
          <div className="stagger mt-8 grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
            {saved.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}

        {suggestions.length > 0 && (
          <section className="mt-16">
            <div className="flex items-end justify-between">
              <h2 className="text-2xl font-extrabold tracking-tight">You might also love</h2>
              <Link to="/shop" className="text-sm font-bold text-brand">Shop all →</Link>
            </div>
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
