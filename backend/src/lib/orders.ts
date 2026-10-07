import type { OrderStatus, PaymentMethod, Prisma } from '@prisma/client'
import { badRequest, conflict, notFound } from './errors.js'
import { sendMail } from './mailer.js'
import { buildQuote, type CartInput } from './pricing.js'
import { paymentProvider } from './payments.js'
import { prisma, type Tx } from './prisma.js'
import { getSettings } from './settings.js'
import { orderCode } from './serializers.js'

export const orderInclude = { items: true, events: true } satisfies Prisma.OrderInclude

export type CheckoutInput = {
  items: CartInput[]
  couponCode?: string | null
  paymentMethod: PaymentMethod
  customer: { name: string; email: string; phone: string }
  address: { line: string; city: string; state: string; pin: string }
}

export async function createOrder(input: CheckoutInput, userId?: string) {
  const settings = await getSettings()
  if (input.paymentMethod === 'COD' && !settings.codEnabled) throw badRequest('Cash on delivery is not available right now')

  const quote = await buildQuote(input.items, input.couponCode, userId)
  if (input.paymentMethod === 'COD' && quote.total > settings.codMaxOrder) {
    throw badRequest(`Cash on delivery is available up to ₹${settings.codMaxOrder}. Please pay online.`)
  }

  const isCod = input.paymentMethod === 'COD'

  const order = await prisma.$transaction(async (tx) => {
    // Atomic stock reservation: the WHERE clause prevents overselling under concurrent checkouts.
    for (const line of quote.lines) {
      const updated = await tx.productVariant.updateMany({
        where: { id: line.variantId, stock: { gte: line.quantity }, isActive: true },
        data: { stock: { decrement: line.quantity } },
      })
      if (updated.count === 0) throw conflict(`${line.name} (${line.size}) just sold out`, { variantId: line.variantId })
      const variant = await tx.productVariant.findUniqueOrThrow({ where: { id: line.variantId } })
      await tx.stockMovement.create({
        data: { variantId: line.variantId, delta: -line.quantity, reason: 'SALE', balance: variant.stock, userId },
      })
      await tx.product.update({ where: { id: line.productId }, data: { sold: { increment: line.quantity } } })
    }

    let couponId: string | null = null
    if (quote.couponCode) {
      const coupon = await tx.coupon.findUniqueOrThrow({ where: { code: quote.couponCode } })
      if (coupon.usageLimit !== null) {
        const claimed = await tx.coupon.updateMany({
          where: { id: coupon.id, usedCount: { lt: coupon.usageLimit } },
          data: { usedCount: { increment: 1 } },
        })
        if (claimed.count === 0) throw badRequest('That coupon has been fully claimed')
      } else {
        await tx.coupon.update({ where: { id: coupon.id }, data: { usedCount: { increment: 1 } } })
      }
      couponId = coupon.id
    }

    const created = await tx.order.create({
      data: {
        userId,
        customerName: input.customer.name,
        email: input.customer.email.toLowerCase(),
        phone: input.customer.phone,
        addressLine: input.address.line,
        city: input.address.city,
        state: input.address.state,
        pin: input.address.pin,
        subtotal: quote.subtotal + quote.offerDiscount,
        offerDiscount: quote.offerDiscount,
        discount: quote.couponDiscount,
        shipping: quote.shipping,
        total: quote.total,
        couponCode: quote.couponCode,
        paymentMethod: input.paymentMethod,
        status: isCod ? 'CONFIRMED' : 'PLACED',
        paymentStatus: 'PENDING',
        items: {
          create: quote.lines.map((line) => ({
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
          })),
        },
        events: {
          create: isCod
            ? [
                { status: 'PLACED', note: 'Order placed' },
                { status: 'CONFIRMED', note: 'Confirmed. Pay on delivery.' },
              ]
            : [{ status: 'PLACED', note: 'Order placed. Waiting for payment.' }],
        },
      },
    })
    if (couponId) await tx.couponRedemption.create({ data: { couponId, userId, orderId: created.id } })
    if (userId) await tx.cartItem.deleteMany({ where: { userId } })
    return created
  })

  let payment: { provider: string; providerOrderId: string; keyId?: string; amount: number } | null = null
  if (!isCod) {
    try {
      const providerOrder = await paymentProvider.createOrder(orderCode(order.number), order.total)
      await prisma.payment.create({
        data: {
          orderId: order.id,
          provider: paymentProvider.name,
          providerOrderId: providerOrder.providerOrderId,
          amount: order.total,
          method: input.paymentMethod,
        },
      })
      payment = { provider: paymentProvider.name, ...providerOrder, amount: order.total }
    } catch (error) {
      await failPayment(order.id, 'Could not start payment').catch(() => undefined)
      throw error
    }
  } else {
    await prisma.payment.create({
      data: { orderId: order.id, provider: 'cod', amount: order.total, method: 'COD' },
    })
    void notifyOrder(order.id, 'Order confirmed')
  }

  const full = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: orderInclude })
  return { order: full, payment }
}

