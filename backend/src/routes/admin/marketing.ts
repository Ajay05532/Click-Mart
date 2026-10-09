import { Router } from 'express'
import { z } from 'zod'
import { audit } from '../../lib/audit.js'
import { notFound } from '../../lib/errors.js'
import { from, count, db, exec, maybe, one, rows, rpc  } from '../../lib/db.js'
import type { Coupon, Offer } from '../../lib/types.js'
import { actor, adminOnly } from '../../middleware/auth.js'

export const adminMarketingRouter = Router()

const date = z.coerce.date().nullish()
const ids = z.array(z.string()).default([])

const offerSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    badge: z.string().trim().max(30).nullish(),
    type: z.enum(['PERCENT', 'FLAT']).default('PERCENT'),
    value: z.number().int().min(1),
    startsAt: date,
    endsAt: date,
    isActive: z.boolean().default(true),
    categoryIds: ids,
    productIds: ids,
  })
  .superRefine((data, ctx) => {
    if (data.type === 'PERCENT' && data.value > 90) ctx.addIssue({ code: 'custom', path: ['value'], message: 'Percent offers cannot exceed 90%' })
    if (data.startsAt && data.endsAt && data.endsAt <= data.startsAt) ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'End date must be after the start date' })
  })

adminMarketingRouter.get('/offers', async (_req, res) => {
  res.json({ items: await rows(from('Offer').select('*').order('createdAt', { ascending: false })) })
})
adminMarketingRouter.post('/offers', async (req, res) => {
  const { badge, ...data } = offerSchema.parse(req.body)
  const offer = await one<Offer>(from('Offer').insert({ ...data, badge: badge ?? null }).select().single())
  await rpc('set_offer_targets', { p_offer_id: offer.id, p_product_ids: data.productIds, p_category_ids: data.categoryIds })
  await audit(actor(req).id, 'offer.create', 'Offer', offer.id, data)
  res.status(201).json({ offer })
})
adminMarketingRouter.patch('/offers/:id', async (req, res) => {
  const existing = await maybe<Offer>(from('Offer').select('*').eq('id', String(req.params.id)).maybeSingle())
  if (!existing) throw notFound('Offer')
  const data = offerSchema.parse({ ...existing, ...req.body })
  const offer = await one<Offer>(from('Offer').update({ ...data, badge: data.badge ?? null }).eq('id', existing.id).select().single())
  await rpc('set_offer_targets', { p_offer_id: offer.id, p_product_ids: data.productIds, p_category_ids: data.categoryIds })
  await audit(actor(req).id, 'offer.update', 'Offer', offer.id, req.body)
  res.json({ offer })
})
adminMarketingRouter.delete('/offers/:id', async (req, res) => {
  await exec(from('Offer').delete().eq('id', String(req.params.id)))
  await audit(actor(req).id, 'offer.delete', 'Offer', String(req.params.id))
  res.json({ deleted: true })
})

// Coupons change what customers pay, so they are admin-only.
const couponSchema = z
  .object({
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,20}$/, 'Use 3-20 letters or numbers'),
    label: z.string().trim().min(2).max(100),
    type: z.enum(['PERCENT', 'FLAT', 'FREE_SHIPPING']),
    value: z.number().int().min(0).default(0),
    minOrder: z.number().int().min(0).default(0),
    maxDiscount: z.number().int().min(1).nullish(),
    startsAt: date,
    endsAt: date,
    usageLimit: z.number().int().min(1).nullish(),
    perUserLimit: z.number().int().min(1).nullish(),
    categoryIds: ids,
    productIds: ids,
    isActive: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    if (data.type !== 'FREE_SHIPPING' && data.value < 1) ctx.addIssue({ code: 'custom', path: ['value'], message: 'Enter a discount value' })
    if (data.type === 'PERCENT' && data.value > 100) ctx.addIssue({ code: 'custom', path: ['value'], message: 'Percent cannot exceed 100' })
    if (data.startsAt && data.endsAt && data.endsAt <= data.startsAt) ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'End date must be after the start date' })
  })

