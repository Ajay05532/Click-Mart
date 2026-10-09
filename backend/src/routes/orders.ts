import { createHash } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { forbidden, HttpError, notFound, unauthorized } from '../lib/errors.js'
import { changeStatus, createOrder, failPayment, loadOrder, markPaid } from '../lib/orders.js'
import { exec, from, one, maybe, rows, type Row } from '../lib/db.js'
import { ORDER_SELECT } from '../lib/types.js'
import { paymentProvider } from '../lib/payments.js'
import { orderCode, serializeOrder } from '../lib/serializers.js'
import { env } from '../lib/env.js'
import { actor, requireAuth } from '../middleware/auth.js'
import type { Request } from 'express'
import { upiIdSchema } from './wallet.js'

export const ordersRouter = Router()

const checkoutSchema = z.object({
  items: z.array(z.object({ variantId: z.string(), quantity: z.number().int().min(1).max(99) })).min(1).max(50),
  couponCode: z.string().trim().max(40).nullish(),
  paymentMethod: z.enum(['UPI', 'CARD', 'NETBANKING', 'COD']),
  // What the shopper is paying with. Never a card number or CVV: those stay in the browser / gateway.
  paymentDetail: z
    .object({
      savedPaymentId: z.string().max(60).optional(),
      upiId: upiIdSchema.optional(),
      cardBrand: z.string().trim().max(20).optional(),
      cardLast4: z.string().regex(/^\d{4}$/).optional(),
      bank: z.string().trim().max(60).optional(),
    })
    .optional(),
  customer: z.object({
    name: z.string().trim().min(2).max(80),
    email: z.string().trim().toLowerCase().email(),
    phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'),
  }),
  address: z.object({
    line: z.string().trim().min(8).max(250),
    city: z.string().trim().min(2).max(80),
    state: z.string().trim().min(2).max(60),
    pin: z.string().regex(/^\d{6}$/, 'Enter a 6-digit PIN code'),
  }),
})

ordersRouter.post('/checkout', requireAuth, async (req, res) => {
  const data = checkoutSchema.parse(req.body)
  const { order, payment } = await createOrder({ ...data, couponCode: data.couponCode ?? null, paymentDetail: data.paymentDetail ?? null }, actor(req).id)
  res.status(201).json({ order: serializeOrder(order), payment })
})

/** Parses ORD-1234 (or 1234) into the numeric order number. */
function parseCode(value: string) {
  const match = /^(?:ORD-)?(\d{1,9})$/i.exec(value.trim())
  return match ? Number(match[1]) : null
}

async function loadOwned(req: Request, code: string) {
  const number = parseCode(code)
  const order = number === null ? null : await maybe<Row>(from('Order').select(ORDER_SELECT).eq('number', number).maybeSingle())
  if (!order) throw notFound('Order')
  const auth = req.auth
  const isStaff = auth && (auth.role === 'ADMIN' || auth.role === 'STAFF')
  if (!isStaff && order.userId !== auth?.id) throw order.userId && auth ? forbidden() : notFound('Order')
  return order
}

ordersRouter.get('/orders', requireAuth, async (req, res) => {
  const orders = await rows<Row>(from('Order').select(ORDER_SELECT).eq('userId', actor(req).id).order('createdAt', { ascending: false }).limit(100))
  res.json({ items: orders.map(serializeOrder) })
})

ordersRouter.get('/orders/:code', requireAuth, async (req, res) => {
  res.json({ order: serializeOrder(await loadOwned(req, String(req.params.code))) })
})

ordersRouter.post('/orders/:code/cancel', requireAuth, async (req, res) => {
  const order = await loadOwned(req, String(req.params.code))
  const reason = z.object({ reason: z.string().trim().max(200).optional() }).parse(req.body ?? {}).reason
  await changeStatus(order.id, 'CANCELLED', { note: reason ? `Cancelled by customer: ${reason}` : 'Cancelled by customer' })
  res.json({ order: serializeOrder(await loadOrder(order.id)) })
})

ordersRouter.get('/orders/:code/invoice', requireAuth, async (req, res) => {
  const order = await loadOwned(req, String(req.params.code))
  res.type('html').send(renderInvoice(order))
})

// Guest-friendly tracking: the order ID alone is guessable, so the phone number or email must match too.
ordersRouter.get('/track/:code', async (req, res) => {
  const contact = z.string().trim().min(3).parse(req.query.contact)
  const number = parseCode(String(req.params.code))
  const order = number === null ? null : await maybe<Row>(from('Order').select(ORDER_SELECT).eq('number', number).maybeSingle())
  const digits = contact.replace(/\D/g, '').slice(-10)
  const matches = order && (order.email === contact.toLowerCase() || (digits.length === 10 && order.phone.endsWith(digits)))
  if (!order || !matches) throw notFound('Order') // identical response for wrong ID and wrong contact
  const full = serializeOrder(order)
  res.json({
    order: {
      code: full.code,
      status: full.status,
      paymentStatus: full.paymentStatus,
      items: full.items.map(({ name, size, quantity, image, art }) => ({ name, size, quantity, image, art })),
      total: full.total,
      events: full.events,
      carrier: full.carrier,
      trackingNumber: full.trackingNumber,
      placedAt: full.placedAt,
      estimatedDelivery: full.estimatedDelivery,
      city: full.address.city,
    },
  })
})

// ---- Payments ----
export const paymentsRouter = Router()

