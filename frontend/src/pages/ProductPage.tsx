import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Container } from '../components/layout/Container.tsx'
import { ProductCard } from '../components/product/ProductCard.tsx'
import { ProductMedia } from '../components/product/ProductMedia.tsx'
import { Breadcrumbs } from '../components/ui/Breadcrumbs.tsx'
import { QuantityInput } from '../components/ui/QuantityInput.tsx'
import { Stars } from '../components/ui/Stars.tsx'
import { HeartIcon, LeafIcon, ShieldIcon, TruckIcon } from '../components/icons.tsx'
import { Badge } from '../components/ui/Primitives.tsx'
import { useWishlist } from '../context/WishlistContext.tsx'
import { useCart } from '../context/CartContext.tsx'
import { categoryById, getProduct, relatedProducts } from '../data/products.ts'
import { reviews as seedReviews } from '../data/reviews.ts'
import { discountPercent, formatPrice } from '../lib/money.ts'
import { useDocumentTitle } from '../lib/useDocumentTitle.ts'
import type { PackSize, Product, Review } from '../types.ts'

const tabs = ['Description', 'Nutrition Facts', 'Reviews'] as const

export function ProductPage() {
  const { slug = '' } = useParams()
  const product = getProduct(slug)
  useDocumentTitle(product?.name ?? 'Product')

  if (!product) {
    return (
      <Container className="py-20 text-center">
        <h1 className="text-2xl font-bold">Product not found</h1>
        <Link to="/shop" className="mt-4 inline-block font-semibold text-brand">
          Back to shop
        </Link>
      </Container>
    )
  }

  return <ProductDetails key={product.id} product={product} />
}

