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
  metaTitle?: string
  metaDescription?: string
}
export type Category = { id: string; name: string; tagline: string; description?: string; metaTitle?: string; metaDescription?: string; image: string | null; art: string; parentId: string | null; sortOrder: number; isActive: boolean; _count?: { products: number; subProducts: number } }
export type Paged<T> = { items: T[]; total: number; page: number; pages: number }

export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING_CUSTOMER' | 'RESOLVED' | 'CLOSED'
export type TicketPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
export type TicketCategory = 'ORDER_STATUS' | 'DELIVERY' | 'PAYMENT' | 'REFUND_RETURN' | 'PRODUCT_QUALITY' | 'WRONG_OR_MISSING' | 'ACCOUNT' | 'COUPON_OFFER' | 'OTHER'
export type SupportTicket = {
  id: string
  code: string
  subject: string
  category: TicketCategory
  categoryLabel: string
  status: TicketStatus
  priority: TicketPriority
  source: 'ORDER' | 'HELP' | 'CONTACT'
  customer: { id: string | null; name: string; email: string; phone: string | null }
  assignee: { id: string; name: string } | null
  order: { id: string; code: string; status: OrderStatus; total: number; placedAt: string } | null
  needsReply: boolean
  overdue: boolean
  dueAt: string | null
  firstResponseAt: string | null
  lastMessageBy: 'CUSTOMER' | 'STAFF'
  lastMessageAt: string
  createdAt: string
  resolvedAt: string | null
  rating: number | null
  ratingComment: string | null
  preview: string | null
}
export type SupportMessage = { id: string; authorRole: 'CUSTOMER' | 'STAFF' | 'SYSTEM'; authorName: string; body: string; isInternal: boolean; attachments: string[]; createdAt: string }
export type SupportStats = { open: number; inProgress: number; waiting: number; resolved: number; closed: number; unassigned: number; overdue: number; needsReply: number; createdToday: number; resolvedToday: number; avgFirstResponseMinutes: number | null; csat: number | null; csatCount: number; mine: number }
export type Faq = { id: string; category: 'ORDERS' | 'DELIVERY' | 'PAYMENTS' | 'RETURNS' | 'PRODUCTS' | 'ACCOUNT'; question: string; answer: string; sortOrder: number; isPublished: boolean; helpfulYes: number; helpfulNo: number }
export type CannedReply = { id: string; title: string; body: string }
