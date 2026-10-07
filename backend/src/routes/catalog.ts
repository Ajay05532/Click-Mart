import { Router } from 'express'
import { z } from 'zod'
import { notFound } from '../lib/errors.js'
import { buildQuote, loadActiveOffers } from '../lib/pricing.js'
import { prisma } from '../lib/prisma.js'
import { serializeProduct } from '../lib/serializers.js'
import { getSettings } from '../lib/settings.js'
import { actor, requireAuth } from '../middleware/auth.js'
import type { Prisma } from '@prisma/client'

export const catalogRouter = Router()

const listQuery = z.object({
  category: z.union([z.string(), z.array(z.string())]).optional(),
  sub: z.string().optional(),
  q: z.string().trim().max(80).optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  size: z.union([z.string(), z.array(z.string())]).optional(),
  availability: z.enum(['in', 'out']).optional(),
  bestseller: z.enum(['true', 'false']).optional(),
  onSale: z.enum(['true', 'false']).optional(),
  sort: z.enum(['popular', 'price-asc', 'price-desc', 'rating', 'discount', 'newest']).default('popular'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(12),
})
const arr = (value?: string | string[]) => (value === undefined ? [] : Array.isArray(value) ? value : [value])

catalogRouter.get('/products', async (req, res) => {
  const query = listQuery.parse(req.query)
  const categories = arr(query.category)
  const sizes = arr(query.size)
  const where: Prisma.ProductWhereInput = { isActive: true, variants: { some: { isActive: true } } }
  const and: Prisma.ProductWhereInput[] = []
  if (categories.length) and.push({ categoryId: { in: categories } })
  if (query.sub) and.push({ subcategoryId: query.sub })
  if (query.q) {
    and.push({ OR: [{ name: { contains: query.q, mode: 'insensitive' } }, { blurb: { contains: query.q, mode: 'insensitive' } }] })
  }
  if (query.bestseller === 'true') and.push({ isBestseller: true })
  if (sizes.length) and.push({ variants: { some: { size: { in: sizes }, isActive: true } } })
  if (query.availability === 'in') and.push({ variants: { some: { stock: { gt: 0 }, isActive: true } } })
  if (query.availability === 'out') and.push({ variants: { none: { stock: { gt: 0 } } } })
  where.AND = and

  const [offers, rows] = await Promise.all([
    loadActiveOffers(),
    prisma.product.findMany({ where, include: { variants: true, category: true } }),
  ])
  let items = rows.map((row) => serializeProduct(row, offers))

  const feat = (item: (typeof items)[number]) => item.packs.find((pack) => pack.size === item.featuredSize) ?? item.packs[0]
  items = items.filter((item) => {
    const pack = feat(item)
    if (!pack) return false
    if (query.minPrice !== undefined && pack.price < query.minPrice) return false
    if (query.maxPrice !== undefined && pack.price > query.maxPrice) return false
    if (query.onSale === 'true' && !(pack.mrp > pack.price)) return false
    return true
  })

  const off = (item: (typeof items)[number]) => {
    const pack = feat(item)
    return pack ? 1 - pack.price / pack.mrp : 0
  }
  items.sort((a, b) => {
    switch (query.sort) {
      case 'price-asc':
        return feat(a)!.price - feat(b)!.price
      case 'price-desc':
        return feat(b)!.price - feat(a)!.price
      case 'rating':
        return b.rating - a.rating
      case 'discount':
        return off(b) - off(a)
      default:
        return b.sold - a.sold
    }
  })

  const total = items.length
  const pages = Math.max(1, Math.ceil(total / query.pageSize))
  const page = Math.min(query.page, pages)
  res.json({ items: items.slice((page - 1) * query.pageSize, page * query.pageSize), total, page, pages })
})

catalogRouter.get('/products/:slug', async (req, res) => {
  const [offers, product] = await Promise.all([
    loadActiveOffers(),
    prisma.product.findFirst({
      where: { slug: String(req.params.slug), isActive: true },
      include: { variants: true, category: true, subcategory: true },
    }),
  ])
  if (!product) throw notFound('Product')
  const related = await prisma.product.findMany({
    where: { isActive: true, id: { not: product.id }, categoryId: product.categoryId },
    include: { variants: true, category: true },
    orderBy: { sold: 'desc' },
    take: 4,
  })
  res.json({ product: serializeProduct(product, offers), related: related.map((item) => serializeProduct(item, offers)) })
})

catalogRouter.get('/products/:slug/reviews', async (req, res) => {
  const product = await prisma.product.findUnique({ where: { slug: String(req.params.slug) } })
  if (!product) throw notFound('Product')
  const items = await prisma.review.findMany({ where: { productId: product.id, status: 'APPROVED' }, orderBy: { createdAt: 'desc' }, take: 50 })
  res.json({ items })
})

catalogRouter.post('/products/:slug/reviews', requireAuth, async (req, res) => {
  const data = z
    .object({ rating: z.number().int().min(1).max(5), comment: z.string().trim().min(5).max(1000), city: z.string().trim().max(60).optional() })
    .parse(req.body)
  const product = await prisma.product.findUnique({ where: { slug: String(req.params.slug) } })
  if (!product) throw notFound('Product')
  const user = await prisma.user.findUniqueOrThrow({ where: { id: actor(req).id } })
  const purchased = await prisma.orderItem.count({
    where: { productId: product.id, order: { userId: user.id, status: { in: ['DELIVERED', 'SHIPPED', 'OUT_FOR_DELIVERY'] } } },
  })
  const review = await prisma.review.create({
    data: { productId: product.id, userId: user.id, name: user.name, city: data.city ?? 'India', rating: data.rating, comment: data.comment, verified: purchased > 0 },
  })
  res.status(201).json({ review, message: 'Thanks! Your review will appear once it is approved.' })
})

catalogRouter.get('/categories', async (_req, res) => {
  const [categories, counts] = await Promise.all([
    prisma.category.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    prisma.product.groupBy({ by: ['categoryId'], where: { isActive: true }, _count: true }),
  ])
  const subCounts = await prisma.product.groupBy({ by: ['subcategoryId'], where: { isActive: true, subcategoryId: { not: null } }, _count: true })
  const countOf = (id: string) => counts.find((row) => row.categoryId === id)?._count ?? subCounts.find((row) => row.subcategoryId === id)?._count ?? 0
  const top = categories.filter((category) => !category.parentId)
  res.json({
    items: top.map((category) => ({
      id: category.id,
      name: category.name,
      tagline: category.tagline,
      image: category.image,
      art: category.art,
      productCount: countOf(category.id),
      subcategories: categories
        .filter((child) => child.parentId === category.id)
        .map((child) => ({ id: child.id, name: child.name, productCount: countOf(child.id) })),
    })),
  })
})

// Everything currently on offer, grouped for the On Sale page.
catalogRouter.get('/offers', async (_req, res) => {
  const [offers, products] = await Promise.all([
    loadActiveOffers(),
    prisma.product.findMany({ where: { isActive: true }, include: { variants: true, category: true } }),
  ])
  const deals = products
    .map((product) => serializeProduct(product, offers))
    .map((product) => {
      const best = product.packs
        .map((pack) => ({ pack, off: Math.round((1 - pack.price / pack.mrp) * 100) }))
        .sort((a, b) => b.off - a.off)[0]
      return { product, bestPack: best?.pack ?? null, discountPercent: best?.off ?? 0 }
    })
    .filter((deal) => deal.discountPercent > 0)
    .sort((a, b) => b.discountPercent - a.discountPercent)
  res.json({
    offers: offers.map((offer) => ({ id: offer.id, name: offer.name, badge: offer.badge, type: offer.type, value: offer.value, endsAt: offer.endsAt })),
    deals,
    maxDiscount: deals[0]?.discountPercent ?? 0,
  })
})

catalogRouter.get('/coupons/active', async (_req, res) => {
  const now = new Date()
  const items = await prisma.coupon.findMany({
    where: {
      isActive: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    orderBy: { createdAt: 'desc' },
  })
  res.json({
    items: items
      .filter((coupon) => coupon.usageLimit === null || coupon.usedCount < coupon.usageLimit)
      .map((coupon) => ({ code: coupon.code, label: coupon.label, type: coupon.type, value: coupon.value, minOrder: coupon.minOrder, endsAt: coupon.endsAt })),
  })
})

catalogRouter.get('/banners', async (req, res) => {
  const placement = z.enum(['HERO', 'PROMO']).optional().parse(req.query.placement)
  const now = new Date()
  const items = await prisma.banner.findMany({
    where: {
      isActive: true,
      placement,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    orderBy: { sortOrder: 'asc' },
  })
  res.json({ items })
})

catalogRouter.get('/settings/public', async (_req, res) => {
  const s = await getSettings()
  res.json({
    storeName: s.storeName,
    supportEmail: s.supportEmail,
    supportPhone: s.supportPhone,
    address: s.address,
    freeShippingThreshold: s.freeShippingThreshold,
    shippingFee: s.shippingFee,
    codEnabled: s.codEnabled,
    codMaxOrder: s.codMaxOrder,
    paymentProvider: process.env.PAYMENT_PROVIDER ?? 'mock',
  })
})

// Price a cart (guest friendly): used by the cart and checkout summary.
catalogRouter.post('/cart/quote', async (req, res) => {
  const data = z
    .object({
      items: z.array(z.object({ variantId: z.string(), quantity: z.number().int().min(1).max(99) })).min(1).max(50),
      couponCode: z.string().trim().max(40).nullish(),
    })
    .parse(req.body)
  res.json(await buildQuote(data.items, data.couponCode, req.auth?.id))
})
