// How a courier status from NimbusPost (webhooks send words like "in transit", the API uses "in_transit")
// moves one of our orders. Only forward moves: changeStatus refuses anything backwards, and a status we do
// not map (pickup scheduled, NDR, exceptions...) only updates the shipment row, never the order.

const normal = (status) => String(status ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')

const FORWARD = new Map([
  ['picked', 'SHIPPED'],
  ['picked up', 'SHIPPED'],
  ['pickup completed', 'SHIPPED'],
  ['shipped', 'SHIPPED'],
  ['in transit', 'SHIPPED'],
  ['reached at destination', 'SHIPPED'],
  ['out for delivery', 'OUT_FOR_DELIVERY'],
  ['delivered', 'DELIVERED'],
  // The parcel came back to our warehouse after failed deliveries.
  ['rto delivered', 'RETURNED'],
])

/** Our OrderStatus for a forward shipment's courier status, or null when the order should not move. */
export const orderStatusForCourier = (status) => FORWARD.get(normal(status)) ?? null

/** A return pickup only changes our order once the parcel reaches our warehouse. */
export const returnArrived = (status) => normal(status) === 'delivered'

export const isCancelled = (status) => normal(status) === 'cancelled'
export const isBooked = (status) => normal(status) === 'booked'

/** Stored on the shipment row in the API's snake_case form ("out for delivery" -> "out_for_delivery"). */
export const storedStatus = (status) => normal(status).replace(/ /g, '_')

const NOTES = {
  SHIPPED: (courier) => `Handed to ${courier || 'the courier'}`,
  OUT_FOR_DELIVERY: () => 'Out for delivery today',
  DELIVERED: () => 'Delivered. Enjoy!',
  RETURNED: () => 'Returned to our warehouse by the courier',
}
export const noteFor = (to, courier) => NOTES[to]?.(courier) ?? undefined
