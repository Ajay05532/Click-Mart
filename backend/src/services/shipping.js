// Courier-booking helpers shared between the admin order drawer and the customer-facing routes, so a
// customer cancelling their own order and an admin cancelling it from the drawer do the same real thing.
import { from, maybe, exec } from '../database/db.js'
import { cancelOrder as npCancelOrder, cancelShipment } from './nimbuspost.js'

export const providerBooking = (orderId) => maybe(from('Shipment').select('providerOrderId, providerOrderNumber, providerStatus, ewayBillNumber').eq('orderId', orderId).maybeSingle())

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
