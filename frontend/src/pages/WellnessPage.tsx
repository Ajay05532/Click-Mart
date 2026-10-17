import { Link } from 'react-router-dom'
import { BoxIcon, ClockIcon, HelpIcon, LeafIcon, SparkIcon } from '../components/icons.tsx'
import { Container } from '../components/layout/Container.tsx'
import { ProductMedia } from '../components/product/ProductMedia.tsx'
import { PageHero } from '../components/ui/PageHero.tsx'
import { productPath, useProducts } from '../lib/catalog.ts'
import { formatPrice } from '../lib/money.ts'
import { fromPrice } from '../lib/pantry.ts'
import { useSeo } from '../lib/seo.ts'
import type { Product } from '../types.ts'

/** Plain notes per ingredient. Food facts, not medical advice. Matched against product names. */
const notes: { words: string[]; note: string; enjoy: string }[] = [
  { words: ['almond'], note: 'A good source of vitamin E, plant protein and fibre.', enjoy: 'Soak a handful overnight and eat with breakfast.' },
  { words: ['cashew'], note: 'Creamy, with magnesium and plant protein.', enjoy: 'Blend soaked cashews into gravies in place of cream.' },
  { words: ['pistachio'], note: 'Brings protein, fibre and potassium.', enjoy: 'Chop over curd, kheer or overnight oats.' },
  { words: ['raisin', 'kishmish'], note: 'Naturally sweet, with iron and fibre.', enjoy: 'Use a few to sweeten oats instead of sugar.' },
  { words: ['pumpkin'], note: 'Rich in magnesium and zinc.', enjoy: 'Dry roast and sprinkle over salads and soups.' },
  { words: ['chia'], note: 'High in fibre and plant omega-3.', enjoy: 'Soak in milk overnight for a quick pudding.' },
  { words: ['sabja', 'basil'], note: 'Swells into a cooling gel when soaked.', enjoy: 'Add soaked seeds to lemon water in summer.' },
  { words: ['sunflower'], note: 'A source of vitamin E and healthy fats.', enjoy: 'Mix into trail mix or homemade granola.' },
  { words: ['walnut'], note: 'One of the easiest ways to add plant omega-3.', enjoy: 'Crush over porridge or a salad.' },
  { words: ['date'], note: 'Naturally sweet and full of fibre.', enjoy: 'Pair with a few almonds as an evening snack.' },
]
const noteFor = (product: Product) => notes.find((item) => item.words.some((word) => product.name.toLowerCase().includes(word)))

const habits = [
  { icon: SparkIcon, title: 'A small handful', text: 'Around 25 to 30 g a day is a sensible portion for most adults.' },
  { icon: ClockIcon, title: 'Soak some of them', text: 'Soaked almonds and seeds are softer and easier to eat in the morning.' },
  { icon: LeafIcon, title: 'Pair with fruit or curd', text: 'Nuts and seeds go well with fruit, curd or oats instead of a sweet biscuit.' },
  { icon: BoxIcon, title: 'Keep them airtight', text: 'Seal the pouch or use a jar, away from heat, so they stay crunchy.' },
]

const facts = (product: Product) => (product.nutrition ?? []).filter((row) => row.label.trim() && row.value.trim())

