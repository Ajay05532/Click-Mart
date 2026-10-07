export type CategoryId =
  | 'almonds'
  | 'cashews'
  | 'raisins'
  | 'walnuts'
  | 'pistachios'
  | 'seeds'
  | 'mixed'

export type PackSize = '100g' | '250g' | '500g' | '1kg'

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
  size: PackSize
  price: number
  mrp: number
}

export type Subcategory = {
  id: string
  name: string
}

export type Product = {
  id: string
  slug: string
  name: string
  category: CategoryId
  subcategory: string
  rating: number
  reviewCount: number
  image: string | null
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
