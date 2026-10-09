import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Container } from '../components/layout/Container.tsx'
import { ProductCard } from '../components/product/ProductCard.tsx'
import { Breadcrumbs } from '../components/ui/Breadcrumbs.tsx'
import { CloseIcon } from '../components/icons.tsx'
import { packCards, useCategories, useProducts } from '../lib/catalog.ts'
import { formatPrice } from '../lib/money.ts'
import { useDocumentTitle } from '../lib/useDocumentTitle.ts'
import type { Category, CategoryId, PackSize } from '../types.ts'

const PAGE_SIZE = 12
const PRICE_CAP = 1500
const packSizes: PackSize[] = ['100g', '250g', '500g', '1kg']

export function ShopPage() {
  useDocumentTitle('Shop')
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

  const filters = (
    <Filters
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
      <div className="relative overflow-hidden bg-gradient-to-br from-brand-dark via-brand to-[#1d56b8] text-white">
        <div className="pointer-events-none absolute -top-16 right-10 size-64 rounded-full bg-accent/25 blur-3xl" />
        <Container className="relative py-8 sm:py-10">
          <nav className="text-xs text-white/70 [&_a:hover]:text-white [&_span.text-ink]:text-white">
            <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Shop' }]} />
          </nav>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
            {activeSub?.name ?? activeCategory?.name ?? (query ? `Results for “${params.get('q')}”` : 'All dry fruits')}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-white/75">
            {activeCategory?.tagline ?? 'Handpicked nuts, seeds and dried fruits, sealed fresh and delivered across India.'}
          </p>
        </Container>
      </div>
      <Container className="py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            Showing <span className="font-extrabold text-ink">{total}</span>{' '}
            {total === 1 ? 'pouch' : 'pouches'}
          </p>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-semibold text-muted">
              <span>Sort by</span>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value)}
                className="h-10 cursor-pointer rounded-full border border-line bg-white px-4 text-sm font-bold text-ink shadow-sm outline-none hover:border-brand focus:border-brand"
              >
                <option value="popular">Popular</option>
                <option value="price-asc">Price: low to high</option>
                <option value="price-desc">Price: high to low</option>
                <option value="rating">Top rated</option>
                <option value="discount">Biggest discount</option>
              </select>
            </label>
          </div>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="card sticky top-32 hidden max-h-[calc(100svh-9rem)] overflow-y-auto p-5 lg:block">
            {filters}
          </aside>

          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setFiltersOpen(true)}
                className="btn btn-outline btn-sm lg:hidden"
              >
                Filters
                {filterCount > 0 && (
                  <span className="grid size-4 place-items-center rounded-full bg-brand text-[10px] text-white">
                    {filterCount}
                  </span>
                )}
              </button>
              {chips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={chip.clear}
                  className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1.5 text-xs font-bold text-brand transition hover:bg-brand hover:text-white"
                >
                  {chip.label}
                  <CloseIcon className="size-3" />
                  <span className="sr-only">Remove {chip.label}</span>
                </button>
              ))}
              {canClear && (
                <button type="button" onClick={clearAll} className="px-2 text-xs font-bold text-accent">
                  Clear all
                </button>
              )}
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
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="font-semibold">Filters</h2>
              <button type="button" aria-label="Close filters" onClick={() => setFiltersOpen(false)}>
                <CloseIcon className="size-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-5">{filters}</div>
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

function Filters({
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
  return (
    <div className="text-sm">
      <div className="flex items-center justify-between border-b border-line pb-2.5">
        <h2 className="text-base font-extrabold">Filters</h2>
        <button
          type="button"
          onClick={onClear}
          disabled={!canClear}
          className="text-xs font-medium text-brand disabled:text-muted/50"
        >
          Reset
        </button>
      </div>

      <div className="border-b border-line py-3">
        <p className="text-sm font-extrabold">Category</p>
        <div className="mt-1">
          <FilterRow
            label="All"
            count={categories.reduce((sum, category) => sum + (category.productCount ?? 0), 0)}
            active={selectedCategories.length === 0}
            onClick={clearCategories}
          />
          {categories.map((category) => {
            const active = selectedCategories.includes(category.id)
            const count = category.productCount ?? 0
            return (
              <div key={category.id}>
                <FilterRow
                  label={category.name}
                  count={count}
                  active={active}
                  onClick={() => toggleCategory(category.id)}
                />
                {active && (
                  <div className="ml-5 border-l border-line pl-2">
                    {category.subcategories.map((item) => (
                      <FilterRow
                        key={item.id}
                        label={item.name}
                        count={item.productCount ?? 0}
                        active={activeCategory?.id === category.id && sub === item.id}
                        onClick={() => selectSub(item.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="border-b border-line py-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-extrabold">Price</p>
          <p className="text-xs text-muted">Up to {formatPrice(maxPrice)}</p>
        </div>
        <input
          type="range"
          min={0}
          max={PRICE_CAP}
          step={50}
          value={maxPrice}
          onChange={(event) => setMaxPrice(Number(event.target.value))}
          aria-label="Maximum price"
          className="mt-3 w-full"
        />
        <div className="mt-1 flex justify-between text-[11px] text-muted">
          <span>{formatPrice(0)}</span>
          <span>{formatPrice(PRICE_CAP)}</span>
        </div>
      </div>

      <div className="border-b border-line py-3">
        <p className="text-sm font-extrabold">Pack size</p>
        <div className="mt-2 grid grid-cols-4 gap-1">
          {packSizes.map((size) => {
            const active = sizes.includes(size)
            return (
              <button
                key={size}
                type="button"
                aria-pressed={active}
                onClick={() => toggleSize(size)}
                className={`h-9 rounded-full border text-xs font-bold transition ${
                  active ? 'border-brand bg-brand text-white' : 'border-line bg-white text-ink hover:border-brand/40'
                }`}
              >
                {size}
              </button>
            )
          })}
        </div>
      </div>

      <div className="pt-3">
        <p className="text-sm font-extrabold">Availability</p>
        <div className="mt-1">
          {(
            [
              ['in', 'In stock'],
              ['out', 'Out of stock'],
            ] as const
          ).map(([value, label]) => {
            const active = availability.includes(value)
            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                onClick={() => toggleAvailability(value)}
                className="flex w-full items-center gap-2 py-1.5 text-left text-xs text-ink"
              >
                <span
                  className={`grid size-3.5 place-items-center rounded border ${
                    active ? 'border-brand bg-brand text-white' : 'border-line bg-white'
                  }`}
                >
                  {active && <span className="text-[9px] leading-none">✓</span>}
                </span>
                {label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function FilterRow({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-2.5 py-1.5 text-left text-[13px]">
      <span
        className={`grid size-3.5 shrink-0 place-items-center rounded border ${
          active ? 'border-brand bg-brand text-white' : 'border-line bg-white'
        }`}
      >
        {active && <span className="text-[9px] leading-none">✓</span>}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="text-[11px] text-muted">{count}</span>
    </button>
  )
}
