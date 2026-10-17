import { z } from 'zod'
import { audit } from './audit.js'
import { exec, from, maybe, one, rows, rpc } from '../database/db.js'
import { badRequest, conflict } from '../utils/errors.js'
import { slugify } from '../utils/slug.js'

export const variantSchema = z.object({
  size: z.string().trim().min(1).max(20),
  price: z.number().int().min(1),
  mrp: z.number().int().min(1),
  stock: z.number().int().min(0).default(0),
  lowStockAt: z.number().int().min(0).optional(),
  sku: z.string().trim().max(60).optional(),
  barcode: z.string().trim().max(32).nullish(),
  weightGrams: z.number().int().min(1).max(100000).nullish(),
  isActive: z.boolean().default(true),
})
export const productFields = {
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().max(100).optional(),
  categoryId: z.string().min(1),
  subcategoryId: z.string().nullish(),
  blurb: z.string().max(400).default(''),
  description: z.string().max(5000).default(''),
  highlights: z.array(z.string().max(200)).max(10).default([]),
  nutrition: z
    .array(
      z.object({
        label: z.string().max(60),
        value: z.string().max(60),
      }),
    )
    .max(20)
    .default([]),
  images: z.array(z.string().max(500)).max(8).default([]),
  art: z.string().max(20).default('mix'),
  brandId: z.string().nullish(),
  hsnCode: z.string().trim().max(8).nullish(),
  gstPercent: z.number().int().min(0).max(28).default(5),
  countryOfOrigin: z.string().trim().max(60).default('India'),
  ingredients: z.string().max(2000).default(''),
  shelfLifeDays: z.number().int().min(1).max(3650).nullish(),
  isActive: z.boolean().default(true),
  isBestseller: z.boolean().default(false),
  featuredSize: z.string().nullish(),
  metaTitle: z.string().trim().max(70).default(''),
  metaDescription: z.string().trim().max(170).default(''),
}
export const createSchema = z
  .object({
    ...productFields,
    variants: z.array(variantSchema).min(1, 'Add at least one pack size').max(12),
  })
  .superRefine((data, ctx) => {
    data.variants.forEach((variant, index) => {
      if (variant.mrp < variant.price)
        ctx.addIssue({
          code: 'custom',
          path: ['variants', index, 'mrp'],
          message: 'MRP cannot be lower than the selling price',
        })
    })
    const sizes = data.variants.map((variant) => variant.size.toLowerCase())
    if (new Set(sizes).size !== sizes.length)
      ctx.addIssue({
        code: 'custom',
        path: ['variants'],
        message: 'Each pack size can only appear once',
      })
  })
export const sku = (slug, size) => `${slug}-${size}`.toUpperCase().replace(/[^A-Z0-9]+/g, '-')
export const like = (value) => value.replace(/[%,()*\\]/g, ' ')
export function weightFromSize(size) {
  const match = size
    .trim()
    .toLowerCase()
    .match(/^(\d+(?:\.\d+)?)\s*(kg|g)$/)
  if (!match) return null
  const amount = Number(match[1])
  return match[2] === 'kg' ? Math.round(amount * 1000) : Math.round(amount)
}
export function variantRow(data) {
  return {
    ...data,
    barcode: data.barcode?.trim() || null,
    weightGrams: data.weightGrams ?? weightFromSize(data.size),
  }
}
const SEO_KEYS = ['metaTitle', 'metaDescription', 'description']
/** New rows leave empty search text to the column default, so saving works before the SEO migration is pasted. */
export function withoutEmptySeo(data) {
  return Object.fromEntries(Object.entries(data).filter(([key, value]) => !(SEO_KEYS.includes(key) && value === '')))
}
export function productRow(data) {
  const row = {
    ...data,
  }
  if ('brandId' in data) row.brandId = data.brandId || null
  if ('hsnCode' in data) row.hsnCode = data.hsnCode?.trim() || null
  if ('shelfLifeDays' in data) row.shelfLifeDays = data.shelfLifeDays ?? null
  return row
}
export async function assertBrand(brandId) {
  if (!brandId) return
  const brand = await maybe(from('Brand').select('id').eq('id', brandId).maybeSingle())
  if (!brand) throw badRequest('Choose a valid brand')
}
export async function assertCategory(categoryId, subcategoryId) {
  const category = await maybe(from('Category').select('id, parentId').eq('id', categoryId).maybeSingle())
  if (!category || category.parentId) throw badRequest('Choose a valid category')
  if (subcategoryId) {
    const sub = await maybe(from('Category').select('id, parentId').eq('id', subcategoryId).maybeSingle())
    if (!sub || sub.parentId !== categoryId) throw badRequest('That subcategory does not belong to the chosen category')
  }
}

/**
 * Creates a product with its pack sizes, photos and opening stock. If anything after the product
 * row fails, the product is removed again so no half-made product is left behind.
 */
export async function createProduct(data, userId) {
  await assertCategory(data.categoryId, data.subcategoryId)
  await assertBrand(data.brandId)
  const slug = slugify(data.slug || data.name)
  if (await maybe(from('Product').select('id').eq('slug', slug).maybeSingle())) throw conflict('A product with this URL name already exists')
  const { variants, ...rest } = data
  const product = await one(
    from('Product')
      .insert({
        ...withoutEmptySeo(productRow(rest)),
        slug,
        subcategoryId: data.subcategoryId ?? null,
        featuredSize: data.featuredSize ?? variants[0].size,
      })
      .select()
      .single(),
  )
  try {
    await rpc('set_product_images', {
      p_product_id: product.id,
      p_urls: data.images,
    })
    const created = await rows(
      from('ProductVariant')
        .insert(
          variants.map((variant, index) => ({
            ...variantRow(variant),
            productId: product.id,
            sku: variant.sku || sku(slug, variant.size),
            lowStockAt: variant.lowStockAt ?? 10,
            sortOrder: index,
          })),
        )
        .select(),
    )
    const opening = created
      .filter((variant) => variant.stock > 0)
      .map((variant) => ({
        variantId: variant.id,
        delta: variant.stock,
        reason: 'RESTOCK',
        note: 'Opening stock',
        balance: variant.stock,
        userId,
      }))
    if (opening.length) await exec(from('StockMovement').insert(opening))
    product.variants = created
  } catch (error) {
    await from('Product').delete().eq('id', product.id)
    throw error
  }
  await audit(userId, 'product.create', 'Product', product.id, {
    name: product.name,
  })
  return product
}
