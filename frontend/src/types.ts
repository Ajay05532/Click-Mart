// Categories and pack sizes are managed in the admin, so they are open-ended strings.
export type CategoryId = string

export type PackSize = string

export type ArtTone =
  | 'amber'
  | 'cream'
  | 'wine'
  | 'cocoa'
  | 'leaf'
  | 'olive'
  | 'ink'
  | 'plum'
  | 'apricot'
  | 'sand'
  | 'mix'

export type Pack = {
  /** The purchasable unit: carts and orders refer to this id. */
  variantId: string
  size: PackSize
  price: number
  mrp: number
  stock?: number
  /** Active offer applied to this price, if any. */
  offer?: { name: string; badge: string | null } | null
}

export type Subcategory = {
  id: string
  name: string
  productCount?: number
}

export type Product = {
  id: string
  slug: string
  name: string
  category: CategoryId
  categoryName?: string
  subcategory: string | null
  rating: number
  reviewCount: number
  image: string | null
  images?: string[]
  art: ArtTone
  blurb: string
  description: string
  highlights: string[]
  packs: Pack[]
  featuredSize: PackSize
  inStock: boolean
  stock: number
  sold: number
  nutrition: { label: string; value: string }[]
  bestseller?: boolean
}

export type Category = {
  id: CategoryId
  name: string
  image: string | null
  art: ArtTone
  tagline: string
  productCount?: number
  subcategories: Subcategory[]
}

export type Review = {
  id: string
  productId: string
  name: string
  city: string
  rating: number
  comment: string
  date: string
}

export type Testimonial = {
  name: string
  city: string
  rating: number
  comment: string
}

export type Coupon = {
  code: string
  label: string
  type: 'percent' | 'shipping'
  value: number
}

export type OrderStatus = 'Delivered' | 'Processing' | 'Shipped' | 'Cancelled'

export type StoreOrder = {
  id: string
  customer: string
  items: string
  amount: number
  status: OrderStatus
  date: string
}
