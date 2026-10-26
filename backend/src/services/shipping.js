// Courier-booking helpers shared by the admin order drawer, the customer routes, order placement and the
// NimbusPost webhook, so every path does the same real thing.
import { from, maybe, exec, rows } from '../database/db.js'
import { audit } from './audit.js'
import { getSettings } from './settings.js'
import { DEFAULT_ITEM_GRAMS } from './pricing.js'
import { orderCode } from '../utils/serializers.js'
import {
  bookShipment,
  cancelOrder as npCancelOrder,
  cancelShipment,
  createOrder as npCreateOrder,
  createReturnOrder,
  nimbuspostEnabled,
} from './nimbuspost.js'

export const providerBooking = (orderId) =>
  maybe(from('Shipment').select('providerOrderId, providerOrderNumber, providerStatus, ewayBillNumber, returnProviderOrderId, returnAwb, returnCourier, returnStatus, returnReason').eq('orderId', orderId).maybeSingle())

/** Total weight (grams) and each item's ProductVariant (for its SKU). OrderItem snapshots neither, and sales and
 * catalog are separate schemas, so this is always its own query. */
export async function weighOrderItems(items) {
  const variantIds = [...new Set(items.map((item) => item.variantId).filter(Boolean))]
  const variants = variantIds.length ? new Map((await rows(from('ProductVariant').select('id, weightGrams, sku').in('id', variantIds))).map((v) => [v.id, v])) : new Map()
  const weightGrams = items.reduce((sum, item) => sum + (variants.get(item.variantId)?.weightGrams || DEFAULT_ITEM_GRAMS) * item.quantity, 0)
  return { weightGrams: Math.max(weightGrams, DEFAULT_ITEM_GRAMS), variants }
}

const ORDER_FOR_COURIER = 'number, status, customerName, email, phone, addressLine, city, state, pin, shipping, total, paymentMethod, items:OrderItem(variantId, name, unitPrice, quantity, hsnCode, gstPercent)'

function courierItems(order, variants) {
  return order.items.map((item) => ({
    name: item.name,
    quantity: item.quantity,
    unitPriceInclGst: item.unitPrice,
    gstPercent: item.gstPercent,
    hsnCode: item.hsnCode,
    sku: variants.get(item.variantId)?.sku,
  }))
}

const customerAddress = (order) => ({ name: order.customerName, email: order.email, line: order.addressLine, pin: order.pin, city: order.city, state: order.state, phone: order.phone })

/**
 * Creates the NimbusPost order for one of ours (not booked with a courier yet). Throws a plain Error with a
 * readable message when it cannot (not connected, no warehouse, already created, NimbusPost refused).
 */
export async function createProviderOrder(orderId) {
  if (!nimbuspostEnabled()) throw new Error('NimbusPost is not connected. Add NIMBUSPOST_API_KEY and NIMBUSPOST_API_SECRET on the server.')
  const settings = await getSettings()
  if (!settings.nimbuspostWarehouseId) throw new Error('Pick a NimbusPost pickup warehouse first, in Settings -> Delivery.')
  const existing = await providerBooking(orderId)
  if (existing?.providerOrderId && existing.providerStatus !== 'cancelled') throw new Error('This order is already booked with NimbusPost')
  const order = await maybe(from('Order').select(ORDER_FOR_COURIER).eq('id', orderId).maybeSingle())
  if (!order) throw new Error('Order not found')
  const { weightGrams, variants } = await weighOrderItems(order.items)
  const result = await npCreateOrder({
    orderNumber: orderCode(order.number),
    paymentMode: order.paymentMethod === 'COD' ? 'cod' : 'prepaid',
    warehouseId: settings.nimbuspostWarehouseId,
    shippingCharges: order.shipping,
    orderTotal: order.total,
    weightGrams,
    address: customerAddress(order),
    items: courierItems(order, variants),
  })
  await exec(
    from('Shipment').upsert(
      { orderId, provider: 'nimbuspost', providerOrderId: result.order_id, providerOrderNumber: orderCode(order.number), providerStatus: result.order_status ?? 'created', updatedAt: new Date().toISOString() },
      { onConflict: 'orderId' },
    ),
  )
  return result
}

/**
 * Called when an order is confirmed (COD placed, or online payment captured). Creates the NimbusPost order so
 * staff only have to book a courier. Never throws: a failure is written to the activity log and the admin can
 * press "Create" in the order drawer instead.
 */
