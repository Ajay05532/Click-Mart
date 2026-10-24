// NimbusPost Partner API (v2): https://api-v2.nimbuspost.com/docs/reference/v2
// Auth is a key pair sent as headers, not a bearer token. Every response is { success, data, meta } or
// { success: false, error }. Used today for pincode serviceability and the admin's real delivery-rate
// check; shipment booking/tracking can reuse `npFetch`.
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

/**
 * Whether at least one courier can carry a parcel from our pickup PIN to this delivery PIN. A light,
 * store-sized package stands in for the real one, since this runs before a cart exists (home page "Set PIN").
 */
export async function checkPincodeServiceability(pickupPincode, deliveryPincode, paymentMode = 'prepaid') {
  const data = await serviceability({ pickupPincode, deliveryPincode, paymentMode, packages: [{ weight: 500, length: 15, width: 12, height: 10 }] })
  return {
    deliverable: (data.available ?? []).length > 0,
    reason: data.available?.length ? null : (data.excluded?.[0]?.reason ?? null),
  }
}

/** A box big enough for the order's weight. We don't track per-product dimensions, so this is an estimate. */
function packageFor(weightGrams) {
  if (weightGrams <= 1000) return { weight: weightGrams, length: 20, width: 15, height: 8 }
  if (weightGrams <= 3000) return { weight: weightGrams, length: 25, width: 20, height: 12 }
  return { weight: weightGrams, length: 30, width: 25, height: 15 }
}

/**
 * The real delivery charge for an order: every courier NimbusPost offers on this route for this order's
 * actual weight, value and payment mode, cheapest first. Used by the admin order drawer.
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

export function createWarehouse({ name, address, contactName, contactPhone, verificationId, isPrimary }) {
  return npFetch('/warehouses', {
    method: 'POST',
    body: {
      name,
      address,
      contact_person: { name: contactName, phone: contactPhone, phone_verified: true, verification_id: verificationId },
      ...(isPrimary ? { is_primary: true } : {}),
    },
  })
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
