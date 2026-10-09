import { badRequest, notFound } from './errors.js'
import { exec, from, maybe, one, rpc, type Row } from './db.js'
import { sendMail } from './mailer.js'
import { buildQuote, type CartInput } from './pricing.js'
import { paymentProvider } from './payments.js'
import { getSettings } from './settings.js'
import { orderCode } from './serializers.js'
import { ORDER_SELECT, type OrderStatus, type PaymentMethod } from './types.js'

export const loadOrder = (id: string) => one<Row>(from('Order').select(ORDER_SELECT).eq('id', id).single())

export type CheckoutInput = {
  items: CartInput[]
  couponCode?: string | null
  paymentMethod: PaymentMethod
  paymentDetail?: { savedPaymentId?: string; upiId?: string; cardBrand?: string; cardLast4?: string; bank?: string } | null
  customer: { name: string; email: string; phone: string }
  address: { line: string; city: string; state: string; pin: string }
}

/** Turns what the shopper picked into the columns stored on Payment (display text only, never card data). */
async function resolvePaymentDetail(input: CheckoutInput, userId?: string) {
  const d = input.paymentDetail ?? {}
  let { upiId, cardBrand, cardLast4 } = d
  let savedPaymentId: string | null = null
  if (d.savedPaymentId && userId) {
    const saved = await maybe<Row>(from('SavedPayment').select('id, kind, upiId, cardBrand, last4').eq('id', d.savedPaymentId).eq('userId', userId).maybeSingle())
    if (!saved || saved.kind !== input.paymentMethod) throw badRequest('That saved payment method cannot be used here')
    savedPaymentId = saved.id as string
    upiId = (saved.upiId as string | null) ?? undefined
    cardBrand = (saved.cardBrand as string | null) ?? undefined
    cardLast4 = (saved.last4 as string | null) ?? undefined
  }
  const bank = input.paymentMethod === 'NETBANKING' ? d.bank : undefined
  const detail =
    input.paymentMethod === 'UPI' ? (upiId ? `UPI · ${upiId}` : 'UPI')
    : input.paymentMethod === 'CARD' ? (cardLast4 ? `${cardBrand || 'Card'} •••• ${cardLast4}` : 'Card')
    : input.paymentMethod === 'NETBANKING' ? (bank ? `Net banking · ${bank}` : 'Net banking')
    : 'Cash on delivery'
  return {
    detail,
    upiId: input.paymentMethod === 'UPI' ? upiId ?? null : null,
    cardBrand: input.paymentMethod === 'CARD' ? cardBrand ?? null : null,
    cardLast4: input.paymentMethod === 'CARD' ? cardLast4 ?? null : null,
    bank: bank ?? null,
    savedPaymentId,
  }
}

export async function createOrder(input: CheckoutInput, userId?: string) {
  const settings = await getSettings()
  if (input.paymentMethod === 'COD' && !settings.codEnabled) throw badRequest('Cash on delivery is not available right now')

  const quote = await buildQuote(input.items, input.couponCode, userId)
  if (input.paymentMethod === 'COD' && quote.total > settings.codMaxOrder) {
    throw badRequest(`Cash on delivery is available up to ₹${settings.codMaxOrder}. Please pay online.`)
  }
  const isCod = input.paymentMethod === 'COD'
  const paymentDetail = await resolvePaymentDetail(input, userId)

  // One database transaction: reserve stock, claim the coupon, write the order.
  const created = await rpc<{ id: string; number: number }>('create_order', {
    p: {
      userId: userId ?? null,
      customer: input.customer,
      address: input.address,
      paymentMethod: input.paymentMethod,
      couponCode: quote.couponCode,
      subtotal: quote.subtotal + quote.offerDiscount,
      offerDiscount: quote.offerDiscount,
      discount: quote.couponDiscount,
      shipping: quote.shipping,
      total: quote.total,
      lines: quote.lines.map((line) => ({
        variantId: line.variantId,
        productId: line.productId,
        name: line.name,
        slug: line.slug,
        image: line.image,
        art: line.art,
        size: line.size,
        unitPrice: line.unitPrice,
        mrp: line.mrp,
        quantity: line.quantity,
        hsnCode: line.hsnCode,
        gstPercent: line.gstPercent,
      })),
    },
  })

  let payment: { provider: string; providerOrderId: string; keyId?: string; amount: number } | null = null
  if (!isCod) {
    try {
      const providerOrder = await paymentProvider.createOrder(orderCode(created.number), quote.total)
      await exec(from('Payment').insert({ orderId: created.id, provider: paymentProvider.name, providerOrderId: providerOrder.providerOrderId, amount: quote.total, method: input.paymentMethod, ...paymentDetail }))
      payment = { provider: paymentProvider.name, ...providerOrder, amount: quote.total }
    } catch (error) {
      await failPayment(created.id, 'Could not start payment').catch(() => undefined)
      throw error
    }
  } else {
    await exec(from('Payment').insert({ orderId: created.id, provider: 'cod', amount: quote.total, method: 'COD', ...paymentDetail }))
    void notifyOrder(created.id, 'Order confirmed')
  }

  await exec(from('Order').update({ paymentDetail: paymentDetail.detail }).eq('id', created.id))
  return { order: await loadOrder(created.id), payment }
}

