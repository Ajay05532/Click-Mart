import { keepPreviousData, useQuery } from '@tanstack/react-query'
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

/** Filtered, sorted, paginated products. The server does the filtering. */
export const useProducts = (params: ProductParams = {}, enabled = true) =>
  useQuery({
    queryKey: ['products', params],
    queryFn: () => api<ProductList>('/products', { query: params }),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    enabled,
  })

export const useProduct = (slug: string) =>
  useQuery({
    queryKey: ['product', slug],
    queryFn: () => api<{ product: Product; related: Product[] }>(`/products/${slug}`),
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
    queryFn: () => api<{ items: Category[] }>('/categories').then((result) => result.items),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  })

export type ProductReview = { id: string; name: string; city: string; rating: number; comment: string; images?: string[]; verified: boolean; createdAt: string }
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
  freeShippingThreshold: number
  shippingFee: number
  codEnabled: boolean
  codMaxOrder: number
  paymentProvider: 'mock' | 'razorpay'
  /** True when checkout opens Razorpay's test window. No real money moves. */
  paymentTestMode: boolean
}

const defaults: StoreSettings = {
  storeName: 'ClickMart',
  supportEmail: '',
  supportPhone: '',
  freeShippingThreshold: 499,
  shippingFee: 49,
  codEnabled: true,
  codMaxOrder: 5000,
  paymentProvider: 'mock',
  paymentTestMode: false,
}

/** Shipping rules and payment options set in the admin. Falls back to sensible defaults while loading. */
export function useStoreSettings(): StoreSettings {
  const query = useQuery({ queryKey: ['settings'], queryFn: () => api<StoreSettings>('/settings/public'), staleTime: 5 * 60_000 })
  return { ...defaults, ...query.data }
}
