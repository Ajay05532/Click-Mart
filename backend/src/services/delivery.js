// One answer to "can we deliver this, and what does delivery cost?" for the location picker, the cart quote
// and checkout, so they never disagree. Rules, in order:
//  1. Settings -> Delivery block-list (PIN codes and states) always wins.
//  2. NimbusPost, when connected and Settings has a pickup PIN: a real courier must serve the route (and offer
//     cash on delivery for COD). Its cheapest rate is the delivery charge when Settings uses courier rates.
//  3. If NimbusPost cannot be reached, we fall back to "deliverable" and the flat fee: a third-party outage
//     must never stop the shop from taking orders.
import { getDeliveryRates, nimbuspostEnabled } from './nimbuspost.js'

const SLAB_GRAMS = 500

/** Couriers bill per 500 g slab, so rounding up keeps the rate exact and lets one cached quote cover many carts. */
export const weightSlab = (grams) => Math.max(SLAB_GRAMS, Math.ceil(Math.max(0, grams) / SLAB_GRAMS) * SLAB_GRAMS)

/** Whole rupees, rounded up, from a courier rate in paise. */
export const rupeesFromPaise = (paise) => Math.ceil(paise / 100)

export function isBlocked(settings, pin, state) {
  if (pin && (settings.nonServiceablePincodes ?? []).includes(pin)) return true
  const name = (state ?? '').trim().toLowerCase()
  return !!name && (settings.nonServiceableStates ?? []).some((item) => item.trim().toLowerCase() === name)
}

/**
 * @param {object} settings  getSettings()
 * @param {{ pin: string, state?: string|null, paymentMode?: 'prepaid'|'cod', weightGrams?: number, orderValue?: number }} where
 * @returns {Promise<{ deliverable: boolean, reason: string|null, codAvailable: boolean, courierCharge: number|null, etaDays: number|null, checked: boolean }>}
 *   `checked` is false when NimbusPost was not asked (not connected) or could not answer.
 */
export async function checkDelivery(settings, { pin, state = null, paymentMode = 'prepaid', weightGrams = SLAB_GRAMS, orderValue = 0 }) {
  if (isBlocked(settings, pin, state)) {
    return { deliverable: false, reason: 'We do not deliver to this area yet.', codAvailable: false, courierCharge: null, etaDays: null, checked: true }
  }
  const open = { deliverable: true, reason: null, codAvailable: true, courierCharge: null, etaDays: null, checked: false }
  if (!/^\d{6}$/.test(pin ?? '') || !nimbuspostEnabled() || !settings.pickupPincode) return open
  const quote = (mode) =>
    getDeliveryRates({
      pickupPincode: settings.pickupPincode,
      deliveryPincode: pin,
      paymentMode: mode,
      weightGrams: weightSlab(weightGrams),
      // COD fees depend on the amount; round up to ₹100 so nearby cart totals share one cached quote.
      orderValuePaise: mode === 'cod' ? Math.ceil(Math.max(1, orderValue) / 100) * 100 * 100 : undefined,
    })
  try {
    const prepaid = await quote('prepaid')
    if (!prepaid.deliverable) {
      return { deliverable: false, reason: 'No courier delivers to this PIN code yet.', codAvailable: false, courierCharge: null, etaDays: null, checked: true }
    }
    let cod = null
    if (paymentMode === 'cod') cod = await quote('cod').catch(() => ({ deliverable: false, cheapest: null }))
    const chosen = paymentMode === 'cod' && cod?.deliverable ? cod.cheapest : prepaid.cheapest
    return {
      deliverable: true,
      reason: null,
      codAvailable: paymentMode === 'cod' ? !!cod?.deliverable : true,
      courierCharge: chosen?.ratePaise != null ? rupeesFromPaise(chosen.ratePaise) : null,
      etaDays: chosen?.tatDays ?? null,
      checked: true,
    }
  } catch (error) {
    console.error('NimbusPost delivery check failed', pin, error instanceof Error ? error.message : error)
    return open
  }
}
