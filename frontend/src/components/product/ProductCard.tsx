import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useCart } from '../../context/CartContext.tsx'
import { useWishlist } from '../../context/WishlistContext.tsx'
import { CartIcon, HeartIcon } from '../icons.tsx'
import { featuredPack, productPath } from '../../lib/catalog.ts'
import { discountPercent, formatPrice } from '../../lib/money.ts'
import type { Pack, Product } from '../../types.ts'
import { Stars } from '../ui/Stars.tsx'
import { ProductMedia } from './ProductMedia.tsx'

export function ProductCard({ product, pack: chosen }: { product: Product; pack?: Pack }) {
  const { addItem } = useCart()
  const wishlist = useWishlist()
  const saved = wishlist.has(product.id)
  const pack = chosen ?? featuredPack(product)
  const stock = pack.stock ?? 0
  const inStock = stock > 0
  const title = product.packs.length > 1 ? `${product.name} · ${pack.size}` : product.name
  const href = productPath(product, pack.size)
  const off = discountPercent(pack.price, pack.mrp)
  const [added, setAdded] = useState(false)
  const lowStock = inStock && stock <= 15

  const add = () => {
    addItem(pack.variantId, 1, product.name)
    setAdded(true)
    window.setTimeout(() => setAdded(false), 1000)
  }

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-[1.25rem] border border-line bg-white shadow-card transition duration-300 hover:-translate-y-1 hover:border-transparent hover:shadow-lift">
      <Link to={href} className="relative block overflow-hidden bg-canvas">
        <ProductMedia
          name={product.name}
          image={product.image}
          art={product.art}
          className={`motion-zoom aspect-square w-full ${inStock ? '' : 'opacity-50 grayscale'}`}
        />
        <div className="absolute top-3 left-3 flex flex-col items-start gap-1.5">
          {off > 0 && (
            <span className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-extrabold text-white shadow-sm">
              {off}% OFF
            </span>
          )}
          {product.bestseller && (
            <span className="rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-extrabold text-brand shadow-sm">
              ★ Bestseller
            </span>
          )}
        </div>
        {!inStock && (
          <span className="absolute inset-x-0 bottom-3 mx-auto w-fit rounded-full bg-ink px-3 py-1 text-xs font-bold text-white">
            Sold out
          </span>
        )}
      </Link>
      <button
        type="button"
        onClick={() => wishlist.toggle(product.id)}
        aria-pressed={saved}
        aria-label={saved ? `Remove ${product.name} from wishlist` : `Save ${product.name}`}
        className={`absolute top-3 right-3 grid size-9 place-items-center rounded-full bg-white/95 shadow-md backdrop-blur transition duration-200 hover:scale-110 ${
          saved ? 'text-rose-500' : 'text-ink hover:text-rose-500'
        }`}
      >
        <span key={saved ? 'saved' : 'idle'} className={saved ? 'motion-pop' : undefined}>
          <HeartIcon className="size-[18px]" filled={saved} />
        </span>
      </button>

      <div className="flex flex-1 flex-col p-3.5 sm:p-4">
        <p className="text-[11px] font-bold tracking-wide text-muted uppercase">
          {product.categoryName ?? product.category}
        </p>
        <Link
          to={href}
          className="mt-0.5 line-clamp-2 text-[15px] font-extrabold text-ink transition hover:text-brand"
        >
          {title}
        </Link>
        <div className="mt-1 flex items-center gap-1.5">
          <Stars value={product.rating} className="size-3.5" />
          <span className="text-xs font-semibold text-ink-soft">{product.rating}</span>
          <span className="text-xs text-muted">({product.reviewCount})</span>
        </div>
        {lowStock && <p className="mt-1.5 text-[11px] font-bold text-rose-600">Only {stock} left</p>}

        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <div>
            <p className="text-[11px] font-semibold text-muted">{pack.size}</p>
            <p className="flex items-baseline gap-1.5">
              <span className="text-lg leading-none font-extrabold text-ink">{formatPrice(pack.price)}</span>
              {off > 0 && <span className="text-xs text-muted line-through">{formatPrice(pack.mrp)}</span>}
            </p>
          </div>
          <button
            type="button"
            disabled={!inStock}
            onClick={add}
            aria-label={`Add ${title} to cart`}
            className={`grid size-11 shrink-0 place-items-center rounded-full text-white transition duration-200 active:scale-90 disabled:cursor-not-allowed disabled:bg-slate-300 ${
              added ? 'bg-success' : 'bg-brand hover:bg-accent'
            }`}
          >
            {added ? <span className="motion-pop text-lg leading-none font-bold">✓</span> : <CartIcon className="size-5" />}
          </button>
        </div>
      </div>
    </article>
  )
}