function ProductDetails({ product }: { product: Product }) {
  const { addItem } = useCart()
  const wishlist = useWishlist()
  const navigate = useNavigate()
  const [size, setSize] = useState<PackSize>(product.featuredSize)
  const [qty, setQty] = useState(1)
  const [tab, setTab] = useState<(typeof tabs)[number]>('Description')
  const [extraReviews, setExtraReviews] = useState<Review[]>([])
  const [reviewForm, setReviewForm] = useState({ name: '', rating: 5, comment: '' })
  const pack = product.packs.find((item) => item.size === size) ?? product.packs[0]
  const related = relatedProducts(product)
  const productReviews = [
    ...extraReviews,
    ...seedReviews.filter((review) => review.productId === product.id),
  ]

  const off = discountPercent(pack.price, pack.mrp)
  const grams = pack.size === '1kg' ? 1000 : parseInt(pack.size, 10)
  const per100g = Math.round((pack.price / grams) * 100)
  const category = categoryById(product.category)

  return (
    <div className="bg-canvas">
      <Container className="py-6">
        <Breadcrumbs
          items={[
            { label: 'Home', to: '/' },
            { label: 'Shop', to: '/shop' },
            { label: category?.name ?? 'Product', to: `/shop?category=${product.category}` },
            { label: product.name },
          ]}
        />
        <div className="card mt-4 grid gap-8 p-4 md:p-7 lg:grid-cols-[minmax(0,480px)_1fr]">
          <div className="group relative h-fit overflow-hidden rounded-3xl bg-canvas lg:sticky lg:top-32">
            {off > 0 && <span className="absolute top-4 left-4 z-10 rounded-full bg-accent px-3 py-1.5 text-xs font-extrabold text-white shadow-md">{off}% OFF</span>}
            <ProductMedia
              name={product.name}
              image={product.image}
              art={product.art}
              className="motion-zoom aspect-square w-full"
            />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{category?.name}</Badge>
              {product.bestseller && <Badge tone="accent">★ Bestseller</Badge>}
              {product.inStock ? <Badge tone="success">In stock</Badge> : <Badge tone="dark">Sold out</Badge>}
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
                  onClick={() => setSize(option.size)}
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
              <QuantityInput value={qty} max={Math.max(product.stock, 1)} onChange={setQty} />
              <button
                type="button"
                disabled={!product.inStock}
                onClick={() => addItem(product.id, pack.size, qty)}
                className="btn btn-accent btn-lg"
              >
                Add to Cart
              </button>
              <button
                type="button"
                disabled={!product.inStock}
                onClick={() => {
                  addItem(product.id, pack.size, qty)
                  navigate('/checkout')
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
            </div>
            {!product.inStock && <p className="mt-3 text-sm font-medium text-rose-600">Currently out of stock.</p>}
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

        <div className="card mt-6 p-5 sm:p-7">
          <div className="flex gap-6 border-b border-line">
            {tabs.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setTab(item)}
                className={`-mb-px border-b-[3px] pb-3 text-sm font-extrabold transition ${
                  tab === item ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                {item}
                {item === 'Reviews' ? ` (${productReviews.length})` : ''}
              </button>
            ))}
          </div>
          {tab === 'Description' && (
            <div className="max-w-3xl py-5">
              <p className="leading-7 text-muted">{product.description}</p>
              <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-ink">
                {product.highlights.map((highlight) => (
                  <li key={highlight}>{highlight}</li>
                ))}
              </ul>
            </div>
          )}
          {tab === 'Nutrition Facts' && (
            <div className="max-w-md py-5">
              <p className="text-sm font-semibold">Nutrition value (per 100g)</p>
              <table className="mt-3 w-full text-sm">
                <tbody>
                  {product.nutrition.map((row) => (
                    <tr key={row.label} className="border-b border-line">
                      <th className="py-2 text-left font-medium">{row.label}</th>
                      <td className="py-2 text-right text-muted">{row.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {tab === 'Reviews' && (
            <div className="grid gap-6 py-5 lg:grid-cols-[1fr_280px]">
              <div className="space-y-4">
                {productReviews.map((review) => (
                  <article key={review.id} className="rounded-xl border border-line p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold">
                        {review.name} <span className="font-normal text-muted">· {review.city}</span>
                      </p>
                      <span className="text-xs text-muted">{review.date}</span>
                    </div>
                    <div className="mt-2">
                      <Stars value={review.rating} className="size-3.5" />
                    </div>
                    <p className="mt-2 text-sm text-muted">{review.comment}</p>
                  </article>
                ))}
              </div>
              <form
                className="h-fit rounded-xl bg-canvas p-4"
                onSubmit={(event) => {
                  event.preventDefault()
                  setExtraReviews((current) => [
                    {
                      id: `local-${Date.now()}`,
                      productId: product.id,
                      name: reviewForm.name,
                      city: 'India',
                      rating: reviewForm.rating,
                      comment: reviewForm.comment,
                      date: 'Just now',
                    },
                    ...current,
                  ])
                  setReviewForm({ name: '', rating: 5, comment: '' })
                }}
              >
                <p className="font-semibold">Write a review</p>
                <input
                  required
                  value={reviewForm.name}
                  onChange={(event) => setReviewForm({ ...reviewForm, name: event.target.value })}
                  placeholder="Your name"
                  className="field mt-3"
                />
                <label className="mt-3 block text-sm">
                  Rating
                  <select
                    value={reviewForm.rating}
                    onChange={(event) => setReviewForm({ ...reviewForm, rating: Number(event.target.value) })}
                    className="mt-1 h-10 w-full rounded-lg border border-line bg-white px-3"
                  >
                    {[5, 4, 3, 2, 1].map((value) => (
                      <option key={value} value={value}>
                        {value} stars
                      </option>
                    ))}
                  </select>
                </label>
                <textarea
                  required
                  value={reviewForm.comment}
                  onChange={(event) => setReviewForm({ ...reviewForm, comment: event.target.value })}
                  placeholder="How was it?"
                  className="mt-3 h-24 w-full rounded-lg border border-line px-3 py-2 text-sm"
                />
                <button type="submit" className="btn btn-brand mt-3 w-full">
                  Submit review
                </button>
              </form>
            </div>
          )}
        </div>

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
