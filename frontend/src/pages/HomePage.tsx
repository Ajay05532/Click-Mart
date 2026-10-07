import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Container } from '../components/layout/Container.tsx'
import { BoxIcon, LeafIcon, ShieldIcon, TruckIcon } from '../components/icons.tsx'
import { ProductCard } from '../components/product/ProductCard.tsx'
import { ProductMedia } from '../components/product/ProductMedia.tsx'
import { SectionHeading } from '../components/ui/Primitives.tsx'
import { Stars } from '../components/ui/Stars.tsx'
import { categories, featuredPack, products } from '../data/products.ts'
import { testimonials } from '../data/reviews.ts'
import { FREE_SHIPPING_AT, formatPrice } from '../lib/money.ts'
import { useDocumentTitle } from '../lib/useDocumentTitle.ts'

const promises = [
  { icon: LeafIcon, title: '100% Natural', text: 'No preservatives or added sugar' },
  { icon: BoxIcon, title: 'Packed to order', text: 'Sealed fresh after you order' },
  { icon: TruckIcon, title: 'Free delivery', text: `On orders above ${formatPrice(FREE_SHIPPING_AT)}` },
  { icon: ShieldIcon, title: 'Secure checkout', text: 'UPI, cards, netbanking & COD' },
]

const steps = [
  { step: '01', title: 'Pick your pouch', text: 'Choose the nut, the grade and the pack size that suits your pantry.' },
  { step: '02', title: 'We pack it fresh', text: 'Orders are sealed after they are placed, never pulled from a warm shelf.' },
  { step: '03', title: 'Track it to your door', text: 'Follow every step live, from our Bengaluru kitchen to your doorstep.' },
]


export function HomePage() {
  useDocumentTitle('ClickMart')
  const [copied, setCopied] = useState(false)
  const bestsellers = products.filter((product) => product.bestseller).slice(0, 4)
  const spotlight = products.find((product) => product.id === 'almonds') ?? products[0]
  const spotlightPack = featuredPack(spotlight)
  const alsoLoved = products.filter((product) => !product.bestseller && product.inStock).slice(0, 4)

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText('DRY15')
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
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
                [`${(products.length * 150).toLocaleString('en-IN')}+`, 'Pouches Delivered'],
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
            <Link
              to={`/product/${spotlight.slug}`}
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
          </div>
        </Container>
      </section>

      {/* Category strip */}
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

      {/* Categories */}
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

      {/* Best sellers */}
      <section className="bg-canvas py-14">
        <Container>
          <SectionHeading eyebrow="Most reordered" title="Customer favourites" action={{ to: '/shop', label: 'Shop all' }} />
          <div className="stagger mt-8 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
            {bestsellers.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </Container>
      </section>

      {/* Offer banner */}
      <section className="py-14">
        <Container>
          <div className="relative grid overflow-hidden rounded-[2rem] bg-gradient-to-br from-brand-dark via-brand to-[#1d56b8] text-white lg:grid-cols-[1.1fr_0.9fr]">
            <div className="pointer-events-none absolute -top-20 -left-10 size-72 rounded-full bg-accent/25 blur-3xl" />
            <div className="relative p-8 sm:p-12">
              <p className="eyebrow !text-orange-300">This week only</p>
              <h2 className="mt-3 max-w-md text-3xl leading-tight font-extrabold tracking-tight sm:text-4xl">
                15% off every pouch
              </h2>
              <p className="mt-4 max-w-md leading-7 text-white/75">
                Healthy snacking, made simple. Use the code at checkout and it comes off your whole basket.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void copyCode()}
                  className="inline-flex items-center gap-3 rounded-full border-2 border-dashed border-white/50 bg-white/10 py-3 pr-5 pl-6 text-sm font-extrabold tracking-[0.2em] backdrop-blur transition hover:bg-white/20"
                >
                  DRY15
                  <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-extrabold tracking-normal text-brand">
                    {copied ? 'Copied ✓' : 'Copy'}
                  </span>
                </button>
                <Link to="/shop" className="btn btn-accent btn-lg">
                  Shop the offer
                </Link>
              </div>
            </div>
            <div className="relative min-h-52">
              <img src="/images/walnuts.jpg" alt="" className="absolute inset-0 size-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-r from-brand-dark/80 via-transparent to-transparent" />
            </div>
          </div>
        </Container>
      </section>

      {/* Also in pantry */}
      <section className="pb-14">
        <Container>
          <SectionHeading eyebrow="Worth a look" title="Also in the pantry" />
          <div className="stagger mt-8 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
            {alsoLoved.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
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
