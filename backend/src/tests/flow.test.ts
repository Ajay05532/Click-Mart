import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import { after, before, describe, it } from 'node:test'
import { createApp } from '../app.js'
import { prisma } from '../lib/prisma.js'
import { paymentProvider } from '../lib/payments.js'

process.env.NODE_ENV = 'test'

let server: Server
let base = ''
const run = Date.now().toString(36)

async function api(path: string, opts: { method?: string; body?: unknown; token?: string; headers?: Record<string, string>; raw?: string } = {}) {
  const response = await fetch(`${base}/api/v1${path}`, {
    method: opts.method ?? (opts.body || opts.raw ? 'POST' : 'GET'),
    headers: {
      ...(opts.body || opts.raw ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      ...opts.headers,
    },
    body: opts.raw ?? (opts.body ? JSON.stringify(opts.body) : undefined),
  })
  const text = await response.text()
  let json: any = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = text
  }
  return { status: response.status, json, headers: response.headers }
}

const address = { line: '12 MG Road, Indiranagar', city: 'Bengaluru', state: 'Karnataka', pin: '560038' }
const customer = { name: 'Test Buyer', email: `buyer-${run}@example.com`, phone: '9876543210' }

let admin = ''
let buyer = ''
let productId = ''
let variantId = ''
const productSlug = `test-pouch-${run}`

