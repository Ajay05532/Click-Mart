import { Router } from 'express'
import { z } from 'zod'
import { findAccountById } from '../services/account.js'
import { from, db, maybe, rows } from '../database/db.js'
import { badRequest, notFound } from '../utils/errors.js'
import { reviewImageUpload, storeImage } from '../services/storage.js'
import { buildQuote } from '../services/pricing.js'
import { serializeProduct } from '../utils/serializers.js'
import { env } from '../config/env.js'
import { activeBanners, activeCategories, activeCoupons, activeProducts, displayOffers, publicSettings } from '../services/publicCache.js'
import { actor, requireAuth } from '../middleware/auth.js'
export const catalogRouter = Router()
const listQuery = z.object({
  category: z.union([z.string(), z.array(z.string())]).optional(),
  sub: z.string().optional(),
  q: z.string().trim().max(80).optional(),
  ids: z.string().max(2000).optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  size: z.union([z.string(), z.array(z.string())]).optional(),
  availability: z.enum(['in', 'out']).optional(),
  bestseller: z.enum(['true', 'false']).optional(),
  onSale: z.enum(['true', 'false']).optional(),
  sort: z.enum(['popular', 'price-asc', 'price-desc', 'rating', 'discount', 'newest']).default('popular'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(12),
  /** Shuffle seed for products without reviews. Same seed, same order, so pages never repeat or skip items. */
  seed: z.string().trim().max(40).optional(),
})
/** Stable pseudo-random number for a product under a seed (FNV-1a). */
function shuffleKey(seed, id) {
  let hash = 2166136261
  for (const char of `${seed}:${id}`) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}
const arr = (value) => (value === undefined ? [] : Array.isArray(value) ? value : [value])
catalogRouter.get('/products', async (req, res) => {
  const query = listQuery.parse(req.query)
  const categories = arr(query.category)
  const sizes = arr(query.size)
  const ids = query.ids
    ? new Set(
        query.ids
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
          .slice(0, 100),
      )
    : null
  const words = query.q?.toLowerCase()
  const [offers, products] = await Promise.all([displayOffers(), activeProducts()])
  let items = products
    .filter(
      (product) =>
        (!categories.length || categories.includes(product.categoryId)) &&
        (!query.sub || product.subcategoryId === query.sub) &&
        (!ids || ids.has(product.id)) &&
        (query.bestseller !== 'true' || product.isBestseller) &&
        (!words || product.name.toLowerCase().includes(words) || (product.blurb ?? '').toLowerCase().includes(words)),
    )
    .filter((product) => (product.variants ?? []).some((variant) => variant.isActive))
    .filter((product) => {
      const active = (product.variants ?? []).filter((variant) => variant.isActive)
      if (sizes.length && !active.some((variant) => sizes.includes(variant.size))) return false
      const inStock = active.some((variant) => variant.stock > 0)
      if (query.availability === 'in' && !inStock) return false
      if (query.availability === 'out' && inStock) return false
      return true
    })
    .map((product) => serializeProduct(product, offers))
  const feat = (item) => item.packs.find((pack) => pack.size === item.featuredSize) ?? item.packs[0]
  items = items.filter((item) => {
    const pack = feat(item)
    if (!pack) return false
    if (query.minPrice !== undefined && pack.price < query.minPrice) return false
    if (query.maxPrice !== undefined && pack.price > query.maxPrice) return false
    if (query.onSale === 'true' && !(pack.mrp > pack.price)) return false
    return true
  })
  const off = (item) => {
    const pack = feat(item)
    return pack ? 1 - pack.price / pack.mrp : 0
  }
  // Reviewed products lead, best rated first. The rest are shuffled per shopper (or per day without a seed).
  const seed = query.seed || new Date().toISOString().slice(0, 10)
  const rated = (item) => item.reviewCount > 0 && item.rating > 0
  const byReviews = (a, b) => {
    if (rated(a) !== rated(b)) return rated(a) ? -1 : 1
    if (rated(a)) return b.rating - a.rating || b.reviewCount - a.reviewCount || b.sold - a.sold
    return shuffleKey(seed, a.id) - shuffleKey(seed, b.id)
  }
  items.sort((a, b) => {
    switch (query.sort) {
      case 'price-asc':
        return feat(a).price - feat(b).price
      case 'price-desc':
        return feat(b).price - feat(a).price
      case 'discount':
        return off(b) - off(a)
      default:
        return byReviews(a, b)
    }
  })
  const total = items.length
  const pages = Math.max(1, Math.ceil(total / query.pageSize))
  const page = Math.min(query.page, pages)
  res.json({
    items: items.slice((page - 1) * query.pageSize, page * query.pageSize),
    total,
    page,
    pages,
  })
})
catalogRouter.get('/products/:slug', async (req, res) => {
  const [offers, products] = await Promise.all([displayOffers(), activeProducts()])
  const product = products.find((item) => item.slug === String(req.params.slug))
  if (!product) throw notFound('Product')
  const related = products
    .filter((item) => item.id !== product.id && item.categoryId === product.categoryId)
    .sort((a, b) => b.sold - a.sold)
    .slice(0, 4)
  res.json({
    product: serializeProduct(product, offers),
    related: related.map((item) => serializeProduct(item, offers)),
  })
})
/** Recent approved 4 and 5 star reviews with a comment, for the home page. Empty until customers write some. */
catalogRouter.get('/reviews/featured', async (_req, res) => {
  const items = await rows(
    from('Review')
      .select('id, name, city, rating, comment, verified, createdAt, product:Product(name, slug)')
      .eq('status', 'APPROVED')
      .gte('rating', 4)
      .neq('comment', '')
      .order('createdAt', { ascending: false })
      .limit(6),
  )
  res.json({ items })
})
catalogRouter.get('/products/:slug/reviews', async (req, res) => {
  const product = await maybe(from('Product').select('id').eq('slug', String(req.params.slug)).maybeSingle())
  if (!product) throw notFound('Product')
  const items = await rows(
    from('Review')
      .select('*')
      .eq('productId', product.id)
      .eq('status', 'APPROVED')
      .order('createdAt', {
        ascending: false,
      })
      .limit(50),
  )
  res.json({
    items,
  })
})
catalogRouter.post('/products/:slug/review-images', requireAuth, reviewImageUpload.array('images', 4), async (req, res) => {
  const files = req.files ?? []
  if (!files.length) throw badRequest('Choose a JPG, PNG or WebP photo')
  const urls = []
  for (const file of files) urls.push(await storeImage(file, 'review'))
  res.status(201).json({
    urls,
  })
})
catalogRouter.post('/products/:slug/reviews', requireAuth, async (req, res) => {
  const data = z
    .object({
      rating: z.number().int().min(1).max(5),
      comment: z.string().trim().min(5).max(1000),
      city: z.string().trim().max(60).optional(),
      images: z.array(z.string().trim().max(500)).max(4).default([]),
    })
    .parse(req.body)
  if (data.images.some((url) => !url.includes('/storage/v1/object/public/review-images/'))) {
    throw badRequest('Review photos must be uploaded from this page')
  }
  const product = await maybe(from('Product').select('id').eq('slug', String(req.params.slug)).maybeSingle())
  if (!product) throw notFound('Product')
  const userId = actor(req).id
  const user = await findAccountById(userId)
  if (!user) throw notFound('Account')
  const orders = await rows(from('Order').select('id').eq('userId', userId).in('status', ['DELIVERED', 'SHIPPED', 'OUT_FOR_DELIVERY']))
  const purchased = orders.length
    ? (
        await rows(
          from('OrderItem')
            .select('id')
            .eq('productId', product.id)
            .in(
              'orderId',
              orders.map((order) => order.id),
            )
            .limit(1),
        )
      ).length > 0
    : false
  const review = await rows(
    from('Review')
      .insert({
        productId: product.id,
        userId,
        name: user.name,
        city: data.city ?? 'India',
        rating: data.rating,
        comment: data.comment,
        verified: purchased,
        ...(data.images.length
          ? {
              images: data.images,
            }
          : {}),
      })
      .select(),
  )
  res.status(201).json({
    review: review[0],
    message: 'Thanks! Your review will appear once it is approved.',
  })
})
catalogRouter.get('/categories', async (_req, res) => {
  const [categories, products] = await Promise.all([activeCategories(), activeProducts()])
  const countOf = (id) => products.filter((product) => product.categoryId === id || product.subcategoryId === id).length
  res.json({
    items: categories
      .filter((category) => !category.parentId)
      .map((category) => ({
        id: category.id,
        name: category.name,
        tagline: category.tagline,
        description: category.description ?? '',
        metaTitle: category.metaTitle ?? '',
        metaDescription: category.metaDescription ?? '',
        image: category.image,
        art: category.art,
        productCount: countOf(category.id),
        subcategories: categories
          .filter((child) => child.parentId === category.id)
          .map((child) => ({
            id: child.id,
            name: child.name,
            description: child.description ?? '',
            metaTitle: child.metaTitle ?? '',
            metaDescription: child.metaDescription ?? '',
            productCount: countOf(child.id),
          })),
      })),
  })
})
catalogRouter.get('/offers', async (_req, res) => {
  const [offers, products] = await Promise.all([displayOffers(), activeProducts()])
  const deals = products
    .map((product) => serializeProduct(product, offers))
    .map((product) => {
      const best = product.packs
        .map((pack) => ({
          pack,
          off: Math.round((1 - pack.price / pack.mrp) * 100),
        }))
        .sort((a, b) => b.off - a.off)[0]
      return {
        product,
        bestPack: best?.pack ?? null,
        discountPercent: best?.off ?? 0,
      }
    })
    .filter((deal) => deal.discountPercent > 0)
    .sort((a, b) => b.discountPercent - a.discountPercent)
  res.json({
    offers: offers.map((offer) => ({
      id: offer.id,
      name: offer.name,
      badge: offer.badge,
      type: offer.type,
      value: offer.value,
      endsAt: offer.endsAt,
    })),
    deals,
    maxDiscount: deals[0]?.discountPercent ?? 0,
  })
})
catalogRouter.get('/coupons/active', async (_req, res) => {
  const now = Date.now()
  const items = await activeCoupons()
  res.json({
    items: items
      .filter((coupon) => (!coupon.startsAt || new Date(coupon.startsAt).getTime() <= now) && (!coupon.endsAt || new Date(coupon.endsAt).getTime() >= now))
      .filter((coupon) => coupon.usageLimit === null || coupon.usedCount < coupon.usageLimit)
      .map((coupon) => ({
        code: coupon.code,
        label: coupon.label,
        type: coupon.type,
        value: coupon.value,
        minOrder: coupon.minOrder,
        endsAt: coupon.endsAt,
      })),
  })
})
catalogRouter.get('/banners', async (req, res) => {
  const placement = z.enum(['HERO', 'PROMO']).optional().parse(req.query.placement)
  const now = Date.now()
  const items = (await activeBanners()).filter(
    (banner) =>
      (!placement || banner.placement === placement) &&
      (!banner.startsAt || new Date(banner.startsAt).getTime() <= now) &&
      (!banner.endsAt || new Date(banner.endsAt).getTime() >= now),
  )
  res.json({
    items,
  })
})
catalogRouter.get('/settings/public', async (_req, res) => {
  const s = await publicSettings()
  res.json({
    storeName: s.storeName,
    supportEmail: s.supportEmail,
    supportPhone: s.supportPhone,
    address: s.address,
    freeShippingThreshold: s.freeShippingThreshold,
    shippingFee: s.shippingFee,
    codEnabled: s.codEnabled,
    codMaxOrder: s.codMaxOrder,
    paymentProvider: env.PAYMENT_PROVIDER,
    paymentTestMode: env.PAYMENT_PROVIDER === 'razorpay' && (env.RAZORPAY_KEY_ID ?? '').startsWith('rzp_test_'),
  })
})
catalogRouter.post('/cart/quote', async (req, res) => {
  const data = z
    .object({
      items: z
        .array(
          z.object({
            variantId: z.string(),
            quantity: z.number().int().min(1).max(99),
          }),
        )
        .min(1)
        .max(50),
      couponCode: z.string().trim().max(40).nullish(),
    })
    .parse(req.body)
  res.json(await buildQuote(data.items, data.couponCode, req.auth?.id))
})
