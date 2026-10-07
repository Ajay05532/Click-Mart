import { Router } from 'express'
import { z } from 'zod'
import { audit } from '../../lib/audit.js'
import { badRequest, conflict, notFound } from '../../lib/errors.js'
import { prisma } from '../../lib/prisma.js'
import { slugify } from '../../lib/slug.js'
import { getSettings } from '../../lib/settings.js'
import { actor, adminOnly } from '../../middleware/auth.js'
import type { Prisma } from '@prisma/client'

export const adminCatalogRouter = Router()

const variantSchema = z.object({
  size: z.string().trim().min(1).max(20),
  price: z.number().int().min(1),
  mrp: z.number().int().min(1),
  stock: z.number().int().min(0).default(0),
  lowStockAt: z.number().int().min(0).optional(),
  sku: z.string().trim().max(60).optional(),
  isActive: z.boolean().default(true),
})

const productFields = {
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().max(100).optional(),
  categoryId: z.string().min(1),
  subcategoryId: z.string().nullish(),
  blurb: z.string().max(400).default(''),
  description: z.string().max(5000).default(''),
  highlights: z.array(z.string().max(200)).max(10).default([]),
  nutrition: z.array(z.object({ label: z.string().max(60), value: z.string().max(60) })).max(20).default([]),
  images: z.array(z.string().max(500)).max(8).default([]),
  art: z.string().max(20).default('mix'),
  isActive: z.boolean().default(true),
  isBestseller: z.boolean().default(false),
  featuredSize: z.string().nullish(),
}

const createSchema = z
  .object({ ...productFields, variants: z.array(variantSchema).min(1, 'Add at least one pack size').max(12) })
  .superRefine((data, ctx) => {
    data.variants.forEach((variant, index) => {
      if (variant.mrp < variant.price) ctx.addIssue({ code: 'custom', path: ['variants', index, 'mrp'], message: 'MRP cannot be lower than the selling price' })
    })
    const sizes = data.variants.map((variant) => variant.size.toLowerCase())
    if (new Set(sizes).size !== sizes.length) ctx.addIssue({ code: 'custom', path: ['variants'], message: 'Each pack size can only appear once' })
  })

const sku = (slug: string, size: string) => `${slug}-${size}`.toUpperCase().replace(/[^A-Z0-9]+/g, '-')

async function assertCategory(categoryId: string, subcategoryId?: string | null) {
  const category = await prisma.category.findUnique({ where: { id: categoryId } })
  if (!category || category.parentId) throw badRequest('Choose a valid category')
  if (subcategoryId) {
    const sub = await prisma.category.findUnique({ where: { id: subcategoryId } })
    if (!sub || sub.parentId !== categoryId) throw badRequest('That subcategory does not belong to the chosen category')
  }
}

