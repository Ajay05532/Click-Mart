import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Container } from '../components/layout/Container.tsx'
import { HeartIcon, TagIcon } from '../components/icons.tsx'
import { ProductMedia } from '../components/product/ProductMedia.tsx'
import { Breadcrumbs } from '../components/ui/Breadcrumbs.tsx'
import { Stars } from '../components/ui/Stars.tsx'
import { useCart } from '../context/CartContext.tsx'
import { useWishlist } from '../context/WishlistContext.tsx'
import { useActiveCoupons, useCategories, useOffers, useStoreSettings } from '../lib/catalog.ts'
import { formatPrice } from '../lib/money.ts'
import { useDocumentTitle } from '../lib/useDocumentTitle.ts'
import type { CategoryId, Product } from '../types.ts'

const tiers = [0, 10, 15, 20] as const
const sorts = [
  { id: 'discount', label: 'Biggest discount' },
  { id: 'savings', label: 'Most savings (₹)' },
  { id: 'price', label: 'Price: low to high' },
] as const

/** Time left until the end of today, so the sale banner always has a live countdown. */
function useCountdown() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)
  const left = Math.max(0, end.getTime() - now)
  const pad = (n: number) => String(Math.floor(n)).padStart(2, '0')
  return [pad(left / 3600000), pad((left / 60000) % 60), pad((left / 1000) % 60)]
}

