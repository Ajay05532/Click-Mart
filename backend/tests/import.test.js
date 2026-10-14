import './setup.js'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { importBody, planProducts, planStock, readBool, readInt, summarisePlans } from '../src/services/importer.js'

const lookup = (extra = {}) => ({
  categories: [
    { id: 'c1', name: 'Dry Fruits & Nuts', slug: 'dry-fruits-nuts', parentId: null },
    { id: 'c2', name: 'Almonds', slug: 'almonds', parentId: 'c1' },
  ],
  brands: [{ id: 'b1', name: 'ClickMart' }],
  products: new Map([
    ['cashews', { id: 'p9', name: 'Cashews', slug: 'cashews', categoryId: 'c1', subcategoryId: null, brandId: null, blurb: '', description: 'Crunchy', ingredients: '', countryOfOrigin: 'India', hsnCode: '0801', gstPercent: 5, shelfLifeDays: null, isBestseller: false, isActive: true, images: [], variants: [{ id: 'v9', size: '250 g', sku: 'CASHEWS-250-G', price: 299, mrp: 349, stock: 10, weightGrams: 250, lowStockAt: 10, barcode: null, isActive: true }] }],
  ]),
  skus: new Map([['CASHEWS-250-G', 'v9']]),
  ...extra,
})
const row = (over) => ({ name: 'Almonds', category: 'Dry Fruits & Nuts', size: '500 g', price: '549', mrp: '649', stock: '40', ...over })

describe('reading cells', () => {
  it('reads yes/no and whole numbers the way people type them', () => {
    assert.equal(readBool('Yes'), true)
    assert.equal(readBool(' no '), false)
    assert.equal(readBool(''), undefined)
    assert.equal(readBool('maybe'), null)
    assert.equal(readInt('₹1,299'), 1299)
    assert.equal(readInt(''), undefined)
    assert.equal(readInt('12.5'), null)
  })
})

describe('product import plan', () => {
  it('groups rows into one product with several pack sizes and lets later rows leave product columns blank', () => {
    const { plans, errors } = planProducts([row({ hsn: '0802', gst: '5', brand: 'clickmart' }), { name: 'Almonds', size: '1 kg', price: '1049', mrp: '1199', stock: '12' }], lookup())
    assert.deepEqual(errors, [])
    assert.equal(plans.length, 1)
    assert.equal(plans[0].action, 'create')
    assert.equal(plans[0].categoryId, 'c1')
    assert.equal(plans[0].brandId, 'b1')
    assert.equal(plans[0].product.hsnCode, '0802')
    assert.deepEqual(plans[0].variants.map((variant) => [variant.size, variant.action]), [['500 g', 'create'], ['1 kg', 'create']])
  })

  it('updates an existing product, leaving the stock alone when the cell is blank', () => {
    const { plans, errors } = planProducts([{ name: 'Cashews', size: '250 g', price: '319' }, { name: 'Cashews', size: '1 kg', price: '1099', mrp: '1199', stock: '5' }], lookup())
    assert.deepEqual(errors, [])
    assert.equal(plans[0].action, 'update')
    const [existing, added] = plans[0].variants
    assert.equal(existing.action, 'update')
    assert.equal(existing.price, 319)
    assert.equal(existing.mrp, 349, 'mrp is kept when it is blank and still above the price')
    assert.equal(existing.stock, undefined)
    assert.equal(added.action, 'create')
  })

  it('marks identical rows as unchanged, product and pack size', () => {
    const { plans } = planProducts([{ name: 'Cashews', category: 'Dry Fruits & Nuts', description: 'Crunchy', hsn: '0801', gst: '5', active: 'yes', size: '250 g', price: '299', mrp: '349', stock: '10' }], lookup())
    assert.equal(plans[0].variants[0].action, 'unchanged')
    assert.equal(plans[0].action, 'unchanged')
    assert.deepEqual(plans[0].product, {})
    const summary = summarisePlans({ plans, errors: [] })
    assert.deepEqual([summary.unchanged, summary.productsUnchanged, summary.productsToUpdate], [1, 1, 0])
  })

  it('writes only the product fields that differ', () => {
    const { plans } = planProducts([{ name: 'Cashews', category: 'Dry Fruits & Nuts', description: 'Crunchy and fresh', hsn: '0801', gst: '12', size: '250 g', price: '299', mrp: '349' }], lookup())
    assert.equal(plans[0].action, 'update')
    assert.deepEqual(plans[0].product, { description: 'Crunchy and fresh', gstPercent: 12 })
    assert.equal(plans[0].categoryId, undefined, 'the category did not change')
  })

  it('reports every problem with its line number and skips only the broken product', () => {
    const { plans, errors } = planProducts(
      [
        { _line: '2', ...row({ name: 'Walnuts', category: 'Spices' }) },
        { _line: '3', ...row({ name: 'Pistachios', price: 'abc' }) },
        { _line: '4', ...row({ name: 'Raisins', mrp: '100', price: '200' }) },
        { _line: '5', ...row({ name: 'Cashews', category: '', size: '1 kg', price: '1099', mrp: '1199' }) },
        { _line: '6', name: '', size: '500 g' },
      ],
      lookup(),
    )
    const byLine = Object.fromEntries(errors.map((error) => [error.line, error.message]))
    assert.match(byLine[2], /Category "Spices" does not exist/)
    assert.match(byLine[3], /price must be a whole number/)
    assert.match(byLine[4], /mrp \(100\) cannot be lower than the price \(200\)/)
    assert.match(byLine[6], /name column is empty/)
    assert.equal(plans.find((plan) => plan.name === 'Cashews').skipped, undefined, 'a good product still goes ahead')
    assert.equal(plans.filter((plan) => plan.skipped).length, 3)
  })

  it('rejects repeated sizes, a SKU used twice and a SKU owned by another pack size', () => {
    const repeated = planProducts([row({ sku: 'AL-1' }), row({ size: '500 G', sku: 'AL-2' })], lookup())
    assert.match(repeated.errors[0].message, /appears twice/)
    const twice = planProducts([row({ sku: 'DUP' }), row({ name: 'Walnuts', sku: 'DUP' })], lookup())
    assert.ok(twice.errors.some((error) => /already used on line/.test(error.message)))
    const taken = planProducts([row({ sku: 'cashews-250-g' })], lookup())
    assert.match(taken.errors[0].message, /already belongs to another pack size/)
  })

  it('only accepts https image links', () => {
    assert.match(planProducts([row({ images: 'http://x.com/a.jpg' })], lookup()).errors[0].message, /https links/)
    assert.deepEqual(planProducts([row({ images: 'https://x.com/a.jpg| https://x.com/b.jpg' })], lookup()).plans[0].product.images, ['https://x.com/a.jpg', 'https://x.com/b.jpg'])
  })
})

