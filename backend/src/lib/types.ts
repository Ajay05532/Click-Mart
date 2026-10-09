import type { Row } from './db.js'

export type Role = 'CUSTOMER' | 'STAFF' | 'ADMIN'
export type DiscountType = 'PERCENT' | 'FLAT' | 'FREE_SHIPPING'
export type OrderStatus = 'PLACED' | 'CONFIRMED' | 'PACKED' | 'SHIPPED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED' | 'RETURNED'
export type PaymentMethod = 'UPI' | 'CARD' | 'NETBANKING' | 'COD'

export type User = { id: string; name: string; email: string; phone: string | null; avatarUrl: string | null; passwordHash: string; role: Role; isBlocked: boolean; lastLoginAt: string | null; createdAt: string }
export type Variant = { id: string; productId: string; size: string; sku: string; barcode: string | null; weightGrams: number | null; price: number; mrp: number; stock: number; lowStockAt: number; isActive: boolean; sortOrder: number }
export type Product = {
  id: string; slug: string; name: string; categoryId: string; subcategoryId: string | null; blurb: string; description: string
  highlights: string[]; nutrition: unknown; images: string[]; art: string; brandId: string | null
  hsnCode: string | null; gstPercent: number; countryOfOrigin: string; ingredients: string; shelfLifeDays: number | null
  isActive: boolean; isBestseller: boolean
  featuredSize: string | null; sold: number; ratingAvg: number; ratingCount: number; createdAt: string; updatedAt: string
  variants?: Variant[]; category?: Row | null; subcategory?: Row | null
}
export type Offer = { id: string; name: string; badge: string | null; type: DiscountType; value: number; startsAt: string | null; endsAt: string | null; isActive: boolean; categoryIds: string[]; productIds: string[] }
export type Coupon = { id: string; code: string; label: string; type: DiscountType; value: number; minOrder: number; maxDiscount: number | null; startsAt: string | null; endsAt: string | null; usageLimit: number | null; perUserLimit: number | null; usedCount: number; categoryIds: string[]; productIds: string[]; isActive: boolean }
export type OrderRow = Row & { id: string; number: number; status: OrderStatus; items?: Row[]; events?: Row[] }

/** Select string that loads an order with its lines and timeline. */
export const ORDER_SELECT = '*, items:OrderItem(*), events:OrderEvent(*)'
export const PRODUCT_SELECT = '*, variants:ProductVariant(*), category:Category!categoryId(*), subcategory:Category!subcategoryId(*)'
