import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Container } from '../components/layout/Container.tsx'
import { BoxIcon, LeafIcon, ShieldIcon, TagIcon, TruckIcon } from '../components/icons.tsx'
import { ProductCard } from '../components/product/ProductCard.tsx'
import { ProductMedia } from '../components/product/ProductMedia.tsx'
import { SectionHeading } from '../components/ui/Primitives.tsx'
import { Stars } from '../components/ui/Stars.tsx'
import { featuredPack, productPath, useActiveCoupons, useBanners, useCategories, useProducts, useStoreSettings } from '../lib/catalog.ts'
import { testimonials } from '../data/reviews.ts'
import { discountPercent, formatPrice } from '../lib/money.ts'
import { useDocumentTitle } from '../lib/useDocumentTitle.ts'
import type { Pack, Product } from '../types.ts'

const promisesFor = (freeAt: number) => [
  { icon: LeafIcon, title: '100% Natural', text: 'No preservatives or added sugar' },
  { icon: BoxIcon, title: 'Packed to order', text: 'Sealed fresh after you order' },
  { icon: TruckIcon, title: 'Free delivery', text: `On orders above ${formatPrice(freeAt)}` },
  { icon: ShieldIcon, title: 'Secure checkout', text: 'UPI, cards, netbanking & COD' },
]

const steps = [
  { step: '01', title: 'Pick your pouch', text: 'Choose the nut, the grade and the pack size that suits your pantry.' },
  { step: '02', title: 'We pack it fresh', text: 'Orders are sealed after they are placed, never pulled from a warm shelf.' },
  { step: '03', title: 'Track it to your door', text: 'Follow every step live, from our Patna packing desk to your doorstep.' },
]

type ShelfTab = 'all' | 'sale' | 'best'

/** Time left until midnight, so the sale strip has a live countdown. */
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

function deepestCut(product: Product): Pack {
  return [...product.packs].sort((a, b) => discountPercent(b.price, b.mrp) - discountPercent(a.price, a.mrp))[0] ?? featuredPack(product)
}


