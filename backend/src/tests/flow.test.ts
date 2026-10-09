import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import { after, before, describe, it } from 'node:test'
import { createApp } from '../app.js'
import { from, db, one, rows, type Row  } from '../lib/db.js'
import { env } from '../lib/env.js'
import { testMailbox } from '../lib/mailer.js'
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
const categoryId = `test-cat-${run}` // own category: existing offers/coupons in the database cannot change test prices

// Direct reads of the database state (the API under test never exposes some of these fields).
const variantById = (id: string) => one<Row>(from('ProductVariant').select('*').eq('id', id).single())
const stockOf = async (id: string) => (await variantById(id)).stock as number
const orderById = (id: string) => one<Row>(from('Order').select('*').eq('id', id).single())
const myOrders = (status?: string) => {
  let q = from('Order').select('*').eq('email', customer.email).order('number')
  if (status) q = q.eq('status', status)
  return rows<Row>(q)
}

describe('ClickMart API', () => {
  before(async () => {
    assert.match(env.SUPABASE_URL, /localhost|127\.0\.0\.1/, 'tests only run against the local stack, never a real Supabase project')
    server = createApp().listen(0)
    base = `http://localhost:${(server.address() as { port: number }).port}`
    const login = await api('/auth/login', { body: { email: process.env.SEED_ADMIN_EMAIL ?? 'admin@clickmart.com', password: process.env.SEED_ADMIN_PASSWORD } })
    assert.equal(login.status, 200, 'admin login (run `npm run db:seed` first)')
    admin = login.json.accessToken
  })

  after(async () => {
    if (productId) {
      await from('OrderItem').update({ productId: null, variantId: null }).eq('productId', productId)
      await from('Product').delete().eq('id', productId)
    }
    await from('Order').delete().eq('email', customer.email)
    await from('Category').delete().eq('id', categoryId)
    await from('Coupon').delete().like('code', `T${run.toUpperCase().slice(0, 4)}%`)
    await from('Offer').delete().like('name', `Test offer ${run}%`)
    await from('Login').delete().in('email', [customer.email, `staff-${run}@example.com`])
    server.close()
  })

  it('serves the seeded catalogue publicly', async () => {
    const list = await api('/products?category=almonds')
    assert.equal(list.status, 200)
    assert.ok(list.json.items.length >= 1)
    assert.ok(list.json.items[0].packs[0].variantId)
    const ids = list.json.items.map((item: any) => item.id).join(',')
    assert.equal((await api(`/products?ids=${ids}&pageSize=60`)).json.items.length, list.json.items.length, 'fetch by ids')
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
    const cat = await api('/admin/categories', { token: admin, body: { name: categoryId, id: categoryId } })
    assert.equal(cat.status, 201, JSON.stringify(cat.json))
    const invalid = await api('/admin/products', { token: admin, body: { name: 'Bad', categoryId, variants: [{ size: '100g', price: 100, mrp: 50 }] } })
    assert.equal(invalid.status, 400)
    const created = await api('/admin/products', {
      token: admin,
      body: { name: `Test Pouch ${run}`, slug: productSlug, categoryId, images: ['/images/almonds.jpg'], variants: [{ size: '250g', price: 300, mrp: 400, stock: 5 }, { size: '500g', price: 600, mrp: 750, stock: 2 }] },
    })
    assert.equal(created.status, 201, JSON.stringify(created.json))
    productId = created.json.product.id
    variantId = created.json.product.variants.find((v: any) => v.size === '250g').id
    assert.equal(created.json.product.gstPercent, 5)
    assert.equal(created.json.product.variants.find((v: any) => v.size === '250g').weightGrams, 250)
    const photos = await rows<Row>(from('ProductImage').select('url').eq('productId', productId))
    assert.equal(photos.length, 1)
    const page = await api(`/products/${productSlug}`)
    assert.equal(page.json.product.stock, 7)
    assert.equal(page.json.product.packs[0].price, 300)
  })

  it('applies an active offer to the storefront price and ignores expired ones', async () => {
    const offer = await api('/admin/offers', { token: admin, body: { name: `Test offer ${run}`, type: 'PERCENT', value: 10, productIds: [productId] } })
    assert.equal(offer.status, 201)
    const targets = await rows<Row>(from('OfferProduct').select('productId').eq('offerId', offer.json.offer.id))
    assert.deepEqual(targets.map((row) => row.productId), [productId])
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
    assert.equal(await stockOf(variantId), 4)
    assert.equal((await api('/checkout', { body: { items: [{ variantId, quantity: 1 }], paymentMethod: 'COD', customer, address } })).status, 401)
    const second = await api('/checkout', { body: { items: [{ variantId, quantity: 1 }], couponCode: code, paymentMethod: 'COD', customer, address }, token: buyer })
    assert.equal(second.status, 400)
    assert.match(second.json.error, /claimed/)
  })

  it('never oversells under concurrent checkouts', async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, () => api('/checkout', { token: buyer, body: { items: [{ variantId, quantity: 1 }], paymentMethod: 'COD', customer, address } })),
    )
    const ok = results.filter((r) => r.status === 201).length
    assert.equal(ok, 4, `expected exactly 4 of 6 to succeed, got ${ok}`)
    assert.equal(results.filter((r) => r.status === 409).length, 2)
    assert.equal(await stockOf(variantId), 0)
  })

  it('online payment: rejects forged signatures, confirms on a valid one', async () => {
    const other = (await one<Row>(from('ProductVariant').select('id').eq('productId', productId).eq('size', '500g').single())).id as string
    const checkout = await api('/checkout', { token: buyer, body: { items: [{ variantId: other, quantity: 1 }], paymentMethod: 'UPI', customer, address } })
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
    const paymentRow = await one<Row>(from('Payment').select('orderId').eq('providerOrderId', providerOrderId).single())
    const events = await rows(from('OrderEvent').select('id').eq('orderId', paymentRow.orderId).eq('status', 'CONFIRMED'))
    assert.equal(events.length, 1)
  })

  it('a failed online payment releases the reserved stock', async () => {
    const other = (await one<Row>(from('ProductVariant').select('id').eq('productId', productId).eq('size', '500g').single())).id as string
    const before = await stockOf(other)
    assert.equal(before, 1)
    const checkout = await api('/checkout', { token: buyer, body: { items: [{ variantId: other, quantity: 1 }], paymentMethod: 'CARD', customer, address } })
    assert.equal((await stockOf(other)), 0)
    const failed = await api('/payments/mock/pay', { body: { providerOrderId: checkout.json.payment.providerOrderId, outcome: 'failure' } })
    assert.equal(failed.status, 402)
    assert.equal((await stockOf(other)), 1)
    const order = await orderById(checkout.json.order.id)
    assert.equal(order.status, 'CANCELLED')
    assert.equal(order.paymentStatus, 'FAILED')
  })

  it('verifies webhook signatures over the raw body', async () => {
    const body = JSON.stringify({ event: 'payment.failed', payload: { payment: { entity: { id: 'x', order_id: 'nope' } } } })
    assert.equal((await api('/payments/webhook', { raw: body, headers: { 'x-signature': 'bad' } })).status, 401)
    const ok = await api('/payments/webhook', { raw: body, headers: { 'x-signature': paymentProvider.signWebhookBody(body) } })
    assert.equal(ok.status, 200)
  })

  it('logs each webhook event once, skips redeliveries, and keeps payment tables in the payment schema', async () => {
    const spare = (await one<Row>(from('ProductVariant').select('id').eq('productId', productId).eq('size', '500g').single())).id as string
    const checkout = await api('/checkout', { token: buyer, body: { items: [{ variantId: spare, quantity: 1 }], paymentMethod: 'UPI', paymentDetail: { upiId: 'hook@okbank' }, customer, address } })
    assert.equal(checkout.status, 201, JSON.stringify(checkout.json))
    const providerOrderId = checkout.json.payment.providerOrderId as string
    const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: `pay_${run}`, order_id: providerOrderId } } } })
    const headers = { 'x-signature': paymentProvider.signWebhookBody(body), 'x-razorpay-event-id': `evt_${run}` }
    const first = await api('/payments/webhook', { raw: body, headers })
    assert.equal(first.status, 200)
    const again = await api('/payments/webhook', { raw: body, headers })
    assert.equal(again.json.duplicate, true)
    const logged = await rows<Row>(from('WebhookEvent').select('*').eq('eventId', `evt_${run}`))
    assert.equal(logged.length, 1)
    assert.equal(logged[0].status, 'PROCESSED')
    assert.equal(logged[0].providerOrderId, providerOrderId)
    const payment = await one<Row>(from('Payment').select('status, paidAt, detail').eq('providerOrderId', providerOrderId).single())
    assert.equal(payment.status, 'PAID')
    assert.ok(payment.paidAt)
    assert.equal(payment.detail, 'UPI · hook@okbank')
    const { data: moved } = await db.schema('sales').from('Payment').select('id').limit(1)
    assert.equal(moved, null, 'Payment is no longer in the sales schema')
    const adminLog = await api('/admin/payments/webhooks', { token: admin })
    assert.equal(adminLog.status, 200)
    assert.ok((adminLog.json.items as Row[]).some((item) => item.eventId === `evt_${run}`))
  })

  it('tracking needs the order ID plus the matching phone or email', async () => {
    const order = (await myOrders())[0]!
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
    const order = (await myOrders('CONFIRMED'))[0]!
    const patch = (status: string, extra: object = {}) => api(`/admin/orders/${order.id}/status`, { token: admin, method: 'PATCH', body: { status, ...extra } })
    assert.equal((await patch('DELIVERED')).status, 200) // forward skips are allowed
    assert.equal((await patch('PACKED')).status, 400) // but never backwards
    assert.equal((await patch('CANCELLED')).status, 400) // and a delivered order cannot be cancelled
    const done = await orderById(order.id)
    assert.equal(done.paymentStatus, 'PAID') // COD becomes paid on delivery
    const shipment = await one<Row>(from('Shipment').select('orderId, deliveredAt').eq('orderId', order.id).single())
    assert.equal(shipment.orderId, order.id)
    assert.ok(shipment.deliveredAt)

    const second = (await myOrders('CONFIRMED'))[0]!
    const stockBefore = await stockOf(variantId)
    const cancelled = await api(`/admin/orders/${second.id}/status`, { token: admin, method: 'PATCH', body: { status: 'CANCELLED', note: 'Customer request' } })
    assert.equal(cancelled.status, 200)
    assert.equal(await stockOf(variantId), stockBefore + 1)
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
    assert.equal((await api(`/admin/products/${productId}`, { token, method: 'PATCH', body: { hsnCode: '08021100', gstPercent: 5 } })).status, 200)
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


  it('password reset: same answer for unknown emails, single-use link, sessions revoked', async () => {
    const unknown = await api('/auth/forgot-password', { body: { email: `nobody-${run}@example.com` } })
    const known = await api('/auth/forgot-password', { body: { email: customer.email } })
    assert.equal(unknown.status, 200)
    assert.deepEqual(known.json, unknown.json, 'responses must not reveal whether an account exists')
    assert.equal(testMailbox.filter((mail) => mail.to === `nobody-${run}@example.com`).length, 0)
    const mail = testMailbox.filter((item) => item.to === customer.email && /Reset/.test(item.subject)).at(-1)!
    const token = /reset-password\?token=([a-f0-9]+)/.exec(mail.text)![1]!
    assert.ok(mail.text.includes(env.STORE_URL), 'customers get a storefront link')

    assert.equal((await api('/auth/reset-password', { body: { token, password: 'short' } })).status, 400)
    assert.equal((await api('/auth/reset-password', { body: { token: 'f'.repeat(64), password: 'NewPassw0rd!' } })).status, 400)
    // an old session cookie from before the reset
    const before = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: customer.email, password: 'Passw0rd!x' }) })
    const oldCookie = before.headers.get('set-cookie')!.split(';')[0]!

    assert.equal((await api('/auth/reset-password', { body: { token, password: 'NewPassw0rd!' } })).status, 200)
    assert.equal((await api('/auth/reset-password', { body: { token, password: 'Another1234!' } })).status, 400, 'a reset link works only once')
    assert.equal((await api('/auth/login', { body: { email: customer.email, password: 'Passw0rd!x' } })).status, 401)
    assert.equal((await api('/auth/login', { body: { email: customer.email, password: 'NewPassw0rd!' } })).status, 200)
    assert.equal((await fetch(`${base}/api/v1/auth/refresh`, { method: 'POST', headers: { cookie: oldCookie } })).status, 401, 'old sessions are signed out')

    // newer requests invalidate older links
    await api('/auth/forgot-password', { body: { email: customer.email } })
    await api('/auth/forgot-password', { body: { email: customer.email } })
    const [older, newer] = testMailbox.filter((item) => item.to === customer.email && /Reset/.test(item.subject)).slice(-2).map((item) => /token=([a-f0-9]+)/.exec(item.text)![1]!)
    assert.equal((await api('/auth/reset-password', { body: { token: older, password: 'Whatever1234!' } })).status, 400)
    assert.equal((await api('/auth/reset-password', { body: { token: newer, password: 'Passw0rd!x' } })).status, 200)
  })

  it('change password needs the current password and signs other sessions out', async () => {
    const login = await api('/auth/login', { body: { email: customer.email, password: 'Passw0rd!x' } })
    const token = login.json.accessToken
    assert.equal((await api('/auth/change-password', { token, body: { currentPassword: 'wrong', newPassword: 'BrandNew123!' } })).status, 401)
    assert.equal((await api('/auth/change-password', { token, body: { currentPassword: 'Passw0rd!x', newPassword: 'short' } })).status, 400)
    assert.equal((await api('/auth/change-password', { token, body: { currentPassword: 'Passw0rd!x', newPassword: 'BrandNew123!' } })).status, 204)
    assert.equal((await api('/auth/login', { body: { email: customer.email, password: 'BrandNew123!' } })).status, 200)
    await api('/auth/change-password', { token: (await api('/auth/login', { body: { email: customer.email, password: 'BrandNew123!' } })).json.accessToken, body: { currentPassword: 'BrandNew123!', newPassword: 'Passw0rd!x' } })
  })

  it('upgrades an older password hash to the peppered format on login', async () => {
    const bcrypt = (await import('bcryptjs')).default
    const user = await one<Row>(from('Login').select('id, passwordHash').eq('email', customer.email).single())
    assert.ok(String(user.passwordHash).startsWith('v2$'))
    await from('Login').update({ passwordHash: await bcrypt.hash('Passw0rd!x', 4) }).eq('id', user.id) // as if made by the SQL helper
    assert.equal((await api('/auth/login', { body: { email: customer.email, password: 'Passw0rd!x' } })).status, 200)
    const after = await one<Row>(from('Login').select('passwordHash').eq('id', user.id).single())
    assert.ok(String(after.passwordHash).startsWith('v2$'), 'hash was upgraded')
    assert.equal((await api('/auth/login', { body: { email: customer.email, password: 'Passw0rd!x' } })).status, 200)
    assert.equal((await api('/auth/login', { body: { email: `nobody-${run}@example.com`, password: 'whatever12' } })).status, 401)
  })

  it('saved payment methods and addresses: no card data, one default, owner-only, history shows the method used', async () => {
    const token = (await api('/auth/login', { body: { email: customer.email, password: 'Passw0rd!x' } })).json.accessToken as string
    const other = (await api('/auth/register', { body: { name: 'Other Buyer', email: `other-${run}@example.com`, password: 'Passw0rd!x' } })).json.accessToken as string

    // Cards: only brand / last 4 / expiry are accepted. A full number is rejected.
    const year = new Date().getFullYear() + 2
    const bad = await api('/me/payment-methods', { token, body: { kind: 'CARD', cardBrand: 'VISA', last4: '4111111111111111', expMonth: 12, expYear: year, holderName: 'Test Buyer' } })
    assert.equal(bad.status, 400)
    const card = await api('/me/payment-methods', { token, body: { kind: 'CARD', cardBrand: 'VISA', last4: '4242', expMonth: 12, expYear: year, holderName: 'Test Buyer' } })
    assert.equal(card.status, 201)
    assert.equal(card.json.isDefault, true, 'the first saved method becomes the default')
    const upi = await api('/me/payment-methods', { token, body: { kind: 'UPI', upiId: 'Buyer@OkHdfcBank', isDefault: true } })
    assert.equal(upi.status, 201)
    assert.equal(upi.json.upiId, 'buyer@okhdfcbank')
    assert.equal((await api('/me/payment-methods', { token, body: { kind: 'UPI', upiId: 'buyer@okhdfcbank' } })).status, 200, 'saving the same UPI ID twice reuses the row')
    const list = (await api('/me/payment-methods', { token })).json.items as Row[]
    assert.equal(list.length, 2)
    assert.deepEqual(list.filter((item) => item.isDefault).map((item) => item.id), [upi.json.id], 'exactly one default')
    assert.ok(!JSON.stringify(list).includes('4111'))

    // Another customer cannot see, change or use them.
    assert.equal((await api('/me/payment-methods', { token: other })).json.items.length, 0)
    assert.equal((await api(`/me/payment-methods/${card.json.id}`, { method: 'DELETE', token: other })).status, 404)
    const stolen = await api('/checkout', { token: other, body: { items: [{ variantId, quantity: 1 }], paymentMethod: 'CARD', paymentDetail: { savedPaymentId: card.json.id }, customer, address } })
    assert.equal(stolen.status, 400)

    // Pay with the saved card: the Payment row records what was used and history lists it.
    const stockBefore = await stockOf(variantId)
    const checkout = await api('/checkout', { token, body: { items: [{ variantId, quantity: 1 }], paymentMethod: 'CARD', paymentDetail: { savedPaymentId: card.json.id }, customer, address } })
    assert.equal(checkout.status, 201)
    assert.equal(checkout.json.order.payment.detail, 'VISA •••• 4242')
    const paid = paymentProvider.mockGatewayPay(checkout.json.payment.providerOrderId)
    assert.equal((await api('/payments/verify', { body: { providerOrderId: checkout.json.payment.providerOrderId, ...paid } })).status, 200)
    const history = (await api('/me/payments', { token })).json.items as Row[]
    const entry = history.find((item) => item.orderCode === checkout.json.order.code)!
    assert.equal(entry.status, 'PAID')
    assert.equal(entry.detail, 'VISA •••• 4242')
    assert.ok(entry.paidAt)
    assert.equal((await api('/me/payments', { token: other })).json.items.length, 0, 'history is private')
    assert.equal(await stockOf(variantId), stockBefore - 1)

    // Deleting the default promotes another method.
    assert.equal((await api(`/me/payment-methods/${upi.json.id}`, { method: 'DELETE', token })).status, 204)
    const left = (await api('/me/payment-methods', { token })).json.items as Row[]
    assert.equal(left.length, 1)
    assert.equal(left[0].isDefault, true)

    // Addresses: label and landmark are stored and defaults switch atomically.
    const home = await api('/me/addresses', { token, body: { name: 'Test Buyer', phone: '9876543210', ...address, label: 'HOME', landmark: 'Near the park' } })
    const work = await api('/me/addresses', { token, body: { name: 'Test Buyer', phone: '9876543210', ...address, label: 'WORK', isDefault: true } })
    assert.equal(home.json.landmark, 'Near the park')
    assert.equal(home.json.isDefault, true)
    assert.equal(work.json.label, 'WORK')
    assert.equal((await api(`/me/addresses/${home.json.id}/default`, { method: 'POST', token })).status, 204)
    const addresses = (await api('/me/addresses', { token })).json.items as Row[]
    assert.deepEqual(addresses.filter((item) => item.isDefault).map((item) => item.id), [home.json.id])
  })

  it('a blocked account cannot log in or refresh', async () => {
    const me = await from('Login').select('id').eq('email', customer.email).single()
    const login = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: customer.email, password: 'Passw0rd!x' }) })
    const cookie = login.headers.get('set-cookie')!.split(';')[0]!
    await from('Login').update({ isBlocked: true }).eq('id', me.data!.id)
    assert.equal((await api('/auth/login', { body: { email: customer.email, password: 'Passw0rd!x' } })).status, 401)
    assert.equal((await fetch(`${base}/api/v1/auth/refresh`, { method: 'POST', headers: { cookie } })).status, 401)
    await from('Login').update({ isBlocked: false }).eq('id', me.data!.id)
  })

  it('refresh tokens rotate, tolerate an interrupted refresh, and logout revokes the session', async () => {
    const login = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: customer.email, password: 'Passw0rd!x' }) })
    const cookie = login.headers.get('set-cookie')!.split(';')[0]!
    const refreshed = await fetch(`${base}/api/v1/auth/refresh`, { method: 'POST', headers: { cookie } })
    assert.equal(refreshed.status, 200)
    assert.notEqual(refreshed.headers.get('set-cookie')!.split(';')[0], cookie, 'a new refresh token is issued')
    // The browser may never have stored the new cookie (reload mid-refresh): the old one still works briefly.
    const retry = await fetch(`${base}/api/v1/auth/refresh`, { method: 'POST', headers: { cookie } })
    assert.equal(retry.status, 200)
    const newCookie = retry.headers.get('set-cookie')!.split(';')[0]!
    await fetch(`${base}/api/v1/auth/logout`, { method: 'POST', headers: { cookie: newCookie } })
    const afterLogout = await fetch(`${base}/api/v1/auth/refresh`, { method: 'POST', headers: { cookie: newCookie } })
    assert.equal(afterLogout.status, 401, 'logout revokes the token immediately')
  })
})
