import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.tsx'
import { api, errorMessage } from '../../lib/api.ts'
import { useProductReviews } from '../../lib/catalog.ts'
import type { Product } from '../../types.ts'
import { CheckIcon, StarIcon } from '../icons.tsx'
import { Stars } from '../ui/Stars.tsx'

type Tab = 'description' | 'nutrition' | 'reviews'

/** Attribute names that suppliers paste as "Brand NOURIVA" style lines. Matched case-insensitively at the start of a line. */
const SPEC_KEYS = [
  'Brand', 'Product Name', 'Product Type', 'Main Ingredient', 'Ingredients', 'Taste', 'Flavour', 'Flavor', 'Dietary Preference', 'Diet', 'Usage', 'Storage', 'Shelf Life',
  'Country of Origin', 'Origin', 'Net Weight', 'Weight', 'Pack Size', 'Form', 'Variety', 'Grade', 'Type', 'Allergen Information', 'Allergens', 'Texture', 'Colour', 'Color',
]

/** Splits highlights into selling points and attribute rows ("Taste Mild, nutty" becomes Taste: Mild, nutty). */
function splitHighlights(lines: string[]) {
  const specs: { label: string; value: string }[] = []
  const points: string[] = []
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || /^(attribute|product)?\s*details$/i.test(line)) continue
    const key = SPEC_KEYS.find((name) => line.toLowerCase().startsWith(`${name.toLowerCase()} `) || line.toLowerCase().startsWith(`${name.toLowerCase()}:`))
    if (key) specs.push({ label: key, value: line.slice(key.length).replace(/^[:\s-]+/, '').trim() })
    else points.push(line)
  }
  return { specs: specs.filter((spec) => spec.value && spec.label !== 'Product Name'), points }
}

/** The customer-facing ingredient line. Supplier notes ("if sold without…", "Confirm…") are left out. */
function ingredientLine(text: string) {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean)
  const labelled = lines.find((line) => /^ingredients?\s*:/i.test(line))
  if (labelled) return labelled.replace(/^ingredients?\s*:\s*/i, '').replace(/\.$/, '')
  return lines.length === 1 && lines[0]!.length <= 140 && !/\bif\b|confirm/i.test(lines[0]!) ? lines[0]! : ''
}

type Block = { kind: 'heading'; text: string } | { kind: 'lead'; text: string } | { kind: 'para'; text: string } | { kind: 'list'; items: string[] }

/** Turns plain description text into headings, paragraphs and bullet lists. */
function blocks(text: string): Block[] {
  const out: Block[] = []
  const chunks = text.replace(/\r/g, '').split(/\n{2,}/).map((chunk) => chunk.trim()).filter(Boolean)
  chunks.forEach((chunk, index) => {
    const lines = chunk.split('\n').map((line) => line.trim()).filter(Boolean)
    const bullets = lines.filter((line) => /^[-–•*]\s+/.test(line))
    if (bullets.length && bullets.length === lines.length) {
      const items = bullets.map((line) => line.replace(/^[-–•*]\s+/, ''))
      const last = out[out.length - 1]
      if (last?.kind === 'list') last.items.push(...items)
      else out.push({ kind: 'list', items })
      return
    }
    const single = lines.join(' ')
    const short = lines.length === 1 && single.length <= 80 && !/[.!]$/.test(single)
    if (short) out.push(index === 0 ? { kind: 'lead', text: single } : { kind: 'heading', text: single })
    else out.push({ kind: 'para', text: single })
  })
  return out
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="text-[11px] font-extrabold tracking-[0.14em] text-muted uppercase">{children}</h3>
}

