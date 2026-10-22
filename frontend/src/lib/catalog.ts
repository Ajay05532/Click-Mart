import { useQuery } from '@tanstack/react-query'
import { storeAddress, storeEmail, storePhone, storePhoneTel } from './store.ts'
import type { Category, Pack, Product } from '../types.ts'
import { api } from './api.ts'

export const featuredPack = (product: Product) => product.packs.find((pack) => pack.size === product.featuredSize) ?? product.packs[0]!

/** Same product page, with this pack already selected. */
export const productPath = (product: Pick<Product, 'slug'>, size?: string) =>
  size ? `/product/${product.slug}?size=${encodeURIComponent(size)}` : `/product/${product.slug}`

/** One card per pack size. The default pack comes first. */
export const packCards = (products: Product[]): { product: Product; pack: Pack }[] =>
  products.flatMap((product) =>
    [...product.packs]
      .sort((a, b) => Number(b.size === product.featuredSize) - Number(a.size === product.featuredSize))
      .map((pack) => ({ product, pack })),
  )

export type ProductList = { items: Product[]; total: number; page: number; pages: number }
export type ProductParams = Record<string, string | number | boolean | string[] | undefined>

/** One shuffle per browser per day: products without reviews keep their order while the shopper browses and on return visits. */
function browseSeed() {
  try {
    const day = new Date().toISOString().slice(0, 10)
    const [savedDay, savedSeed] = (localStorage.getItem('clickmart-seed') ?? '').split(':')
    if (savedDay === day && savedSeed) return savedSeed
    const seed = Math.random().toString(36).slice(2, 10)
    localStorage.setItem('clickmart-seed', `${day}:${seed}`)
    return seed
  } catch {
    return undefined
  }
}

// The last catalogue answers, kept in the browser so a return visit shows products at once while fresh ones load.
// They are only placeholders: every query still asks the API, and the cart and checkout are always priced by the server.
const SAVED_KEY = 'clickmart-catalog-v1'
const SAVED_LIMIT = 20
const SAVED_DAYS = 7
type Saved = Record<string, { at: number; data: unknown }>
let saved: Saved | null = null

function savedAnswers(): Saved {
  if (!saved) {
    try {
      saved = JSON.parse(localStorage.getItem(SAVED_KEY) ?? '{}') as Saved
    } catch {
      saved = {}
    }
  }
  return saved
}

function remembered<T>(key: readonly unknown[]): T | undefined {
  const hit = savedAnswers()[JSON.stringify(key)]
  return hit && Date.now() - hit.at < SAVED_DAYS * 86_400_000 ? (hit.data as T) : undefined
}

function remember<T>(key: readonly unknown[], data: T): T {
  const all = { ...savedAnswers(), [JSON.stringify(key)]: { at: Date.now(), data } }
  saved = Object.fromEntries(Object.entries(all).sort((a, b) => b[1].at - a[1].at).slice(0, SAVED_LIMIT))
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(saved))
  } catch {
    // Storage full or blocked: the shop still works, just without the instant start.
  }
  return data
}

/** Filtered, sorted, paginated products. The server does the filtering. */
export const useProducts = (params: ProductParams = {}, enabled = true) =>
  useQuery({
    queryKey: ['products', params],
    queryFn: () => api<ProductList>('/products', { query: { ...params, seed: browseSeed() } }).then((data) => remember(['products', params], data)),
    placeholderData: (previous) => previous ?? remembered<ProductList>(['products', params]),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    enabled,
  })

export const useProduct = (slug: string) =>
  useQuery({
    queryKey: ['product', slug],
    queryFn: () => api<{ product: Product; related: Product[] }>(`/products/${slug}`).then((data) => remember(['product', slug], data)),
    placeholderData: () => remembered<{ product: Product; related: Product[] }>(['product', slug]),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    retry: (count, error) => !(error instanceof Error && 'status' in error && (error as { status: number }).status === 404) && count < 2,
  })