adminMarketingRouter.get('/coupons', adminOnly, async (_req, res) => {
  res.json({ items: await rows(from('Coupon').select('*').order('createdAt', { ascending: false })) })
})
adminMarketingRouter.post('/coupons', adminOnly, async (req, res) => {
  const data = couponSchema.parse(req.body)
  const coupon = await one<Coupon>(from('Coupon').insert({ ...data, maxDiscount: data.maxDiscount ?? null, usageLimit: data.usageLimit ?? null, perUserLimit: data.perUserLimit ?? null }).select().single())
  await rpc('set_coupon_targets', { p_coupon_id: coupon.id, p_product_ids: data.productIds, p_category_ids: data.categoryIds })
  await audit(actor(req).id, 'coupon.create', 'Coupon', coupon.id, { code: coupon.code })
  res.status(201).json({ coupon })
})
adminMarketingRouter.patch('/coupons/:id', adminOnly, async (req, res) => {
  const existing = await maybe<Coupon>(from('Coupon').select('*').eq('id', String(req.params.id)).maybeSingle())
  if (!existing) throw notFound('Coupon')
  const data = couponSchema.parse({ ...existing, ...req.body })
  const coupon = await one<Coupon>(from('Coupon').update({ ...data, maxDiscount: data.maxDiscount ?? null, usageLimit: data.usageLimit ?? null, perUserLimit: data.perUserLimit ?? null }).eq('id', existing.id).select().single())
  await rpc('set_coupon_targets', { p_coupon_id: coupon.id, p_product_ids: data.productIds, p_category_ids: data.categoryIds })
  await audit(actor(req).id, 'coupon.update', 'Coupon', coupon.id, req.body)
  res.json({ coupon })
})
adminMarketingRouter.delete('/coupons/:id', adminOnly, async (req, res) => {
  const used = await count(from('CouponRedemption').select('id', { count: 'exact', head: true }).eq('couponId', String(req.params.id)))
  if (used > 0) {
    await exec(from('Coupon').update({ isActive: false }).eq('id', String(req.params.id)))
    return res.json({ archived: true, message: 'This coupon was used on orders, so it was deactivated instead of deleted.' })
  }
  await exec(from('Coupon').delete().eq('id', String(req.params.id)))
  res.json({ deleted: true })
})

const bannerSchema = z.object({
  title: z.string().trim().min(2).max(100),
  subtitle: z.string().max(200).default(''),
  image: z.string().max(500).nullish(),
  link: z.string().max(300).default('/shop'),
  placement: z.enum(['HERO', 'PROMO']).default('HERO'),
  sortOrder: z.number().int().default(0),
  startsAt: date,
  endsAt: date,
  isActive: z.boolean().default(true),
})

adminMarketingRouter.get('/banners', async (_req, res) => {
  res.json({ items: await rows(from('Banner').select('*').order('placement').order('sortOrder')) })
})
adminMarketingRouter.post('/banners', async (req, res) => {
  const data = bannerSchema.parse(req.body)
  const banner = await one<{ id: string }>(from('Banner').insert({ ...data, image: data.image ?? null }).select().single())
  await audit(actor(req).id, 'banner.create', 'Banner', banner.id)
  res.status(201).json({ banner })
})
adminMarketingRouter.patch('/banners/:id', async (req, res) => {
  const data = bannerSchema.partial().parse(req.body)
  const banner = await one<{ id: string }>(from('Banner').update({ ...data, ...(data.image === undefined ? {} : { image: data.image }) }).eq('id', String(req.params.id)).select().single())
  await audit(actor(req).id, 'banner.update', 'Banner', banner.id, data)
  res.json({ banner })
})
adminMarketingRouter.delete('/banners/:id', async (req, res) => {
  await exec(from('Banner').delete().eq('id', String(req.params.id)))
  res.json({ deleted: true })
})

// ---- Reviews moderation ----
adminMarketingRouter.get('/reviews', async (req, res) => {
  const status = z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional().parse(req.query.status)
  let request = from('Review').select('*, product:Product(name, slug)').order('createdAt', { ascending: false }).limit(200)
  if (status) request = request.eq('status', status)
  res.json({ items: await rows(request) })
})
adminMarketingRouter.patch('/reviews/:id', async (req, res) => {
  const data = z.object({ status: z.enum(['APPROVED', 'REJECTED', 'PENDING']) }).parse(req.body)
  const review = await one<{ id: string; productId: string }>(from('Review').update(data).eq('id', String(req.params.id)).select().single())
  await rpc('recompute_rating', { p_product_id: review.productId })
  await audit(actor(req).id, `review.${data.status.toLowerCase()}`, 'Review', review.id)
  res.json({ review })
})
adminMarketingRouter.delete('/reviews/:id', async (req, res) => {
  const review = await one<{ id: string; productId: string }>(from('Review').delete().eq('id', String(req.params.id)).select().single())
  await rpc('recompute_rating', { p_product_id: review.productId })
  res.json({ deleted: true })
})