describe('ClickMart API', () => {
  before(async () => {
    server = createApp().listen(0)
    base = `http://localhost:${(server.address() as { port: number }).port}`
    const login = await api('/auth/login', { body: { email: process.env.SEED_ADMIN_EMAIL ?? 'admin@clickmart.com', password: process.env.SEED_ADMIN_PASSWORD } })
    assert.equal(login.status, 200, 'admin login (run `npm run db:seed` first)')
    admin = login.json.accessToken
  })

  after(async () => {
    if (productId) {
      await prisma.orderItem.updateMany({ where: { productId }, data: { productId: null, variantId: null } })
      await prisma.product.delete({ where: { id: productId } }).catch(() => undefined)
    }
    await prisma.order.deleteMany({ where: { email: customer.email } })
    await prisma.coupon.deleteMany({ where: { code: { startsWith: 'T' + run.toUpperCase().slice(0, 4) } } })
    await prisma.offer.deleteMany({ where: { name: { startsWith: `Test offer ${run}` } } })
    await prisma.user.deleteMany({ where: { email: { in: [customer.email, `staff-${run}@example.com`] } } })
    server.close()
    await prisma.$disconnect()
  })

  it('serves the seeded catalogue publicly', async () => {
    const list = await api('/products?category=almonds')
    assert.equal(list.status, 200)
    assert.ok(list.json.items.length >= 1)
    assert.ok(list.json.items[0].packs[0].variantId)
    const categories = await api('/categories')
    assert.ok(categories.json.items.some((c: any) => c.id === 'cashews' && c.subcategories.length === 2))
  })

  it('blocks customers and anonymous users from the admin API', async () => {
    assert.equal((await api('/admin/products')).status, 401)
    const reg = await api('/auth/register', { body: { name: 'Test Buyer', email: customer.email, password: 'Passw0rd!x', phone: customer.phone } })
    assert.equal(reg.status, 201)
    buyer = reg.json.accessToken
    assert.equal((await api('/admin/products', { token: buyer })).status, 403)
    assert.equal((await api('/auth/register', { body: { name: 'Dup', email: customer.email, password: 'Passw0rd!x' } })).status, 409)
    assert.equal((await api('/auth/login', { body: { email: customer.email, password: 'wrong-password' } })).status, 401)
  })

  it('admin creates a product with stock and it appears on the storefront', async () => {
    const invalid = await api('/admin/products', { token: admin, body: { name: 'Bad', categoryId: 'almonds', variants: [{ size: '100g', price: 100, mrp: 50 }] } })
    assert.equal(invalid.status, 400)
    const created = await api('/admin/products', {
      token: admin,
      body: { name: `Test Pouch ${run}`, slug: productSlug, categoryId: 'almonds', variants: [{ size: '250g', price: 300, mrp: 400, stock: 5 }, { size: '500g', price: 600, mrp: 750, stock: 2 }] },
    })
    assert.equal(created.status, 201, JSON.stringify(created.json))
    productId = created.json.product.id
    variantId = created.json.product.variants.find((v: any) => v.size === '250g').id
    const page = await api(`/products/${productSlug}`)
    assert.equal(page.json.product.stock, 7)
    assert.equal(page.json.product.packs[0].price, 300)
  })

  it('applies an active offer to the storefront price and ignores expired ones', async () => {
    const offer = await api('/admin/offers', { token: admin, body: { name: `Test offer ${run}`, type: 'PERCENT', value: 10, productIds: [productId] } })
    assert.equal(offer.status, 201)
    let page = await api(`/products/${productSlug}`)
    assert.equal(page.json.product.packs[0].price, 270)
    await api(`/admin/offers/${offer.json.offer.id}`, { token: admin, method: 'PATCH', body: { endsAt: new Date(Date.now() - 1000).toISOString(), startsAt: new Date(Date.now() - 86400000).toISOString() } })
    page = await api(`/products/${productSlug}`)
    assert.equal(page.json.product.packs[0].price, 300)
    await api(`/admin/offers/${offer.json.offer.id}`, { token: admin, method: 'DELETE' })
  })

  it('prices carts on the server, including coupons and shipping', async () => {
    const code = `T${run.toUpperCase().slice(0, 4)}X`
    const coupon = await api('/admin/coupons', { token: admin, body: { code, label: 'Test 10%', type: 'PERCENT', value: 10, minOrder: 200, usageLimit: 1 } })
    assert.equal(coupon.status, 201, JSON.stringify(coupon.json))
    const quote = await api('/cart/quote', { body: { items: [{ variantId, quantity: 1 }], couponCode: code } })
    assert.equal(quote.status, 200)
    assert.equal(quote.json.subtotal, 300)
    assert.equal(quote.json.couponDiscount, 30)
    assert.equal(quote.json.shipping, 49)
    assert.equal(quote.json.total, 319)
    const free = await api('/cart/quote', { body: { items: [{ variantId, quantity: 2 }] } })
    assert.equal(free.json.shipping, 0)
    assert.equal((await api('/cart/quote', { body: { items: [{ variantId, quantity: 99 }] } })).status, 409)
    assert.equal((await api('/cart/quote', { body: { items: [{ variantId, quantity: 1 }], couponCode: 'NOPE' } })).status, 400)
  })

  it('COD checkout reserves stock, and a coupon with a usage limit cannot be reused', async () => {
    const code = `T${run.toUpperCase().slice(0, 4)}X`
    const first = await api('/checkout', { body: { items: [{ variantId, quantity: 1 }], couponCode: code, paymentMethod: 'COD', customer, address }, token: buyer })
    assert.equal(first.status, 201, JSON.stringify(first.json))
    assert.equal(first.json.order.status, 'CONFIRMED')
    assert.equal(first.json.order.total, 319)
    assert.equal(first.json.payment, null)
    const v = await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })
    assert.equal(v.stock, 4)
    const second = await api('/checkout', { body: { items: [{ variantId, quantity: 1 }], couponCode: code, paymentMethod: 'COD', customer, address } })
    assert.equal(second.status, 400)
    assert.match(second.json.error, /claimed/)
  })

  it('never oversells under concurrent checkouts', async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, () => api('/checkout', { body: { items: [{ variantId, quantity: 1 }], paymentMethod: 'COD', customer, address } })),
    )
    const ok = results.filter((r) => r.status === 201).length
    assert.equal(ok, 4, `expected exactly 4 of 6 to succeed, got ${ok}`)
    assert.equal(results.filter((r) => r.status === 409).length, 2)
    const v = await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })
    assert.equal(v.stock, 0)
  })

  it('online payment: rejects forged signatures, confirms on a valid one', async () => {
    const other = (await prisma.productVariant.findFirstOrThrow({ where: { productId, size: '500g' } })).id
    const checkout = await api('/checkout', { body: { items: [{ variantId: other, quantity: 1 }], paymentMethod: 'UPI', customer, address } })
    assert.equal(checkout.status, 201)
    assert.equal(checkout.json.order.status, 'PLACED')
    assert.equal(checkout.json.order.paymentStatus, 'PENDING')
    const { providerOrderId } = checkout.json.payment
    const forged = await api('/payments/verify', { body: { providerOrderId, providerPaymentId: 'pay_x', signature: 'deadbeef' } })
    assert.equal(forged.status, 401)
    const pay = await api('/payments/mock/pay', { body: { providerOrderId } })
    const verified = await api('/payments/verify', { body: { providerOrderId, ...pay.json } })
    assert.equal(verified.status, 200)
    assert.equal(verified.json.order.paymentStatus, 'PAID')
    assert.equal(verified.json.order.status, 'CONFIRMED')
    // Idempotent: a second callback (e.g. the webhook) changes nothing.
    const again = await api('/payments/verify', { body: { providerOrderId, ...pay.json } })
    assert.equal(again.status, 200)
    const events = await prisma.orderEvent.count({ where: { order: { payments: { some: { providerOrderId } } }, status: 'CONFIRMED' } })
    assert.equal(events, 1)
  })

  it('a failed online payment releases the reserved stock', async () => {
    const other = (await prisma.productVariant.findFirstOrThrow({ where: { productId, size: '500g' } })).id
    const before = (await prisma.productVariant.findUniqueOrThrow({ where: { id: other } })).stock
    assert.equal(before, 1)
    const checkout = await api('/checkout', { body: { items: [{ variantId: other, quantity: 1 }], paymentMethod: 'CARD', customer, address } })
    assert.equal((await prisma.productVariant.findUniqueOrThrow({ where: { id: other } })).stock, 0)
    const failed = await api('/payments/mock/pay', { body: { providerOrderId: checkout.json.payment.providerOrderId, outcome: 'failure' } })
    assert.equal(failed.status, 402)
    assert.equal((await prisma.productVariant.findUniqueOrThrow({ where: { id: other } })).stock, 1)
    const order = await prisma.order.findUniqueOrThrow({ where: { id: checkout.json.order.id } })
    assert.equal(order.status, 'CANCELLED')
    assert.equal(order.paymentStatus, 'FAILED')
  })

  it('verifies webhook signatures over the raw body', async () => {
    const body = JSON.stringify({ event: 'payment.failed', payload: { payment: { entity: { id: 'x', order_id: 'nope' } } } })
    assert.equal((await api('/payments/webhook', { raw: body, headers: { 'x-signature': 'bad' } })).status, 401)
    const ok = await api('/payments/webhook', { raw: body, headers: { 'x-signature': paymentProvider.signWebhookBody(body) } })
    assert.equal(ok.status, 200)
  })

  it('tracking needs the order ID plus the matching phone or email', async () => {
    const order = await prisma.order.findFirstOrThrow({ where: { email: customer.email }, orderBy: { number: 'asc' } })
    const code = `ORD-${order.number}`
    assert.equal((await api(`/track/${code}`)).status, 400)
    assert.equal((await api(`/track/${code}?contact=9000000000`)).status, 404)
    const byPhone = await api(`/track/${code}?contact=98765 43210`)
    assert.equal(byPhone.status, 200)
    assert.equal(byPhone.json.order.status, 'CONFIRMED')
    assert.equal((await api(`/track/${code}?contact=${customer.email}`)).status, 200)
    // Orders are private to their owner.
    assert.equal((await api(`/orders/${code}`)).status, 401)
    assert.equal((await api(`/orders/${code}`, { token: buyer })).status, 200)
  })

  it('admin moves an order through the pipeline; cancel restores stock', async () => {
    const order = await prisma.order.findFirstOrThrow({ where: { email: customer.email, status: 'CONFIRMED' }, orderBy: { number: 'asc' } })
    const patch = (status: string, extra: object = {}) => api(`/admin/orders/${order.id}/status`, { token: admin, method: 'PATCH', body: { status, ...extra } })
    assert.equal((await patch('DELIVERED')).status, 200) // forward skips are allowed
    assert.equal((await patch('PACKED')).status, 400) // but never backwards
    assert.equal((await patch('CANCELLED')).status, 400) // and a delivered order cannot be cancelled
    const done = await prisma.order.findUniqueOrThrow({ where: { id: order.id } })
    assert.equal(done.paymentStatus, 'PAID') // COD becomes paid on delivery

    const second = await prisma.order.findFirstOrThrow({ where: { email: customer.email, status: 'CONFIRMED' } })
    const stockBefore = (await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock
    const cancelled = await api(`/admin/orders/${second.id}/status`, { token: admin, method: 'PATCH', body: { status: 'CANCELLED', note: 'Customer request' } })
    assert.equal(cancelled.status, 200)
    assert.equal((await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock, stockBefore + 1)
    const ship = await api(`/admin/orders/${second.id}/status`, { token: admin, method: 'PATCH', body: { status: 'SHIPPED' } })
    assert.equal(ship.status, 400)
  })

  it('admin stock adjustments are logged and cannot go negative', async () => {
    const restock = await api(`/admin/variants/${variantId}/stock`, { token: admin, body: { mode: 'adjust', quantity: 10, reason: 'RESTOCK', note: 'New batch' } })
    assert.equal(restock.status, 200)
    const stock = restock.json.variant.stock
    assert.equal((await api(`/admin/variants/${variantId}/stock`, { token: admin, body: { mode: 'adjust', quantity: -(stock + 1) } })).status, 400)
    assert.equal((await api(`/admin/variants/${variantId}/stock`, { token: admin, body: { mode: 'set', quantity: 3 } })).json.variant.stock, 3)
    const history = await api(`/admin/inventory/${variantId}/history`, { token: admin })
    assert.ok(history.json.items.length >= 3)
    assert.equal(history.json.items[0].balance, 3)
  })

  it('role limits: staff can manage orders but not money or settings', async () => {
    const staff = await api('/admin/staff', { token: admin, body: { name: 'Packer', email: `staff-${run}@example.com`, password: 'Passw0rd!x', role: 'STAFF' } })
    assert.equal(staff.status, 201)
    const login = await api('/auth/login', { body: { email: `staff-${run}@example.com`, password: 'Passw0rd!x' } })
    const token = login.json.accessToken
    assert.equal((await api('/admin/orders', { token })).status, 200)
    assert.equal((await api('/admin/inventory', { token })).status, 200)
    assert.equal((await api('/admin/analytics', { token })).status, 403)
    assert.equal((await api('/admin/settings', { token })).status, 403)
    assert.equal((await api('/admin/coupons', { token })).status, 403)
    assert.equal((await api('/admin/summary', { token })).status, 200)
  })

  it('reviews are moderated and update the product rating', async () => {
    const review = await api(`/products/${productSlug}/reviews`, { token: buyer, body: { rating: 4, comment: 'Fresh and crunchy, will reorder' } })
    assert.equal(review.status, 201)
    assert.equal((await api(`/products/${productSlug}/reviews`)).json.items.length, 0)
    await api(`/admin/reviews/${review.json.review.id}`, { token: admin, method: 'PATCH', body: { status: 'APPROVED' } })
    assert.equal((await api(`/products/${productSlug}/reviews`)).json.items.length, 1)
    assert.equal((await api(`/products/${productSlug}`)).json.product.rating, 4)
  })

  it('analytics reports revenue for admins', async () => {
    const stats = await api('/admin/analytics?days=7', { token: admin })
    assert.equal(stats.status, 200)
    assert.equal(stats.json.daily.length, 7)
    assert.ok(stats.json.orders >= 1)
  })

  it('refresh tokens rotate and logout revokes the session', async () => {
    const login = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: customer.email, password: 'Passw0rd!x' }) })
    const cookie = login.headers.get('set-cookie')!.split(';')[0]!
    const refreshed = await fetch(`${base}/api/v1/auth/refresh`, { method: 'POST', headers: { cookie } })
    assert.equal(refreshed.status, 200)
    const replay = await fetch(`${base}/api/v1/auth/refresh`, { method: 'POST', headers: { cookie } })
    assert.equal(replay.status, 401, 'a used refresh token must not work twice')
  })
})
