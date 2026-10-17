import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Container } from '../components/layout/Container.tsx'
import { ProductCard } from '../components/product/ProductCard.tsx'
import { ProductMedia } from '../components/product/ProductMedia.tsx'
import { ProductTabs } from '../components/product/ProductTabs.tsx'
import { ShareButton } from '../components/product/ShareButton.tsx'
import { Breadcrumbs } from '../components/ui/Breadcrumbs.tsx'
import { QuantityInput } from '../components/ui/QuantityInput.tsx'
import { Stars } from '../components/ui/Stars.tsx'
import { HeartIcon, LeafIcon, PinIcon, ShieldIcon, TruckIcon } from '../components/icons.tsx'
import { Badge } from '../components/ui/Primitives.tsx'
import { useDeliveryLocation } from '../context/LocationContext.tsx'
import { useWishlist } from '../context/WishlistContext.tsx'
import { useCart } from '../context/CartContext.tsx'
import { useAuth } from '../context/AuthContext.tsx'
import { useProduct, useStoreSettings } from '../lib/catalog.ts'
import { discountPercent, formatPrice } from '../lib/money.ts'
import { breadcrumbJsonLd, productJsonLd } from '../lib/jsonld.ts'
import { absoluteUrl, productSearchText, useSeo, type Seo } from '../lib/seo.ts'
import type { Product } from '../types.ts'

