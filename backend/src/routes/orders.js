import { createHash } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { conflict, forbidden, HttpError, notFound, unauthorized } from '../utils/errors.js'
import { changeStatus, createOrder, failPayment, loadOrder, markPaid } from '../services/orders.js'
import { exec, from, one, maybe, rows } from '../database/db.js'
import { ORDER_SELECT } from '../database/selects.js'
import { paymentProvider } from '../services/payments.js'
import { serializeOrder } from '../utils/serializers.js'
import { env } from '../config/env.js'
import { actor, requireAuth } from '../middleware/auth.js'
import { upiIdSchema } from './wallet.js'
import { renderInvoiceHtml } from '../services/invoice.js'
import { getSettings } from '../services/settings.js'
export const ordersRouter = Router()
const checkoutSchema = z.object({
  items: z
    .array(
      z.object({
        variantId: z.string(),
        quantity: z.number().int().min(1).max(99),
      }),
    )
    .min(1)
    .max(50),
  couponCode: z.string().trim().max(40).nullish(),
  paymentMethod: z.enum(['UPI', 'CARD', 'NETBANKING', 'COD']),
  paymentDetail: z
    .object({
      savedPaymentId: z.string().max(60).optional(),
      upiId: upiIdSchema.optional(),
      cardBrand: z.string().trim().max(20).optional(),
      cardLast4: z
        .string()
        .regex(/^\d{4}$/)
        .optional(),
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
  const { order, payment } = await createOrder(
    {
      ...data,
      couponCode: data.couponCode ?? null,
      paymentDetail: data.paymentDetail ?? null,
    },
    actor(req).id,
  )
  res.status(201).json({
    order: serializeOrder(order),
    payment,
  })
})
function parseCode(value) {
  const match = /^(?:ORD-)?(\d{1,9})$/i.exec(value.trim())
  return match ? Number(match[1]) : null
}
async function loadOwned(req, code) {
  const number = parseCode(code)
  const order = number === null ? null : await maybe(from('Order').select(ORDER_SELECT).eq('number', number).maybeSingle())
  if (!order) throw notFound('Order')
  const auth = req.auth
  const isStaff = auth && (auth.role === 'ADMIN' || auth.role === 'STAFF')
  if (!isStaff && order.userId !== auth?.id) throw order.userId && auth ? forbidden() : notFound('Order')
  return order
}
ordersRouter.get('/orders', requireAuth, async (req, res) => {
  const orders = await rows(
    from('Order')
      .select(ORDER_SELECT)
      .eq('userId', actor(req).id)
      .order('createdAt', {
        ascending: false,
      })
      .limit(100),
  )
  res.json({
    items: orders.map(serializeOrder),
  })
})
ordersRouter.get('/orders/:code', requireAuth, async (req, res) => {
  res.json({
    order: serializeOrder(await loadOwned(req, String(req.params.code))),
  })
})
ordersRouter.post('/orders/:code/cancel', requireAuth, async (req, res) => {
  const order = await loadOwned(req, String(req.params.code))
  if (order.status !== 'PLACED' && order.status !== 'CONFIRMED') {
    throw conflict(
      order.status === 'PACKED'
        ? 'This order is packed for delivery and can no longer be cancelled.'
        : 'This order can no longer be cancelled.',
    )
  }
  const reason = z
    .object({
      reason: z.string().trim().max(200).optional(),
    })
    .parse(req.body ?? {}).reason
  await changeStatus(order.id, 'CANCELLED', {
    note: reason ? `Cancelled by customer: ${reason}` : 'Cancelled by customer',
  })
  res.json({
    order: serializeOrder(await loadOrder(order.id)),
  })
})
ordersRouter.get('/orders/:code/invoice', requireAuth, async (req, res) => {
  const order = await loadOwned(req, String(req.params.code))
  res.type('html').send(renderInvoiceHtml(serializeOrder(order), await getSettings()))
})
ordersRouter.get('/track/:code', async (req, res) => {
  const contact = z.string().trim().min(3).parse(req.query.contact)
  const number = parseCode(String(req.params.code))
  const order = number === null ? null : await maybe(from('Order').select(ORDER_SELECT).eq('number', number).maybeSingle())
  const digits = contact.replace(/\D/g, '').slice(-10)
  const matches = order && (order.email === contact.toLowerCase() || (digits.length === 10 && order.phone.endsWith(digits)))
  if (!order || !matches) throw notFound('Order')
  const full = serializeOrder(order)
  res.json({
    order: {
      code: full.code,
      status: full.status,
      paymentStatus: full.paymentStatus,
      items: full.items.map(({ name, size, quantity, image, art }) => ({
        name,
        size,
        quantity,
        image,
        art,
      })),
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
export const paymentsRouter = Router()
paymentsRouter.post('/verify', async (req, res) => {
  const data = z
    .object({
      providerOrderId: z.string(),
      providerPaymentId: z.string(),
      signature: z.string(),
    })
    .parse(req.body)
  if (!paymentProvider.verifyPayment(data.providerOrderId, data.providerPaymentId, data.signature)) {
    throw unauthorized('Payment signature is invalid')
  }
  const attempt = await maybe(from('Payment').select('amount').eq('providerOrderId', data.providerOrderId).limit(1).maybeSingle())
  if (!attempt) throw notFound('Payment')
  await paymentProvider.assertCaptured(data.providerOrderId, data.providerPaymentId, attempt.amount)
  const result = await markPaid(data.providerOrderId, data.providerPaymentId)
  res.json({
    order: serializeOrder(await loadOrder(result.orderId)),
  })
})
paymentsRouter.post('/fail', async (req, res) => {
  const data = z
    .object({
      providerOrderId: z.string(),
      reason: z.string().max(200).optional(),
    })
    .parse(req.body)
  const payment = await maybe(from('Payment').select('orderId').eq('providerOrderId', data.providerOrderId).limit(1).maybeSingle())
  if (!payment) throw notFound('Payment')
  await failPayment(payment.orderId, data.reason ?? 'Payment failed')
  res.json({
    order: serializeOrder(await loadOrder(payment.orderId)),
  })
})
paymentsRouter.post('/mock/pay', async (req, res) => {
  if (paymentProvider.name !== 'mock' || env.NODE_ENV === 'production') throw notFound('Route')
  const data = z
    .object({
      providerOrderId: z.string(),
      outcome: z.enum(['success', 'failure']).default('success'),
    })
    .parse(req.body)
  const payment = await maybe(from('Payment').select('orderId').eq('providerOrderId', data.providerOrderId).limit(1).maybeSingle())
  if (!payment) throw notFound('Payment')
  if (data.outcome === 'failure') {
    await failPayment(payment.orderId, 'Your bank declined the payment')
    return res.status(402).json({
      error: 'Your bank declined the payment',
    })
  }
  res.json(paymentProvider.mockGatewayPay(data.providerOrderId))
})
export async function paymentWebhook(req, res) {
  const raw = req.body
  if (!paymentProvider.verifyWebhook(raw, req.header('x-razorpay-signature') ?? req.header('x-signature'))) {
    throw unauthorized('Invalid webhook signature')
  }
  const event = JSON.parse(raw.toString('utf8'))
  const entity = event.payload?.payment?.entity
  const eventId = req.header('x-razorpay-event-id') ?? createHash('sha256').update(raw).digest('hex')
  let logId
  try {
    logId = (
      await one(
        from('WebhookEvent')
          .insert({
            provider: paymentProvider.name,
            eventId,
            eventType: event.event,
            providerOrderId: entity?.order_id ?? null,
            providerPaymentId: entity?.id ?? null,
            payload: event,
          })
          .select('id')
          .single(),
      )
    ).id
  } catch (error) {
    if (!(error instanceof HttpError) || error.status !== 409) throw error
    const existing = await one(from('WebhookEvent').select('id, status').eq('provider', paymentProvider.name).eq('eventId', eventId).single())
    if (existing.status === 'PROCESSED' || existing.status === 'IGNORED')
      return res.json({
        received: true,
        duplicate: true,
      })
    logId = existing.id
  }
  try {
    let handled = false
    if (entity) {
      if (event.event === 'payment.captured' || event.event === 'order.paid') {
        await markPaid(entity.order_id, entity.id, event)
        handled = true
      } else if (event.event === 'payment.failed') {
        const payment = await maybe(from('Payment').select('orderId').eq('providerOrderId', entity.order_id).limit(1).maybeSingle())
        if (payment) await failPayment(payment.orderId, 'Payment failed')
        handled = true
      }
    }
    await exec(
      from('WebhookEvent')
        .update({
          status: handled ? 'PROCESSED' : 'IGNORED',
          error: null,
          processedAt: new Date().toISOString(),
        })
        .eq('id', logId),
    )
  } catch (error) {
    await exec(
      from('WebhookEvent')
        .update({
          status: 'FAILED',
          error: error instanceof Error ? error.message.slice(0, 500) : 'Unknown error',
        })
        .eq('id', logId),
    ).catch(() => undefined)
    throw error
  }
  res.json({
    received: true,
  })
}