export function SalePage() {
  useDocumentTitle('On Sale')
  const [tier, setTier] = useState<(typeof tiers)[number]>(0)
  const [category, setCategory] = useState<CategoryId | 'all'>('all')
  const [sort, setSort] = useState<(typeof sorts)[number]['id']>('discount')
  const [copied, setCopied] = useState('')
  const [h, m, s] = useCountdown()

  const categories = useCategories().data ?? []
  const coupons = useActiveCoupons().data ?? []
  const offers = useOffers()
  const all = (offers.data?.deals ?? []).filter((deal) => deal.bestPack).map((deal) => ({ product: deal.product, pack: deal.bestPack!, off: deal.discountPercent, save: deal.bestPack!.mrp - deal.bestPack!.price }))
  const deals = all
    .filter((deal) => deal.off >= tier && (category === 'all' || deal.product.category === category))
    .sort((a, b) => (sort === 'savings' ? b.save - a.save : sort === 'price' ? a.pack.price - b.pack.price : b.off - a.off))
  const maxOff = offers.data?.maxDiscount ?? 0
  const topPercent = coupons.find((coupon) => coupon.type === 'PERCENT')

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
    } catch {
      /* clipboard unavailable, still show feedback */
    }
    setCopied(code)
    window.setTimeout(() => setCopied(''), 1600)
  }

  return (
    <div className="bg-canvas">
      <div className="relative overflow-hidden bg-ink text-white">
        <div className="pointer-events-none absolute -top-24 right-0 size-96 rounded-full bg-accent/30 blur-3xl" />
        <Container className="relative py-10 sm:py-14">
          <div className="text-white/60 [&_a:hover]:text-white [&_span.text-ink]:text-white">
            <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'On Sale' }]} />
          </div>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-8">
            <div>
              <p className="eyebrow !text-orange-300">Limited time offers</p>
              <h1 className="mt-2 text-4xl leading-none font-extrabold tracking-tight uppercase sm:text-6xl">
                Sale up to <span className="text-accent">{maxOff}% off</span>
              </h1>
              <p className="mt-4 max-w-lg text-white/65">
                Every pouch on offer, with the best pack price and the coupons that stack on top. Prices already include the
                discount.
              </p>
            </div>
            <div>
              <p className="text-xs font-bold tracking-widest text-white/60 uppercase">Today&apos;s deals end in</p>
              <div className="mt-2 flex items-center gap-2">
                {[
                  [h, 'Hrs'],
                  [m, 'Min'],
                  [s, 'Sec'],
                ].map(([value, label], index) => (
                  <div key={label} className="flex items-center gap-2">
                    <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15 backdrop-blur">
                      <div className="text-center">
                        <p className="text-2xl leading-none font-extrabold tabular-nums">{value}</p>
                        <p className="mt-1 text-[10px] text-white/55 uppercase">{label}</p>
                      </div>
                    </div>
                    {index < 2 && <span className="text-xl font-bold text-white/40">:</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Container>
      </div>

      <Container className="py-8 sm:py-10">
        {/* Coupons */}
        <section aria-labelledby="coupons">
          <h2 id="coupons" className="text-xl font-extrabold">Coupons you can use today</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {coupons.map((coupon) => (
              <div key={coupon.code} className="card relative flex items-center gap-4 overflow-hidden p-5">
                <span className="absolute top-1/2 -left-2.5 size-5 -translate-y-1/2 rounded-full bg-canvas ring-1 ring-line" />
                <span className="absolute top-1/2 -right-2.5 size-5 -translate-y-1/2 rounded-full bg-canvas ring-1 ring-line" />
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-orange-50 text-accent">
                  <TagIcon className="size-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-lg leading-tight font-extrabold">
                    {coupon.type === 'PERCENT' ? `${coupon.value}% off` : coupon.type === 'FLAT' ? `${formatPrice(coupon.value)} off` : 'Free shipping'}
                  </p>
                  <p className="truncate text-xs text-muted">{coupon.label}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void copy(coupon.code)}
                  className="shrink-0 rounded-full border-2 border-dashed border-accent/60 bg-orange-50 px-3.5 py-2 text-xs font-extrabold tracking-widest text-accent-dark transition hover:bg-orange-100"
                >
                  {copied === coupon.code ? 'Copied ✓' : coupon.code}
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Filters */}
        <section className="mt-12" aria-labelledby="deals">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 id="deals" className="text-2xl font-extrabold tracking-tight">All deals</h2>
              <p className="mt-1 text-sm text-muted">
                <span className="font-extrabold text-ink">{deals.length}</span> products on offer
              </p>
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-muted">
              Sort by
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as typeof sort)}
                className="h-10 cursor-pointer rounded-full border border-line bg-white px-4 text-sm font-bold text-ink outline-none hover:border-brand"
              >
                {sorts.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="no-scrollbar mt-5 flex gap-2 overflow-x-auto pb-1">
            {tiers.map((value) => (
              <Chip key={value} active={tier === value} onClick={() => setTier(value)}>
                {value === 0 ? 'All offers' : `${value}% off or more`}
              </Chip>
            ))}
            <span className="mx-1 w-px shrink-0 bg-line" />
            <Chip active={category === 'all'} onClick={() => setCategory('all')}>All categories</Chip>
            {categories.map((item) => (
              <Chip key={item.id} active={category === item.id} onClick={() => setCategory(item.id)}>{item.name}</Chip>
            ))}
          </div>

          {deals.length === 0 ? (
            <div className="card mt-6 px-6 py-16 text-center">
              <p className="text-lg font-extrabold">No offers match these filters</p>
              <button type="button" onClick={() => { setTier(0); setCategory('all') }} className="btn btn-brand mt-5">
                Show all offers
              </button>
            </div>
          ) : (
            <div className="stagger mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {deals.map((deal) => (
                <DealCard key={deal.product.id} {...deal} topPercent={topPercent} />
              ))}
            </div>
          )}
        </section>
      </Container>
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition ${
        active ? 'bg-ink text-white' : 'bg-white text-ink-soft ring-1 ring-line hover:ring-ink'
      }`}
    >
      {children}
    </button>
  )
}

function DealCard({ product, pack, off, save, topPercent }: { product: Product; pack: Product['packs'][number]; off: number; save: number; topPercent?: { code: string; value: number } }) {
  const { addItem } = useCart()
  const wishlist = useWishlist()
  const saved = wishlist.has(product.id)
  const settings = useStoreSettings()
  const withCode = topPercent ? Math.round((pack.price * (100 - topPercent.value)) / 100) : null
  const freeShip = pack.price >= settings.freeShippingThreshold

  return (
    <article className="group card flex overflow-hidden transition duration-300 hover:-translate-y-1 hover:shadow-lift">
      <Link to={`/product/${product.slug}`} className="relative block w-32 shrink-0 overflow-hidden bg-canvas sm:w-44">
        <ProductMedia name={product.name} image={product.image} art={product.art} className="motion-zoom size-full min-h-44" />
        <span className="absolute top-3 left-3 rounded-full bg-accent px-2.5 py-1 text-xs font-extrabold text-white shadow-md">
          {off}% OFF
        </span>
      </Link>
      <div className="relative flex min-w-0 flex-1 flex-col p-4">
        <button
          type="button"
          onClick={() => wishlist.toggle(product.id)}
          aria-pressed={saved}
          aria-label={saved ? `Remove ${product.name} from wishlist` : `Save ${product.name}`}
          className={`absolute top-3 right-3 transition hover:scale-110 ${saved ? 'text-rose-500' : 'text-muted hover:text-rose-500'}`}
        >
          <HeartIcon className="size-5" filled={saved} />
        </button>
        <Link to={`/product/${product.slug}`} className="truncate pr-7 text-[15px] font-extrabold hover:text-brand">
          {product.name}
        </Link>
        <div className="mt-1 flex items-center gap-1.5">
          <Stars value={product.rating} className="size-3.5" />
          <span className="text-xs text-muted">({product.reviewCount})</span>
        </div>

        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-xl font-extrabold">{formatPrice(pack.price)}</span>
          <span className="text-sm text-muted line-through">{formatPrice(pack.mrp)}</span>
          <span className="text-xs font-bold text-muted">/ {pack.size}</span>
        </div>

        <ul className="mt-2.5 space-y-1.5 text-xs">
          <li className="flex items-center gap-1.5 font-bold text-success">
            <span className="grid size-4 place-items-center rounded-full bg-emerald-100 text-[9px]">✓</span>
            You save {formatPrice(save)} on the {pack.size} pack
          </li>
          {withCode !== null && topPercent && (
          <li className="flex items-center gap-1.5 font-semibold text-accent-dark">
            <TagIcon className="size-4" />
            {formatPrice(withCode!)} with code <span className="font-extrabold">{topPercent!.code}</span>
          </li>
          )}
          {freeShip && (
            <li className="flex items-center gap-1.5 font-semibold text-brand">
              <span className="grid size-4 place-items-center rounded-full bg-brand-soft text-[9px]">✓</span>
              Free delivery included
            </li>
          )}
          {!product.inStock ? (
            <li className="font-bold text-rose-600">Currently sold out</li>
          ) : (
            product.stock <= 15 && <li className="font-bold text-rose-600">Only {product.stock} left at this price</li>
          )}
        </ul>

        <button
          type="button"
          disabled={!product.inStock}
          onClick={() => addItem(pack.variantId, 1, product.name)}
          className="btn btn-brand btn-sm mt-auto w-full disabled:bg-slate-300"
          style={{ marginTop: '0.9rem' }}
        >
          Add {pack.size} to cart
        </button>
      </div>
    </article>
  )
}
