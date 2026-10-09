export type OrderStatus = 'PLACED' | 'CONFIRMED' | 'PACKED' | 'SHIPPED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED' | 'RETURNED'
export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED'

export type OrderItem = { id: string; productId: string | null; name: string; slug: string | null; image: string | null; art: string | null; size: string; unitPrice: number; mrp: number; quantity: number }
export type OrderEvent = { status: OrderStatus; note: string | null; at: string }
export type Order = {
  id: string
  code: string
  status: OrderStatus
  paymentStatus: PaymentStatus
  paymentMethod: 'UPI' | 'CARD' | 'NETBANKING' | 'COD'
  customer: { name: string; email: string; phone: string }
  address: { line: string; city: string; state: string; pin: string }
  items: OrderItem[]
  subtotal: number
  offerDiscount: number
  discount: number
  shipping: number
  total: number
  couponCode: string | null
  carrier: string | null
  trackingNumber: string | null
  events: OrderEvent[]
  placedAt: string
  payments?: { id: string; provider: string; status: PaymentStatus; amount: number; providerPaymentId: string | null; detail?: string | null; failureReason?: string | null }[]
}

export type Variant = { id: string; productId: string; size: string; sku: string; barcode: string | null; weightGrams: number | null; price: number; mrp: number; stock: number; lowStockAt: number; isActive: boolean; sortOrder: number }
export type Product = {
  id: string
  slug: string
  name: string
  categoryId: string
  subcategoryId: string | null
  blurb: string
  description: string
  highlights: string[]
  nutrition: { label: string; value: string }[]
  images: string[]
  art: string
  brandId: string | null
  hsnCode: string | null
  gstPercent: number
  countryOfOrigin: string
  ingredients: string
  shelfLifeDays: number | null
  isActive: boolean
  isBestseller: boolean
  featuredSize: string | null
  sold: number
  variants: Variant[]
  category?: { name: string }
  brand?: { id: string; name: string } | null
  stock?: number
  lowStock?: boolean
}
export type Category = { id: string; name: string; tagline: string; image: string | null; art: string; parentId: string | null; sortOrder: number; isActive: boolean; _count?: { products: number; subProducts: number } }
export type Paged<T> = { items: T[]; total: number; page: number; pages: number }