export async function restoreStock(tx: Tx, orderId: string, reason: 'CANCELLATION' | 'RETURN', note: string) {
  const items = await tx.orderItem.findMany({ where: { orderId } })
  for (const item of items) {
    if (!item.variantId) continue
    const variant = await tx.productVariant.update({
      where: { id: item.variantId },
      data: { stock: { increment: item.quantity } },
    })
    await tx.stockMovement.create({
      data: { variantId: item.variantId, delta: item.quantity, reason, note, orderId, balance: variant.stock },
    })
    if (item.productId) {
      await tx.product.update({ where: { id: item.productId }, data: { sold: { decrement: item.quantity } } }).catch(() => undefined)
    }
  }
}

/** Idempotent: webhooks and the browser callback may both arrive. */
export async function markPaid(providerOrderId: string, providerPaymentId: string, raw?: unknown) {
  const payment = await prisma.payment.findFirst({ where: { providerOrderId } })
  if (!payment) throw notFound('Payment')
  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({ where: { id: payment.orderId } })
    if (order.paymentStatus === 'PAID') return { order, changed: false }
    if (order.status === 'CANCELLED') {
      // Money arrived after the order was cancelled (e.g. expired). Flag it for a refund instead of silently reviving it.
      await tx.payment.update({ where: { id: payment.id }, data: { status: 'PAID', providerPaymentId, raw: raw as never } })
      await tx.order.update({ where: { id: order.id }, data: { paymentStatus: 'PAID' } })
      return { order, changed: false, needsRefund: true }
    }
    await tx.payment.update({ where: { id: payment.id }, data: { status: 'PAID', providerPaymentId, raw: raw as never } })
    const updated = await tx.order.update({
      where: { id: order.id },
      data: { paymentStatus: 'PAID', status: 'CONFIRMED' },
    })
    await tx.orderEvent.create({ data: { orderId: order.id, status: 'CONFIRMED', note: 'Payment received. Order confirmed.' } })
    return { order: updated, changed: true }
  })
  if (result.changed) void notifyOrder(result.order.id, 'Payment received')
  return result
}

export async function failPayment(orderId: string, note = 'Payment failed') {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } })
    if (order.paymentStatus === 'PAID' || order.status === 'CANCELLED') return order
    await tx.payment.updateMany({ where: { orderId, status: 'PENDING' }, data: { status: 'FAILED' } })
    await restoreStock(tx, orderId, 'CANCELLATION', note)
    await tx.orderEvent.create({ data: { orderId, status: 'CANCELLED', note } })
    return tx.order.update({ where: { id: orderId }, data: { status: 'CANCELLED', paymentStatus: 'FAILED' } })
  })
}

