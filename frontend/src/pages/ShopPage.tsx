import { useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Container } from '../components/layout/Container.tsx'
import { ProductCard } from '../components/product/ProductCard.tsx'
import { Breadcrumbs } from '../components/ui/Breadcrumbs.tsx'
import { CloseIcon, FilterIcon } from '../components/icons.tsx'
import { ProductMedia } from '../components/product/ProductMedia.tsx'
import { packCards, useCategories, useProducts } from '../lib/catalog.ts'
import { formatPrice } from '../lib/money.ts'
import { breadcrumbJsonLd, categoryJsonLd } from '../lib/jsonld.ts'
import { categorySearchText, useSeo } from '../lib/seo.ts'
import type { Category, CategoryId, PackSize } from '../types.ts'

const PAGE_SIZE = 12
const PRICE_CAP = 1500
const packSizes: PackSize[] = ['100g', '250g', '500g', '1kg']

export function ShopPage() {
  const [params, setParams] = useSearchParams()
  const query = (params.get('q') ?? '').trim().toLowerCase()
  const selectedCategories = params.getAll('category')
  const sub = params.get('sub') ?? ''
  const [maxPrice, setMaxPrice] = useState(PRICE_CAP)
  const [sizes, setSizes] = useState<PackSize[]>([])
  const [availability, setAvailability] = useState<Array<'in' | 'out'>>([])
  const sortParam = params.get('sort')
  const [sort, setSort] = useState(sortParam === 'discount' ? 'discount' : 'popular')
  const [seenSort, setSeenSort] = useState(sortParam)
  if (seenSort !== sortParam) {
    setSeenSort(sortParam)
    setSort(sortParam === 'discount' ? 'discount' : 'popular')
  }
  const [filtersOpen, setFiltersOpen] = useState(false)
  const filterKey = [
    query,
    selectedCategories.join('|'),
    sub,
    maxPrice,
    sizes.join('|'),
    availability.join('|'),
    sort,
  ].join('~')
  const [pageState, setPageState] = useState({ key: filterKey, page: 1 })
  if (pageState.key !== filterKey) {
    setPageState({ key: filterKey, page: 1 })
  }
  const page = pageState.key === filterKey ? pageState.page : 1
  const setPage = (value: number | ((current: number) => number)) => {
    setPageState((current) => {
      const currentPage = current.key === filterKey ? current.page : 1
      return { key: filterKey, page: typeof value === 'function' ? value(currentPage) : value }
    })
  }

  const categories = useCategories().data ?? []
  // The server filters, sorts and paginates; the page only describes what the shopper asked for.
  const result = useProducts({
    category: selectedCategories,
    sub: selectedCategories.length === 1 ? sub : undefined,
    q: params.get('q') ?? undefined,
    maxPrice: maxPrice < PRICE_CAP ? maxPrice : undefined,
    size: sizes,
    availability: availability.length === 1 ? availability[0] : undefined,
    sort,
    page,
    pageSize: PAGE_SIZE,
  })
  const visible = result.data?.items ?? []
  const total = result.data?.total ?? 0
  const pages = result.data?.pages ?? 1
  const chosen = categories.filter((category) => selectedCategories.includes(category.id))
  // A single category (and sub-category) page is worth indexing. Searches, sorting and mixed filters are not.
  const onlyCategory = [...params.keys()].every((key) => key === 'category' || key === 'sub') && selectedCategories.length <= 1
  const seoCategory = selectedCategories.length === 1 ? categories.find((category) => category.id === selectedCategories[0]) : undefined
  const seoSub = seoCategory?.subcategories.find((item) => item.id === sub)
  const seoText = seoCategory ? categorySearchText(seoSub ? { ...seoSub, tagline: seoCategory.tagline } : seoCategory) : undefined
  const seoPath = `/shop${seoCategory ? `?category=${seoCategory.id}${seoSub ? `&sub=${seoSub.id}` : ''}` : ''}`
  const listed = [...new Map(visible.map((product) => [product.id, product])).values()]
  useSeo({
    title: query ? `Results for “${params.get('q')}”` : seoText ? seoText.title : 'Shop Dry Fruits, Nuts and Seeds Online',
    description: seoText ? seoText.description : 'Browse premium almonds, cashews, raisins, walnuts and seeds. Packed fresh to order, delivered across India, with cash on delivery available.',
    path: seoPath,
    noindex: !onlyCategory,
    jsonLd: [
      breadcrumbJsonLd([
        { name: 'Home', path: '/' },
        { name: 'Shop', path: '/shop' },
        ...(seoCategory ? [{ name: seoCategory.name, path: `/shop?category=${seoCategory.id}` }] : []),
        ...(seoCategory && seoSub ? [{ name: seoSub.name, path: seoPath }] : []),
      ]),
      ...(onlyCategory && listed.length
        ? [categoryJsonLd({ name: seoSub?.name ?? seoCategory?.name ?? 'All dry fruits', path: seoPath, description: seoText?.description ?? 'Premium almonds, cashews, raisins, walnuts and seeds from ClickMart.', products: listed })]
        : []),
    ],
  })
  const activeCategory = chosen.length === 1 ? chosen[0] : undefined
  const activeSub = activeCategory?.subcategories.find((item) => item.id === sub)
  const toggleCategory = (id: CategoryId) => {
    const next = new URLSearchParams(params)
    const current = next.getAll('category')
    next.delete('category')
    next.delete('sub')
    const updated = current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    updated.forEach((item) => next.append('category', item))
    setParams(next)
  }

  const clearCategories = () => {
    const next = new URLSearchParams(params)
    next.delete('category')
    next.delete('sub')
    setParams(next)
  }

  const toggleSize = (size: PackSize) => {
    setSizes((current) => (current.includes(size) ? current.filter((item) => item !== size) : [...current, size]))
  }

  const toggleAvailability = (value: 'in' | 'out') => {
    setAvailability((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    )
  }

  const clearAll = () => {
    setParams(query ? { q: query } : {})
    setMaxPrice(PRICE_CAP)
    setSizes([])
    setAvailability([])
  }

  const chips = [
    ...chosen.map((category) => ({
      key: category.id,
      label: category.name,
      clear: () => toggleCategory(category.id),
    })),
    ...(activeSub
      ? [
          {
            key: activeSub.id,
            label: activeSub.name,
            clear: () => {
              const next = new URLSearchParams(params)
              next.delete('sub')
              setParams(next)
            },
          },
        ]
      : []),
    ...sizes.map((size) => ({ key: size, label: size, clear: () => toggleSize(size) })),
    ...(maxPrice < PRICE_CAP
      ? [{ key: 'price', label: `Up to ${formatPrice(maxPrice)}`, clear: () => setMaxPrice(PRICE_CAP) }]
      : []),
    ...availability.map((value) => ({
      key: value,
      label: value === 'in' ? 'In stock' : 'Out of stock',
      clear: () => toggleAvailability(value),
    })),
  ]
  const filterCount = chips.length
  const canClear = filterCount > 0

  const selectSub = (id: string) => {
    const next = new URLSearchParams(params)
    if (sub === id) next.delete('sub')
    else next.set('sub', id)
    setParams(next)
  }

  const renderFilters = (heading: boolean) => (
    <Filters
      heading={heading}
      categories={categories}
      selectedCategories={selectedCategories}
      toggleCategory={toggleCategory}
      clearCategories={clearCategories}
      activeCategory={activeCategory}
      sub={sub}
      selectSub={selectSub}
      maxPrice={maxPrice}
      setMaxPrice={setMaxPrice}
      sizes={sizes}
      toggleSize={toggleSize}
      availability={availability}
      toggleAvailability={toggleAvailability}
      onClear={clearAll}
      canClear={canClear}
    />
  )

  return (
    <div className="bg-canvas">
      <div className="border-b border-line bg-white">
        <Container className="py-5 sm:py-6">
          <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Shop', to: activeCategory || query ? '/shop' : undefined }, ...(activeCategory ? [{ label: activeCategory.name }] : [])]} />
          <div className="mt-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
            <div className="min-w-0">
              <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
                {activeSub?.name ?? activeCategory?.name ?? (query ? `Results for “${params.get('q')}”` : 'All dry fruits')}
              </h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
                {(!query && (activeSub?.description || (!activeSub && activeCategory?.description))) ||
                  activeCategory?.tagline ||
                  'Handpicked nuts, seeds and dried fruits, sealed fresh and delivered across India.'}
              </p>
            </div>
            <p className="text-sm text-muted">
              <span className="font-extrabold text-ink tabular-nums">{total}</span> {total === 1 ? 'pouch' : 'pouches'}
            </p>
          </div>
          {categories.length > 1 && (
            <div className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
              <CategoryChip label="All" count={categories.reduce((sum, category) => sum + (category.productCount ?? 0), 0)} active={selectedCategories.length === 0} onClick={clearCategories} />
              {categories.map((category) => (
                <CategoryChip
                  key={category.id}
                  label={category.name}
                  count={category.productCount ?? 0}
                  image={category.image}
                  art={category.art}
                  active={selectedCategories.includes(category.id)}
                  onClick={() => toggleCategory(category.id)}
                />
              ))}
            </div>
          )}
        </Container>
      </div>
      <Container className="py-5 sm:py-6">
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="card sticky top-24 hidden max-h-[calc(100svh-7rem)] min-w-0 overflow-y-auto lg:block">
            {renderFilters(true)}
          </aside>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setFiltersOpen(true)} className="btn btn-outline btn-sm lg:hidden">
                <FilterIcon className="size-4" />
                Filters
                {filterCount > 0 && <span className="grid size-5 place-items-center rounded-full bg-brand text-[10px] text-white">{filterCount}</span>}
              </button>
              {chips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={chip.clear}
                  className="inline-flex items-center gap-1.5 rounded-full border border-brand/20 bg-brand-soft px-3 py-1.5 text-xs font-bold text-brand transition hover:border-brand hover:bg-white"
                >
                  {chip.label}
                  <CloseIcon className="size-3" />
                  <span className="sr-only">Remove {chip.label}</span>
                </button>
              ))}
              {canClear && (
                <button type="button" onClick={clearAll} className="px-1 text-xs font-bold text-muted underline-offset-2 hover:text-ink hover:underline">
                  Clear all
                </button>
              )}
              <label className="ml-auto flex items-center gap-2">
                <span className="hidden text-xs font-semibold text-muted sm:inline">Sort by</span>
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value)}
                  aria-label="Sort products"
                  className="h-9 cursor-pointer rounded-full border border-line bg-white pr-8 pl-3.5 text-sm font-bold text-ink outline-none hover:border-brand/40 focus:border-brand"
                >
                  <option value="popular">Popular</option>
                  <option value="price-asc">Price: low to high</option>
                  <option value="price-desc">Price: high to low</option>
                  <option value="rating">Top rated</option>
                  <option value="discount">Biggest discount</option>
                </select>
              </label>
            </div>

            {result.isLoading ? (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 xl:grid-cols-4" aria-busy="true">
                {Array.from({ length: 8 }, (_, index) => (
                  <div key={index} className="aspect-[3/4] animate-pulse rounded-[1.25rem] bg-white ring-1 ring-line" />
                ))}
              </div>
            ) : result.isError ? (
              <div className="card mt-4 px-6 py-16 text-center">
                <p className="text-lg font-semibold text-ink">We could not load the products</p>
                <p className="mt-2 text-sm text-muted">Check your connection and try again.</p>
                <button type="button" onClick={() => void result.refetch()} className="btn btn-brand mt-6">
                  Try again
                </button>
              </div>
            ) : visible.length === 0 ? (
              <div className="card mt-4 px-6 py-20 text-center">
                <p className="text-lg font-semibold text-ink">Nothing matches these filters</p>
                <p className="mt-2 text-sm text-muted">Try another category, or clear the price and pack size.</p>
                <button
                  type="button"
                  onClick={clearAll}
                  className="btn btn-brand mt-6"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="stagger mt-4 grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 xl:grid-cols-4">
                {packCards(visible)
                  .filter(({ pack }) => sizes.length === 0 || sizes.includes(pack.size))
                  .map(({ product, pack }) => (
                    <ProductCard key={`${product.id}-${pack.size}`} product={product} pack={pack} />
                  ))}
              </div>
            )}

            {pages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-2">
                <button
                  type="button"
                  disabled={page === 1}
                  onClick={() => setPage((current) => current - 1)}
                  className="btn btn-outline btn-sm disabled:opacity-40"
                >
                  Prev
                </button>
                {Array.from({ length: pages }, (_, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => setPage(index + 1)}
                    className={`grid size-10 place-items-center rounded-full text-sm font-semibold ${
                      page === index + 1 ? 'bg-brand text-white shadow-lg shadow-brand/30' : 'bg-white text-ink ring-1 ring-line hover:ring-brand'
                    }`}
                  >
                    {index + 1}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={page === pages}
                  onClick={() => setPage((current) => current + 1)}
                  className="btn btn-outline btn-sm disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      </Container>

      {filtersOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close filters"
            className="motion-fade absolute inset-0 bg-ink/40"
            onClick={() => setFiltersOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Filters"
            className="motion-sheet absolute inset-y-0 right-0 flex w-[min(100%,22rem)] flex-col bg-white shadow-xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
              <h2 className="text-base font-extrabold">Filters</h2>
              <div className="flex items-center gap-4">
                <button type="button" onClick={clearAll} disabled={!canClear} className="text-xs font-bold text-brand disabled:text-muted/50">
                  Clear all
                </button>
                <button type="button" aria-label="Close filters" onClick={() => setFiltersOpen(false)}>
                  <CloseIcon className="size-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">{renderFilters(false)}</div>
            <div className="border-t border-line p-4">
              <button
                type="button"
                onClick={() => setFiltersOpen(false)}
                className="btn btn-brand w-full"
              >
                Show {total} {total === 1 ? 'pouch' : 'pouches'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const pricePresets = [
  { label: 'Under ₹300', value: 300 },
  { label: 'Under ₹600', value: 600 },
  { label: 'Under ₹1,000', value: 1000 },
]

function FilterSection({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-line px-5 py-4 first:border-t-0">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-extrabold tracking-[0.14em] text-muted uppercase">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  )
}

function Filters({
  heading,
  categories,
  selectedCategories,
  toggleCategory,
  clearCategories,
  activeCategory,
  sub,
  selectSub,
  maxPrice,
  setMaxPrice,
  sizes,
  toggleSize,
  availability,
  toggleAvailability,
  onClear,
  canClear,
}: {
  heading: boolean
  selectedCategories: string[]
  toggleCategory: (id: CategoryId) => void
  clearCategories: () => void
  categories: Category[]
  activeCategory: Category | undefined
  sub: string
  selectSub: (id: string) => void
  maxPrice: number
  setMaxPrice: (value: number) => void
  sizes: PackSize[]
  toggleSize: (size: PackSize) => void
  availability: Array<'in' | 'out'>
  toggleAvailability: (value: 'in' | 'out') => void
  onClear: () => void
  canClear: boolean
}) {
  const inStockOnly = availability.length === 1 && availability[0] === 'in'
  return (
    <div className="text-sm">
      {heading && (
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 className="text-base font-extrabold">Filters</h2>
        <button type="button" onClick={onClear} disabled={!canClear} className="text-xs font-bold text-brand hover:underline disabled:pointer-events-none disabled:text-muted/50">
          Clear all
        </button>
      </div>
      )}

      <FilterSection title="Category">
        <div className="space-y-0.5">
          <FilterRow label="All products" count={categories.reduce((sum, category) => sum + (category.productCount ?? 0), 0)} active={selectedCategories.length === 0} onClick={clearCategories} />
          {categories.map((category) => {
            const active = selectedCategories.includes(category.id)
            const subs = category.subcategories.filter((item) => (item.productCount ?? 0) > 0)
            return (
              <div key={category.id}>
                <FilterRow label={category.name} count={category.productCount ?? 0} active={active} onClick={() => toggleCategory(category.id)} />
                {active && subs.length > 0 && (
                  <div className="mt-0.5 ml-4 space-y-0.5 border-l border-line pl-2">
                    {subs.map((item) => (
                      <FilterRow key={item.id} label={item.name} count={item.productCount ?? 0} active={activeCategory?.id === category.id && sub === item.id} onClick={() => selectSub(item.id)} small />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </FilterSection>

      <FilterSection title="Price" aside={<span className="text-xs font-bold text-ink">{maxPrice < PRICE_CAP ? `Up to ${formatPrice(maxPrice)}` : 'Any price'}</span>}>
        <div className="flex flex-wrap gap-1.5">
          {pricePresets.map((preset) => {
            const active = maxPrice === preset.value
            return (
              <button
                key={preset.value}
                type="button"
                aria-pressed={active}
                onClick={() => setMaxPrice(active ? PRICE_CAP : preset.value)}
                className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${active ? 'bg-ink text-white' : 'bg-canvas text-ink-soft hover:bg-brand-soft hover:text-brand'}`}
              >
                {preset.label}
              </button>
            )
          })}
        </div>
        <input type="range" min={100} max={PRICE_CAP} step={50} value={maxPrice} onChange={(event) => setMaxPrice(Number(event.target.value))} aria-label="Maximum price" className="mt-4 w-full cursor-pointer" />
        <div className="mt-1 flex justify-between text-[11px] font-semibold text-muted">
          <span>{formatPrice(100)}</span>
          <span>{formatPrice(PRICE_CAP)}+</span>
        </div>
      </FilterSection>

      <FilterSection title="Pack size">
        <div className="grid grid-cols-4 gap-1.5">
          {packSizes.map((size) => {
            const active = sizes.includes(size)
            return (
              <button
                key={size}
                type="button"
                aria-pressed={active}
                onClick={() => toggleSize(size)}
                className={`h-10 rounded-xl border text-xs font-extrabold transition ${active ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-white text-ink hover:border-brand/40'}`}
              >
                {size}
              </button>
            )
          })}
        </div>
      </FilterSection>

      <FilterSection title="Availability">
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-canvas px-3 py-2.5">
          <span className="text-sm font-bold">In stock only</span>
          <button
            type="button"
            role="switch"
            aria-checked={inStockOnly}
            aria-label="In stock only"
            onClick={() => {
              if (inStockOnly) toggleAvailability('in')
              else {
                if (availability.includes('out')) toggleAvailability('out')
                if (!availability.includes('in')) toggleAvailability('in')
              }
            }}
            className={`relative h-6 w-11 shrink-0 rounded-full transition ${inStockOnly ? 'bg-brand' : 'bg-slate-300'}`}
          >
            <span className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform ${inStockOnly ? 'translate-x-5' : ''}`} />
          </button>
        </label>
      </FilterSection>
    </div>
  )
}

function FilterRow({ label, count, active, onClick, small = false }: { label: string; count: number; active: boolean; onClick: () => void; small?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 text-left transition ${small ? 'py-1.5 text-xs' : 'py-2 text-[13px]'} ${active ? 'bg-brand-soft font-bold text-brand' : 'text-ink hover:bg-canvas'}`}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${active ? 'bg-white text-brand' : 'text-muted'}`}>{count}</span>
    </button>
  )
}

function CategoryChip({ label, count, image, art, active, onClick }: { label: string; count: number; image?: string | null; art?: Category['art']; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex shrink-0 items-center gap-2 rounded-full py-1 pr-3.5 text-sm font-bold transition ${image !== undefined ? 'pl-1' : 'pl-3.5'} ${active ? 'bg-ink text-white' : 'bg-canvas text-ink hover:bg-brand-soft hover:text-brand'}`}
    >
      {image !== undefined && (
        <span className="size-7 overflow-hidden rounded-full bg-white ring-1 ring-black/5">
          <ProductMedia name="" image={image} art={art ?? 'mix'} className="size-full" />
        </span>
      )}
      {label}
      <span className={`text-xs tabular-nums ${active ? 'text-white/70' : 'text-muted'}`}>{count}</span>
    </button>
  )
}