describe('stock import plan', () => {
  const skus = new Map([
    ['AL-500', { id: 'v1', stock: 10, size: '500 g', productName: 'Almonds' }],
    ['CA-250', { id: 'v2', stock: 4, size: '250 g', productName: 'Cashews' }],
  ])

  it('sets a new total or adds and removes, and shows before and after', () => {
    const { items, errors } = planStock([{ sku: 'al-500', stock: '25' }, { sku: 'CA-250', adjust: '-3', reason: 'adjustment', note: 'Damaged' }], skus)
    assert.deepEqual(errors, [])
    assert.deepEqual(items.map((item) => [item.sku, item.before, item.after, item.mode]), [['AL-500', 10, 25, 'set'], ['CA-250', 4, 1, 'adjust']])
    assert.equal(items[1].note, 'Damaged')
  })

  it('rejects unknown SKUs, both or neither of stock and adjust, negatives and repeats', () => {
    const { items, errors } = planStock(
      [{ sku: 'NOPE', stock: '1' }, { sku: 'AL-500' }, { sku: 'AL-500', stock: '1', adjust: '1' }, { sku: 'CA-250', adjust: '-9' }, { sku: 'AL-500', stock: '7' }, { sku: 'AL-500', stock: '8' }, { sku: 'CA-250', stock: '2', reason: 'THEFT' }],
      skus,
    )
    assert.equal(items.length, 1)
    assert.equal(errors.length, 6)
    assert.match(errors[0].message, /No pack size has the SKU NOPE/)
    assert.match(errors[3].message, /below zero/)
  })

  it('limits how many rows one request can carry', () => {
    assert.equal(importBody.safeParse({ rows: [] }).success, false)
    assert.equal(importBody.safeParse({ rows: Array.from({ length: 801 }, () => ({ sku: 'A' })) }).success, false)
    assert.equal(importBody.parse({ rows: [{ sku: 'A', stock: 5 }] }).dryRun, true)
  })
})
