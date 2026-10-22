import { from, rows } from '../database/db.js'
import { PRODUCT_SELECT } from '../database/selects.js'
import { loadActiveOffers } from './pricing.js'
import { getSettings } from './settings.js'

// Short-lived copies of the public catalogue. Every shop page asks for these, and each trip to the
// database adds about half a second, so they are kept for a few seconds and dropped after any write
// (see clearPublicCache in app.js). Checkout and the admin never read from here.
const TTL_MS = 30_000
const store = new Map()

function cached(key, load) {
  const hit = store.get(key)
  if (hit && hit.expires > Date.now()) return hit.value
  const value = load()
  store.set(key, { value, expires: Date.now() + TTL_MS })
  value.catch(() => {
    if (store.get(key)?.value === value) store.delete(key)
  })
  return value
}

export function clearPublicCache() {
  store.clear()
}

export const activeProducts = () => cached('products', () => rows(from('Product').select(PRODUCT_SELECT).eq('isActive', true)))
export const displayOffers = () => cached('offers', loadActiveOffers)
export const activeCategories = () => cached('categories', () => rows(from('Category').select('*').eq('isActive', true).order('sortOrder').order('name')))
export const activeBanners = () => cached('banners', () => rows(from('Banner').select('*').eq('isActive', true).order('sortOrder')))
export const activeCoupons = () => cached('coupons', () => rows(from('Coupon').select('*').eq('isActive', true).order('createdAt', { ascending: false })))
export const publicSettings = () => cached('settings', getSettings)