const FLOW: OrderStatus[] = ['PLACED', 'CONFIRMED', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED']
const CANCELLABLE: OrderStatus[] = ['PLACED', 'CONFIRMED', 'PACKED']
const RETURNABLE: OrderStatus[] = ['SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED']

export function assertTransition(from: OrderStatus, to: OrderStatus) {
  const ok =
    to === 'CANCELLED'
      ? CANCELLABLE.includes(from)
      : to === 'RETURNED'
        ? RETURNABLE.includes(from)
        : FLOW.includes(to) && FLOW.includes(from) && FLOW.indexOf(to) > FLOW.indexOf(from)
  if (!ok) throw badRequest(`An order that is ${from.replaceAll('_', ' ').toLowerCase()} cannot move to ${to.replaceAll('_', ' ').toLowerCase()}`)
}

export async function changeStatus(
  orderId: string,
  to: OrderStatus,
  opts: { note?: string; carrier?: string; trackingNumber?: string } = {},
) {
  const order = await prisma.order.findUnique({ where: { id: orderId } })
  if (!order) throw notFound('Order')
  assertTransition(order.status, to)

  const updated = await prisma.$transaction(async (tx) => {
    if (to === 'CANCELLED') await restoreStock(tx, orderId, 'CANCELLATION', opts.note ?? 'Order cancelled')
    if (to === 'RETURNED') await restoreStock(tx, orderId, 'RETURN', opts.note ?? 'Order returned')
    await tx.orderEvent.create({ data: { orderId, status: to, note: opts.note ?? defaultNote[to] } })
    return tx.order.update({
      where: { id: orderId },
      data: {
        status: to,
        carrier: opts.carrier ?? undefined,
        trackingNumber: opts.trackingNumber ?? undefined,
        // Cash is collected at the door, so delivery is when COD becomes paid.
        paymentStatus: to === 'DELIVERED' && order.paymentMethod === 'COD' ? 'PAID' : undefined,
      },
    })
  })
  if (to === 'DELIVERED' && order.paymentMethod === 'COD') {
    await prisma.payment.updateMany({ where: { orderId, provider: 'cod' }, data: { status: 'PAID' } })
  }

  // Auto-refund online payments when an order is cancelled before shipping.
  if (to === 'CANCELLED' && order.paymentStatus === 'PAID' && order.paymentMethod !== 'COD') {
    await refundOrder(orderId).catch((error) => console.error('auto-refund failed', error))
  }
  void notifyOrder(orderId, statusSubject[to])
  return updated
}

export async function refundOrder(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { payments: true } })
  if (!order) throw notFound('Order')
  if (order.paymentStatus !== 'PAID') throw badRequest('Only paid orders can be refunded')
  const payment = order.payments.find((item) => item.status === 'PAID')
  if (payment?.providerPaymentId) await paymentProvider.refund(payment.providerPaymentId, order.total)
  await prisma.$transaction([
    prisma.payment.updateMany({ where: { orderId, status: 'PAID' }, data: { status: 'REFUNDED' } }),
    prisma.order.update({ where: { id: orderId }, data: { paymentStatus: 'REFUNDED' } }),
    prisma.orderEvent.create({ data: { orderId, status: order.status, note: `Refund of ₹${order.total} initiated` } }),
  ])
}

const defaultNote: Record<OrderStatus, string> = {
  PLACED: 'Order placed',
  CONFIRMED: 'Order confirmed',
  PACKED: 'Packed fresh at our Patna desk',
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

export async function notifyOrder(orderId: string, subject: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: orderInclude })
  if (!order) return
  const lines = order.items.map((item) => `  - ${item.name} (${item.size}) x ${item.quantity}  ₹${item.unitPrice * item.quantity}`).join('\n')
  await sendMail(
    order.email,
    `${subject} · ${orderCode(order.number)}`,
    `Hi ${order.customerName},\n\n${subject}.\nOrder ${orderCode(order.number)} · Status: ${order.status.replaceAll('_', ' ')}\n\n${lines}\n\nTotal: ₹${order.total}\nTrack it any time with your order ID and phone number.\n\n— ClickMart`,
  )
}

/** Online orders that never got paid release their stock after 30 minutes. */
export async function expireStaleOrders(olderThanMinutes = 30) {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60000)
  const stale = await prisma.order.findMany({
    where: { status: 'PLACED', paymentStatus: 'PENDING', paymentMethod: { not: 'COD' }, createdAt: { lt: cutoff } },
    select: { id: true },
  })
  for (const { id } of stale) await failPayment(id, 'Payment window expired').catch(console.error)
  return stale.length
}
