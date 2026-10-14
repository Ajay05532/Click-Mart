import { z } from 'zod'
import { audit } from './audit.js'
import { createProduct, createSchema, variantRow } from './catalogWrite.js'
import { exec, from, rows, rpc } from '../database/db.js'
import { slugify } from '../utils/slug.js'

export const MAX_IMPORT_ROWS = 800

/* ---------------- Reading cells ---------------- */

const clean = (value) => String(value ?? '').trim()
const norm = (value) => clean(value).toLowerCase()

/** yes/true/1 -> true, no/false/0 -> false, blank -> undefined, anything else -> null (a mistake). */
export function readBool(value) {
  const text = norm(value)
  if (!text) return undefined
  if (['yes', 'y', 'true', '1'].includes(text)) return true
  if (['no', 'n', 'false', '0'].includes(text)) return false
  return null
}
/** Whole number, blank -> undefined, not a number -> null. Accepts "1,299" and "₹1299". */
export function readInt(value) {
  const text = clean(value).replace(/[₹,\s]/g, '')
  if (!text) return undefined
  return /^-?\d+$/.test(text) ? Number(text) : null
}

/* ---------------- Products ---------------- */

const PRODUCT_TEXT = { blurb: 'blurb', description: 'description', ingredients: 'ingredients', origin: 'countryOfOrigin' }

/**
 * Turns CSV rows into one plan per product. Nothing here touches the database: `lookup` carries the
 * categories, brands and existing products, so this can be tested on its own.
 * One CSV row is one pack size. Rows with the same product name belong together, and
 * product-level columns can be left blank on every row after the first.
 */
