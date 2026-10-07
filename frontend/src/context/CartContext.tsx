import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { coupons } from '../data/promotions.ts'
import { packBySize, products } from '../data/products.ts'
import { shippingCost } from '../lib/money.ts'
import type { Coupon, PackSize } from '../types.ts'

type CartLine = {
  productId: string
  size: PackSize
  quantity: number
}

export type ResolvedLine = CartLine & {
  key: string
  name: string
  slug: string
  image: string | null
  art: (typeof products)[number]['art']
  unitPrice: number
  mrp: number
  lineTotal: number
}

type CartContextValue = {
  lines: ResolvedLine[]
  count: number
  subtotal: number
  discount: number
  shipping: number
  total: number
  coupon: Coupon | null
  toast: string | null
  toastTick: number
  addItem: (productId: string, size: PackSize, quantity?: number) => void
  updateQty: (productId: string, size: PackSize, quantity: number) => void
  removeItem: (productId: string, size: PackSize) => void
  applyCoupon: (code: string) => string | null
  clearCoupon: () => void
  clear: () => void
}

const STORAGE_KEY = 'clickmart-cart'
const CartContext = createContext<CartContextValue | null>(null)

function loadLines(): CartLine[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as CartLine[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter((line) => line.productId && line.size && line.quantity > 0)
  } catch {
    return []
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(loadLines)
  const [coupon, setCoupon] = useState<Coupon | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [toastTick, setToastTick] = useState(0)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lines))
  }, [lines])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 2800)
    return () => window.clearTimeout(timer)
  }, [toast, toastTick])

  const resolved = useMemo(() => {
    return lines.flatMap((line) => {
      const product = products.find((item) => item.id === line.productId)
      if (!product) return []
      const pack = packBySize(product, line.size)
      return [
        {
          ...line,
          key: `${line.productId}:${line.size}`,
          name: product.name,
          slug: product.slug,
          image: product.image,
          art: product.art,
          unitPrice: pack.price,
          mrp: pack.mrp,
          lineTotal: pack.price * line.quantity,
        },
      ]
    })
  }, [lines])

  const subtotal = resolved.reduce((sum, line) => sum + line.lineTotal, 0)
  const discount = coupon?.type === 'percent' ? Math.round((subtotal * coupon.value) / 100) : 0
  const shipping = shippingCost(subtotal, coupon?.type === 'shipping')
  const total = Math.max(0, subtotal - discount + shipping)
  const count = resolved.reduce((sum, line) => sum + line.quantity, 0)

  const addItem = (productId: string, size: PackSize, quantity = 1) => {
    const product = products.find((item) => item.id === productId)
    if (!product || !product.inStock || product.stock < 1) {
      setToastTick((tick) => tick + 1)
      setToast('This item is out of stock')
      return
    }
    setLines((current) => {
      const existing = current.find((line) => line.productId === productId && line.size === size)
      if (!existing) {
        return [...current, { productId, size, quantity: Math.min(quantity, product.stock) }]
      }
      return current.map((line) =>
        line === existing
          ? { ...line, quantity: Math.min(product.stock, line.quantity + quantity) }
          : line,
      )
    })
    setToastTick((tick) => tick + 1)
    setToast(`${product.name} added to cart`)
  }

  const updateQty = (productId: string, size: PackSize, quantity: number) => {
    const product = products.find((item) => item.id === productId)
    if (quantity < 1) {
      setLines((current) =>
        current.filter((line) => !(line.productId === productId && line.size === size)),
      )
      return
    }
    const next = Math.min(quantity, product?.stock ?? quantity)
    setLines((current) =>
      current.map((line) =>
        line.productId === productId && line.size === size ? { ...line, quantity: next } : line,
      ),
    )
  }

  const removeItem = (productId: string, size: PackSize) => {
    setLines((current) =>
      current.filter((line) => !(line.productId === productId && line.size === size)),
    )
  }

  const applyCoupon = (code: string) => {
    const found = coupons.find((item) => item.code.toLowerCase() === code.trim().toLowerCase())
    if (!found) {
      setCoupon(null)
      return 'That code is not valid. Try DRY15.'
    }
    setCoupon(found)
    return null
  }

  const value: CartContextValue = {
    lines: resolved,
    count,
    subtotal,
    discount,
    shipping,
    total,
    coupon,
    toast,
    toastTick,
    addItem,
    updateQty,
    removeItem,
    applyCoupon,
    clearCoupon: () => setCoupon(null),
    clear: () => {
      setLines([])
      setCoupon(null)
    },
  }

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const context = useContext(CartContext)
  if (!context) throw new Error('useCart must be used within CartProvider')
  return context
}
