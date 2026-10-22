import { badRequest, notFound } from '../utils/errors.js'
import { exec, from, maybe, one, rpc } from '../database/db.js'
import { sendOrderConfirmation, sendOrderStatus, sendRefundIssued } from './emails.js'
import { buildQuote } from './pricing.js'
import { paymentProvider } from './payments.js'
import { getSettings } from './settings.js'
import { orderCode } from '../utils/serializers.js'
import { ORDER_SELECT } from '../database/selects.js'
export const loadOrder = (id) => one(from('Order').select(ORDER_SELECT).eq('id', id).single())
async function resolvePaymentDetail(input, userId) {
  const d = input.paymentDetail ?? {}
  let { upiId, cardBrand, cardLast4 } = d
  let savedPaymentId = null
  if (d.savedPaymentId && userId) {
    const saved = await maybe(from('SavedPayment').select('id, kind, upiId, cardBrand, last4').eq('id', d.savedPaymentId).eq('userId', userId).maybeSingle())
    if (!saved || saved.kind !== input.paymentMethod) throw badRequest('That saved payment method cannot be used here')
    savedPaymentId = saved.id
    upiId = saved.upiId ?? undefined
    cardBrand = saved.cardBrand ?? undefined
    cardLast4 = saved.last4 ?? undefined
  }
  const bank = input.paymentMethod === 'NETBANKING' ? d.bank : undefined
  const detail =
    input.paymentMethod === 'UPI'
      ? upiId
        ? `UPI · ${upiId}`
        : 'UPI'
      : input.paymentMethod === 'CARD'
        ? cardLast4
          ? `${cardBrand || 'Card'} •••• ${cardLast4}`
          : 'Card'
        : input.paymentMethod === 'NETBANKING'
          ? bank
            ? `Net banking · ${bank}`
            : 'Net banking'
          : 'Cash on delivery'
  return {
    detail,
    upiId: input.paymentMethod === 'UPI' ? (upiId ?? null) : null,
    cardBrand: input.paymentMethod === 'CARD' ? (cardBrand ?? null) : null,
    cardLast4: input.paymentMethod === 'CARD' ? (cardLast4 ?? null) : null,
    bank: bank ?? null,
    savedPaymentId,
  }
}
export async function createOrder(input, userId) {
  const settings = await getSettings()
  if (input.paymentMethod === 'COD' && !settings.codEnabled) throw badRequest('Cash on delivery is not available right now')
  const quote = await buildQuote(input.items, input.couponCode, userId)
  if (input.paymentMethod === 'COD' && quote.total > settings.codMaxOrder) {
    throw badRequest(`Cash on delivery is available up to ₹${settings.codMaxOrder}. Please pay online.`)
  }
  const isCod = input.paymentMethod === 'COD'
  const paymentDetail = await resolvePaymentDetail(input, userId)
  const created = await rpc('create_order', {
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
  let payment = null
  if (!isCod) {
    try {
      const providerOrder = await paymentProvider.createOrder(orderCode(created.number), quote.total)
      await exec(
        from('Payment').insert({
          orderId: created.id,
          provider: paymentProvider.name,
          providerOrderId: providerOrder.providerOrderId,
          amount: quote.total,
          method: input.paymentMethod,
          ...paymentDetail,
        }),
      )
      payment = {
        provider: paymentProvider.name,
        ...providerOrder,
        amount: quote.total,
      }
    } catch (error) {
      await failPayment(created.id, 'Could not start payment').catch(() => undefined)
      throw error
    }
  } else {
    await exec(
      from('Payment').insert({
        orderId: created.id,
        provider: 'cod',
        amount: quote.total,
        method: 'COD',
        ...paymentDetail,
      }),
    )
    void sendOrderConfirmation(created.id)
  }
  await exec(
    from('Order')
      .update({
        paymentDetail: paymentDetail.detail,
      })
      .eq('id', created.id),
  )
  return {
    order: await loadOrder(created.id),
    payment,
  }
}
export async function markPaid(providerOrderId, providerPaymentId, raw) {
  const result = await rpc('mark_paid', {
    p_provider_order_id: providerOrderId,
    p_payment_id: providerPaymentId,
    p_raw: raw ?? null,
  })
  if (result.changed) void sendOrderConfirmation(result.orderId)
  // The money arrived after the order was cancelled (window expired, or the shopper gave up and paid later):
  // send it straight back. If Razorpay refuses, the order stays "Paid" and cancelled, and the admin can refund it.
  if (result.needsRefund) await refundOrder(result.orderId).catch((error) => console.error('late payment refund failed', result.orderId, error))
  return result
}
export const failPayment = (orderId, note = 'Payment failed') =>
  rpc('fail_payment', {
    p_order_id: orderId,
    p_note: note,
  })
const defaultNote = {
  PLACED: 'Order placed',
  CONFIRMED: 'Order confirmed',
  PACKED: 'Packed fresh at our Patna kitchen',
  SHIPPED: 'Handed to the courier',
  OUT_FOR_DELIVERY: 'Out for delivery today',
  DELIVERED: 'Delivered. Enjoy!',
  CANCELLED: 'Order cancelled',
  RETURNED: 'Order returned',
}
export async function changeStatus(orderId, to, opts = {}) {
  const result = await rpc('change_order_status', {
    p_order_id: orderId,
    p_to: to,
    p_note: opts.note ?? defaultNote[to],
    p_carrier: opts.carrier ?? null,
    p_tracking: opts.trackingNumber ?? null,
  })
  if (to === 'CANCELLED' && result.paymentStatus === 'PAID' && result.paymentMethod !== 'COD') {
    // The cancellation email already explains the refund, so no separate refund email here.
    await refundOrder(orderId, { notify: false }).catch((error) => console.error('auto-refund failed', error))
  }
  void sendOrderStatus(orderId, to)
}
export async function refundOrder(orderId, { notify = true } = {}) {
  const order = await maybe(from('Order').select('id, total, paymentStatus, payments:Payment(*)').eq('id', orderId).maybeSingle())
  if (!order) throw notFound('Order')
  if (order.paymentStatus !== 'PAID') throw badRequest('Only paid orders can be refunded')
  const payment = order.payments.find((item) => item.status === 'PAID')
  if (payment?.providerPaymentId) await paymentProvider.refund(payment.providerPaymentId, order.total)
  await rpc('finish_refund', {
    p_order_id: orderId,
  })
  if (notify) void sendRefundIssued(orderId)
}
export const expireStaleOrders = (minutes = 30) =>
  rpc('expire_stale_orders', {
    p_minutes: minutes,
  })
