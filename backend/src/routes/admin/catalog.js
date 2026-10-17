import { Router } from 'express'
import { z } from 'zod'
import { peopleByIds } from '../../services/account.js'
import { audit } from '../../services/audit.js'
import { from, count, db, exec, maybe, one, rows, rpc, toHttpError } from '../../database/db.js'
import { badRequest, conflict, notFound } from '../../utils/errors.js'
import { slugify } from '../../utils/slug.js'
import { getSettings } from '../../services/settings.js'
import { actor, adminOnly } from '../../middleware/auth.js'
import { loadProductLinks } from '../../services/reports.js'
import { env } from '../../config/env.js'
import {
  assertBrand,
  assertCategory,
  createProduct,
  createSchema,
  like,
  productFields,
  productRow,
  sku,
  variantRow,
  withoutEmptySeo,
  variantSchema,
  weightFromSize,
} from '../../services/catalogWrite.js'
export const adminCatalogRouter = Router()
const PRODUCT_ADMIN_SELECT = '*, variants:ProductVariant(*), category:Category!categoryId(name), brand:Brand(id, name)'
adminCatalogRouter.get('/brands', async (req, res) => {
  let request = from('Brand').select('id, name, slug, isActive').order('name')
  if (req.query.all !== '1') request = request.eq('isActive', true)
  res.json({
    items: await rows(request),
  })
})
adminCatalogRouter.post('/brands', async (req, res) => {
  const data = z
    .object({
      name: z.string().trim().min(2).max(80),
    })
    .parse(req.body)
  const slug = slugify(data.name)
  if (await maybe(from('Brand').select('id').eq('slug', slug).maybeSingle())) throw conflict('A brand with this name already exists')
  const brand = await one(
    from('Brand')
      .insert({
        name: data.name,
        slug,
      })
      .select('id, name, slug, isActive')
      .single(),
  )
  await audit(actor(req).id, 'brand.create', 'Brand', brand.id, {
    name: data.name,
  })
  res.status(201).json({
    brand,
  })
})
adminCatalogRouter.patch('/brands/:id', async (req, res) => {
  const data = z
    .object({
      name: z.string().trim().min(2).max(80).optional(),
      isActive: z.boolean().optional(),
    })
    .parse(req.body)
  const id = String(req.params.id)
  const patch = {}
  if (data.name) {
    const slug = slugify(data.name)
    const taken = await maybe(from('Brand').select('id').eq('slug', slug).maybeSingle())
    if (taken && taken.id !== id) throw conflict('A brand with this name already exists')
    patch.name = data.name
    patch.slug = slug
  }
  if (data.isActive !== undefined) patch.isActive = data.isActive
  const brand = await one(from('Brand').update(patch).eq('id', id).select('id, name, slug, isActive').single())
  await audit(actor(req).id, 'brand.update', 'Brand', id, data)
  res.json({
    brand,
  })
})
adminCatalogRouter.delete('/brands/:id', async (req, res) => {
  const id = String(req.params.id)
  await exec(from('Brand').delete().eq('id', id))
  await audit(actor(req).id, 'brand.delete', 'Brand', id)
  res.json({
    ok: true,
  })
})
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
  let request = from('Product')
    .select(PRODUCT_ADMIN_SELECT, {
      count: 'exact',
    })
    .order('updatedAt', {
      ascending: false,
    })
  if (q.q) request = request.or(`name.ilike.%${like(q.q)}%,slug.ilike.%${like(q.q)}%`)
  if (q.category) request = request.eq('categoryId', q.category)
  if (q.status === 'active') request = request.eq('isActive', true)
  if (q.status === 'inactive') request = request.eq('isActive', false)
  const stockFilter = q.status === 'lowstock' || q.status === 'out'
  if (!stockFilter) request = request.range((q.page - 1) * q.pageSize, q.page * q.pageSize - 1)
  const { data, error, count: total } = await request
  if (error) throw toHttpError(error)
  let items = (data ?? []).map((product) => {
    const variants = [...(product.variants ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)
    return {
      ...product,
      variants,
      stock: variants.reduce((sum, variant) => sum + variant.stock, 0),
      lowStock: variants.some((variant) => variant.stock <= (variant.lowStockAt ?? settings.lowStockDefault)),
    }
  })
  let totalCount = total ?? items.length
  if (q.status === 'out') items = items.filter((item) => item.stock === 0)
  if (q.status === 'lowstock') items = items.filter((item) => item.lowStock)
  if (stockFilter) {
    totalCount = items.length
    items = items.slice((q.page - 1) * q.pageSize, q.page * q.pageSize)
  }
  res.json({
    items,
    total: totalCount,
    page: q.page,
    pages: Math.max(1, Math.ceil(totalCount / q.pageSize)),
  })
})
/** Every product's storefront link, for copying. Hidden products are left out unless asked for. Must stay above /products/:id. */
adminCatalogRouter.get('/products/links', async (req, res) => {
  const includeHidden = req.query.includeHidden === '1'
  const items = (await loadProductLinks()).filter((item) => includeHidden || item.status === 'Live')
  res.json({ items, store: env.STORE_URL.replace(/\/+$/, '') })
})
adminCatalogRouter.get('/products/:id', async (req, res) => {
  const product = await maybe(from('Product').select(PRODUCT_ADMIN_SELECT).eq('id', String(req.params.id)).maybeSingle())
  if (!product) throw notFound('Product')
  product.variants = [...(product.variants ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)
  res.json({
    product,
  })
})
adminCatalogRouter.post('/products', async (req, res) => {
  const product = await createProduct(createSchema.parse(req.body), actor(req).id)
  res.status(201).json({
    product,
  })
})
adminCatalogRouter.patch('/products/:id', async (req, res) => {
  const body = req.body
  const parsed = z.object(productFields).partial().parse(body)
  const data = Object.fromEntries(Object.entries(parsed).filter(([key]) => Object.prototype.hasOwnProperty.call(body, key)))
  const existing = await maybe(from('Product').select('*').eq('id', String(req.params.id)).maybeSingle())
  if (!existing) throw notFound('Product')
  if (data.categoryId || data.subcategoryId !== undefined) {
    await assertCategory(data.categoryId ?? existing.categoryId, data.subcategoryId === undefined ? existing.subcategoryId : data.subcategoryId)
  }
  if (data.brandId !== undefined) await assertBrand(data.brandId)
  const slug = data.slug ? slugify(data.slug) : undefined
  if (slug && slug !== existing.slug && (await maybe(from('Product').select('id').eq('slug', slug).maybeSingle()))) throw conflict('A product with this URL name already exists')
  const product = await one(
    from('Product')
      .update({
        ...productRow(data),
        ...(slug
          ? {
              slug,
            }
          : {}),
      })
      .eq('id', existing.id)
      .select('*, variants:ProductVariant(*)')
      .single(),
  )
  if (data.images)
    await rpc('set_product_images', {
      p_product_id: product.id,
      p_urls: data.images,
    })
  await audit(actor(req).id, 'product.update', 'Product', product.id, data)
  res.json({
    product,
  })
})
adminCatalogRouter.delete('/products/:id', adminOnly, async (req, res) => {
  const id = String(req.params.id)
  const used = await count(
    from('OrderItem')
      .select('id', {
        count: 'exact',
        head: true,
      })
      .eq('productId', id),
  )
  if (used > 0) {
    await exec(
      from('Product')
        .update({
          isActive: false,
        })
        .eq('id', id),
    )
    await audit(actor(req).id, 'product.archive', 'Product', id)
    return res.json({
      archived: true,
      message: 'This product has orders, so it was hidden instead of deleted.',
    })
  }
  await exec(from('Product').delete().eq('id', id))
  await audit(actor(req).id, 'product.delete', 'Product', id)
  res.json({
    deleted: true,
  })
})
adminCatalogRouter.post('/products/bulk', async (req, res) => {
  const data = z
    .object({
      ids: z.array(z.string()).min(1).max(200),
      action: z.enum(['activate', 'deactivate', 'bestseller', 'unbestseller', 'priceChange']),
      percent: z.number().min(-90).max(200).optional(),
    })
    .parse(req.body)
  const patch = (changes) => exec(from('Product').update(changes).in('id', data.ids))
  if (data.action === 'activate')
    await patch({
      isActive: true,
    })
  if (data.action === 'deactivate')
    await patch({
      isActive: false,
    })
  if (data.action === 'bestseller')
    await patch({
      isBestseller: true,
    })
  if (data.action === 'unbestseller')
    await patch({
      isBestseller: false,
    })
  if (data.action === 'priceChange') {
    if (data.percent === undefined) throw badRequest('percent is required')
    const variants = await rows(from('ProductVariant').select('*').in('productId', data.ids))
    await Promise.all(
      variants.map((variant) => {
        const price = Math.max(1, Math.round((variant.price * (100 + data.percent)) / 100))
        return exec(
          from('ProductVariant')
            .update({
              price,
              mrp: Math.max(variant.mrp, price),
            })
            .eq('id', variant.id),
        )
      }),
    )
  }
  await audit(actor(req).id, `product.bulk.${data.action}`, 'Product', undefined, data)
  res.json({
    updated: data.ids.length,
  })
})
adminCatalogRouter.post('/products/:id/variants', async (req, res) => {
  const data = variantSchema.parse(req.body)
  if (data.mrp < data.price) throw badRequest('MRP cannot be lower than the selling price')
  const product = await maybe(from('Product').select('id, slug, variants:ProductVariant(id)').eq('id', String(req.params.id)).maybeSingle())
  if (!product) throw notFound('Product')
  const variant = await one(
    from('ProductVariant')
      .insert({
        ...variantRow(data),
        productId: product.id,
        sku: data.sku || sku(product.slug, data.size),
        lowStockAt: data.lowStockAt ?? 10,
        sortOrder: product.variants?.length ?? 0,
      })
      .select()
      .single(),
  )
  if (variant.stock > 0) {
    await exec(
      from('StockMovement').insert({
        variantId: variant.id,
        delta: variant.stock,
        reason: 'RESTOCK',
        note: 'Opening stock',
        balance: variant.stock,
        userId: actor(req).id,
      }),
    )
  }
  await audit(actor(req).id, 'variant.create', 'ProductVariant', variant.id)
  res.status(201).json({
    variant,
  })
})
adminCatalogRouter.patch('/variants/:id', async (req, res) => {
  const data = variantSchema
    .omit({
      stock: true,
    })
    .partial()
    .parse(req.body)
  const existing = await maybe(from('ProductVariant').select('*').eq('id', String(req.params.id)).maybeSingle())
  if (!existing) throw notFound('Variant')
  if ((data.mrp ?? existing.mrp) < (data.price ?? existing.price)) throw badRequest('MRP cannot be lower than the selling price')
  const next = {
    ...data,
    ...(data.barcode !== undefined
      ? {
          barcode: data.barcode?.trim() || null,
        }
      : {}),
    ...(data.weightGrams !== undefined || data.size
      ? {
          weightGrams: data.weightGrams ?? weightFromSize(data.size ?? existing.size),
        }
      : {}),
  }
  const variant = await one(from('ProductVariant').update(next).eq('id', existing.id).select().single())
  await audit(actor(req).id, 'variant.update', 'ProductVariant', variant.id, data)
  res.json({
    variant,
  })
})
adminCatalogRouter.delete('/variants/:id', async (req, res) => {
  const variant = await maybe(from('ProductVariant').select('*, product:Product(variants:ProductVariant(id))').eq('id', String(req.params.id)).maybeSingle())
  if (!variant) throw notFound('Variant')
  if (variant.product.variants.length === 1) throw badRequest('A product needs at least one pack size')
  const sold = await count(
    from('OrderItem')
      .select('id', {
        count: 'exact',
        head: true,
      })
      .eq('variantId', variant.id),
  )
  if (sold > 0) {
    await exec(
      from('ProductVariant')
        .update({
          isActive: false,
        })
        .eq('id', variant.id),
    )
    return res.json({
      archived: true,
    })
  }
  await exec(from('ProductVariant').delete().eq('id', variant.id))
  res.json({
    deleted: true,
  })
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
  const variant = await rpc('adjust_stock', {
    p_variant_id: String(req.params.id),
    p_mode: data.mode,
    p_quantity: data.quantity,
    p_reason: data.reason,
    p_note: data.note ?? null,
    p_user: actor(req).id,
  })
  await audit(actor(req).id, 'stock.change', 'ProductVariant', variant.id, data)
  res.json({
    variant,
  })
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
  const all = await rows(from('ProductVariant').select('*, product:Product!inner(id, name, slug, images, art, isActive)').order('stock').order('sku'))
  const needle = q.q?.toLowerCase()
  const matching = needle ? all.filter((variant) => String(variant.product.name).toLowerCase().includes(needle)) : all
  const filtered = matching.filter((variant) => (q.filter === 'out' ? variant.stock === 0 : q.filter === 'low' ? variant.stock <= variant.lowStockAt : true))
  res.json({
    items: filtered.slice((q.page - 1) * q.pageSize, q.page * q.pageSize),
    total: filtered.length,
    summary: {
      out: matching.filter((v) => v.stock === 0).length,
      low: matching.filter((v) => v.stock > 0 && v.stock <= v.lowStockAt).length,
      variants: matching.length,
    },
  })
})
adminCatalogRouter.get('/inventory/:variantId/history', async (req, res) => {
  const items = await rows(
    from('StockMovement')
      .select('*')
      .eq('variantId', String(req.params.variantId))
      .order('createdAt', {
        ascending: false,
      })
      .limit(100),
  )
  const userIds = [...new Set(items.map((item) => item.userId).filter(Boolean))]
  const namesById = await peopleByIds(userIds)
  const names = new Map([...namesById].map(([id, person]) => [id, person.name]))
  res.json({
    items: items.map((item) => ({
      ...item,
      user: item.userId
        ? {
            name: names.get(item.userId) ?? null,
          }
        : null,
    })),
  })
})
const categorySchema = z.object({
  name: z.string().trim().min(2).max(60),
  id: z.string().trim().max(60).optional(),
  tagline: z.string().max(120).default(''),
  image: z.string().max(500).nullish(),
  art: z.string().max(20).default('mix'),
  parentId: z.string().nullish(),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
  description: z.string().trim().max(1000).default(''),
  metaTitle: z.string().trim().max(70).default(''),
  metaDescription: z.string().trim().max(170).default(''),
})
adminCatalogRouter.get('/categories', async (_req, res) => {
  const [categories, products] = await Promise.all([rows(from('Category').select('*').order('sortOrder').order('name')), rows(from('Product').select('categoryId, subcategoryId'))])
  res.json({
    items: categories.map((category) => ({
      ...category,
      _count: {
        products: products.filter((product) => product.categoryId === category.id).length,
        subProducts: products.filter((product) => product.subcategoryId === category.id).length,
      },
    })),
  })
})
adminCatalogRouter.post('/categories', async (req, res) => {
  const data = categorySchema.parse(req.body)
  const id = slugify(data.id || data.name)
  if (data.parentId) {
    const parent = await maybe(from('Category').select('id, parentId').eq('id', data.parentId).maybeSingle())
    if (!parent || parent.parentId) throw badRequest('Subcategories can only sit under a top-level category')
  }
  const category = await one(
    from('Category')
      .insert({
        ...withoutEmptySeo(data),
        id,
        image: data.image ?? null,
        parentId: data.parentId ?? null,
      })
      .select()
      .single(),
  )
  await audit(actor(req).id, 'category.create', 'Category', id)
  res.status(201).json({
    category,
  })
})
adminCatalogRouter.patch('/categories/:id', async (req, res) => {
  const body = req.body ?? {}
  const parsed = categorySchema
    .omit({
      id: true,
    })
    .partial()
    .parse(body)
  const data = Object.fromEntries(Object.entries(parsed).filter(([key]) => Object.prototype.hasOwnProperty.call(body, key)))
  const id = String(req.params.id)
  if (data.parentId === id) throw badRequest('A category cannot be its own parent')
  const category = await one(from('Category').update(data).eq('id', id).select().single())
  await audit(actor(req).id, 'category.update', 'Category', category.id, data)
  res.json({
    category,
  })
})
adminCatalogRouter.post('/categories/reorder', async (req, res) => {
  const data = z
    .object({
      ids: z.array(z.string()).min(1),
    })
    .parse(req.body)
  await Promise.all(
    data.ids.map((id, index) =>
      exec(
        from('Category')
          .update({
            sortOrder: index,
          })
          .eq('id', id),
      ),
    ),
  )
  res.json({
    ok: true,
  })
})
adminCatalogRouter.delete('/categories/:id', adminOnly, async (req, res) => {
  const id = String(req.params.id)
  const used = await count(
    from('Product')
      .select('id', {
        count: 'exact',
        head: true,
      })
      .or(`categoryId.eq.${id},subcategoryId.eq.${id}`),
  )
  if (used > 0) throw conflict(`${used} products still use this category. Move them first.`)
  await exec(from('Category').delete().eq('id', id))
  await audit(actor(req).id, 'category.delete', 'Category', id)
  res.json({
    deleted: true,
  })
})
