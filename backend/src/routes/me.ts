import { Router } from 'express'
import { z } from 'zod'
import { notFound } from '../lib/errors.js'
import { prisma } from '../lib/prisma.js'
import { actor, requireAuth } from '../middleware/auth.js'
import { publicUser } from './auth.js'

export const meRouter = Router()
meRouter.use(requireAuth)

meRouter.get('/', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: actor(req).id } })
  if (!user) throw notFound('User')
  res.json({ user: publicUser(user) })
})

meRouter.patch('/', async (req, res) => {
  const data = z
    .object({
      name: z.string().trim().min(2).max(80).optional(),
      phone: z.string().regex(/^[6-9]\d{9}$/).nullable().optional(),
    })
    .parse(req.body)
  const user = await prisma.user.update({ where: { id: actor(req).id }, data })
  res.json({ user: publicUser(user) })
})

const addressSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'),
  line: z.string().trim().min(8).max(250),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(60),
  pin: z.string().regex(/^\d{6}$/, 'Enter a 6-digit PIN code'),
  isDefault: z.boolean().default(false),
})

meRouter.get('/addresses', async (req, res) => {
  res.json({
    items: await prisma.address.findMany({ where: { userId: actor(req).id }, orderBy: [{ isDefault: 'desc' }, { id: 'asc' }] }),
  })
})

meRouter.post('/addresses', async (req, res) => {
  const data = addressSchema.parse(req.body)
  const userId = actor(req).id
  const first = (await prisma.address.count({ where: { userId } })) === 0
  const address = await prisma.$transaction(async (tx) => {
    const makeDefault = data.isDefault || first
    if (makeDefault) await tx.address.updateMany({ where: { userId }, data: { isDefault: false } })
    return tx.address.create({ data: { ...data, isDefault: makeDefault, userId } })
  })
  res.status(201).json(address)
})

meRouter.put('/addresses/:id', async (req, res) => {
  const data = addressSchema.parse(req.body)
  const userId = actor(req).id
  const existing = await prisma.address.findFirst({ where: { id: String(req.params.id), userId } })
  if (!existing) throw notFound('Address')
  const address = await prisma.$transaction(async (tx) => {
    if (data.isDefault) await tx.address.updateMany({ where: { userId }, data: { isDefault: false } })
    return tx.address.update({ where: { id: existing.id }, data })
  })
  res.json(address)
})

meRouter.delete('/addresses/:id', async (req, res) => {
  const result = await prisma.address.deleteMany({ where: { id: String(req.params.id), userId: actor(req).id } })
  if (result.count === 0) throw notFound('Address')
  res.status(204).end()
})

// Wishlist
meRouter.get('/wishlist', async (req, res) => {
  const rows = await prisma.wishlistItem.findMany({ where: { userId: actor(req).id }, orderBy: { createdAt: 'desc' } })
  res.json({ productIds: rows.map((row) => row.productId) })
})

meRouter.put('/wishlist/:productId', async (req, res) => {
  const product = await prisma.product.findUnique({ where: { id: String(req.params.productId) } })
  if (!product) throw notFound('Product')
  await prisma.wishlistItem.upsert({
    where: { userId_productId: { userId: actor(req).id, productId: product.id } },
    update: {},
    create: { userId: actor(req).id, productId: product.id },
  })
  res.status(204).end()
})

meRouter.delete('/wishlist/:productId', async (req, res) => {
  await prisma.wishlistItem.deleteMany({ where: { userId: actor(req).id, productId: String(req.params.productId) } })
  res.status(204).end()
})

// Persisted cart (the storefront merges its guest cart on login)
const cartSchema = z.object({
  items: z.array(z.object({ variantId: z.string(), quantity: z.number().int().min(1).max(99) })).max(50),
})

async function loadCart(userId: string) {
  const rows = await prisma.cartItem.findMany({ where: { userId }, include: { variant: { include: { product: true } } } })
  return rows.map((row) => ({
    variantId: row.variantId,
    quantity: Math.min(row.quantity, row.variant.stock),
    productId: row.variant.productId,
    name: row.variant.product.name,
    size: row.variant.size,
  }))
}

meRouter.get('/cart', async (req, res) => res.json({ items: await loadCart(actor(req).id) }))

meRouter.put('/cart', async (req, res) => {
  const { items } = cartSchema.parse(req.body)
  const userId = actor(req).id
  const known = await prisma.productVariant.findMany({ where: { id: { in: items.map((item) => item.variantId) }, isActive: true }, select: { id: true } })
  const valid = new Set(known.map((variant) => variant.id))
  await prisma.$transaction([
    prisma.cartItem.deleteMany({ where: { userId } }),
    prisma.cartItem.createMany({
      data: items.filter((item) => valid.has(item.variantId)).map((item) => ({ userId, variantId: item.variantId, quantity: item.quantity })),
      skipDuplicates: true,
    }),
  ])
  res.json({ items: await loadCart(userId) })
})
