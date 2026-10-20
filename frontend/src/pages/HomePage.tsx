import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Container } from '../components/layout/Container.tsx'
import { BoxIcon, LeafIcon, ShieldIcon, TruckIcon } from '../components/icons.tsx'
import { ProductCard } from '../components/product/ProductCard.tsx'
import { ProductMedia } from '../components/product/ProductMedia.tsx'
import { SectionHeading } from '../components/ui/Primitives.tsx'
import { Stars } from '../components/ui/Stars.tsx'
import { featuredPack, productPath, useActiveCoupons, useBanners, useCategories, useFeaturedReviews, useProducts, useStoreSettings } from '../lib/catalog.ts'
import { discountPercent, formatPrice } from '../lib/money.ts'
import { organizationJsonLd, websiteJsonLd } from '../lib/jsonld.ts'
import { useSeo } from '../lib/seo.ts'
import type { Pack, Product } from '../types.ts'
import { categoryPath } from '../lib/paths.ts'

const showcase = [
  { name: 'Almonds', image: '/images/almonds.jpg', query: 'almond' },
  { name: 'Cashews', image: '/images/cashews.jpg', query: 'cashew' },
  { name: 'Walnuts', image: '/images/walnuts.jpg', query: 'walnut' },
  { name: 'Raisins', image: '/images/raisins.jpg', query: 'raisin' },
  { name: 'Seeds', image: '/images/seeds.jpg', query: 'seed' },
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

function couponOffer(coupon: { type: 'PERCENT' | 'FLAT' | 'FREE_SHIPPING'; value: number; label: string }) {
  if (coupon.label.trim()) return coupon.label
  if (coupon.type === 'FREE_SHIPPING') return 'Free shipping'
  if (coupon.type === 'PERCENT') return `${coupon.value}% off the basket`
  return `${formatPrice(coupon.value)} off the basket`
}

function inStockPacks(product: Product) {
  return product.packs.filter((pack) => (pack.stock ?? 0) > 0)
}

/** The pack shown on the home shelf. Sold-out packs are skipped so the card can still be bought. */
function shelfPack(product: Product, tab: ShelfTab): Pack | undefined {
  const packs = inStockPacks(product)
  if (packs.length === 0) return undefined
  if (tab === 'sale') return [...packs].sort((a, b) => discountPercent(b.price, b.mrp) - discountPercent(a.price, a.mrp))[0]
  return packs.find((pack) => pack.size === product.featuredSize) ?? packs[0]
}


export function HomePage() {
  useSeo({
    title: 'ClickMart · Premium dry fruits, nuts and seeds delivered across India',
    description: 'Buy fresh almonds, cashews, raisins, walnuts and seeds online. Packed after you order in Patna, delivered across India. Pay by UPI, card or cash on delivery.',
    path: '/',
    jsonLd: [organizationJsonLd(), websiteJsonLd()],
  })
  const [shelf, setShelf] = useState<ShelfTab>('all')
  const [copied, setCopied] = useState<string | null>(null)
  const [hours, minutes, seconds] = useCountdown()
  const settings = useStoreSettings()
  const marks = [
    { icon: ShieldIcon, title: 'Premium quality', text: 'Handpicked from trusted farms' },
    { icon: TruckIcon, title: 'Fast delivery', text: `Free above ${formatPrice(settings.freeShippingThreshold)}` },
    { icon: LeafIcon, title: '100% natural', text: 'No artificial preservatives' },
    { icon: BoxIcon, title: 'Premium packaging', text: 'Sealed fresh, ready to gift' },
  ]
  const categories = useCategories().data ?? []
  const lone = categories.length === 1 ? categories[0] : undefined
  const catalog = useProducts({ category: lone?.id, sort: 'popular', pageSize: 12 })
  const sale = useProducts({ category: lone?.id, onSale: true, sort: 'discount', pageSize: 12 })
  const best = useProducts({ category: lone?.id, bestseller: true, pageSize: 8 })
  const promo = useBanners('PROMO').data?.[0]
  const coupons = useActiveCoupons().data ?? []
  const reviews = useFeaturedReviews().data ?? []
  const tabs = [
    { id: 'all' as const, label: 'All' },
    ...(sale.data && sale.data.total > 0 ? [{ id: 'sale' as const, label: 'On sale' }] : []),
    ...(best.data && best.data.total > 0 ? [{ id: 'best' as const, label: 'Best sellers' }] : []),
  ]
  const activeTab = tabs.some((tab) => tab.id === shelf) ? shelf : 'all'
  const activeQuery = activeTab === 'sale' ? sale : activeTab === 'best' ? best : catalog
  const activeItems = activeQuery.data?.items ?? []
  const cards = activeItems.flatMap((product) => {
    const pack = shelfPack(product, activeTab)
    return pack ? [{ product, pack }] : []
  })
  const circles = (catalog.data?.items ?? []).filter((product) => inStockPacks(product).length > 0)
  const viewAll = activeTab === 'sale' ? '/sale' : lone ? categoryPath(lone.id) : '/shop'

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
      <section className="relative overflow-hidden bg-[#f6f1e8]">
        <Container className="relative grid grid-cols-1 items-center gap-8 py-12 sm:py-16 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-6 lg:py-20">
          <div className="motion-rise relative z-10 max-w-xl">
            <p className="eyebrow">Handpicked dry fruits</p>
            <h1 className="mt-4 text-[3.4rem] leading-[0.92] font-extrabold tracking-tight text-brand-dark sm:text-7xl lg:text-[5.2rem]">
              Pure.
              <br />
              Natural.
              <br />
              ClickMart.
            </h1>
            <p className="mt-6 max-w-md text-[15px] leading-7 text-ink/70">
              Premium nuts and dried fruit, handpicked and sealed fresh to order, delivered to your door.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/shop" className="btn btn-lg bg-brand px-7 text-white hover:bg-brand-dark">
                Shop now <span aria-hidden="true">→</span>
              </Link>
              <a href="#goodness" className="btn btn-accent btn-lg px-7">
                Explore collection
              </a>
            </div>
          </div>

          <div className="motion-rise-late relative mx-auto flex w-full max-w-2xl items-center gap-4">
            <div className="relative h-[24rem] min-w-0 flex-1 sm:h-[28rem]">
              <div className="absolute inset-x-2 top-8 bottom-2 rounded-[2.5rem] bg-[#efe4cf]" />
              <img src="/images/almonds.jpg" alt="" className="absolute top-2 left-[6%] size-32 rounded-full object-cover shadow-lift ring-4 ring-[#f6f1e8] sm:size-40" />
              <img src="/images/cashews.jpg" alt="" className="absolute top-0 right-[8%] size-28 rounded-full object-cover shadow-lift ring-4 ring-[#f6f1e8] sm:size-36" />
              <img src="/images/walnuts.jpg" alt="" className="absolute bottom-8 left-[14%] size-28 rounded-full object-cover shadow-lift ring-4 ring-[#f6f1e8] sm:size-36" />
              <img src="/images/raisins.jpg" alt="" className="absolute right-[6%] bottom-4 size-28 rounded-full object-cover shadow-lift ring-4 ring-[#f6f1e8] sm:size-36" />
              <img src="/images/seeds.jpg" alt="Bowls of almonds, cashews, walnuts, raisins and seeds" className="absolute top-[38%] left-[36%] size-20 rounded-full object-cover shadow-pop ring-4 ring-white sm:size-24" />
            </div>
            <aside className="hidden w-36 shrink-0 rounded-2xl bg-white p-4 text-center shadow-lift lg:block">
              {[
                ['Nature’s finest', LeafIcon],
                ['Handpicked for quality', ShieldIcon],
                ['Chosen for you', BoxIcon],
              ].map(([label, Icon], index) => (
                <div key={String(label)} className={index > 0 ? 'mt-3 border-t border-line pt-3' : ''}>
                  <Icon className="mx-auto size-4 text-brand" />
                  <p className="mt-1.5 text-[10px] leading-4 font-extrabold tracking-wide text-ink uppercase">{String(label)}</p>
                </div>
              ))}
            </aside>
          </div>
        </Container>
      </section>

      <div className="relative z-10 -mt-8">
        <Container>
          <ul className="grid grid-cols-2 gap-3 rounded-3xl border border-line bg-white p-3 shadow-lift sm:p-4 lg:grid-cols-4">
            {marks.map((item) => (
              <li key={item.title} className="flex items-center gap-3 rounded-2xl px-2 py-2 sm:px-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
                  <item.icon className="size-5" />
                </span>
                <span>
                  <span className="block text-xs font-extrabold tracking-wide uppercase sm:text-sm">{item.title}</span>
                  <span className="mt-0.5 block text-[11px] leading-4 text-muted sm:text-xs">{item.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </Container>
      </div>

      <section id="goodness" className="scroll-mt-24 py-14 sm:py-16">
        <Container>
          <div className="text-center">
            <p className="eyebrow">The range</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-brand-dark sm:text-5xl">Goodness in every bite</h2>
            <div className="mt-4 flex items-center justify-center gap-3 text-brand" aria-hidden="true">
              <span className="h-px w-14 bg-line" />
              <LeafIcon className="size-4" />
              <span className="h-px w-14 bg-line" />
            </div>
          </div>
          <ul className="mt-10 flex flex-wrap justify-center gap-x-6 gap-y-8">
            {(circles.length ? circles.slice(0, 5) : showcase).map((item) => {
              const product = 'slug' in item ? item : undefined
              const name = product ? product.name : item.name
              const image = product ? product.image : item.image
              const to = product ? productPath(product, featuredPack(product).size) : `/shop?q=${'query' in item ? item.query : ''}`
              return (
                <li key={product?.id ?? item.name} className="w-32 sm:w-40">
                  <Link to={to} className="group block text-center">
                    <span className="mx-auto grid size-32 place-items-center overflow-hidden rounded-full bg-[#f6f1e8] ring-1 ring-line transition duration-300 group-hover:-translate-y-1 group-hover:shadow-lift sm:size-40">
                      {product ? (
                        <ProductMedia name={product.name} image={product.image} art={product.art} className="size-[78%] rounded-full object-cover" />
                      ) : (
                        <img src={image ?? ''} alt={name} loading="lazy" decoding="async" className="size-[78%] rounded-full object-cover" />
                      )}
                    </span>
                    <span className="mt-4 block text-xs font-extrabold tracking-[0.14em] text-brand-dark uppercase sm:text-sm">{name}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
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
                    to={categoryPath(category.id)}
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

      <section id="sale-banner" className="scroll-mt-24 py-14">
        <Container>
          <div className="overflow-hidden rounded-[1.75rem] bg-brand-dark text-white shadow-lift">
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
              <div className="order-2 flex flex-col p-6 sm:p-10 lg:order-1 lg:p-12">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs font-extrabold tracking-[0.18em] text-orange-300 uppercase">On sale</p>
                  <p className="inline-flex items-center gap-2 text-xs font-bold text-white/65" aria-label="Today's deals end in">
                    Ends tonight
                    <span className="rounded-full bg-white/10 px-3 py-1 font-mono text-sm font-extrabold tracking-wide text-white tabular-nums">
                      {hours}:{minutes}:{seconds}
                    </span>
                  </p>
                </div>
                <h2 className="mt-5 max-w-lg text-4xl leading-[1.05] font-extrabold tracking-tight sm:text-5xl">
                  {promo?.title ?? (coupons[0]?.type === 'PERCENT' ? `${coupons[0].value}% off every pouch` : 'Fresh offers every week')}
                </h2>
                <p className="mt-4 max-w-md text-sm leading-6 text-white/70 sm:text-[15px]">
                  {promo?.subtitle || 'Copy a code, then use it at checkout. It comes off your whole basket.'}
                </p>
                {coupons.length > 0 && (
                  <ul className="mt-8 grid gap-2 sm:grid-cols-3">
                    {coupons.slice(0, 3).map((coupon) => (
                      <li key={coupon.code}>
                        <button
                          type="button"
                          onClick={() => void copyCode(coupon.code)}
                          className="flex h-full w-full items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3.5 text-left text-ink transition hover:-translate-y-0.5 hover:shadow-lift"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-extrabold tracking-wide">{coupon.code}</span>
                            <span className="mt-0.5 block truncate text-xs font-semibold text-muted">{couponOffer(coupon)}</span>
                          </span>
                          <span className={`shrink-0 text-xs font-extrabold ${copied === coupon.code ? 'text-success' : 'text-accent'}`}>
                            {copied === coupon.code ? 'Copied' : 'Copy'}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <Link to={promo?.link ?? '/sale'} className="btn btn-accent mt-6 w-full sm:w-fit">
                  Shop the sale
                </Link>
              </div>
              <div className="order-1 p-3 sm:p-4 lg:order-2 lg:py-4 lg:pr-4 lg:pl-0">
                <div className="relative h-52 overflow-hidden rounded-[1.35rem] sm:h-64 lg:h-full lg:min-h-[22rem]">
                  <img src={promo?.image ?? '/images/walnuts.jpg'} alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />
                </div>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* How it works */}
      <section className="bg-cream py-14">
        <Container>
          <SectionHeading eyebrow="How it works" title="From the pouch to your door" />
          <ol className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3">
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

      {reviews.length > 0 && (
        <section className="py-14">
          <Container>
            <SectionHeading eyebrow="From our customers" title="What shoppers say" />
            <div className="stagger mt-8 grid grid-cols-1 gap-5 md:grid-cols-3">
              {reviews.slice(0, 3).map((item) => (
                <figure key={item.id} className="flex flex-col rounded-3xl border border-line bg-white p-6 shadow-card">
                  <Stars value={item.rating} />
                  <blockquote className="mt-4 flex-1 text-[15px] leading-7 text-ink-soft">“{item.comment}”</blockquote>
                  <figcaption className="mt-5 flex items-center gap-3 border-t border-line pt-4">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand text-xs font-extrabold text-white">
                      {item.name.split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-extrabold">{item.name}</span>
                      <span className="block truncate text-xs text-muted">
                        {item.city}
                        {item.verified ? ' · Verified buyer' : ''}
                        {item.product ? (
                          <>
                            {' · '}
                            <Link to={`/product/${item.product.slug}`} className="font-semibold text-brand hover:underline">
                              {item.product.name}
                            </Link>
                          </>
                        ) : null}
                      </span>
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </Container>
        </section>
      )}
    </div>
  )
}
