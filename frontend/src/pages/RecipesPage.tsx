import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CartIcon, CheckIcon, ClockIcon, SearchIcon, UsersIcon } from '../components/icons.tsx'
import { Container } from '../components/layout/Container.tsx'
import { ProductMedia } from '../components/product/ProductMedia.tsx'
import { PageHero } from '../components/ui/PageHero.tsx'
import { useCart } from '../context/CartContext.tsx'
import { useNotice } from '../context/NoticeContext.tsx'
import { featuredPack, productPath, useProducts } from '../lib/catalog.ts'
import { formatPrice } from '../lib/money.ts'
import { fromPrice, productsMatching } from '../lib/pantry.ts'
import { useSeo } from '../lib/seo.ts'
import type { Product } from '../types.ts'

type Tag = 'Breakfast' | 'Snack' | 'Drink' | 'Dessert' | 'Main'
/** `image` is a kitchen photo; without one the card shows the shop's photo of the main ingredient. */
type Recipe = { title: string; tag: Tag; time: string; serves: string; uses: string[]; image?: string; ingredients: string[]; steps: string[] }

const recipes: Recipe[] = [
  {
    title: 'Almond and raisin energy bites',
    tag: 'Snack',
    time: '15 min',
    serves: 'Makes 12',
    uses: ['almond', 'raisin'],
    image: '/images/almonds.jpg',
    ingredients: ['1 cup almonds', '½ cup golden raisins', '1 tbsp honey', 'A pinch of cardamom'],
    steps: ['Pulse the almonds until coarse.', 'Add the raisins, honey and cardamom and pulse until it sticks together.', 'Roll into 12 balls and chill for 20 minutes. Keeps a week in the fridge.'],
  },
  {
    title: 'Overnight chia pudding with pistachios',
    tag: 'Breakfast',
    time: '5 min + overnight',
    serves: 'Serves 2',
    uses: ['chia', 'pistachio'],
    ingredients: ['3 tbsp chia seeds', '1 cup milk', '2 tsp honey', '2 tbsp chopped pistachios'],
    steps: ['Stir the chia seeds into the milk and honey.', 'Stir again after 10 minutes so the seeds do not clump, then chill overnight.', 'Top with pistachios before serving.'],
  },
  {
    title: 'Sabja lemon cooler',
    tag: 'Drink',
    time: '10 min',
    serves: 'Serves 2',
    uses: ['sabja'],
    ingredients: ['2 tsp sabja seeds', 'Juice of 1 lemon', '2 tbsp sugar or honey', 'A few mint leaves', '2 glasses cold water'],
    steps: ['Soak the sabja seeds in ½ cup water for 10 minutes until they swell.', 'Stir the lemon, sugar and mint into the cold water.', 'Add the soaked seeds and serve with ice.'],
  },
  {
    title: 'Roasted seed and nut trail mix',
    tag: 'Snack',
    time: '12 min',
    serves: 'Makes 2 cups',
    uses: ['pumpkin', 'sunflower', 'almond', 'raisin'],
    image: '/images/walnuts.jpg',
    ingredients: ['½ cup pumpkin seeds', '½ cup sunflower seeds', '½ cup almonds', '¼ cup raisins', 'Salt and chaat masala'],
    steps: ['Dry roast the seeds and almonds on low heat for 6 to 8 minutes, stirring.', 'Season while warm, then cool completely.', 'Stir in the raisins and store airtight.'],
  },
  {
    title: 'Creamy cashew curry base',
    tag: 'Main',
    time: '25 min',
    serves: 'Serves 4',
    uses: ['cashew'],
    image: '/images/cashews.jpg',
    ingredients: ['¼ cup cashews, soaked 20 minutes', '2 onions', '3 tomatoes', '1 tsp ginger-garlic paste', 'Garam masala, chilli and salt'],
    steps: ['Cook the onions until golden, then the ginger-garlic paste and tomatoes until soft.', 'Blend with the soaked cashews into a smooth paste.', 'Simmer with the spices for 5 minutes. Add paneer or vegetables.'],
  },
  {
    title: 'Dry fruit kheer',
    tag: 'Dessert',
    time: '35 min',
    serves: 'Serves 4',
    uses: ['cashew', 'almond', 'pistachio', 'raisin'],
    image: '/images/raisins.jpg',
    ingredients: ['1 litre milk', '¼ cup rice, rinsed', '4 tbsp sugar', '2 tbsp each cashews, almonds, pistachios', '1 tbsp raisins', '¼ tsp cardamom'],
    steps: ['Simmer the rice in the milk, stirring often, until soft and thick (about 25 minutes).', 'Add the sugar and cardamom.', 'Stir in the chopped nuts and raisins and cook 2 more minutes.'],
  },
]
const tags: ('All' | Tag)[] = ['All', 'Breakfast', 'Snack', 'Drink', 'Main', 'Dessert']