export function WellnessPage() {
  useSeo({ title: 'Health & Wellness', description: 'What is in each ClickMart dry fruit and seed, with the nutrition per 100 g and simple ways to eat them through the week.' })
  const query = useProducts({ pageSize: 60 })
  const products = query.data?.items ?? []

  const groups = [...new Map(products.map((product) => [product.categoryName ?? 'Our range', [] as Product[]])).entries()]
  for (const product of products) groups.find(([name]) => name === (product.categoryName ?? 'Our range'))?.[1].push(product)

  const withFacts = products.filter((product) => facts(product).length > 0)
  const columns = [...new Set(withFacts.flatMap((product) => facts(product).map((row) => row.label.trim())))].slice(0, 6)

  return (
    <div className="bg-canvas">
      <PageHero
        eyebrow="Eat well"
        title="Health & Wellness"
        intro="What is in each pouch we sell, and easy ways to make dry fruits and seeds part of your week."
        aside={
          <div className="card p-5 sm:p-6">
            <p className="text-[11px] font-extrabold tracking-wider text-muted uppercase">A daily handful</p>
            <p className="mt-2 text-4xl font-extrabold tracking-tight text-brand">25–30 g</p>
            <p className="mt-1 text-sm leading-6 text-ink-soft">About 20 almonds, or two spoons of mixed seeds. Spread it over the day with meals or as a snack.</p>
            <p className="mt-4 flex gap-2 rounded-xl bg-canvas p-3 text-xs leading-5 text-muted">
              <HelpIcon className="mt-0.5 size-4 shrink-0" />
              Dry fruits are food, not medicine. Talk to your doctor about any diet change, allergies or a health condition.
            </p>
          </div>
        }
      />

      <Container className="py-10 sm:py-12">
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {habits.map((habit) => (
            <li key={habit.title} className="card p-5">
              <span className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-success">
                <habit.icon className="size-5" />
              </span>
              <p className="mt-3 font-extrabold">{habit.title}</p>
              <p className="mt-1 text-sm leading-6 text-muted">{habit.text}</p>
            </li>
          ))}
        </ul>

        <div className="mt-14">
          <p className="eyebrow">In every pouch</p>
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight">What is in our range</h2>
        </div>

        {query.isLoading ? (
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="card h-40 animate-pulse" />
            ))}
          </div>
        ) : (
          groups.map(([name, items]) => (
            <section key={name} className="mt-6">
              <h3 className="flex items-center gap-2 text-sm font-extrabold tracking-wide text-ink-soft uppercase">
                {name} <span className="rounded-full bg-white px-2 py-0.5 text-[11px] text-muted ring-1 ring-line">{items.length}</span>
              </h3>
              <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                {items.map((product) => {
                  const note = noteFor(product)
                  const rows = facts(product).slice(0, 4)
                  return (
                    <article key={product.id} className="card flex gap-4 p-4 sm:p-5">
                      <Link to={productPath(product)} className="size-24 shrink-0 overflow-hidden rounded-2xl bg-canvas ring-1 ring-line sm:size-28">
                        <ProductMedia name={product.name} image={product.image} art={product.art} className="size-full" />
                      </Link>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                          <Link to={productPath(product)} className="font-extrabold hover:text-brand">
                            {product.name}
                          </Link>
                          <span className={`text-xs font-bold ${product.inStock ? 'text-ink-soft' : 'text-rose-600'}`}>{product.inStock ? `from ${formatPrice(fromPrice(product))}` : 'Sold out'}</span>
                        </div>
                        <p className="mt-1 text-sm leading-6 text-ink-soft">{note?.note ?? product.blurb}</p>
                        {note && <p className="mt-2 rounded-lg bg-emerald-50/70 px-2.5 py-1.5 text-xs leading-5 text-emerald-900">Try: {note.enjoy}</p>}
                        {rows.length > 0 && (
                          <dl className="mt-3 grid grid-cols-4 gap-1.5">
                            {rows.map((row) => (
                              <div key={row.label} className="rounded-lg bg-canvas px-1.5 py-1.5 text-center">
                                <dt className="truncate text-[10px] font-bold text-muted uppercase">{row.label}</dt>
                                <dd className="text-xs font-extrabold tabular-nums">{row.value}</dd>
                              </div>
                            ))}
                          </dl>
                        )}
                        <Link to={productPath(product)} className="mt-auto self-start pt-3 text-xs font-bold text-brand hover:underline">
                          View pack sizes →
                        </Link>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          ))
        )}

        {withFacts.length >= 2 && columns.length > 0 && (
          <section className="mt-14">
            <p className="eyebrow">Side by side</p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight">Nutrition per 100 g</h2>
            <p className="mt-1 text-sm text-muted">As printed on each pack.</p>
            <div className="card mt-5 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b border-line bg-canvas/70 text-[11px] font-bold tracking-wider text-muted uppercase">
                    <th className="px-4 py-3">Product</th>
                    {columns.map((column) => (
                      <th key={column} className="px-4 py-3 text-right">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {withFacts.map((product) => {
                    const byLabel = new Map(facts(product).map((row) => [row.label.trim(), row.value]))
                    return (
                      <tr key={product.id}>
                        <td className="px-4 py-3 font-bold">
                          <Link to={productPath(product)} className="hover:text-brand">
                            {product.name}
                          </Link>
                        </td>
                        {columns.map((column) => (
                          <td key={column} className="px-4 py-3 text-right tabular-nums">
                            {byLabel.get(column) ?? '—'}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </Container>
    </div>
  )
}