export function HomePage() {
  useDocumentTitle('ClickMart')
  const [shelf, setShelf] = useState<ShelfTab>('all')
  const [copied, setCopied] = useState<string | null>(null)
  const [hours, minutes, seconds] = useCountdown()
  const settings = useStoreSettings()
  const promises = promisesFor(settings.freeShippingThreshold)
  const categories = useCategories().data ?? []
  const lone = categories.length === 1 ? categories[0] : undefined
  const catalog = useProducts({ category: lone?.id, sort: 'popular', pageSize: 12 })
  const sale = useProducts({ category: lone?.id, onSale: true, sort: 'discount', pageSize: 12 })
  const best = useProducts({ category: lone?.id, bestseller: true, pageSize: 8 })
  const catalogSize = useProducts({ pageSize: 1 }).data?.total
  const promo = useBanners('PROMO').data?.[0]
  const coupons = useActiveCoupons().data ?? []
  const bestsellers = best.data?.items ?? []
  const spotlight = bestsellers[0] ?? catalog.data?.items[0]
  const spotlightPack = spotlight ? featuredPack(spotlight) : undefined
  const tabs = [
    { id: 'all' as const, label: 'All' },
    ...(sale.data && sale.data.total > 0 ? [{ id: 'sale' as const, label: 'On sale' }] : []),
    ...(best.data && best.data.total > 0 ? [{ id: 'best' as const, label: 'Best sellers' }] : []),
  ]
  const activeTab = tabs.some((tab) => tab.id === shelf) ? shelf : 'all'
  const activeQuery = activeTab === 'sale' ? sale : activeTab === 'best' ? best : catalog
  const activeItems = activeQuery.data?.items ?? []
  const cards = activeItems.map((product) => ({
    product,
    pack: activeTab === 'sale' ? deepestCut(product) : featuredPack(product),
  }))
  const viewAll = activeTab === 'sale' ? '/sale' : lone ? `/shop?category=${lone.id}` : '/shop'

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
    } catch {
      /* The button still confirms the tap when the clipboard is blocked. */
    }
    setCopied(code)
    window.setTimeout(() => setCopied((current) => (current === code ? null : current)), 1800)
  }

  return (
    <div className="bg-white">
      {/* Hero */}
      <section className="relative overflow-hidden bg-[#f2efe9]">
        <Container className="relative grid items-stretch lg:grid-cols-[1.05fr_0.95fr]">
          <div className="motion-rise relative z-10 py-12 sm:py-16 lg:py-24 lg:pr-8">
            <h1 className="max-w-xl text-[2.6rem] leading-[0.98] font-extrabold tracking-tight text-ink uppercase sm:text-6xl xl:text-[4.25rem]">
              Find dry fruits that fuel your day
            </h1>
            <p className="mt-6 max-w-md text-[15px] leading-7 text-ink/60">
              Browse our range of handpicked almonds, cashews, walnuts and seeds, sealed fresh to order and made for
              everyday healthy snacking.
            </p>
            <Link to="/shop" className="btn btn-lg mt-8 w-full bg-ink px-14 text-white hover:bg-black sm:w-auto">
              Shop Now
            </Link>
            <dl className="mt-10 flex flex-nowrap items-center">
              {[
                ['50+', 'Premium Varieties'],
                [`${((catalogSize ?? 12) * 150).toLocaleString('en-IN')}+`, 'Pouches Delivered'],
                ['12,000+', 'Happy Customers'],
              ].map(([value, label], index) => (
                <div key={label} className={`pr-4 sm:pr-8 ${index > 0 ? 'border-l border-ink/15 pl-4 sm:pl-8' : ''}`}>
                  <dd className="text-2xl font-extrabold text-ink sm:text-4xl">{value}</dd>
                  <dt className="mt-0.5 text-[11px] leading-4 text-ink/55 sm:text-sm">{label}</dt>
                </div>
              ))}
            </dl>
          </div>

          <div className="motion-rise-late relative -mx-4 min-h-[22rem] sm:-mx-6 lg:mx-0 lg:min-h-0">
            <img
              src="/images/almonds.jpg"
              alt="Premium almonds"
              className="absolute inset-0 size-full object-cover lg:[mask-image:linear-gradient(to_right,transparent,#000_22%)]"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-[#f2efe9] via-transparent to-transparent lg:hidden" />
            <svg viewBox="0 0 24 24" className="motion-float absolute top-10 right-6 size-16 text-ink drop-shadow-lg sm:size-24 lg:top-16 lg:right-2" aria-hidden="true">
              <path fill="currentColor" d="M12 0c.6 6.7 4.9 11.4 12 12-7.1.6-11.4 5.3-12 12-.6-6.7-4.9-11.4-12-12C7.1 11.4 11.4 6.7 12 0Z" />
            </svg>
            <svg viewBox="0 0 24 24" className="motion-float absolute bottom-16 left-6 size-9 text-ink drop-shadow-lg sm:size-12 lg:left-20" style={{ animationDelay: '-2s' }} aria-hidden="true">
              <path fill="currentColor" d="M12 0c.6 6.7 4.9 11.4 12 12-7.1.6-11.4 5.3-12 12-.6-6.7-4.9-11.4-12-12C7.1 11.4 11.4 6.7 12 0Z" />
            </svg>
            {spotlight && spotlightPack && (
              <Link
                to={productPath(spotlight, spotlightPack.size)}
                className="absolute right-4 bottom-4 flex items-center gap-3 rounded-2xl bg-white/95 p-3 pr-5 shadow-pop backdrop-blur transition hover:scale-[1.03] sm:right-6 sm:bottom-6"
              >
                <span className="size-12 overflow-hidden rounded-xl bg-canvas">
                  <ProductMedia name={spotlight.name} image={spotlight.image} art={spotlight.art} className="size-full" />
                </span>
                <span>
                  <span className="eyebrow block">Best seller</span>
                  <span className="block text-sm font-extrabold">{spotlight.name}</span>
                  <span className="text-sm text-muted">
                    {spotlightPack.size} · <span className="font-bold text-ink">{formatPrice(spotlightPack.price)}</span>
                  </span>
                </span>
              </Link>
            )}
          </div>
        </Container>
      </section>

      <section className="border-b border-line bg-white py-8 sm:py-12">
        <Container>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">{lone?.name ?? 'The shop'}</p>
              <h2 className="mt-1.5 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">Shop the range</h2>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div role="tablist" aria-label="Browse products" className="flex rounded-full bg-canvas p-1">
                {tabs.map((tab) => {
                  const selected = activeTab === tab.id
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() => setShelf(tab.id)}
                      className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                        selected ? 'bg-ink text-white shadow-sm' : 'text-ink/70 hover:bg-white hover:text-ink'
                      }`}
                    >
                      {tab.label}
                    </button>
                  )
                })}
              </div>
              <Link to={viewAll} className="text-sm font-bold text-brand">
                View all →
              </Link>
            </div>
          </div>
          <div key={activeTab} className="stagger mt-8 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
            {activeQuery.isPending
              ? Array.from({ length: 4 }, (_, index) => <div key={index} className="aspect-[3/4] animate-pulse rounded-[1.25rem] bg-canvas" />)
              : cards.slice(0, 8).map(({ product, pack }) => (
                  <ProductCard key={`${product.id}-${pack.size}`} product={product} pack={pack} />
                ))}
          </div>
          {!activeQuery.isPending && cards.length === 0 && (
            <p className="mt-8 text-sm text-muted">Nothing in this list yet. Try another tab.</p>
          )}
        </Container>
      </section>

      {categories.length > 1 ? (
        <section className="bg-ink py-7 text-white sm:py-9">
          <Container>
            <ul className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4 sm:justify-between sm:gap-x-12">
              {categories.slice(0, 6).map((category) => (
                <li key={category.id}>
                  <Link
                    to={`/shop?category=${category.id}`}
                    className="text-xl font-extrabold tracking-wide uppercase opacity-90 transition hover:text-accent hover:opacity-100 sm:text-3xl"
                  >
                    {category.name}
                  </Link>
                </li>
              ))}
            </ul>
          </Container>
        </section>
      ) : null}

      {/* Promises */}
      <section className="py-10">
        <Container>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {promises.map((item) => (
              <div key={item.title} className="flex items-center gap-3.5 rounded-2xl border border-line bg-white p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-lift">
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
                  <item.icon className="size-6" />
                </span>
                <div>
                  <p className="font-extrabold">{item.title}</p>
                  <p className="text-xs leading-5 text-muted">{item.text}</p>
                </div>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {categories.length > 1 && (
        <section className="pb-14">
          <Container>
            <SectionHeading eyebrow="Browse" title="Shop by category" action={{ to: '/shop', label: 'View all' }} />
            <div className="no-scrollbar -mx-4 mt-7 flex gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 lg:grid lg:grid-cols-7 lg:overflow-visible">
              {categories.map((category) => (
                <Link key={category.id} to={`/shop?category=${category.id}`} className="group w-28 shrink-0 text-center lg:w-auto">
                  <span className="relative mx-auto block aspect-square w-full overflow-hidden rounded-full border-4 border-white shadow-card ring-1 ring-line transition duration-300 group-hover:-translate-y-1 group-hover:shadow-lift group-hover:ring-accent">
                    <ProductMedia name={category.name} image={category.image} art={category.art} className="motion-zoom size-full" />
                  </span>
                  <span className="mt-3 block text-sm font-extrabold group-hover:text-brand">{category.name}</span>
                  <span className="block text-[11px] text-muted">{category.subcategories.length} grades</span>
                </Link>
              ))}
            </div>
          </Container>
        </section>
      )}

      <section className="py-14">
        <Container>
          <div className="relative grid overflow-hidden rounded-[2rem] bg-gradient-to-br from-brand-dark via-brand to-[#1d56b8] text-white lg:grid-cols-[1.1fr_0.9fr]">
            <div className="pointer-events-none absolute -top-20 -left-10 size-72 rounded-full bg-accent/25 blur-3xl" />
            <div className="relative p-8 sm:p-12">
              <p className="eyebrow !text-orange-300">On sale</p>
              <h2 className="mt-3 max-w-md text-3xl leading-tight font-extrabold tracking-tight sm:text-4xl">
                {promo?.title ?? (coupons[0]?.type === 'PERCENT' ? `${coupons[0].value}% off every pouch` : 'Fresh offers every week')}
              </h2>
              <p className="mt-4 max-w-md leading-7 text-white/75">
                {promo?.subtitle || 'Tap a code to copy it, then use it at checkout. It comes off your whole basket.'}
              </p>
              <div className="mt-6 flex items-center gap-2" aria-label="Today's deals end in">
                {[
                  [hours, 'Hrs'],
                  [minutes, 'Min'],
                  [seconds, 'Sec'],
                ].map(([value, label]) => (
                  <div key={label} className="grid h-14 w-14 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15">
                    <div className="text-center">
                      <p className="text-lg leading-none font-extrabold tabular-nums">{value}</p>
                      <p className="mt-1 text-[10px] text-white/55 uppercase">{label}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                {coupons.slice(0, 3).map((coupon) => (
                  <button
                    key={coupon.code}
                    type="button"
                    onClick={() => void copyCode(coupon.code)}
                    className="inline-flex items-center gap-3 rounded-full border-2 border-dashed border-white/50 bg-white/10 py-2.5 pr-3 pl-4 text-sm font-extrabold tracking-[0.16em] backdrop-blur transition hover:bg-white/20"
                  >
                    <TagIcon className="size-4" />
                    {coupon.code}
                    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-extrabold tracking-normal text-brand">
                      {copied === coupon.code ? 'Copied ✓' : 'Copy'}
                    </span>
                  </button>
                ))}
                <Link to={promo?.link ?? '/sale'} className="btn btn-accent btn-lg">
                  Shop the sale
                </Link>
              </div>
            </div>
            <div className="relative min-h-52">
              <img src={promo?.image ?? '/images/walnuts.jpg'} alt="" className="absolute inset-0 size-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-r from-brand-dark/80 via-transparent to-transparent" />
            </div>
          </div>
        </Container>
      </section>

      {/* How it works */}
      <section className="bg-cream py-14">
        <Container>
          <SectionHeading eyebrow="How it works" title="From the pouch to your door" />
          <ol className="mt-8 grid gap-5 md:grid-cols-3">
            {steps.map((item) => (
              <li key={item.step} className="relative overflow-hidden rounded-3xl border border-line bg-white p-7 shadow-card">
                <span className="absolute -top-3 right-3 text-8xl font-extrabold text-brand/[0.06]">{item.step}</span>
                <span className="grid size-10 place-items-center rounded-full bg-accent text-sm font-extrabold text-white">
                  {item.step}
                </span>
                <h3 className="mt-5 text-lg font-extrabold">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{item.text}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      {/* Testimonials */}
      <section className="py-14">
        <Container>
          <SectionHeading eyebrow="Loved across India" title="What our customers say" />
          <div className="stagger mt-8 grid gap-5 md:grid-cols-3">
            {testimonials.map((item) => (
              <figure key={item.name} className="flex flex-col rounded-3xl border border-line bg-white p-6 shadow-card">
                <Stars value={item.rating} />
                <blockquote className="mt-4 flex-1 text-[15px] leading-7 text-ink-soft">“{item.comment}”</blockquote>
                <figcaption className="mt-5 flex items-center gap-3 border-t border-line pt-4">
                  <span className="grid size-10 place-items-center rounded-full bg-gradient-to-br from-brand to-[#2f6bd6] text-xs font-extrabold text-white">
                    {item.name
                      .split(' ')
                      .map((part) => part[0])
                      .join('')}
                  </span>
                  <span>
                    <span className="block text-sm font-extrabold">{item.name}</span>
                    <span className="block text-xs text-muted">{item.city} · Verified buyer</span>
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </Container>
      </section>
    </div>
  )
}