/** Four working days from today, skipping Sundays. Shown as "22 Oct". */
function deliveryBy(from = new Date()) {
  const date = new Date(from)
  let added = 0
  while (added < 4) {
    date.setDate(date.getDate() + 1)
    if (date.getDay() !== 0) added += 1
  }
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

/** Title, description, social preview and structured data for a product page. */
function productSeo(product: Product): Seo {
  return {
    ...productSearchText(product),
    path: `/product/${product.slug}`,
    image: product.image,
    type: 'product',
    jsonLd: [
      productJsonLd(product),
      breadcrumbJsonLd([
        { name: 'Home', path: '/' },
        { name: 'Shop', path: '/shop' },
        { name: product.categoryName ?? 'Product', path: `/shop?category=${product.category}` },
        { name: product.name, path: `/product/${product.slug}` },
      ]),
    ],
  }
}

export function ProductPage() {
  const { slug = '' } = useParams()
  const query = useProduct(slug)
  useSeo(query.data ? productSeo(query.data.product) : { title: 'Product', noindex: !query.isLoading })

  if (query.isLoading) {
    return (
      <div className="bg-canvas">
        <Container className="py-10">
          <div className="card grid grid-cols-1 animate-pulse gap-8 p-4 md:p-7 lg:grid-cols-[minmax(0,480px)_minmax(0,1fr)]" aria-busy="true">
            <div className="aspect-square rounded-3xl bg-canvas" />
            <div className="space-y-4">
              <div className="h-6 w-1/3 rounded bg-canvas" />
              <div className="h-10 w-2/3 rounded bg-canvas" />
              <div className="h-24 rounded-2xl bg-canvas" />
              <div className="h-12 w-1/2 rounded bg-canvas" />
            </div>
          </div>
        </Container>
      </div>
    )
  }

  if (!query.data) {
    return (
      <Container className="py-20 text-center">
        <h1 className="text-2xl font-bold">{query.isError && !(query.error instanceof Error && /not found/i.test(query.error.message)) ? 'We could not load this product' : 'Product not found'}</h1>
        <Link to="/shop" className="mt-4 inline-block font-semibold text-brand">
          Back to shop
        </Link>
      </Container>
    )
  }

  return <ProductDetails key={query.data.product.id} product={query.data.product} related={query.data.related} />
}

function ProductDetails({ product, related }: { product: Product; related: Product[] }) {
  const { addItem, updateQty, items } = useCart()
  const { location: delivery, openPicker } = useDeliveryLocation()
  const settings = useStoreSettings()
  const wishlist = useWishlist()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const requested = params.get('size')
  const pack = product.packs.find((item) => item.size === requested) ?? product.packs.find((item) => item.size === product.featuredSize) ?? product.packs[0]!
  const inCart = items.find((item) => item.variantId === pack.variantId)?.quantity ?? 0
  const [pending, setPending] = useState(1)
  const qty = inCart > 0 ? inCart : pending
  const photos = product.images?.length ? product.images : product.image ? [product.image] : []
  const [photo, setPhoto] = useState(0)
  const shown = photos[photo] ?? null
  const changeQty = (next: number) => {
    if (inCart > 0) updateQty(pack.variantId, next)
    else setPending(next)
  }
  const chooseSize = (next: string) => {
    setPending(1)
    const nextParams = new URLSearchParams(params)
    nextParams.set('size', next)
    setParams(nextParams, { replace: true })
  }
  const { user } = useAuth()
  const packStock = pack.stock ?? 0
  const packInStock = packStock > 0

  const off = discountPercent(pack.price, pack.mrp)
  const grams = pack.size === '1kg' ? 1000 : parseInt(pack.size, 10)
  const per100g = Math.round((pack.price / grams) * 100)

  return (
    <div className="bg-canvas">
      <Container className="py-6">
        <Breadcrumbs
          items={[
            { label: 'Home', to: '/' },
            { label: 'Shop', to: '/shop' },
            { label: product.categoryName ?? 'Product', to: `/shop?category=${product.category}` },
            { label: product.name },
          ]}
        />
        <div className="card mt-4 grid grid-cols-1 gap-8 p-4 md:p-7 lg:grid-cols-[minmax(0,480px)_minmax(0,1fr)]">
          <div className="h-fit lg:sticky lg:top-32">
            <div className="group relative overflow-hidden rounded-3xl bg-canvas">
              {off > 0 && <span className="absolute top-4 left-4 z-10 rounded-full bg-accent px-3 py-1.5 text-xs font-extrabold text-white shadow-md">{off}% OFF</span>}
              <div className="absolute top-4 right-4 z-10">
                <ShareButton
                  variant="overlay"
                  label={`Share ${product.name}`}
                  title={`${product.name} · ClickMart`}
                  text={`${product.name} (${pack.size}) for ${formatPrice(pack.price)} at ClickMart`}
                  url={absoluteUrl(`/product/${product.slug}?size=${encodeURIComponent(pack.size)}`)}
                />
              </div>
              <ProductMedia
                name={product.name}
                image={shown}
                art={product.art}
                className="aspect-square w-full"
              />
            </div>
            {photos.length > 1 && (
              <div className="mt-3 flex gap-2 overflow-x-auto">
                {photos.map((src, index) => (
                  <button
                    key={src}
                    type="button"
                    aria-label={`Photo ${index + 1}`}
                    aria-pressed={index === photo}
                    onClick={() => setPhoto(index)}
                    className={`size-16 shrink-0 overflow-hidden rounded-xl border-2 bg-canvas ${index === photo ? 'border-brand' : 'border-transparent'}`}
                  >
                    <img src={src} alt={`${product.name}, photo ${index + 1}`} loading="lazy" decoding="async" className="size-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{product.categoryName}</Badge>
              {product.bestseller && <Badge tone="accent">★ Bestseller</Badge>}
              {packInStock ? <Badge tone="success">In stock</Badge> : <Badge tone="dark">Sold out</Badge>}
            </div>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">{product.name}</h1>
            <div className="mt-3 flex items-center gap-2 text-sm">
              <Stars value={product.rating} className="size-[18px]" />
              <span className="font-bold">{product.rating}</span>
              <span className="text-muted">· {product.reviewCount} reviews · {product.sold.toLocaleString('en-IN')} sold</span>
            </div>
            <div className="mt-5 flex flex-wrap items-end gap-3 rounded-2xl bg-canvas p-4">
              <span className="text-4xl leading-none font-extrabold text-ink">{formatPrice(pack.price)}</span>
              {off > 0 && <span className="pb-0.5 text-lg text-muted line-through">{formatPrice(pack.mrp)}</span>}
              {off > 0 && <span className="pb-1 text-sm font-extrabold text-success">You save {formatPrice(pack.mrp - pack.price)}</span>}
              <span className="w-full text-xs text-muted">Inclusive of all taxes · {formatPrice(per100g)} per 100g</span>
            </div>
            <p className="mt-5 leading-7 text-muted">{product.blurb}</p>
            <p className="mt-6 text-sm font-extrabold">Choose pack size</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {product.packs.map((option) => (
                <button
                  key={option.size}
                  type="button"
                  onClick={() => chooseSize(option.size)}
                  className={`min-w-24 rounded-2xl border-2 px-4 py-2.5 text-left transition duration-200 ${
                    option.size === pack.size ? 'border-brand bg-brand-soft shadow-[0_0_0_4px_rgb(18_58_134/0.08)]' : 'border-line bg-white hover:border-brand/40'
                  }`}
                >
                  <span className="block text-sm font-extrabold">{option.size}</span>
                  <span className="block text-xs text-muted">{formatPrice(option.price)}</span>
                </button>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <QuantityInput value={qty} max={Math.max(packStock, 1)} onChange={changeQty} />
              <button
                type="button"
                disabled={!packInStock || inCart > 0}
                onClick={() => addItem(pack.variantId, pending, product.name)}
                className="btn btn-accent btn-lg"
              >
                {inCart > 0 ? 'In cart' : 'Add to Cart'}
              </button>
              <button
                type="button"
                disabled={!packInStock}
                onClick={() => {
                  if (inCart === 0) addItem(pack.variantId, pending, product.name)
                  if (user) navigate('/checkout')
                  else navigate('/login', { state: { from: '/checkout' } })
                }}
                className="btn btn-brand btn-lg"
              >
                Buy Now
              </button>
              <button
                type="button"
                onClick={() => wishlist.toggle(product.id)}
                aria-pressed={wishlist.has(product.id)}
                aria-label="Save to wishlist"
                className={`grid size-[52px] place-items-center rounded-full border-2 transition ${
                  wishlist.has(product.id) ? 'border-rose-200 bg-rose-50 text-rose-500' : 'border-line text-ink hover:border-rose-300 hover:text-rose-500'
                }`}
              >
                <HeartIcon className="size-5" filled={wishlist.has(product.id)} />
              </button>
              <ShareButton
                title={`${product.name} · ClickMart`}
                text={`${product.name} (${pack.size}) for ${formatPrice(pack.price)} at ClickMart`}
                url={absoluteUrl(`/product/${product.slug}?size=${encodeURIComponent(pack.size)}`)}
              />
            </div>
            {!product.inStock && <p className="mt-3 text-sm font-medium text-rose-600">Currently out of stock.</p>}
            <div className="mt-6 space-y-2">
              <p className="text-sm font-extrabold">Delivery details</p>
              <button type="button" onClick={openPicker} className="flex w-full items-center gap-3 rounded-2xl bg-brand-soft px-4 py-3 text-left text-sm">
                <PinIcon className="size-5 shrink-0 text-ink" />
                {delivery ? <span className="font-extrabold">{delivery.pin}</span> : null}
                <span className="font-bold text-brand">{delivery ? 'Change delivery location' : 'Select delivery location'} ›</span>
              </button>
              {packInStock && (
                <div className="flex items-center gap-3 rounded-2xl bg-canvas px-4 py-3 text-sm">
                  <TruckIcon className="size-5 shrink-0 text-ink" />
                  <p>
                    Delivery by <span className="font-extrabold">{deliveryBy()}</span>
                    {pack.price >= settings.freeShippingThreshold && <span className="text-success"> · Free delivery</span>}
                  </p>
                </div>
              )}
              <div className="flex items-center gap-3 rounded-2xl bg-canvas px-4 py-3 text-sm">
                <span className="grid size-5 shrink-0 place-items-center text-ink" aria-hidden="true">
                  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 9h16v10H4z" />
                    <path d="M8 9V7a4 4 0 0 1 8 0v2" />
                  </svg>
                </span>
                <p>
                  Sold by <span className="font-extrabold">ClickMart</span>
                  <span className="block text-xs text-muted">{product.rating}★ · packed and shipped by us</span>
                </p>
              </div>
            </div>
            <div className="mt-7 grid gap-3 text-center text-sm sm:grid-cols-3">
              {[
                { icon: TruckIcon, title: 'Free Shipping', text: 'On orders above ₹499' },
                { icon: LeafIcon, title: '100% Natural', text: 'No preservatives' },
                { icon: ShieldIcon, title: 'Secure Payments', text: 'UPI, cards, net banking' },
              ].map((item) => (
                <div key={item.title} className="rounded-2xl border border-line px-3 py-4">
                  <item.icon className="mx-auto size-6 text-brand" />
                  <p className="mt-1.5 font-extrabold">{item.title}</p>
                  <p className="text-xs text-muted">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <ProductTabs product={product} />

        <h2 className="mt-14 text-2xl font-extrabold tracking-tight">You may also like</h2>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
          {related.map((item) => (
            <ProductCard key={item.id} product={item} />
          ))}
        </div>
      </Container>
    </div>
  )
}
