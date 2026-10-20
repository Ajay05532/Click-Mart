import { Link } from 'react-router-dom'
import { BoxIcon, CashIcon, LeafIcon, MailIcon, PhoneIcon, PinIcon, ShieldIcon, TruckIcon } from '../components/icons.tsx'
import { Container } from '../components/layout/Container.tsx'
import { ProductCard } from '../components/product/ProductCard.tsx'
import { ProductMedia } from '../components/product/ProductMedia.tsx'
import { PageHero } from '../components/ui/PageHero.tsx'
import { useCategories, useProducts, useStoreContact, useStoreSettings } from '../lib/catalog.ts'
import { organizationJsonLd } from '../lib/jsonld.ts'
import { formatPrice } from '../lib/money.ts'
import { useSeo } from '../lib/seo.ts'
import { categoryPath } from '../lib/paths.ts'

const photos = ['/images/almonds.jpg', '/images/cashews.jpg', '/images/raisins.jpg', '/images/seeds.jpg']

const values = [
  { icon: ShieldIcon, title: 'Handpicked', text: 'Every lot is checked for size, colour and freshness before it is packed.' },
  { icon: LeafIcon, title: 'Honest labels', text: 'Pack weight, grade, ingredients and nutrition are printed the way a kitchen would want them.' },
  { icon: BoxIcon, title: 'Packed after you order', text: 'Pouches are weighed and sealed once the order comes in, never pulled from a warm shelf.' },
]

const steps = [
  { title: 'You order', text: 'Choose the nut, grade and pack size. Pay by UPI, card, net banking or cash on delivery.' },
  { title: 'We pack it fresh', text: 'Your pouches are weighed and sealed at our Patna kitchen after the order comes in.' },
  { title: 'It reaches you', text: 'Most orders arrive in about four working days. Every step shows in My orders.' },
]