adminCatalogRouter.get('/products', async (req, res) => {
  const q = z
    .object({
      q: z.string().trim().optional(),
      category: z.string().optional(),
      status: z.enum(['active', 'inactive', 'lowstock', 'out']).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
    })
    .parse(req.query)
  const settings = await getSettings()
  const where: Prisma.ProductWhereInput = {}
  if (q.q) where.OR = [{ name: { contains: q.q, mode: 'insensitive' } }, { slug: { contains: q.q, mode: 'insensitive' } }]
  if (q.category) where.categoryId = q.category
  if (q.status === 'active') where.isActive = true
  if (q.status === 'inactive') where.isActive = false
  if (q.status === 'out') where.variants = { none: { stock: { gt: 0 } } }
  const [rows, total] = await Promise.all([
    prisma.product.findMany({ where, include: { variants: { orderBy: { sortOrder: 'asc' } }, category: true }, orderBy: { updatedAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.product.count({ where }),
  ])
  let items = rows.map((product) => ({
    ...product,
    stock: product.variants.reduce((sum, variant) => sum + variant.stock, 0),
    lowStock: product.variants.some((variant) => variant.stock <= (variant.lowStockAt ?? settings.lowStockDefault)),
  }))
  if (q.status === 'lowstock') items = items.filter((item) => item.lowStock)
  res.json({ items, total, page: q.page, pages: Math.max(1, Math.ceil(total / q.pageSize)) })
})

adminCatalogRouter.get('/products/:id', async (req, res) => {
  const product = await prisma.product.findUnique({ where: { id: String(req.params.id) }, include: { variants: { orderBy: { sortOrder: 'asc' } }, category: true } })
  if (!product) throw notFound('Product')
  res.json({ product })
})

adminCatalogRouter.post('/products', async (req, res) => {
  const data = createSchema.parse(req.body)
  await assertCategory(data.categoryId, data.subcategoryId)
  const slug = slugify(data.slug || data.name)
  if (await prisma.product.findUnique({ where: { slug } })) throw conflict('A product with this URL name already exists')
  const { variants, ...rest } = data
  const product = await prisma.product.create({
    data: {
      ...rest,
      slug,
      featuredSize: data.featuredSize ?? variants[0]!.size,
      variants: {
        create: variants.map((variant, index) => ({
          ...variant,
          sku: variant.sku || sku(slug, variant.size),
          lowStockAt: variant.lowStockAt ?? 10,
          sortOrder: index,
        })),
      },
    },
    include: { variants: true },
  })
  for (const variant of product.variants) {
    if (variant.stock > 0) {
      await prisma.stockMovement.create({ data: { variantId: variant.id, delta: variant.stock, reason: 'RESTOCK', note: 'Opening stock', balance: variant.stock, userId: actor(req).id } })
    }
  }
  await audit(actor(req).id, 'product.create', 'Product', product.id, { name: product.name })
  res.status(201).json({ product })
})

adminCatalogRouter.patch('/products/:id', async (req, res) => {
  const data = z.object(productFields).partial().parse(req.body)
  const existing = await prisma.product.findUnique({ where: { id: String(req.params.id) } })
  if (!existing) throw notFound('Product')
  if (data.categoryId || data.subcategoryId !== undefined) {
    await assertCategory(data.categoryId ?? existing.categoryId, data.subcategoryId === undefined ? existing.subcategoryId : data.subcategoryId)
  }
  const slug = data.slug ? slugify(data.slug) : undefined
  if (slug && slug !== existing.slug && (await prisma.product.findUnique({ where: { slug } }))) throw conflict('A product with this URL name already exists')
  const product = await prisma.product.update({ where: { id: existing.id }, data: { ...data, slug }, include: { variants: true } })
  await audit(actor(req).id, 'product.update', 'Product', product.id, data)
  res.json({ product })
})

adminCatalogRouter.delete('/products/:id', adminOnly, async (req, res) => {
  const used = await prisma.orderItem.count({ where: { productId: String(req.params.id) } })
  if (used > 0) {
    // Past orders keep their snapshots, but hiding is safer than deleting something that has sold.
    await prisma.product.update({ where: { id: String(req.params.id) }, data: { isActive: false } })
    await audit(actor(req).id, 'product.archive', 'Product', String(req.params.id))
    return res.json({ archived: true, message: 'This product has orders, so it was hidden instead of deleted.' })
  }
  await prisma.product.delete({ where: { id: String(req.params.id) } })
  await audit(actor(req).id, 'product.delete', 'Product', String(req.params.id))
  res.json({ deleted: true })
})

adminCatalogRouter.post('/products/bulk', async (req, res) => {
  const data = z
    .object({
      ids: z.array(z.string()).min(1).max(200),
      action: z.enum(['activate', 'deactivate', 'bestseller', 'unbestseller', 'priceChange']),
      percent: z.number().min(-90).max(200).optional(),
    })
    .parse(req.body)
  const where = { id: { in: data.ids } }
  if (data.action === 'activate') await prisma.product.updateMany({ where, data: { isActive: true } })
  if (data.action === 'deactivate') await prisma.product.updateMany({ where, data: { isActive: false } })
  if (data.action === 'bestseller') await prisma.product.updateMany({ where, data: { isBestseller: true } })
  if (data.action === 'unbestseller') await prisma.product.updateMany({ where, data: { isBestseller: false } })
  if (data.action === 'priceChange') {
    if (data.percent === undefined) throw badRequest('percent is required')
    const variants = await prisma.productVariant.findMany({ where: { productId: { in: data.ids } } })
    await prisma.$transaction(
      variants.map((variant) => {
        const price = Math.max(1, Math.round((variant.price * (100 + data.percent!)) / 100))
        return prisma.productVariant.update({ where: { id: variant.id }, data: { price, mrp: Math.max(variant.mrp, price) } })
      }),
    )
  }
  await audit(actor(req).id, `product.bulk.${data.action}`, 'Product', undefined, data)
  res.json({ updated: data.ids.length })
})

// ---- Variants and stock ----
adminCatalogRouter.post('/products/:id/variants', async (req, res) => {
  const data = variantSchema.parse(req.body)
  if (data.mrp < data.price) throw badRequest('MRP cannot be lower than the selling price')
  const product = await prisma.product.findUnique({ where: { id: String(req.params.id) }, include: { variants: true } })
  if (!product) throw notFound('Product')
  const variant = await prisma.productVariant.create({
    data: { ...data, productId: product.id, sku: data.sku || sku(product.slug, data.size), lowStockAt: data.lowStockAt ?? 10, sortOrder: product.variants.length },
  })
  if (variant.stock > 0) {
    await prisma.stockMovement.create({ data: { variantId: variant.id, delta: variant.stock, reason: 'RESTOCK', note: 'Opening stock', balance: variant.stock, userId: actor(req).id } })
  }
  await audit(actor(req).id, 'variant.create', 'ProductVariant', variant.id)
  res.status(201).json({ variant })
})

adminCatalogRouter.patch('/variants/:id', async (req, res) => {
  // Stock is changed only through the stock endpoint so every change is logged.
  const data = variantSchema.omit({ stock: true }).partial().parse(req.body)
  const existing = await prisma.productVariant.findUnique({ where: { id: String(req.params.id) } })
  if (!existing) throw notFound('Variant')
  if ((data.mrp ?? existing.mrp) < (data.price ?? existing.price)) throw badRequest('MRP cannot be lower than the selling price')
  const variant = await prisma.productVariant.update({ where: { id: existing.id }, data })
  await audit(actor(req).id, 'variant.update', 'ProductVariant', variant.id, data)
  res.json({ variant })
})

adminCatalogRouter.delete('/variants/:id', async (req, res) => {
  const variant = await prisma.productVariant.findUnique({ where: { id: String(req.params.id) }, include: { product: { include: { variants: true } } } })
  if (!variant) throw notFound('Variant')
  if (variant.product.variants.length === 1) throw badRequest('A product needs at least one pack size')
  const sold = await prisma.orderItem.count({ where: { variantId: variant.id } })
  if (sold > 0) {
    await prisma.productVariant.update({ where: { id: variant.id }, data: { isActive: false } })
    return res.json({ archived: true })
  }
  await prisma.productVariant.delete({ where: { id: variant.id } })
  res.json({ deleted: true })
})

adminCatalogRouter.post('/variants/:id/stock', async (req, res) => {
  const data = z
    .object({
      mode: z.enum(['set', 'adjust']),
      quantity: z.number().int(),
      reason: z.enum(['RESTOCK', 'ADJUSTMENT', 'RETURN']).default('ADJUSTMENT'),
      note: z.string().max(200).optional(),
    })
    .parse(req.body)
  const result = await prisma.$transaction(async (tx) => {
    const variant = await tx.productVariant.findUnique({ where: { id: String(req.params.id) } })
    if (!variant) throw notFound('Variant')
    const delta = data.mode === 'set' ? data.quantity - variant.stock : data.quantity
    if (variant.stock + delta < 0) throw badRequest(`Only ${variant.stock} in stock, cannot remove ${-delta}`)
    if (data.mode === 'set' && data.quantity < 0) throw badRequest('Stock cannot be negative')
    if (delta === 0) return variant
    // Conditional update keeps the balance right even if a sale lands at the same moment.
    const updated = await tx.productVariant.updateMany({
      where: { id: variant.id, stock: { gte: delta < 0 ? -delta : 0 } },
      data: { stock: { increment: delta } },
    })
    if (updated.count === 0) throw conflict('Stock changed while you were editing. Refresh and try again.')
    const fresh = await tx.productVariant.findUniqueOrThrow({ where: { id: variant.id } })
    await tx.stockMovement.create({
      data: { variantId: variant.id, delta, reason: data.reason, note: data.note, balance: fresh.stock, userId: actor(req).id },
    })
    return fresh
  })
  await audit(actor(req).id, 'stock.change', 'ProductVariant', result.id, data)
  res.json({ variant: result })
})

adminCatalogRouter.get('/inventory', async (req, res) => {
  const q = z
    .object({
      filter: z.enum(['all', 'low', 'out']).default('all'),
      q: z.string().trim().optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(200).default(50),
    })
    .parse(req.query)
  const rows = await prisma.productVariant.findMany({
    where: { product: q.q ? { name: { contains: q.q, mode: 'insensitive' } } : undefined },
    include: { product: { select: { id: true, name: true, slug: true, images: true, art: true, isActive: true } } },
    orderBy: [{ stock: 'asc' }, { sku: 'asc' }],
  })
  const filtered = rows.filter((variant) => (q.filter === 'out' ? variant.stock === 0 : q.filter === 'low' ? variant.stock <= variant.lowStockAt : true))
  res.json({
    items: filtered.slice((q.page - 1) * q.pageSize, q.page * q.pageSize),
    total: filtered.length,
    summary: { out: rows.filter((v) => v.stock === 0).length, low: rows.filter((v) => v.stock > 0 && v.stock <= v.lowStockAt).length, variants: rows.length },
  })
})

adminCatalogRouter.get('/inventory/:variantId/history', async (req, res) => {
  const items = await prisma.stockMovement.findMany({
    where: { variantId: String(req.params.variantId) },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  res.json({ items })
})

// ---- Categories ----
const categorySchema = z.object({
  name: z.string().trim().min(2).max(60),
  id: z.string().trim().max(60).optional(),
  tagline: z.string().max(120).default(''),
  image: z.string().max(500).nullish(),
  art: z.string().max(20).default('mix'),
  parentId: z.string().nullish(),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
})

adminCatalogRouter.get('/categories', async (_req, res) => {
  const items = await prisma.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], include: { _count: { select: { products: true, subProducts: true } } } })
  res.json({ items })
})

adminCatalogRouter.post('/categories', async (req, res) => {
  const data = categorySchema.parse(req.body)
  const id = slugify(data.id || data.name)
  if (data.parentId) {
    const parent = await prisma.category.findUnique({ where: { id: data.parentId } })
    if (!parent || parent.parentId) throw badRequest('Subcategories can only sit under a top-level category')
  }
  const category = await prisma.category.create({ data: { ...data, id } })
  await audit(actor(req).id, 'category.create', 'Category', id)
  res.status(201).json({ category })
})

adminCatalogRouter.patch('/categories/:id', async (req, res) => {
  const data = categorySchema.omit({ id: true }).partial().parse(req.body)
  if (data.parentId === String(req.params.id)) throw badRequest('A category cannot be its own parent')
  const category = await prisma.category.update({ where: { id: String(req.params.id) }, data })
  await audit(actor(req).id, 'category.update', 'Category', category.id, data)
  res.json({ category })
})

adminCatalogRouter.post('/categories/reorder', async (req, res) => {
  const data = z.object({ ids: z.array(z.string()).min(1) }).parse(req.body)
  await prisma.$transaction(data.ids.map((id, index) => prisma.category.update({ where: { id }, data: { sortOrder: index } })))
  res.json({ ok: true })
})

adminCatalogRouter.delete('/categories/:id', adminOnly, async (req, res) => {
  const used = await prisma.product.count({ where: { OR: [{ categoryId: String(req.params.id) }, { subcategoryId: String(req.params.id) }] } })
  if (used > 0) throw conflict(`${used} products still use this category. Move them first.`)
  await prisma.category.delete({ where: { id: String(req.params.id) } })
  await audit(actor(req).id, 'category.delete', 'Category', String(req.params.id))
  res.json({ deleted: true })
})