export function ProductTabs({ product }: { product: Product }) {
  const reviews = useProductReviews(product.slug).data ?? []
  const [tab, setTab] = useState<Tab>('description')
  const { specs, points } = splitHighlights(product.highlights ?? [])
  const description = blocks(product.description || product.blurb || '')
  const listed = new Set(description.flatMap((block) => (block.kind === 'list' ? block.items.map((item) => item.toLowerCase()) : [])))
  const extraPoints = points.filter((point) => !listed.has(point.toLowerCase()))
  const ingredients = ingredientLine(product.ingredients ?? '')
  const facts = [
    ...(product.brand ? [{ label: 'Brand', value: product.brand }] : []),
    ...(ingredients ? [{ label: 'Ingredients', value: ingredients }] : []),
    ...specs.filter((spec) => !(spec.label === 'Brand' && product.brand) && !(spec.label === 'Ingredients' && ingredients)),
    ...(product.countryOfOrigin ? [{ label: 'Country of origin', value: product.countryOfOrigin }] : []),
    ...(product.shelfLifeDays ? [{ label: 'Shelf life', value: `${product.shelfLifeDays} days from packing` }] : []),
    { label: 'Pack sizes', value: product.packs.map((pack) => pack.size).join(', ') },
  ]
  const nutrition = (product.nutrition ?? []).filter((row) => row.label.trim() && row.value.trim())

  const tabs: { id: Tab; label: string; badge?: string }[] = [
    { id: 'description', label: 'Description' },
    { id: 'nutrition', label: 'Nutrition facts' },
    { id: 'reviews', label: 'Reviews', badge: String(reviews.length) },
  ]

  return (
    <section className="card mt-6 overflow-hidden" aria-label="Product information">
      <div role="tablist" aria-label="Product information" className="no-scrollbar flex gap-1 overflow-x-auto border-b border-line px-3 pt-3 sm:px-6">
        {tabs.map((item) => {
          const active = tab === item.id
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(item.id)}
              className={`-mb-px inline-flex shrink-0 items-center gap-2 border-b-[3px] px-3 pt-2 pb-3 text-sm font-extrabold transition ${active ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink'}`}
            >
              {item.label}
              {item.badge !== undefined && <span className={`rounded-full px-2 py-0.5 text-[11px] tabular-nums ${active ? 'bg-accent/10 text-accent-dark' : 'bg-canvas text-muted'}`}>{item.badge}</span>}
            </button>
          )
        })}
      </div>

      <div className="p-5 sm:p-7">
        {tab === 'description' && (
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <article className="min-w-0 max-w-3xl">
              {description.length === 0 ? (
                <p className="text-sm text-muted">No description yet.</p>
              ) : (
                description.map((block, index) =>
                  block.kind === 'lead' ? (
                    <h2 key={index} className="text-xl leading-snug font-extrabold tracking-tight text-ink">
                      {block.text}
                    </h2>
                  ) : block.kind === 'heading' ? (
                    <h3 key={index} className="mt-6 font-extrabold text-ink">
                      {block.text}
                    </h3>
                  ) : block.kind === 'para' ? (
                    <p key={index} className="mt-3 leading-7 text-ink-soft">
                      {block.text}
                    </p>
                  ) : (
                    <ul key={index} className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {block.items.map((item) => (
                        <li key={item} className="flex gap-2.5 rounded-xl bg-canvas px-3 py-2.5 text-sm leading-6 text-ink">
                          <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-success text-white">
                            <CheckIcon className="size-3" />
                          </span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  ),
                )
              )}
              {extraPoints.length > 0 && (
                <>
                  <h3 className="mt-6 font-extrabold text-ink">Highlights</h3>
                  <ul className="mt-3 space-y-2">
                    {extraPoints.map((point) => (
                      <li key={point} className="flex gap-2.5 text-sm leading-6 text-ink">
                        <CheckIcon className="mt-1 size-4 shrink-0 text-success" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </article>
            <aside className="min-w-0">
              <div className="rounded-2xl border border-line">
                <div className="border-b border-line px-4 py-3">
                  <SectionTitle>Product details</SectionTitle>
                </div>
                <dl className="divide-y divide-line text-sm">
                  {facts.map((fact) => (
                    <div key={fact.label} className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 px-4 py-2.5">
                      <dt className="text-muted">{fact.label}</dt>
                      <dd className="font-semibold break-words text-ink">{fact.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </aside>
          </div>
        )}

        {tab === 'nutrition' &&
          (nutrition.length > 0 ? (
            <div className="grid grid-cols-1 items-start gap-8 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
              <div className="rounded-2xl border-2 border-ink p-4">
                <p className="text-xl font-extrabold">Nutrition information</p>
                <p className="mt-0.5 border-b-8 border-ink pb-2 text-sm text-ink-soft">Typical values per 100 g</p>
                <table className="w-full text-sm">
                  <tbody>
                    {nutrition.map((row, index) => (
                      <tr key={row.label} className={index === 0 ? 'border-b-4 border-ink' : 'border-b border-line last:border-0'}>
                        <th className={`py-2 text-left ${index === 0 ? 'text-base font-extrabold' : 'font-semibold'}`}>{row.label}</th>
                        <td className={`py-2 text-right tabular-nums ${index === 0 ? 'text-base font-extrabold' : 'font-bold'}`}>{row.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="text-sm leading-6 text-muted">
                <p>Values are as printed on the pack and can vary slightly between harvests.</p>
                {ingredients && (
                  <p className="mt-3">
                    <span className="font-bold text-ink">Ingredients:</span> {ingredients}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="rounded-2xl bg-canvas p-5">
                <p className="font-extrabold">Nutrition values are printed on the pack</p>
                <p className="mt-1 text-sm leading-6 text-muted">We have not added the per 100 g table for this product online yet. Every pouch carries the full nutrition label.</p>
              </div>
              <dl className="divide-y divide-line rounded-2xl border border-line text-sm">
                {facts
                  .filter((fact) => ['Ingredients', 'Dietary Preference', 'Diet', 'Allergen Information', 'Allergens', 'Storage', 'Shelf life'].includes(fact.label))
                  .map((fact) => (
                    <div key={fact.label} className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 px-4 py-2.5">
                      <dt className="text-muted">{fact.label}</dt>
                      <dd className="font-semibold text-ink">{fact.value}</dd>
                    </div>
                  ))}
              </dl>
            </div>
          ))}

        {tab === 'reviews' && <Reviews product={product} reviews={reviews} />}
      </div>
    </section>
  )
}

type ReviewItem = ReturnType<typeof useProductReviews>['data'] extends (infer T)[] | undefined ? T : never

function Reviews({ product, reviews }: { product: Product; reviews: ReviewItem[] }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [writing, setWriting] = useState(false)
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const total = reviews.length
  const average = total ? reviews.reduce((sum, review) => sum + review.rating, 0) / total : 0
  const counts = [5, 4, 3, 2, 1].map((stars) => ({ stars, count: reviews.filter((review) => review.rating === stars).length }))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (comment.trim().length < 5) return setError('Tell us a little more (at least 5 characters)')
    setBusy(true)
    setError('')
    try {
      let images: string[] = []
      if (photos.length) {
        const form = new FormData()
        photos.forEach((file) => form.append('images', file))
        images = (await api<{ urls: string[] }>(`/products/${product.slug}/review-images`, { form })).urls
      }
      const result = await api<{ message: string }>(`/products/${product.slug}/reviews`, { body: { rating, comment: comment.trim(), images } })
      setMessage(result.message)
      setComment('')
      setPhotos([])
      setWriting(false)
      void queryClient.invalidateQueries({ queryKey: ['reviews', product.slug] })
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="rounded-2xl bg-canvas p-5 lg:sticky lg:top-28">
        <div className="flex items-end gap-3">
          <p className="text-5xl leading-none font-extrabold tabular-nums">{total ? average.toFixed(1) : '–'}</p>
          <div className="pb-1">
            <Stars value={average} className="size-4" />
            <p className="mt-1 text-xs text-muted">{total ? `${total} ${total === 1 ? 'review' : 'reviews'}` : 'No reviews yet'}</p>
          </div>
        </div>
        <ul className="mt-4 space-y-1.5">
          {counts.map((row) => (
            <li key={row.stars} className="flex items-center gap-2 text-xs">
              <span className="w-3 font-bold tabular-nums">{row.stars}</span>
              <StarIcon className="size-3 text-star" filled />
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-white">
                <span className="block h-full rounded-full bg-star" style={{ width: `${total ? (row.count / total) * 100 : 0}%` }} />
              </span>
              <span className="w-5 text-right text-muted tabular-nums">{row.count}</span>
            </li>
          ))}
        </ul>
        {message ? (
          <p className="mt-5 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-success">{message}</p>
        ) : user ? (
          <button type="button" onClick={() => setWriting((value) => !value)} className="btn btn-brand mt-5 w-full">
            {writing ? 'Close' : 'Write a review'}
          </button>
        ) : (
          <Link to="/login" state={{ from: `/product/${product.slug}` }} className="btn btn-outline mt-5 w-full">
            Log in to write a review
          </Link>
        )}
      </aside>

      <div className="min-w-0">
        {writing && user && (
          <form onSubmit={submit} className="motion-fade mb-6 rounded-2xl border border-line p-5">
            <p className="font-extrabold">Your review of {product.name}</p>
            <div className="mt-3 flex items-center gap-1" role="radiogroup" aria-label="Your rating">
              {[1, 2, 3, 4, 5].map((value) => (
                <button key={value} type="button" role="radio" aria-checked={rating === value} aria-label={`${value} star${value === 1 ? '' : 's'}`} onClick={() => setRating(value)} className="text-star transition hover:scale-110">
                  <StarIcon className="size-7" filled={value <= rating} />
                </button>
              ))}
              <span className="ml-2 text-sm font-semibold text-muted">{['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'][rating]}</span>
            </div>
            <textarea
              value={comment}
              onChange={(event) => {
                setComment(event.target.value)
                setError('')
              }}
              placeholder="How was the taste, freshness and packing?"
              className="field mt-3 h-28"
              maxLength={1000}
            />
            <label className="mt-3 block text-sm font-semibold">
              Add photos <span className="font-normal text-muted">(up to 4, JPG, PNG or WebP, 5 MB each)</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="mt-1.5 block w-full text-xs font-normal text-muted file:mr-3 file:rounded-full file:border-0 file:bg-brand-soft file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-brand"
                onChange={(event) => {
                  const next = [...(event.target.files ?? [])].slice(0, 4)
                  if (next.some((file) => file.size > 5 * 1024 * 1024)) {
                    setError('Each photo must be under 5 MB')
                    event.target.value = ''
                    return
                  }
                  setError('')
                  setPhotos(next)
                }}
              />
            </label>
            {photos.length > 0 && <p className="mt-1 text-xs text-muted">{photos.length} of 4 photos selected</p>}
            {error && (
              <p role="alert" className="mt-2 text-xs font-semibold text-rose-600">
                {error}
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="submit" disabled={busy} className="btn btn-brand">
                {busy ? 'Sending…' : 'Submit review'}
              </button>
              <p className="text-xs text-muted">Reviews appear after a quick check by our team.</p>
            </div>
          </form>
        )}

        {total === 0 ? (
          <div className="rounded-2xl border border-dashed border-line px-6 py-12 text-center">
            <p className="font-extrabold">No reviews yet</p>
            <p className="mt-1 text-sm text-muted">Bought {product.name}? Be the first to tell others how it was.</p>
          </div>
        ) : (
          <ul className="space-y-4">
            {reviews.map((review) => (
              <li key={review.id} className="rounded-2xl border border-line p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-extrabold text-brand">
                      {review.name.split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}
                    </span>
                    <div>
                      <p className="font-extrabold">{review.name}</p>
                      <p className="text-xs text-muted">
                        {review.city}
                        {review.verified && <span className="ml-1.5 font-bold text-success">· Verified buyer</span>}
                      </p>
                    </div>
                  </div>
                  <time className="shrink-0 text-xs text-muted">{new Date(review.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</time>
                </div>
                <Stars value={review.rating} className="mt-3 size-4" />
                <p className="mt-2 text-sm leading-6 text-ink-soft">{review.comment}</p>
                {!!review.images?.length && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {review.images.map((src) => (
                      <a key={src} href={src} target="_blank" rel="noreferrer" className="size-20 overflow-hidden rounded-xl bg-canvas ring-1 ring-line">
                        <img src={src} alt="Photo from a customer review" loading="lazy" decoding="async" className="size-full object-cover" />
                      </a>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
