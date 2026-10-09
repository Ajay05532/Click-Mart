import { badRequest, conflict } from './errors.js'
import { count, from, rows } from './db.js'
import { getSettings } from './settings.js'
import type { Coupon, Offer, Product, Variant } from './types.js'

export type CartInput = { variantId: string; quantity: number }

export type PricedLine = {
  variantId: string
  productId: string
  categoryId: string
  name: string
  slug: string
  image: string | null
  art: string
  size: string
  quantity: number
  mrp: number
  basePrice: number
  unitPrice: number
  offerName: string | null
  stock: number
  hsnCode: string | null
  gstPercent: number
}

export type Quote = {
  lines: PricedLine[]
  subtotal: number
  offerDiscount: number
  couponDiscount: number
  shipping: number
  total: number
  couponCode: string | null
  freeShippingApplied: boolean
  savings: number
}

/** Offers that are switched on and inside their start/end window right now. */
export async function loadActiveOffers(): Promise<Offer[]> {
  const now = Date.now()
  const all = await rows<Offer>(from('Offer').select('*').eq('isActive', true))
  return all.map((offer) => ({ ...offer, categoryIds: offer.categoryIds ?? [], productIds: offer.productIds ?? [] })).filter((offer) => (!offer.startsAt || new Date(offer.startsAt).getTime() <= now) && (!offer.endsAt || new Date(offer.endsAt).getTime() >= now))
}

export function offerApplies(offer: Offer, productId: string, categoryId: string) {
  const targeted = offer.productIds.length > 0 || offer.categoryIds.length > 0
  if (!targeted) return true
  return offer.productIds.includes(productId) || offer.categoryIds.includes(categoryId)
}

/** The best (lowest) price any active offer gives for this variant, or null. */
export function bestOfferPrice(offers: Offer[], productId: string, categoryId: string, price: number) {
  let best: { price: number; name: string; badge: string | null } | null = null
  for (const offer of offers) {
    if (offer.type === 'FREE_SHIPPING' || !offerApplies(offer, productId, categoryId)) continue
    const next = offer.type === 'PERCENT' ? Math.round((price * (100 - offer.value)) / 100) : price - offer.value
    const clamped = Math.max(1, Math.min(price, next))
    if (clamped < price && (!best || clamped < best.price)) best = { price: clamped, name: offer.name, badge: offer.badge }
  }
  return best
}

export async function priceItems(items: CartInput[]): Promise<PricedLine[]> {
  if (items.length === 0) throw badRequest('Your cart is empty')
  // Merge duplicate variants so stock checks are correct.
  const merged = new Map<string, number>()
  for (const item of items) merged.set(item.variantId, (merged.get(item.variantId) ?? 0) + item.quantity)

  const [variants, offers] = await Promise.all([
    rows<Variant & { product: Product }>(from('ProductVariant').select('*, product:Product(*)').in('id', [...merged.keys()])),
    loadActiveOffers(),
  ])

  return [...merged.entries()].map(([variantId, quantity]) => {
    const variant = variants.find((item) => item.id === variantId)
    if (!variant || !variant.isActive || !variant.product.isActive) {
      throw conflict('An item in your cart is no longer available', { variantId })
    }
    if (variant.stock < quantity) {
      throw conflict(
        variant.stock === 0
          ? `${variant.product.name} (${variant.size}) is out of stock`
          : `Only ${variant.stock} of ${variant.product.name} (${variant.size}) left`,
        { variantId, available: variant.stock },
      )
    }
    const offer = bestOfferPrice(offers, variant.productId, variant.product.categoryId, variant.price)
    return {
      variantId,
      productId: variant.productId,
      categoryId: variant.product.categoryId,
      name: variant.product.name,
      slug: variant.product.slug,
      image: variant.product.images?.[0] ?? null,
      art: variant.product.art,
      size: variant.size,
      quantity,
      mrp: variant.mrp,
      basePrice: variant.price,
      unitPrice: offer?.price ?? variant.price,
      offerName: offer?.name ?? null,
      stock: variant.stock,
      hsnCode: variant.product.hsnCode ?? null,
      gstPercent: variant.product.gstPercent ?? 0,
    }
  })
}

export async function findCoupon(code: string) {
  const data = await rows<Coupon>(from('Coupon').select('*').eq('code', code.trim().toUpperCase()).limit(1))
  const coupon = data[0]
  return coupon ? { ...coupon, categoryIds: coupon.categoryIds ?? [], productIds: coupon.productIds ?? [] } : null
}

/** Throws a 400 with a customer-readable reason when the coupon cannot be used. */
export async function validateCoupon(coupon: Coupon | null, lines: PricedLine[], userId?: string) {
  const now = new Date()
  if (!coupon || !coupon.isActive) throw badRequest('That coupon code is not valid')
  if (coupon.startsAt && new Date(coupon.startsAt) > now) throw badRequest('That coupon is not active yet')
  if (coupon.endsAt && new Date(coupon.endsAt) < now) throw badRequest('That coupon has expired')
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) throw badRequest('That coupon has been fully claimed')
  if (coupon.perUserLimit !== null && userId) {
    const used = await count(from('CouponRedemption').select('id', { count: 'exact', head: true }).eq('couponId', coupon.id).eq('userId', userId))
    if (used >= coupon.perUserLimit) throw badRequest('You have already used this coupon')
  }
  const eligible = eligibleSubtotal(coupon, lines)
  if (eligible === 0) throw badRequest('This coupon does not apply to the items in your cart')
  const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0)
  if (subtotal < coupon.minOrder) throw badRequest(`Add ₹${coupon.minOrder - subtotal} more to use this coupon`)
}

function eligibleSubtotal(coupon: Coupon, lines: PricedLine[]) {
  const restricted = coupon.categoryIds.length > 0 || coupon.productIds.length > 0
  return lines
    .filter((line) => !restricted || coupon.productIds.includes(line.productId) || coupon.categoryIds.includes(line.categoryId))
    .reduce((sum, line) => sum + line.unitPrice * line.quantity, 0)
}

export async function buildQuote(items: CartInput[], couponCode?: string | null, userId?: string): Promise<Quote> {
  const [lines, settings] = await Promise.all([priceItems(items), getSettings()])
  const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0)
  const offerDiscount = lines.reduce((sum, line) => sum + (line.basePrice - line.unitPrice) * line.quantity, 0)

  let couponDiscount = 0
  let freeShipping = false
  let appliedCode: string | null = null
  if (couponCode?.trim()) {
    const coupon = await findCoupon(couponCode)
    await validateCoupon(coupon, lines, userId)
    appliedCode = coupon!.code
    if (coupon!.type === 'FREE_SHIPPING') freeShipping = true
    else {
      const eligible = eligibleSubtotal(coupon!, lines)
      const raw = coupon!.type === 'PERCENT' ? Math.round((eligible * coupon!.value) / 100) : coupon!.value
      couponDiscount = Math.min(eligible, coupon!.maxDiscount ? Math.min(raw, coupon!.maxDiscount) : raw)
    }
  }

  const qualifiesFree = subtotal >= settings.freeShippingThreshold
  const shipping = freeShipping || qualifiesFree ? 0 : settings.shippingFee
  const total = Math.max(0, subtotal - couponDiscount + shipping)
  const mrpTotal = lines.reduce((sum, line) => sum + line.mrp * line.quantity, 0)

  return {
    lines,
    subtotal,
    offerDiscount,
    couponDiscount,
    shipping,
    total,
    couponCode: appliedCode,
    freeShippingApplied: freeShipping || qualifiesFree,
    savings: Math.max(0, mrpTotal - subtotal) + couponDiscount,
  }
}
