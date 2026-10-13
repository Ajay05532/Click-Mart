import { keepPreviousData, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ApiError, api, errorMessage } from '../lib/api.ts'
import type { Pack, Product } from '../types.ts'
import { useAuth } from './AuthContext.tsx'

type CartLine = { variantId: string; quantity: number }

/** A cart line priced and described by the server. */
export type ResolvedLine = {
  key: string
  variantId: string
  productId: string
  name: string
  slug: string
  image: string | null
  art: string
  size: string
  quantity: number
  unitPrice: number
  mrp: number
  lineTotal: number
  stock: number
  offerName: string | null
}

type Quote = {
  lines: Omit<ResolvedLine, 'key' | 'lineTotal'>[]
  subtotal: number
  offerDiscount: number
  couponDiscount: number
  shipping: number
  total: number
  couponCode: string | null
  freeShippingApplied: boolean
  savings: number
}

type CartContextValue = {
  lines: ResolvedLine[]
  /** Pack quantities, known instantly without waiting for the server price. */
  items: CartLine[]
  /** Items in the cart, known instantly without waiting for the server. */
  count: number
  subtotal: number
  discount: number
  shipping: number
  total: number
  savings: number
  freeShipping: boolean
  coupon: { code: string } | null
  /** True while prices are being (re)calculated. */
  pricing: boolean
  /** Set when the price quote failed and there is nothing to show yet. */
  quoteError: string | null
  reloadQuote: () => void
  toast: { text: string; count?: number } | null
  toastTick: number
  addItem: (variantId: string, quantity?: number, label?: string) => void
  updateQty: (variantId: string, quantity: number) => void
  removeItem: (variantId: string) => void
  /** Resolves to an error message, or null when the coupon was accepted. */
  applyCoupon: (code: string) => Promise<string | null>
  clearCoupon: () => void
  clear: () => void
}

const STORAGE_KEY = 'clickmart-cart-v2'
const COUPON_KEY = 'clickmart-coupon'
const CartContext = createContext<CartContextValue | null>(null)

function loadLines(): CartLine[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as CartLine[]
    return Array.isArray(parsed) ? parsed.filter((line) => typeof line.variantId === 'string' && line.quantity > 0) : []
  } catch {
    return []
  }
}

const merge = (a: CartLine[], b: CartLine[]) => {
  const map = new Map<string, number>()
  for (const line of [...a, ...b]) map.set(line.variantId, Math.max(map.get(line.variantId) ?? 0, line.quantity))
  return [...map].map(([variantId, quantity]) => ({ variantId, quantity }))
}

function addProduct(found: Map<string, Product>, product: Product | undefined) {
  if (product?.id && product.packs?.length) found.set(product.id, product)
}

/** Products already loaded for the shop, so the cart can be drawn before the price quote returns. */
function cachedProducts(queryClient: QueryClient): Product[] {
  const found = new Map<string, Product>()
  for (const [, data] of queryClient.getQueriesData<{ product?: Product; related?: Product[]; items?: Product[] } | Product[]>({ queryKey: ['product'] })) {
    if (Array.isArray(data)) data.forEach((product) => addProduct(found, product))
    else {
      addProduct(found, data?.product)
      data?.related?.forEach((product) => addProduct(found, product))
      data?.items?.forEach((product) => addProduct(found, product))
    }
  }
  for (const [, data] of queryClient.getQueriesData<{ items?: Product[] } | Product[]>({ queryKey: ['products'] })) {
    if (Array.isArray(data)) data.forEach((product) => addProduct(found, product))
    else data?.items?.forEach((product) => addProduct(found, product))
  }
  return [...found.values()]
}