export function AboutPage() {
  useSeo({
    title: 'About Us',
    description: 'ClickMart began as a small packing desk in Patna. We pack premium almonds, cashews, pistachios, raisins and seeds fresh after you order, and deliver across India.',
    jsonLd: organizationJsonLd(),
  })
  const catalogue = useProducts({ pageSize: 60 }).data
  const favourites = useProducts({ sort: 'popular', pageSize: 8 }).data?.items.filter((product) => product.inStock).slice(0, 4) ?? []
  const categories = useCategories().data ?? []
  const settings = useStoreSettings()
  const contact = useStoreContact()
  const directions = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(contact.address)}`

  const facts = [
    { icon: BoxIcon, value: catalogue ? String(catalogue.total) : '–', label: catalogue?.total === 1 ? 'product in the shop' : 'products in the shop' },
    { icon: LeafIcon, value: categories.length ? String(categories.length) : '–', label: categories.length === 1 ? 'category' : 'categories' },
    { icon: TruckIcon, value: formatPrice(settings.freeShippingThreshold), label: 'free delivery from' },
    settings.codEnabled
      ? { icon: CashIcon, value: formatPrice(settings.codMaxOrder), label: 'cash on delivery up to' }
      : { icon: PinIcon, value: 'Patna', label: 'packed in Bihar' },
  ]

  return (
    <div className="bg-canvas">
      <PageHero
        eyebrow="Our story"
        title="Good dry fruits, packed the day you order"
        intro="ClickMart is a small team in Patna packing premium nuts, dried fruit and seeds for homes across India. If we would not keep it in our own kitchen, it does not go in your box."
        aside={
          <div className="grid grid-cols-2 gap-3">
            {photos.map((src, index) => (
              <img key={src} src={src} alt="" className={`aspect-[4/3] w-full rounded-3xl object-cover shadow-card ${index % 2 ? 'lg:translate-y-6' : ''}`} />
            ))}
          </div>
        }
      >
        <div className="mt-6 flex flex-wrap gap-3">
          <Link to="/shop" className="btn btn-brand">
            Shop the range
          </Link>
          <Link to="/contact" className="btn btn-outline">
            Talk to us
          </Link>
        </div>
      </PageHero>

      <Container className="py-10 sm:py-12">
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {facts.map((fact) => (
            <div key={fact.label} className="card flex items-center gap-3 px-4 py-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
                <fact.icon className="size-5" />
              </span>
              <div className="min-w-0">
                <dd className="text-xl font-extrabold tracking-tight tabular-nums">{fact.value}</dd>
                <dt className="truncate text-xs font-semibold text-muted">{fact.label}</dt>
              </div>
            </div>
          ))}
        </dl>

        <section className="mt-14 grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div>
            <p className="eyebrow">How it started</p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">From a packing table to your pantry</h2>
            <p className="mt-4 leading-7 text-ink-soft">
              ClickMart started as a small packing desk in Patna. A few pouches of almonds and cashews came first. The range is larger now, with nuts, dried fruit and seeds, but the rule is the same.
            </p>
            <p className="mt-3 leading-7 text-ink-soft">
              Orders are packed after they are placed, not pulled from a warehouse shelf. That is why a pouch of almonds still smells like almonds when you open it.
            </p>
          </div>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            {values.map((value) => (
              <li key={value.title} className="card p-5">
                <span className="grid size-10 place-items-center rounded-xl bg-accent/10 text-accent">
                  <value.icon className="size-5" />
                </span>
                <h3 className="mt-3 font-extrabold">{value.title}</h3>
                <p className="mt-1 text-sm leading-6 text-muted">{value.text}</p>
              </li>
            ))}
          </ul>
        </section>

        {categories.length > 0 && (
          <section className="mt-14">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="eyebrow">What we pack</p>
                <h2 className="mt-2 text-2xl font-extrabold tracking-tight">Our range</h2>
              </div>
              <Link to="/shop" className="text-sm font-bold text-brand">
                See everything →
              </Link>
            </div>
            <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map((category) => (
                <li key={category.id}>
                  <Link to={categoryPath(category.id)} className="card group flex items-center gap-4 p-3 transition hover:border-brand/30">
                    <span className="size-16 shrink-0 overflow-hidden rounded-2xl bg-canvas">
                      <ProductMedia name={category.name} image={category.image} art={category.art} className="motion-zoom size-full" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-extrabold">{category.name}</span>
                      <span className="block text-sm text-muted">
                        {category.productCount ?? 0} {category.productCount === 1 ? 'product' : 'products'}
                        {category.tagline ? ` · ${category.tagline}` : ''}
                      </span>
                    </span>
                    <span className="text-brand transition group-hover:translate-x-0.5" aria-hidden="true">
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {favourites.length > 0 && (
          <section className="mt-14">
            <p className="eyebrow">Customer favourites</p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight">Start with these</h2>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
              {favourites.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </section>
        )}

        <section className="mt-14 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
          <div className="card p-6 sm:p-7">
            <p className="eyebrow">How an order works</p>
            <ol className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-3">
              {steps.map((step, index) => (
                <li key={step.title}>
                  <span className="grid size-10 place-items-center rounded-full bg-brand text-sm font-extrabold text-white">{index + 1}</span>
                  <p className="mt-3 font-extrabold">{step.title}</p>
                  <p className="mt-1 text-sm leading-6 text-muted">{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
          <aside className="card min-w-0 p-6 sm:p-7">
            <p className="eyebrow">Find us</p>
            <ul className="mt-4 space-y-3 text-sm">
              <li>
                <a href={`tel:${contact.phoneTel}`} className="flex items-center gap-3 font-semibold hover:text-brand">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
                    <PhoneIcon className="size-4" />
                  </span>
                  {contact.phone}
                </a>
              </li>
              <li>
                <a href={`mailto:${contact.email}`} className="flex min-w-0 items-center gap-3 font-semibold hover:text-brand">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
                    <MailIcon className="size-4" />
                  </span>
                  <span className="truncate">{contact.email}</span>
                </a>
              </li>
              <li className="flex items-start gap-3 text-ink-soft">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
                  <PinIcon className="size-4" />
                </span>
                <span className="min-w-0 pt-1.5 leading-6">{contact.address}</span>
              </li>
            </ul>
            <a href={directions} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm mt-5 w-full">
              Get directions
            </a>
            <p className="mt-3 text-center text-xs text-muted">Monday to Saturday, 9:00 to 18:00 IST</p>
          </aside>
        </section>
      </Container>
    </div>
  )
}