export function RecipesPage() {
  useSeo({ title: 'Dry fruit recipes', description: 'Quick recipes with almonds, cashews, pistachios, raisins and seeds: energy bites, chia pudding, sabja cooler, trail mix, cashew curry and kheer.' })
  const products = useProducts({ pageSize: 60 }).data?.items ?? []
  const [tag, setTag] = useState<'All' | Tag>('All')
  const [search, setSearch] = useState('')
  const term = search.trim().toLowerCase()
  const shown = recipes.filter(
    (recipe) => (tag === 'All' || recipe.tag === tag) && (!term || recipe.title.toLowerCase().includes(term) || recipe.ingredients.some((item) => item.toLowerCase().includes(term))),
  )
  const featured = recipes[5]!

  return (
    <div className="bg-canvas">
      <PageHero
        eyebrow="From our kitchen"
        title="Recipes"
        intro="Short, everyday recipes made with the pouches we sell. Each one links to the ingredients, so you can add them to your cart in one go."
        aside={
          <button type="button" onClick={() => document.getElementById(slug(featured.title))?.scrollIntoView({ behavior: 'smooth', block: 'center' })} className="card group block w-full overflow-hidden text-left">
            <span className="relative block aspect-[16/9] overflow-hidden bg-canvas">
              <img src={featured.image ?? '/images/raisins.jpg'} alt="" className="motion-zoom size-full object-cover" />
              <span className="absolute top-3 left-3 rounded-full bg-accent px-2.5 py-1 text-[11px] font-extrabold text-white shadow-sm">Featured</span>
            </span>
            <span className="block p-4">
              <span className="block font-extrabold">{featured.title}</span>
              <span className="mt-1 flex gap-4 text-xs font-semibold text-muted">
                <span className="inline-flex items-center gap-1.5"><ClockIcon className="size-3.5" /> {featured.time}</span>
                <span className="inline-flex items-center gap-1.5"><UsersIcon className="size-3.5" /> {featured.serves}</span>
              </span>
            </span>
          </button>
        }
      />

      <Container className="py-8 sm:py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            {tags.map((item) => {
              const count = item === 'All' ? recipes.length : recipes.filter((recipe) => recipe.tag === item).length
              return (
                <button
                  key={item}
                  type="button"
                  aria-pressed={tag === item}
                  onClick={() => setTag(item)}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition ${tag === item ? 'bg-ink text-white' : 'bg-white text-ink-soft ring-1 ring-line hover:ring-brand/40'}`}
                >
                  {item}
                  <span className={`text-xs ${tag === item ? 'text-white/70' : 'text-muted'}`}>{count}</span>
                </button>
              )
            })}
          </div>
          <label className="relative w-full sm:w-64">
            <span className="sr-only">Search recipes</span>
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or ingredient" className="field h-10 rounded-full pl-10" />
          </label>
        </div>

        {shown.length === 0 ? (
          <p className="card mt-6 px-6 py-12 text-center text-sm text-muted">No recipe matches “{search}”. Try almonds, chia or kheer.</p>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {shown.map((recipe) => (
              <RecipeCard
                key={recipe.title}
                recipe={recipe}
                pouches={productsMatching(products, recipe.uses).slice(0, 4)}
                photo={recipe.image ?? productsMatching(products, recipe.uses.slice(0, 1))[0]?.image ?? '/images/seeds.jpg'}
              />
            ))}
          </div>
        )}

        <div className="mt-12 flex flex-col items-start justify-between gap-4 rounded-3xl bg-brand-dark p-6 text-white sm:flex-row sm:items-center sm:p-8">
          <div>
            <p className="text-lg font-extrabold">Stocking up for the week?</p>
            <p className="mt-1 text-sm text-white/75">Every nut and seed in these recipes is in the shop, packed fresh after you order.</p>
          </div>
          <Link to="/shop" className="btn btn-accent shrink-0">
            Shop all ingredients
          </Link>
        </div>
      </Container>
    </div>
  )
}

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-')

function RecipeCard({ recipe, pouches, photo }: { recipe: Recipe; pouches: Product[]; photo: string }) {
  const { addItem } = useCart()
  const notify = useNotice()
  const [open, setOpen] = useState(false)
  const [added, setAdded] = useState(false)
  const buyable = pouches.filter((product) => product.inStock)
  const addAll = () => {
    let count = 0
    for (const product of buyable) {
      const pack = product.packs.find((item) => item.size === featuredPack(product).size && (item.stock ?? 0) > 0) ?? product.packs.find((item) => (item.stock ?? 0) > 0)
      if (pack) {
        addItem(pack.variantId, 1, product.name, true)
        count++
      }
    }
    notify({
      title: `Ingredients for ${recipe.title} added`,
      text: `${count} ${count === 1 ? 'item' : 'items'} added to your cart.`,
      actions: [
        { label: 'View cart', to: '/cart' },
        { label: 'Checkout', to: '/checkout', primary: true },
      ],
    })
    setAdded(true)
    window.setTimeout(() => setAdded(false), 2000)
  }

  return (
    <article id={slug(recipe.title)} className="card flex scroll-mt-28 flex-col overflow-hidden">
      <div className="relative aspect-[16/10] overflow-hidden bg-canvas">
        <img src={photo} alt={recipe.title} loading="lazy" className="size-full object-cover" />
        <div className="absolute inset-x-3 top-3 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-extrabold text-brand shadow-sm">{recipe.tag}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-ink/75 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur">
            <ClockIcon className="size-3" /> {recipe.time}
          </span>
        </div>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h2 className="text-lg leading-snug font-extrabold">{recipe.title}</h2>
        <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-muted">
          <UsersIcon className="size-3.5" /> {recipe.serves} · {recipe.ingredients.length} ingredients
        </p>

        <ul className="mt-4 space-y-1.5 text-sm text-ink-soft">
          {recipe.ingredients.map((item) => (
            <li key={item} className="flex gap-2.5">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
              {item}
            </li>
          ))}
        </ul>

        <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="mt-4 inline-flex items-center gap-1 self-start text-sm font-bold text-brand hover:underline">
          {open ? 'Hide method' : `See method · ${recipe.steps.length} steps`}
        </button>
        {open && (
          <ol className="motion-fade mt-3 space-y-2.5 rounded-xl bg-canvas p-4 text-sm leading-6 text-ink-soft">
            {recipe.steps.map((step, index) => (
              <li key={step} className="flex gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand text-[11px] font-extrabold text-white">{index + 1}</span>
                {step}
              </li>
            ))}
          </ol>
        )}

        {pouches.length > 0 && (
          <div className="mt-auto pt-5">
            <div className="rounded-2xl border border-line p-3">
              <p className="px-1 text-[11px] font-extrabold tracking-wider text-muted uppercase">Ingredients in our shop</p>
              <ul className="mt-2 space-y-0.5">
                {pouches.map((product) => (
                  <li key={product.id}>
                    <Link to={productPath(product)} className="flex items-center gap-3 rounded-xl p-1.5 transition hover:bg-canvas">
                      <span className="size-10 shrink-0 overflow-hidden rounded-lg bg-canvas ring-1 ring-line">
                        <ProductMedia name={product.name} image={product.image} art={product.art} className="size-full" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-bold">{product.name}</span>
                      <span className={`shrink-0 text-xs font-bold ${product.inStock ? 'text-ink-soft' : 'text-rose-600'}`}>{product.inStock ? `from ${formatPrice(fromPrice(product))}` : 'Sold out'}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              {buyable.length > 0 && (
                <button type="button" onClick={addAll} className={`btn btn-sm mt-2 w-full ${added ? 'bg-success text-white' : 'btn-brand'}`}>
                  {added ? <CheckIcon className="size-4" /> : <CartIcon className="size-4" />}
                  {added ? 'Added to cart' : buyable.length === 1 ? 'Add to cart' : `Add all ${buyable.length} to cart`}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </article>
  )
}
