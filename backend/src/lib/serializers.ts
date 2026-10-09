import type { Row } from './db.js'
import { bestOfferPrice } from './pricing.js'
import type { Offer, Product, Variant } from './types.js'

export function serializeProduct(product: Product, offers: Offer[]) {
  const variants = (product.variants ?? []).filter((variant: Variant) => variant.isActive).sort((a, b) => a.sortOrder - b.sortOrder)
  const packs = variants.map((variant) => {
    const offer = bestOfferPrice(offers, product.id, product.categoryId, variant.price)
    return {
      variantId: variant.id,
      size: variant.size,
      price: offer?.price ?? variant.price,
      mrp: variant.mrp,
      basePrice: variant.price,
      stock: variant.stock,
      offer: offer ? { name: offer.name, badge: offer.badge } : null,
    }
  })
  const stock = variants.reduce((sum, variant) => sum + variant.stock, 0)
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    category: product.categoryId,
    categoryName: product.category?.name as string | undefined,
    subcategory: product.subcategoryId,
    rating: product.ratingAvg,
    reviewCount: product.ratingCount,
    image: product.images?.[0] ?? null,
    images: product.images ?? [],
    art: product.art,
    blurb: product.blurb,
    description: product.description,
    highlights: product.highlights ?? [],
    nutrition: product.nutrition,
    packs,
    featuredSize: product.featuredSize ?? packs[0]?.size ?? null,
    inStock: stock > 0,
    stock,
    sold: product.sold,
    bestseller: product.isBestseller,
  }
}

export const orderCode = (number: number) => `ORD-${number}`

const time = (value: string) => new Date(value).getTime()

/** Order keeps a text snapshot of what was paid with; the full record is in the payment schema. */
function paymentSummary(order: Row) {
  return { detail: (order.paymentDetail as string | null) ?? null, status: order.paymentStatus }
}

export function serializeOrder(order: Row) {
  const items = (order.items ?? []) as Row[]
  const events = (order.events ?? []) as Row[]
  return {
    id: order.id as string,
    code: orderCode(order.number),
    status: order.status,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    payment: paymentSummary(order),
    customer: { name: order.customerName, email: order.email, phone: order.phone },
    address: { line: order.addressLine, city: order.city, state: order.state, pin: order.pin },
    items: items.map((item) => ({
      id: item.id,
      productId: item.productId,
      name: item.name,
      slug: item.slug,
      image: item.image,
      art: item.art,
      size: item.size,
      unitPrice: item.unitPrice,
      mrp: item.mrp,
      quantity: item.quantity,
    })),
    subtotal: order.subtotal,
    offerDiscount: order.offerDiscount,
    discount: order.discount,
    shipping: order.shipping,
    total: order.total,
    couponCode: order.couponCode,
    carrier: order.carrier,
    trackingNumber: order.trackingNumber,
    events: [...events].sort((a, b) => time(a.createdAt) - time(b.createdAt)).map((event) => ({ status: event.status, note: event.note, at: event.createdAt })),
    placedAt: order.createdAt,
    estimatedDelivery: new Date(time(order.createdAt) + 4 * 86400000).toISOString(),
  }
}