/** Called by the storefront after the gateway returns. Trusts only the HMAC signature. */
paymentsRouter.post('/verify', async (req, res) => {
  const data = z.object({ providerOrderId: z.string(), providerPaymentId: z.string(), signature: z.string() }).parse(req.body)
  if (!paymentProvider.verifyPayment(data.providerOrderId, data.providerPaymentId, data.signature)) {
    throw unauthorized('Payment signature is invalid')
  }
  const result = await markPaid(data.providerOrderId, data.providerPaymentId)
  res.json({ order: serializeOrder(await loadOrder(result.orderId)) })
})

paymentsRouter.post('/fail', async (req, res) => {
  const data = z.object({ providerOrderId: z.string(), reason: z.string().max(200).optional() }).parse(req.body)
  const payment = await maybe<{ orderId: string }>(from('Payment').select('orderId').eq('providerOrderId', data.providerOrderId).limit(1).maybeSingle())
  if (!payment) throw notFound('Payment')
  await failPayment(payment.orderId, data.reason ?? 'Payment failed')
  res.json({ order: serializeOrder(await loadOrder(payment.orderId)) })
})

// Development stand-in for the gateway's hosted page (disabled when a real provider is configured).
paymentsRouter.post('/mock/pay', async (req, res) => {
  if (paymentProvider.name !== 'mock' || env.NODE_ENV === 'production') throw notFound('Route')
  const data = z.object({ providerOrderId: z.string(), outcome: z.enum(['success', 'failure']).default('success') }).parse(req.body)
  const payment = await maybe<{ orderId: string }>(from('Payment').select('orderId').eq('providerOrderId', data.providerOrderId).limit(1).maybeSingle())
  if (!payment) throw notFound('Payment')
  if (data.outcome === 'failure') {
    await failPayment(payment.orderId, 'Your bank declined the payment')
    return res.status(402).json({ error: 'Your bank declined the payment' })
  }
  res.json(paymentProvider.mockGatewayPay(data.providerOrderId))
})

/** Server-to-server confirmation (Razorpay events). Signed over the raw body, logged once per event id. */
export async function paymentWebhook(req: Request, res: import('express').Response) {
  const raw = req.body as Buffer
  if (!paymentProvider.verifyWebhook(raw, req.header('x-razorpay-signature') ?? req.header('x-signature'))) {
    throw unauthorized('Invalid webhook signature')
  }
  const event = JSON.parse(raw.toString('utf8')) as {
    event: string
    payload?: { payment?: { entity?: { id: string; order_id: string } } }
  }
  const entity = event.payload?.payment?.entity
  const eventId = req.header('x-razorpay-event-id') ?? createHash('sha256').update(raw).digest('hex')

  // One row per event id. A redelivery of an event we already handled is acknowledged and skipped;
  // one that failed or never finished is processed again.
  let logId: string
  try {
    logId = (await one<{ id: string }>(from('WebhookEvent').insert({ provider: paymentProvider.name, eventId, eventType: event.event, providerOrderId: entity?.order_id ?? null, providerPaymentId: entity?.id ?? null, payload: event }).select('id').single())).id
  } catch (error) {
    if (!(error instanceof HttpError) || error.status !== 409) throw error
    const existing = await one<{ id: string; status: string }>(from('WebhookEvent').select('id, status').eq('provider', paymentProvider.name).eq('eventId', eventId).single())
    if (existing.status === 'PROCESSED' || existing.status === 'IGNORED') return res.json({ received: true, duplicate: true })
    logId = existing.id
  }

  try {
    let handled = false
    if (entity) {
      if (event.event === 'payment.captured' || event.event === 'order.paid') {
        await markPaid(entity.order_id, entity.id, event)
        handled = true
      } else if (event.event === 'payment.failed') {
        const payment = await maybe<{ orderId: string }>(from('Payment').select('orderId').eq('providerOrderId', entity.order_id).limit(1).maybeSingle())
        if (payment) await failPayment(payment.orderId, 'Payment failed')
        handled = true
      }
    }
    await exec(from('WebhookEvent').update({ status: handled ? 'PROCESSED' : 'IGNORED', error: null, processedAt: new Date().toISOString() }).eq('id', logId))
  } catch (error) {
    await exec(from('WebhookEvent').update({ status: 'FAILED', error: error instanceof Error ? error.message.slice(0, 500) : 'Unknown error' }).eq('id', logId)).catch(() => undefined)
    throw error
  }
  res.json({ received: true })
}

function renderInvoice(order: Row) {
  const esc = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
  const lines = (order.items as Row[])
    .map((item) => `<tr><td>${esc(item.name)} (${esc(item.size)})</td><td>${item.quantity}</td><td>₹${item.unitPrice}</td><td>₹${item.unitPrice * item.quantity}</td></tr>`)
    .join('')
  return `<!doctype html><meta charset="utf-8"><title>Invoice ${orderCode(order.number)}</title>
<style>body{font:14px system-ui;max-width:720px;margin:32px auto;padding:0 16px;color:#152033}table{width:100%;border-collapse:collapse;margin:16px 0}td,th{padding:8px;border-bottom:1px solid #e5ebf3;text-align:left}.r{text-align:right}h1{margin:0}</style>
<h1>ClickMart</h1><p>Invoice ${orderCode(order.number)} · ${new Date(order.createdAt).toDateString()}</p>
<p><b>${esc(order.customerName)}</b><br>${esc(order.addressLine)}, ${esc(order.city)}, ${esc(order.state)} ${esc(order.pin)}<br>${esc(order.phone)}</p>
<table><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr>${lines}</table>
<p class="r">Subtotal ₹${order.subtotal}<br>Offers −₹${order.offerDiscount}<br>Coupon −₹${order.discount}<br>Shipping ₹${order.shipping}<br><b>Total ₹${order.total}</b></p>`
}

export { renderInvoice }