/** Idempotent: webhooks and the browser callback may both arrive. */
export async function markPaid(providerOrderId: string, providerPaymentId: string, raw?: unknown) {
  const result = await rpc<{ orderId: string; changed: boolean; needsRefund?: boolean }>('mark_paid', {
    p_provider_order_id: providerOrderId,
    p_payment_id: providerPaymentId,
    p_raw: raw ?? null,
  })
  if (result.changed) void notifyOrder(result.orderId, 'Payment received')
  return result
}

export const failPayment = (orderId: string, note = 'Payment failed') => rpc('fail_payment', { p_order_id: orderId, p_note: note })

const defaultNote: Record<OrderStatus, string> = {
  PLACED: 'Order placed',
  CONFIRMED: 'Order confirmed',
  PACKED: 'Packed fresh at our Bengaluru kitchen',
  SHIPPED: 'Handed to the courier',
  OUT_FOR_DELIVERY: 'Out for delivery today',
  DELIVERED: 'Delivered. Enjoy!',
  CANCELLED: 'Order cancelled',
  RETURNED: 'Order returned',
}

const statusSubject: Record<OrderStatus, string> = {
  PLACED: 'Order placed',
  CONFIRMED: 'Order confirmed',
  PACKED: 'Your order is packed',
  SHIPPED: 'Your order has shipped',
  OUT_FOR_DELIVERY: 'Your order is out for delivery',
  DELIVERED: 'Your order was delivered',
  CANCELLED: 'Your order was cancelled',
  RETURNED: 'Your return was received',
}

export async function changeStatus(orderId: string, to: OrderStatus, opts: { note?: string; carrier?: string; trackingNumber?: string } = {}) {
  // The function validates the transition and does everything (events, stock, COD payment) in one transaction.
  const result = await rpc<{ from: OrderStatus; paymentMethod: PaymentMethod; paymentStatus: string }>('change_order_status', {
    p_order_id: orderId,
    p_to: to,
    p_note: opts.note ?? defaultNote[to],
    p_carrier: opts.carrier ?? null,
    p_tracking: opts.trackingNumber ?? null,
  })
  // Auto-refund online payments when an order is cancelled before shipping.
  if (to === 'CANCELLED' && result.paymentStatus === 'PAID' && result.paymentMethod !== 'COD') {
    await refundOrder(orderId).catch((error) => console.error('auto-refund failed', error))
  }
  void notifyOrder(orderId, statusSubject[to])
}

export async function refundOrder(orderId: string) {
  const order = await maybe<Row>(from('Order').select('id, total, paymentStatus, payments:Payment(*)').eq('id', orderId).maybeSingle())
  if (!order) throw notFound('Order')
  if (order.paymentStatus !== 'PAID') throw badRequest('Only paid orders can be refunded')
  const payment = (order.payments as Row[]).find((item) => item.status === 'PAID')
  if (payment?.providerPaymentId) await paymentProvider.refund(payment.providerPaymentId, order.total)
  await rpc('finish_refund', { p_order_id: orderId })
}

export async function notifyOrder(orderId: string, subject: string) {
  const order = await maybe<Row>(from('Order').select(ORDER_SELECT).eq('id', orderId).maybeSingle())
  if (!order) return
  const items = order.items as Row[]
  const lines = items.map((item) => `  - ${item.name} (${item.size}) x ${item.quantity}  ₹${item.unitPrice * item.quantity}`).join('\n')
  await sendMail(
    order.email,
    `${subject} · ${orderCode(order.number)}`,
    `Hi ${order.customerName},\n\n${subject}.\nOrder ${orderCode(order.number)} · Status: ${String(order.status).replaceAll('_', ' ')}\n\n${lines}\n\nTotal: ₹${order.total}\nTrack it any time with your order ID and phone number.\n\n— ClickMart`,
  )
}

/** Online orders that never got paid release their stock after 30 minutes. */
export const expireStaleOrders = (minutes = 30) => rpc<number>('expire_stale_orders', { p_minutes: minutes })


