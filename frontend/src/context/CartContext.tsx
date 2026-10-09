import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ApiError, api, errorMessage } from '../lib/api.ts'
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
  toast: string | null
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

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [lines, setLines] = useState<CartLine[]>(loadLines)
  const [couponCode, setCouponCode] = useState<string | null>(() => localStorage.getItem(COUPON_KEY))
  const [toast, setToast] = useState<string | null>(null)
  const [toastTick, setToastTick] = useState(0)
  const synced = useRef<string | null>(null)

  const notify = useCallback((message: string) => {
    setToastTick((tick) => tick + 1)
    setToast(message)
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
    const timer = window.setTimeout(() => setToast(null), 2800)
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
    queryFn: () => api<Quote>('/cart/quote', { body: { items: lines, couponCode } }),
    enabled: lines.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 10_000,
    retry: false,
  })

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
    if (!data) return []
    const quantities = new Map(lines.map((line) => [line.variantId, line.quantity]))
    return data.lines
      .filter((line) => quantities.has(line.variantId))
      .map((line) => {
        const quantity = quantities.get(line.variantId) ?? line.quantity
        return { ...line, key: line.variantId, quantity, lineTotal: line.unitPrice * quantity }
      })
  }, [data, lines])

  const addItem = useCallback(
    (variantId: string, quantity = 1, label?: string) => {
      setLines((current) => {
        const existing = current.find((line) => line.variantId === variantId)
        if (!existing) return [...current, { variantId, quantity }]
        return current.map((line) => (line === existing ? { ...line, quantity: Math.min(99, line.quantity + quantity) } : line))
      })
      notify(`${label ?? 'Item'} added to cart`)
    },
    [notify],
  )

  const updateQty = useCallback((variantId: string, quantity: number) => {
    setLines((current) => (quantity < 1 ? current.filter((line) => line.variantId !== variantId) : current.map((line) => (line.variantId === variantId ? { ...line, quantity: Math.min(99, quantity) } : line))))
  }, [])
  const removeItem = useCallback((variantId: string) => setLines((current) => current.filter((line) => line.variantId !== variantId)), [])

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

  const value = useMemo<CartContextValue>(
    () => ({
      lines: resolved,
      count: lines.reduce((sum, line) => sum + line.quantity, 0),
      subtotal: data?.subtotal ?? 0,
      discount: data?.couponDiscount ?? 0,
      shipping: data?.shipping ?? 0,
      total: data?.total ?? 0,
      savings: data?.savings ?? 0,
      freeShipping: data?.freeShippingApplied ?? false,
      coupon: data?.couponCode ? { code: data.couponCode } : null,
      pricing: lines.length > 0 && (quote.isFetching || !data),
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
    [resolved, lines, data, quote.isFetching, toast, toastTick, addItem, updateQty, removeItem, applyCoupon],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCart() {
  const context = useContext(CartContext)
  if (!context) throw new Error('useCart must be used within CartProvider')
  return context
}