/** Products by id (wishlist). Returns nothing until there are ids. */
export const useProductsByIds = (ids: string[]) =>
  useQuery({
    queryKey: ['products', 'ids', [...ids].sort()],
    queryFn: () => api<ProductList>('/products', { query: { ids: ids.join(','), pageSize: 60 } }).then((result) => result.items),
    enabled: ids.length > 0,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  })

export const useCategories = () =>
  useQuery({
    queryKey: ['categories'],
    queryFn: () => api<{ items: Category[] }>('/categories').then((result) => remember(['categories'], result.items)),
    placeholderData: () => remembered<Category[]>(['categories']),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  })

export type ProductReview = { id: string; name: string; city: string; rating: number; comment: string; images?: string[]; verified: boolean; createdAt: string }
export type FeaturedReview = { id: string; name: string; city: string; rating: number; comment: string; verified: boolean; createdAt: string; product: { name: string; slug: string } | null }
/** Recent approved 4-5 star reviews across the shop. Empty until customers write some. */
export const useFeaturedReviews = () =>
  useQuery({ queryKey: ['reviews', 'featured'], queryFn: () => api<{ items: FeaturedReview[] }>('/reviews/featured').then((result) => result.items), staleTime: 5 * 60_000 })

export const useProductReviews = (slug: string) =>
  useQuery({ queryKey: ['reviews', slug], queryFn: () => api<{ items: ProductReview[] }>(`/products/${slug}/reviews`).then((result) => result.items) })

export type Deal = { product: Product; bestPack: Product['packs'][number] | null; discountPercent: number }
export const useOffers = () =>
  useQuery({
    queryKey: ['offers'],
    queryFn: () => api<{ offers: { id: string; name: string; badge: string | null; endsAt: string | null }[]; deals: Deal[]; maxDiscount: number }>('/offers'),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  })

export type ActiveCoupon = { code: string; label: string; type: 'PERCENT' | 'FLAT' | 'FREE_SHIPPING'; value: number; minOrder: number }
export const useActiveCoupons = () =>
  useQuery({ queryKey: ['coupons'], queryFn: () => api<{ items: ActiveCoupon[] }>('/coupons/active').then((result) => result.items), staleTime: 15_000, refetchOnWindowFocus: true })

export type Banner = { id: string; title: string; subtitle: string; image: string | null; link: string; placement: 'HERO' | 'PROMO' }
export const useBanners = (placement?: 'HERO' | 'PROMO') =>
  useQuery({ queryKey: ['banners', placement], queryFn: () => api<{ items: Banner[] }>('/banners', { query: { placement } }).then((result) => result.items), staleTime: 15_000, refetchOnWindowFocus: true })

export type StoreSettings = {
  storeName: string
  supportEmail: string
  supportPhone: string
  address: string
  freeShippingThreshold: number
  shippingFee: number
  codEnabled: boolean
  codMaxOrder: number
  paymentProvider: 'mock' | 'razorpay'
}

const defaults: StoreSettings = {
  storeName: 'ClickMart',
  supportEmail: '',
  supportPhone: '',
  address: '',
  freeShippingThreshold: 499,
  shippingFee: 49,
  codEnabled: true,
  codMaxOrder: 5000,
  paymentProvider: 'mock',
}

/** Shipping rules and payment options set in the admin. Falls back to sensible defaults while loading. */
export function useStoreSettings(): StoreSettings {
  const query = useQuery({ queryKey: ['settings'], queryFn: () => api<StoreSettings>('/settings/public'), staleTime: 5 * 60_000 })
  return { ...defaults, ...query.data }
}

/** Phone, email and address from Settings in the admin, with the built-in Patna details while they load. */
export function useStoreContact() {
  const settings = useStoreSettings()
  const phone = settings.supportPhone.trim() || storePhone
  return {
    phone,
    phoneTel: phone.replace(/[^\d+]/g, '') || storePhoneTel,
    email: settings.supportEmail.trim() || storeEmail,
    address: settings.address.trim() || storeAddress,
  }
}