export async function autoCreateShipment(orderId) {
  try {
    if (!nimbuspostEnabled()) return
    const settings = await getSettings()
    if (settings.autoCreateShipments === false || !settings.nimbuspostWarehouseId) return
    const existing = await providerBooking(orderId)
    if (existing?.providerOrderId) return
    const result = await createProviderOrder(orderId)
    await audit(null, 'order.nimbuspost.auto_created', 'Order', orderId, { providerOrderId: result.order_id })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('NimbusPost auto-create failed for order', orderId, message)
    await audit(null, 'order.nimbuspost.auto_create_failed', 'Order', orderId, { error: message.slice(0, 300) }).catch(() => undefined)
  }
}

/**
 * Cancels this order's real courier booking: by AWB (shipment-cancel) once a courier is assigned, by order
 * id before that. Returns null when there was nothing booked (or it was already cancelled). Throws on a
 * real NimbusPost failure -- callers that must not block on a third-party hiccup should catch it themselves.
 */
export async function cancelProviderBooking(orderId, reason) {
  const shipment = await providerBooking(orderId)
  if (!shipment?.providerOrderId || shipment.providerStatus === 'cancelled') return null
  const order = await maybe(from('Order').select('trackingNumber').eq('id', orderId).maybeSingle())
  const result = order?.trackingNumber ? await cancelShipment(order.trackingNumber, reason) : await npCancelOrder(shipment.providerOrderId, reason)
  await exec(from('Shipment').update({ providerStatus: 'cancelled' }).eq('orderId', orderId))
  if (order?.trackingNumber) await exec(from('Order').update({ carrier: null, trackingNumber: null }).eq('id', orderId))
  return result
}

/**
 * Arranges a return pickup for a delivered order: a NimbusPost reverse order from the buyer's address to our
 * warehouse, optionally booked with a courier straight away. Status then follows the NimbusPost webhook.
 */
export async function createReturnPickup(orderId, { reason, note, book }) {
  if (!nimbuspostEnabled()) throw new Error('NimbusPost is not connected.')
  const settings = await getSettings()
  if (!settings.nimbuspostWarehouseId) throw new Error('Pick a NimbusPost pickup warehouse first, in Settings -> Delivery.')
  const shipment = await providerBooking(orderId)
  if (!shipment?.providerOrderId) throw new Error('This order was not shipped through NimbusPost, so a return pickup cannot be linked to it.')
  if (shipment.returnProviderOrderId && shipment.returnStatus !== 'cancelled') throw new Error('A return pickup is already arranged for this order.')
  const order = await maybe(from('Order').select(ORDER_FOR_COURIER).eq('id', orderId).maybeSingle())
  if (!order) throw new Error('Order not found')
  if (order.status !== 'DELIVERED') throw new Error('Only a delivered order can be picked up for a return.')
  const { weightGrams, variants } = await weighOrderItems(order.items)
  const created = await createReturnOrder({
    parentOrderId: shipment.providerOrderId,
    orderNumber: `${orderCode(order.number)}-R`,
    reason,
    note,
    warehouseId: settings.nimbuspostWarehouseId,
    weightGrams,
    address: customerAddress(order),
    items: courierItems(order, variants),
  })
  const patch = { returnProviderOrderId: created.order_id, returnStatus: created.order_status ?? 'created', returnReason: reason, returnAwb: null, returnCourier: null }
  let booked = null
  if (book) {
    booked = await bookShipment(created.order_id).catch((error) => {
      console.error('NimbusPost return booking failed', orderId, error)
      return null
    })
    if (booked) Object.assign(patch, { returnAwb: booked.awb ?? null, returnCourier: booked.courier_name ?? null, returnStatus: booked.order_status ?? 'booked' })
  }
  await exec(from('Shipment').update(patch).eq('orderId', orderId))
  return { ...patch, booked: !!booked }
}

/** Cancels a return pickup (by AWB once a courier is booked, by order id before that). */
export async function cancelReturnPickup(orderId, reason) {
  const shipment = await providerBooking(orderId)
  if (!shipment?.returnProviderOrderId || shipment.returnStatus === 'cancelled') return null
  const result = shipment.returnAwb ? await cancelShipment(shipment.returnAwb, reason) : await npCancelOrder(shipment.returnProviderOrderId, reason)
  await exec(from('Shipment').update({ returnStatus: 'cancelled' }).eq('orderId', orderId))
  return result
}