export function planProducts(inputRows, lookup) {
  const errors = []
  const fail = (line, message) => errors.push({ line, message })
  const groups = new Map()
  const seenSkus = new Map()

  inputRows.forEach((row, index) => {
    const line = Number(row._line) || index + 2
    const name = clean(row.name)
    if (!name) return fail(line, 'The name column is empty')
    const key = slugify(name)
    if (!groups.has(key)) groups.set(key, { key, name, line, rows: [] })
    groups.get(key).rows.push({ line, row })
  })

  const plans = []
  for (const group of groups.values()) {
    const problems = errors.length
    const first = (field) => group.rows.map(({ row }) => clean(row[field])).find(Boolean) ?? ''
    const existing = lookup.products.get(group.key) ?? null

    // Category and brand
    const categoryName = first('category')
    let category = null
    if (categoryName) {
      category = lookup.categories.find((item) => !item.parentId && (norm(item.name) === norm(categoryName) || item.slug === norm(categoryName)))
      if (!category) fail(group.line, `Category "${categoryName}" does not exist. Create it under Categories first.`)
    } else if (!existing) fail(group.line, 'The category column is empty')
    const subName = first('subcategory')
    let subcategory = null
    const parentId = category?.id ?? existing?.categoryId
    if (subName && parentId) {
      subcategory = lookup.categories.find((item) => item.parentId === parentId && (norm(item.name) === norm(subName) || item.slug === norm(subName)))
      if (!subcategory) fail(group.line, `Subcategory "${subName}" does not exist under that category`)
    }
    const brandName = first('brand')
    let brand = null
    if (brandName) {
      brand = lookup.brands.find((item) => norm(item.name) === norm(brandName))
      if (!brand) fail(group.line, `Brand "${brandName}" does not exist. Add it under Brands first.`)
    }

    // Product fields (blank means "leave as it is" for an existing product)
    const product = {}
    for (const [column, field] of Object.entries(PRODUCT_TEXT)) if (first(column)) product[field] = first(column)
    const hsn = first('hsn')
    if (hsn) {
      if (!/^\d{4,8}$/.test(hsn)) fail(group.line, `HSN "${hsn}" should be 4 to 8 digits`)
      else product.hsnCode = hsn
    }
    const gst = readInt(first('gst'))
    if (gst === null || (gst !== undefined && (gst < 0 || gst > 28))) fail(group.line, 'gst must be a whole number from 0 to 28')
    else if (gst !== undefined) product.gstPercent = gst
    const shelf = readInt(first('shelf_life_days'))
    if (shelf === null || (shelf !== undefined && (shelf < 1 || shelf > 3650))) fail(group.line, 'shelf_life_days must be a whole number of days')
    else if (shelf !== undefined) product.shelfLifeDays = shelf
    for (const [column, field] of [
      ['bestseller', 'isBestseller'],
      ['active', 'isActive'],
    ]) {
      const value = readBool(first(column))
      if (value === null) fail(group.line, `${column} must be yes or no`)
      else if (value !== undefined) product[field] = value
    }
    const images = first('images')
      .split('|')
      .map((url) => url.trim())
      .filter(Boolean)
    if (images.some((url) => !/^https:\/\//i.test(url))) fail(group.line, 'images must be https links separated by |')
    else if (images.length > 8) fail(group.line, 'A product can have at most 8 images')
    else if (images.length) product.images = images

    // Pack sizes
    const variants = []
    const sizes = new Set()
    for (const { line, row } of group.rows) {
      const size = clean(row.size)
      if (!size || size.length > 20) {
        fail(line, 'The size column must be filled in, up to 20 characters (for example 500 g)')
        continue
      }
      if (sizes.has(norm(size))) {
        fail(line, `Pack size "${size}" appears twice for ${group.name}`)
        continue
      }
      sizes.add(norm(size))
      const sku = clean(row.sku).toUpperCase()
      if (sku) {
        const owner = lookup.skus.get(sku)
        const matches = existing?.variants.find((variant) => norm(variant.size) === norm(size))
        if (seenSkus.has(sku)) fail(line, `SKU ${sku} is already used on line ${seenSkus.get(sku)}`)
        else if (owner && owner !== matches?.id) fail(line, `SKU ${sku} already belongs to another pack size`)
        seenSkus.set(sku, line)
      }
      const price = readInt(row.price)
      const mrp = readInt(row.mrp)
      const stock = readInt(row.stock)
      const weight = readInt(row.weight_grams)
      const alert = readInt(row.low_stock_at)
      const variantActive = readBool(row.variant_active)
      const found = existing?.variants.find((variant) => norm(variant.size) === norm(size)) ?? null
      let bad = false
      const must = (condition, message) => {
        if (!condition) {
          fail(line, message)
          bad = true
        }
      }
      must(price !== null && (price !== undefined || !!found) && (price === undefined || price >= 1), 'price must be a whole number of rupees, 1 or more')
      must(mrp !== null && (mrp === undefined || mrp >= 1), 'mrp must be a whole number of rupees')
      must(stock !== null && (stock === undefined || stock >= 0), 'stock must be a whole number, 0 or more')
      must(weight !== null && (weight === undefined || (weight >= 1 && weight <= 100000)), 'weight_grams must be a whole number of grams')
      must(alert !== null && (alert === undefined || alert >= 0), 'low_stock_at must be a whole number, 0 or more')
      must(variantActive !== null, 'variant_active must be yes or no')
      const nextPrice = price ?? found?.price
      const nextMrp = mrp ?? (price !== undefined ? Math.max(price, found?.mrp ?? price) : found?.mrp)
      if (!bad) must(nextMrp >= nextPrice, `mrp (${nextMrp}) cannot be lower than the price (${nextPrice})`)
      if (bad) continue
      variants.push({
        line,
        size,
        sku: sku || undefined,
        barcode: clean(row.barcode) || undefined,
        price: nextPrice,
        mrp: nextMrp,
        stock,
        weightGrams: weight,
        lowStockAt: alert,
        isActive: variantActive,
        existing: found,
        action: !found ? 'create' : changed(found, { price: nextPrice, mrp: nextMrp, stock, weight, alert, barcode: clean(row.barcode), variantActive }) ? 'update' : 'unchanged',
      })
    }
    if (errors.length > problems) {
      plans.push({ key: group.key, name: group.name, line: group.line, skipped: true })
      continue
    }
    // For an existing product, only what really differs is written.
    let categoryId = category?.id
    let subcategoryId = subcategory?.id
    let brandId = brand?.id
    let finalProduct = product
    let productChanged = true
    if (existing) {
      finalProduct = Object.fromEntries(Object.entries(product).filter(([field, value]) => !sameValue(existing[field], value)))
      if (categoryId === existing.categoryId) categoryId = undefined
      if (subcategoryId === existing.subcategoryId) subcategoryId = undefined
      if (brandId === existing.brandId) brandId = undefined
      productChanged = Object.keys(finalProduct).length > 0 || !!categoryId || !!subcategoryId || !!brandId
    }
    plans.push({
      key: group.key,
      name: existing?.name ?? group.name,
      line: group.line,
      action: !existing ? 'create' : productChanged || variants.some((variant) => variant.action !== 'unchanged') ? 'update' : 'unchanged',
      existing,
      categoryId,
      subcategoryId,
      brandId,
      product: finalProduct,
      variants,
    })
  }
  return { plans, errors }
}

const sameValue = (a, b) => (Array.isArray(a) || Array.isArray(b) ? JSON.stringify(a ?? []) === JSON.stringify(b ?? []) : (a ?? null) === (b ?? null))

function changed(found, next) {
  return (
    found.price !== next.price ||
    found.mrp !== next.mrp ||
    (next.stock !== undefined && next.stock !== found.stock) ||
    (next.weight !== undefined && next.weight !== found.weightGrams) ||
    (next.alert !== undefined && next.alert !== found.lowStockAt) ||
    (next.barcode && next.barcode !== (found.barcode ?? '')) ||
    (next.variantActive !== undefined && next.variantActive !== found.isActive)
  )
}

export async function loadProductLookup() {
  const [categories, brands, products, variants] = await Promise.all([
    rows(from('Category').select('id, name, slug, parentId')),
    rows(from('Brand').select('id, name')),
    rows(from('Product').select('id, name, slug, categoryId, subcategoryId, brandId, blurb, description, ingredients, countryOfOrigin, hsnCode, gstPercent, shelfLifeDays, isBestseller, isActive, images').limit(5000)),
    rows(from('ProductVariant').select('id, productId, size, sku, price, mrp, stock, weightGrams, lowStockAt, barcode, isActive').limit(20000)),
  ])
  const byProduct = new Map()
  for (const variant of variants) {
    if (!byProduct.has(variant.productId)) byProduct.set(variant.productId, [])
    byProduct.get(variant.productId).push(variant)
  }
  return {
    categories,
    brands,
    products: new Map(products.map((product) => [product.slug, { ...product, variants: byProduct.get(product.id) ?? [] }])),
    skus: new Map(variants.map((variant) => [String(variant.sku).toUpperCase(), variant.id])),
  }
}

export function summarisePlans({ plans, errors }) {
  const variants = plans.flatMap((plan) => plan.variants ?? [])
  return {
    productsToCreate: plans.filter((plan) => plan.action === 'create').length,
    productsToUpdate: plans.filter((plan) => plan.action === 'update').length,
    variantsToCreate: variants.filter((variant) => variant.action === 'create').length,
    variantsToUpdate: variants.filter((variant) => variant.action === 'update').length,
    productsUnchanged: plans.filter((plan) => plan.action === 'unchanged').length,
    unchanged: variants.filter((variant) => variant.action === 'unchanged').length,
    skipped: plans.filter((plan) => plan.skipped).length,
    errors: errors.length,
  }
}

/** Writes one product. Each product is applied on its own, so one bad row never blocks the rest. */
async function applyPlan(plan, userId) {
  if (plan.action === 'create') {
    await createProduct(
      createSchema.parse({
        name: plan.name,
        categoryId: plan.categoryId,
        subcategoryId: plan.subcategoryId ?? null,
        brandId: plan.brandId ?? null,
        ...plan.product,
        variants: plan.variants.map((variant) => ({
          size: variant.size,
          sku: variant.sku,
          barcode: variant.barcode,
          price: variant.price,
          mrp: variant.mrp,
          stock: variant.stock ?? 0,
          weightGrams: variant.weightGrams,
          lowStockAt: variant.lowStockAt,
          isActive: variant.isActive ?? true,
        })),
      }),
      userId,
    )
    return
  }
  const id = plan.existing.id
  const patch = { ...plan.product }
  delete patch.images
  if (plan.categoryId) patch.categoryId = plan.categoryId
  if (plan.subcategoryId) patch.subcategoryId = plan.subcategoryId
  else if (plan.categoryId && plan.categoryId !== plan.existing.categoryId) patch.subcategoryId = null
  if (plan.brandId) patch.brandId = plan.brandId
  if (Object.keys(patch).length) await exec(from('Product').update(patch).eq('id', id))
  if (plan.product.images) await rpc('set_product_images', { p_product_id: id, p_urls: plan.product.images })
  let order = plan.existing.variants.length
  for (const variant of plan.variants) {
    if (variant.action === 'create') {
      const [created] = await rows(
        from('ProductVariant')
          .insert({
            ...variantRow({ size: variant.size, price: variant.price, mrp: variant.mrp, stock: variant.stock ?? 0, barcode: variant.barcode, weightGrams: variant.weightGrams }),
            productId: id,
            sku: variant.sku || `${plan.key}-${variant.size}`.toUpperCase().replace(/[^A-Z0-9]+/g, '-'),
            lowStockAt: variant.lowStockAt ?? 10,
            isActive: variant.isActive ?? true,
            sortOrder: order++,
          })
          .select(),
      )
      if (created.stock > 0)
        await exec(
          from('StockMovement').insert({ variantId: created.id, delta: created.stock, reason: 'RESTOCK', note: 'Opening stock (CSV import)', balance: created.stock, userId }),
        )
    } else if (variant.action === 'update') {
      const patchVariant = { price: variant.price, mrp: variant.mrp }
      if (variant.weightGrams !== undefined) patchVariant.weightGrams = variant.weightGrams
      if (variant.lowStockAt !== undefined) patchVariant.lowStockAt = variant.lowStockAt
      if (variant.barcode) patchVariant.barcode = variant.barcode
      if (variant.isActive !== undefined) patchVariant.isActive = variant.isActive
      await exec(from('ProductVariant').update(patchVariant).eq('id', variant.existing.id))
      if (variant.stock !== undefined && variant.stock !== variant.existing.stock) {
        await rpc('adjust_stock', { p_variant_id: variant.existing.id, p_mode: 'set', p_quantity: variant.stock, p_reason: 'ADJUSTMENT', p_note: 'CSV import', p_user: userId })
      }
    }
  }
}

export async function runProductImport(inputRows, { dryRun, userId }) {
  const planned = planProducts(inputRows, await loadProductLookup())
  const summary = summarisePlans(planned)
  const report = planned.plans.map((plan) => ({
    name: plan.name,
    line: plan.line,
    action: plan.skipped ? 'skipped' : plan.action,
    variants: (plan.variants ?? []).map((variant) => ({ size: variant.size, action: variant.action })),
  }))
  if (dryRun) return { dryRun: true, summary, products: report, errors: planned.errors }
  const results = []
  for (const plan of planned.plans.filter((item) => !item.skipped && item.action !== 'unchanged')) {
    try {
      await applyPlan(plan, userId)
      results.push({ name: plan.name, ok: true })
    } catch (error) {
      results.push({ name: plan.name, ok: false, message: error?.message ?? 'Could not save this product' })
    }
  }
  const failed = results.filter((item) => !item.ok)
  await audit(userId, 'import.products', 'Product', undefined, { ...summary, failed: failed.length })
  return { dryRun: false, summary: { ...summary, saved: results.length - failed.length, failed: failed.length }, products: report, errors: planned.errors, failures: failed }
}

/* ---------------- Stock ---------------- */

export function planStock(inputRows, skus) {
  const errors = []
  const items = []
  const seen = new Map()
  inputRows.forEach((row, index) => {
    const line = Number(row._line) || index + 2
    const sku = clean(row.sku).toUpperCase()
    if (!sku) return errors.push({ line, message: 'The sku column is empty' })
    const variant = skus.get(sku)
    if (!variant) return errors.push({ line, message: `No pack size has the SKU ${sku}` })
    if (seen.has(sku)) return errors.push({ line, message: `SKU ${sku} is already on line ${seen.get(sku)}` })
    const set = readInt(row.stock)
    const adjust = readInt(row.adjust)
    if (set === null || adjust === null) return errors.push({ line, message: 'stock and adjust must be whole numbers' })
    if ((set === undefined) === (adjust === undefined)) return errors.push({ line, message: 'Fill in exactly one of stock (new total) or adjust (add or remove)' })
    const after = set !== undefined ? set : variant.stock + adjust
    if (after < 0) return errors.push({ line, message: `${sku} would go below zero (${variant.stock} in stock, ${adjust} change)` })
    const reason = clean(row.reason).toUpperCase() || 'ADJUSTMENT'
    if (!['RESTOCK', 'ADJUSTMENT', 'RETURN'].includes(reason)) return errors.push({ line, message: 'reason must be RESTOCK, ADJUSTMENT or RETURN' })
    seen.set(sku, line)
    items.push({
      line,
      id: variant.id,
      sku,
      product: variant.productName,
      size: variant.size,
      before: variant.stock,
      after,
      mode: set !== undefined ? 'set' : 'adjust',
      quantity: set ?? adjust,
      reason,
      note: clean(row.note).slice(0, 150) || 'CSV import',
    })
  })
  return { items, errors }
}

export async function runStockImport(inputRows, { dryRun, userId }) {
  const variants = await rows(from('ProductVariant').select('id, sku, size, stock, product:Product(name)').limit(20000))
  const skus = new Map(
    variants.map((variant) => [String(variant.sku).toUpperCase(), { id: variant.id, stock: variant.stock, size: variant.size, productName: variant.product?.name ?? '' }]),
  )
  const { items, errors } = planStock(inputRows, skus)
  const changes = items.filter((item) => item.before !== item.after)
  const summary = { rows: inputRows.length, toChange: changes.length, unchanged: items.length - changes.length, errors: errors.length }
  const preview = items.map(({ line, sku, product, size, before, after }) => ({ line, sku, product, size, before, after }))
  if (dryRun) return { dryRun: true, summary, items: preview, errors }
  const failures = []
  let saved = 0
  for (const item of changes) {
    try {
      await rpc('adjust_stock', { p_variant_id: item.id, p_mode: item.mode, p_quantity: item.quantity, p_reason: item.reason, p_note: item.note, p_user: userId })
      saved += 1
    } catch (error) {
      failures.push({ line: item.line, sku: item.sku, message: error?.message ?? 'Could not change this stock' })
    }
  }
  await audit(userId, 'import.stock', 'ProductVariant', undefined, { ...summary, saved, failed: failures.length })
  return { dryRun: false, summary: { ...summary, saved, failed: failures.length }, items: preview, errors, failures }
}

export const importBody = z.object({
  rows: z
    .array(z.record(z.string(), z.union([z.string(), z.number()]).transform(String)))
    .min(1, 'The file has no rows')
    .max(MAX_IMPORT_ROWS, `Import up to ${MAX_IMPORT_ROWS} rows at a time`),
  dryRun: z.boolean().default(true),
})
