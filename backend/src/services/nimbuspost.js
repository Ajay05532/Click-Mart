// NimbusPost Partner API (v2): https://api-v2.nimbuspost.com/docs/reference/v2
// Auth is a key pair sent as headers, not a bearer token. Every response is { success, data, meta } or
// { success: false, error }. Used for pincode serviceability today; shipment booking/tracking can reuse `npFetch`.
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

/**
 * Whether at least one courier can carry a parcel from our pickup PIN to this delivery PIN. A light,
 * store-sized package stands in for the real one, since this runs before a cart exists (home page "Set PIN").
 * Cached per route for an hour: serviceability rarely changes and the account is rate-limited to 60/min.
 */
export async function checkPincodeServiceability(pickupPincode, deliveryPincode, paymentMode = 'prepaid') {
  const key = `${pickupPincode}:${deliveryPincode}:${paymentMode}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value
  const data = await npFetch('/serviceability', {
    method: 'POST',
    body: {
      pickupPincode,
      deliveryPincode,
      paymentMode,
      packages: [{ weight: 500, length: 15, width: 12, height: 10 }],
    },
  })
  const value = {
    deliverable: (data.available ?? []).length > 0,
    reason: data.available?.length ? null : (data.excluded?.[0]?.reason ?? null),
  }
  cache.set(key, { at: Date.now(), value })
  if (cache.size > 2000) cache.clear()
  return value
}
