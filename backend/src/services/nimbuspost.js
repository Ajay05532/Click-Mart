// NimbusPost Partner API (v2): https://api-v2.nimbuspost.com/docs/reference/v2
// Auth is a key pair sent as headers, not a bearer token. Every response is { success, data, meta } or
// { success: false, error }. Covers serviceability and rates, orders (forward and return), courier booking,
// pickups, labels, tracking and webhook subscriptions.
import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '../config/env.js'

export const nimbuspostEnabled = () => Boolean(env.NIMBUSPOST_API_KEY && env.NIMBUSPOST_API_SECRET)

async function npFetch(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${env.NIMBUSPOST_BASE_URL}${path}`, {
    method,
    headers: {
      'x-api-key': env.NIMBUSPOST_API_KEY,
      'x-api-secret': env.NIMBUSPOST_API_SECRET,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
  })
  const json = await response.json().catch(() => null)
  if (!response.ok || !json?.success) {
    const message = json?.error?.detail ?? json?.error?.title ?? `NimbusPost error (${response.status})`
    throw new Error(message)
  }
  return json.data
}

const cache = new Map()
const CACHE_MS = 60 * 60 * 1000

/** Raw POST /serviceability, cached per exact set of inputs for an hour (rates rarely change within a day,
 * and the account is rate-limited to 60/min). */
async function serviceability({ pickupPincode, deliveryPincode, paymentMode, packages, orderValuePaise }) {
  const key = JSON.stringify({ pickupPincode, deliveryPincode, paymentMode, packages, orderValuePaise })
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value
  const data = await npFetch('/serviceability', {
    method: 'POST',
    body: { pickupPincode, deliveryPincode, paymentMode, packages, ...(orderValuePaise != null ? { orderValuePaise } : {}) },
  })
  cache.set(key, { at: Date.now(), value: data })
  if (cache.size > 2000) cache.clear()
  return data
}

/** A box big enough for the order's weight. We don't track per-product dimensions, so this is an estimate. */
function packageFor(weightGrams) {
  if (weightGrams <= 1000) return { weight: weightGrams, length: 20, width: 15, height: 8 }
  if (weightGrams <= 3000) return { weight: weightGrams, length: 25, width: 20, height: 12 }
  return { weight: weightGrams, length: 30, width: 25, height: 15 }
}

/**
 * The real delivery charge for an order: every courier NimbusPost offers on this route for this order's
 * actual weight, value and payment mode, cheapest first. Used by the admin order drawer and, through
 * services/delivery.js, by the location picker, cart quote and checkout.
 */
export async function getDeliveryRates({ pickupPincode, deliveryPincode, paymentMode, weightGrams, orderValuePaise }) {
  const data = await serviceability({ pickupPincode, deliveryPincode, paymentMode, packages: [packageFor(weightGrams)], orderValuePaise })
  const couriers = (data.available ?? [])
    .map((courier) => ({
      courierId: courier.courierId,
      courierName: courier.courierDisplayName ?? courier.courierName,
      courierType: courier.courierType,
      tatDays: courier.tatDays ?? null,
      ratePaise: courier.result?.totalPaise ?? courier.result?.forward?.totalPaise ?? null,
    }))
    .filter((courier) => courier.ratePaise != null)
    .sort((a, b) => a.ratePaise - b.ratePaise)
  return {
    deliverable: couriers.length > 0,
    reason: couriers.length ? null : (data.excluded?.[0]?.reason ?? null),
    weightGrams,
    couriers,
    cheapest: couriers[0] ?? null,
  }
}

/* ---------------- Warehouses ---------------- */
// Adding a warehouse needs its pickup contact's phone OTP-verified first (send -> verify -> create);
// there is no way around that in the API, so the admin UI walks through all three calls.

export const listWarehouses = () => npFetch('/warehouses?limit=100')

export const sendWarehouseOtp = (phone, purpose) => npFetch('/warehouses/otp/send', { method: 'POST', body: { phone, purpose } })

export const verifyWarehouseOtp = (phone, otp, purpose) => npFetch('/warehouses/otp/verify', { method: 'POST', body: { phone, otp, purpose } })

/** Returns go back to the same warehouse (`rto_same_as_pickup`), so no second address or OTP is needed. */
export function createWarehouse({ name, address, contactName, contactPhone, contactEmail, verificationId, gst, isPrimary }) {
  return npFetch('/warehouses', {
    method: 'POST',
    body: {
      name,
      address,
      contact_person: { name: contactName, phone: contactPhone, ...(contactEmail ? { email: contactEmail } : {}), phone_verified: true, verification_id: verificationId },
      ...(gst ? { gst } : {}),
      rto_same_as_pickup: true,
      ...(isPrimary ? { is_primary: true } : {}),
    },
  })
}

// Far-apart PIN codes (Delhi, Mumbai, Bengaluru, Kolkata) to ask "will any courier collect from here?".
const PROBE_DESTINATIONS = ['110001', '400001', '560001', '700001']

/**
 * Whether couriers will pick up from this PIN code: a light parcel from it to a few major cities. Serviceable
 * when at least one courier serves at least one of them. Uses the same cached rate check as checkout.
 */
export async function pickupServiceable(pin) {
  const results = await Promise.all(
    PROBE_DESTINATIONS.filter((to) => to !== pin).map((to) =>
      serviceability({ pickupPincode: pin, deliveryPincode: to, paymentMode: 'prepaid', packages: [{ weight: 500, length: 20, width: 15, height: 8 }] }).catch(() => null),
    ),
  )
  const answered = results.filter(Boolean)
  if (!answered.length) throw new Error('NimbusPost did not answer the serviceability check')
  const couriers = new Set(answered.flatMap((data) => (data.available ?? []).map((courier) => courier.courierDisplayName ?? courier.courierName)))
  return { serviceable: couriers.size > 0, couriers: [...couriers].filter(Boolean).slice(0, 8) }
}

/* ---------------- Orders ---------------- */
// Order weight/dimensions are in KILOGRAMS and CM here (unlike /serviceability, which is grams) — easy to
// mix up, so keep the two package helpers separate rather than sharing one with a unit flag.
function orderPackageFor(weightGrams) {
  const weight = Math.round((weightGrams / 1000) * 100) / 100
  if (weightGrams <= 1000) return { weight, length: 20, width: 15, height: 8 }
  if (weightGrams <= 3000) return { weight, length: 25, width: 20, height: 12 }
  return { weight, length: 30, width: 25, height: 15 }
}

/**
 * Creates a NimbusPost order (not yet booked with a courier) from a ClickMart order. Item prices must be
 * tax-exclusive — `unitPriceInclGst` is divided back down by `gstPercent` here, since our own prices include
 * GST (see "Money rules" in CLAUDE.md) but NimbusPost adds its own tax on top of a tax-exclusive price.
 */
export function createOrder({ orderNumber, paymentMode, warehouseId, shippingCharges, orderTotal, weightGrams, address, items }) {
  const orderItems = items.map((item) => ({
    name: item.name,
    qty: item.quantity,
    price: Math.round((item.unitPriceInclGst / (1 + (item.gstPercent ?? 0) / 100)) * 100) / 100,
    sku: item.sku || undefined,
    hsn: item.hsnCode || undefined,
    tax_rate: item.gstPercent ?? 0,
  }))
  // The buyer's real COD amount is our own order total (already net of any coupon/offer discount), not a
  // re-sum of items here — NimbusPost's own item/tax total ignores our discounts, so it is always >= this.
  return npFetch('/orders', {
    method: 'POST',
    body: {
      order_number: orderNumber,
      order_type: 'b2c',
      payment_mode: paymentMode,
      ...(paymentMode === 'cod' ? { order_collectable_amount: orderTotal } : {}),
      warehouse_id: warehouseId,
      shipping_address: {
        name: address.name,
        email: address.email || undefined,
        address: address.line,
        pincode: Number(address.pin),
        city: address.city,
        state: address.state,
        country: 'India',
        phone: Number(address.phone),
      },
      items: orderItems,
      package: orderPackageFor(weightGrams),
      org_charges: shippingCharges > 0 ? { shipping_charges: shippingCharges } : undefined,
    },
  })
}

export const getOrder = (orderId) => npFetch(`/orders/${encodeURIComponent(orderId)}`)

export const cancelOrder = (orderId, reason) => npFetch(`/orders/${encodeURIComponent(orderId)}/cancel`, { method: 'POST', body: { reason } })

export const cancelOrders = (orderIds, reason) => npFetch('/orders/cancel', { method: 'POST', body: { order_ids: orderIds, reason } })

export const setEwayBill = (orderId, ewayBillNumber, documentUrl) =>
  npFetch(`/orders/${encodeURIComponent(orderId)}/eway-bill`, { method: 'PATCH', body: { eway_bill_number: ewayBillNumber, ...(documentUrl ? { eway_bill_document_url: documentUrl } : {}) } })

/* ---------------- Shipments ---------------- */
// Booking is a separate step from creating the order (POST /orders above): this assigns a courier and
// mints the AWB. Omit courierId to let NimbusPost's own ranking pick the top serviceable courier.
export const bookShipment = (orderId, courierId) => npFetch('/shipments/book', { method: 'POST', body: { order_id: orderId, ...(courierId ? { courier_id: courierId } : {}) } })

/** Cancels a booked shipment by AWB (order goes back to `created` and can be booked again) — different from
 * `cancelOrder` above, which cancels the order itself and only works before a courier is booked. */
export const cancelShipment = (awb, reason) => npFetch('/shipments/cancel', { method: 'POST', body: { awb, reason } })

export const schedulePickup = (orderIds, pickupDate) => npFetch('/shipments/pickup', { method: 'POST', body: { order_ids: orderIds, ...(pickupDate ? { pickup_date: pickupDate } : {}) } })

/** One merged label PDF for the given orders. `url` expires — fetch it fresh each time, don't cache it. */
export const getLabels = (orderIds) => npFetch('/shipments/labels', { method: 'POST', body: { order_ids: orderIds } })

export const setShipmentEwayBill = (awb, ewayBillNumber, documentUrl) =>
  npFetch('/shipments/eway-bill', { method: 'POST', body: { awb, eway_bill_number: ewayBillNumber, ...(documentUrl ? { eway_bill_document_url: documentUrl } : {}) } })

/* ---------------- Tracking ---------------- */

export const trackByAwb = (awb) => npFetch(`/tracking/${encodeURIComponent(awb)}`)

export const trackBulk = (awbs) => npFetch('/tracking/bulk', { method: 'POST', body: { awbs } })

/** Same shape as trackByAwb, for an order's current AWB — the one to use once we have an order id but may
 * not have (or trust) a stored AWB. 404s with NO_SHIPMENT if the order was never booked. */
export const trackOrder = (orderId) => npFetch(`/tracking/order/${encodeURIComponent(orderId)}`)

/* ---------------- Returns ---------------- */
export const RETURN_REASONS = ['wrong_item', 'damaged_item', 'quality_issue', 'buyer_changed_mind', 'excess_quantity', 'counterfeit_item', 'late_delivery', 'other']

/**
 * A return (reverse pickup): the courier collects the parcel from the buyer's address and brings it to our
 * warehouse. `parentOrderId` is the forward NimbusPost order, which must already be `delivered` there.
 * Returns are always prepaid (nothing is collected from the buyer).
 */
export function createReturnOrder({ parentOrderId, orderNumber, reason, note, warehouseId, weightGrams, address, items }) {
  return npFetch('/orders', {
    method: 'POST',
    body: {
      order_number: orderNumber,
      order_type: 'reverse',
      payment_mode: 'prepaid',
      parent_order_id: parentOrderId,
      return_reason: reason,
      ...(note ? { return_reason_note: note } : {}),
      warehouse_id: warehouseId,
      shipping_address: {
        name: address.name,
        email: address.email || undefined,
        address: address.line,
        pincode: Number(address.pin),
        city: address.city,
        state: address.state,
        country: 'India',
        phone: Number(address.phone),
      },
      items: items.map((item) => ({
        name: item.name,
        qty: item.quantity,
        price: Math.round((item.unitPriceInclGst / (1 + (item.gstPercent ?? 0) / 100)) * 100) / 100,
        sku: item.sku || undefined,
        hsn: item.hsnCode || undefined,
        tax_rate: item.gstPercent ?? 0,
      })),
      package: orderPackageFor(weightGrams),
    },
  })
}

/* ---------------- Webhooks ---------------- */
export const WEBHOOK_EVENTS = ['order.updated', 'tracking.updated']

export const listWebhooks = () => npFetch('/webhooks')

/** Registers our endpoint. We send our own secret (NIMBUSPOST_WEBHOOK_SECRET) so it never has to be stored. */
export const registerWebhook = (url) =>
  npFetch('/webhooks', { method: 'POST', body: { name: 'ClickMart', url, events: WEBHOOK_EVENTS, secret: env.NIMBUSPOST_WEBHOOK_SECRET } })

export const webhookSecretSet = () => (env.NIMBUSPOST_WEBHOOK_SECRET ?? '').length >= 16

/** `x-nimbus-signature` is `sha256=` + hex HMAC-SHA256 of the raw body, keyed with our subscription secret. */
export function verifyWebhookSignature(rawBody, header) {
  if (!webhookSecretSet() || typeof header !== 'string') return false
  const expected = `sha256=${createHmac('sha256', env.NIMBUSPOST_WEBHOOK_SECRET).update(rawBody).digest('hex')}`
  const a = Buffer.from(header)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}