function previewLines(items: CartLine[], products: Product[]): ResolvedLine[] {
  const packs = new Map<string, { product: Product; pack: Pack }>()
  for (const product of products) for (const pack of product.packs) packs.set(pack.variantId, { product, pack })
  const lines: ResolvedLine[] = []
  for (const item of items) {
    const match = packs.get(item.variantId)
    if (!match) continue
    const { product, pack } = match
    lines.push({
      key: item.variantId,
      variantId: item.variantId,
      productId: product.id,
      name: product.name,
      slug: product.slug,
      image: product.images?.[0] ?? product.image,
      art: product.art,
      size: pack.size,
      quantity: item.quantity,
      unitPrice: pack.price,
      mrp: pack.mrp,
      lineTotal: pack.price * item.quantity,
      stock: pack.stock ?? product.stock,
      offerName: pack.offer?.name ?? null,
    })
  }
  return lines
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [lines, setLines] = useState<CartLine[]>(loadLines)
  const [cacheTick, setCacheTick] = useState(0)
  const [couponCode, setCouponCode] = useState<string | null>(() => localStorage.getItem(COUPON_KEY))
  const [toast, setToast] = useState<{ text: string; count?: number } | null>(null)
  const [toastTick, setToastTick] = useState(0)
  const synced = useRef<string | null>(null)

  const notify = useCallback((text: string, count?: number) => {
    setToastTick((tick) => tick + 1)
    setToast({ text, count })
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lines))
  }, [lines])
  useEffect(() => {
    if (couponCode) localStorage.setItem(COUPON_KEY, couponCode)
    else localStorage.removeItem(COUPON_KEY)
  }, [couponCode])
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 4500)
    return () => window.clearTimeout(timer)
  }, [toast, toastTick])

  // Logging in: combine the guest cart with the one saved on the account.
  useEffect(() => {
    if (!user) {
      synced.current = null
      return
    }
    if (synced.current === user.id) return
    let cancelled = false
    api<{ items: CartLine[] }>('/me/cart')
      .then(({ items }) => {
        if (cancelled) return
        synced.current = user.id
        setLines((current) => merge(items, current))
      })
      .catch(() => {
        synced.current = user.id
      })
    return () => {
      cancelled = true
    }
  }, [user])

  // Keep the account copy up to date (after the first merge, so nothing is overwritten early).
  useEffect(() => {
    if (!user || synced.current !== user.id) return
    const timer = window.setTimeout(() => {
      api('/me/cart', { method: 'PUT', body: { items: lines } }).catch(() => undefined)
    }, 700)
    return () => window.clearTimeout(timer)
  }, [lines, user])

  const quote = useQuery({
    queryKey: ['quote', lines, couponCode],
    queryFn: ({ queryKey }) => {
      const items = queryKey[1] as CartLine[]
      const code = queryKey[2] as string | null
      return api<Quote>('/cart/quote', { body: { items, couponCode: code } })
    },
    enabled: lines.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  })

  // The catalogue query lives in the page, so listen for it and redraw the cart once those products arrive.
  const awaitingQuote = lines.length > 0 && !quote.data
  const awaitingQuoteRef = useRef(awaitingQuote)
  awaitingQuoteRef.current = awaitingQuote
  useEffect(() => {
    return queryClient.getQueryCache().subscribe((event) => {
      if (!awaitingQuoteRef.current) return
      const head = event.query.queryKey[0]
      if (head !== 'product' && head !== 'products') return
      setCacheTick((tick) => tick + 1)
    })
  }, [queryClient])

  // The server is the authority on stock and coupons: react when it disagrees with the cart.
  const failure = quote.error
  useEffect(() => {
    if (!(failure instanceof ApiError)) return
    if (failure.status === 409) {
      const details = failure.details as { variantId?: string; available?: number } | undefined
      if (details?.variantId) {
        const available = details.available ?? 0
        setLines((current) => (available > 0 ? current.map((line) => (line.variantId === details.variantId ? { ...line, quantity: available } : line)) : current.filter((line) => line.variantId !== details.variantId)))
      }
      notify(failure.message)
    } else if (failure.status === 400 && couponCode) {
      setCouponCode(null)
      notify(failure.message)
    }
  }, [failure, couponCode, notify])

  const data = lines.length > 0 ? quote.data : undefined
  const resolved = useMemo<ResolvedLine[]>(() => {
    const quantities = new Map(lines.map((line) => [line.variantId, line.quantity]))
    const quoted: ResolvedLine[] = data
      ? data.lines
          .filter((line) => quantities.has(line.variantId))
          .map((line) => {
            const quantity = quantities.get(line.variantId) ?? line.quantity
            return { ...line, key: line.variantId, quantity, lineTotal: line.unitPrice * quantity }
          })
      : []
    // A full quote is the price authority. Until it arrives, use products the shop has already loaded.
    if (quoted.length === lines.length && lines.length > 0) return quoted
    const previews = previewLines(lines, cachedProducts(queryClient))
    if (quoted.length === 0) return previews
    const byId = new Map(previews.map((line) => [line.variantId, line]))
    for (const line of quoted) byId.set(line.variantId, line)
    return lines.flatMap((item) => {
      const line = byId.get(item.variantId)
      return line ? [line] : []
    })
  }, [data, lines, queryClient, cacheTick])

  const addItem = useCallback(
    (variantId: string, quantity = 1, label?: string) => {
      let count = 0
      setLines((current) => {
        const existing = current.find((line) => line.variantId === variantId)
        const next = existing
          ? current.map((line) => (line.variantId === variantId ? { ...line, quantity: Math.min(99, line.quantity + quantity) } : line))
          : [...current, { variantId, quantity }]
        count = next.reduce((sum, line) => sum + line.quantity, 0)
        return next
      })
      notify(`${label ?? 'Item'} added to cart`, count)
    },
    [notify],
  )

  const updateQty = useCallback((variantId: string, quantity: number) => {
    setLines((current) => (quantity < 1 ? current.filter((line) => line.variantId !== variantId) : current.map((line) => (line.variantId === variantId ? { ...line, quantity: Math.min(99, quantity) } : line))))
  }, [])
  const removeItem = useCallback((variantId: string) => setLines((current) => current.filter((line) => line.variantId !== variantId)), [])

  const reloadQuote = useCallback(() => {
    void quote.refetch()
  }, [quote.refetch])

  const applyCoupon = useCallback(
    async (code: string) => {
      const clean = code.trim().toUpperCase()
      if (!clean) return null
      if (lines.length === 0) return 'Add something to your cart first'
      try {
        await api<Quote>('/cart/quote', { body: { items: lines, couponCode: clean } }) // validate before accepting
        setCouponCode(clean)
        return null
      } catch (error) {
        return errorMessage(error)
      }
    },
    [lines],
  )

  const covered = lines.length > 0 && resolved.length === lines.length
  const subtotal = covered ? resolved.reduce((sum, line) => sum + line.lineTotal, 0) : (data?.subtotal ?? 0)
  const value = useMemo<CartContextValue>(
    () => ({
      lines: resolved,
      items: lines,
      count: lines.reduce((sum, line) => sum + line.quantity, 0),
      subtotal,
      discount: data?.couponDiscount ?? 0,
      shipping: data?.shipping ?? 0,
      total: data?.total ?? subtotal,
      savings: data?.savings ?? 0,
      freeShipping: data?.freeShippingApplied ?? false,
      coupon: data?.couponCode ? { code: data.couponCode } : null,
      pricing: lines.length > 0 && quote.isFetching,
      quoteError: lines.length > 0 && quote.isError && !quote.isFetching ? errorMessage(quote.error) : null,
      reloadQuote,
      toast,
      toastTick,
      addItem,
      updateQty,
      removeItem,
      applyCoupon,
      clearCoupon: () => setCouponCode(null),
      clear: () => {
        setLines([])
        setCouponCode(null)
      },
    }),
    [resolved, lines, data, subtotal, quote.isFetching, quote.isError, quote.error, reloadQuote, toast, toastTick, addItem, updateQty, removeItem, applyCoupon],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCart() {
  const context = useContext(CartContext)
  if (!context) throw new Error('useCart must be used within CartProvider')
  return context
}
