import { from, maybe } from '../database/db.js'

/** What a staff member can be allowed to open. Administrators always have all of them. */
export const PERMISSIONS = {
  orders: 'Orders, packing and shipping',
  catalog: 'Products, categories and brands',
  inventory: 'Stock levels',
  marketing: 'Offers, banners and reviews',
  support: 'Support tickets and help content',
  customers: 'Customer list',
  reports: 'Reports and CSV exports (sales, GST, customers)',
}
export const PERMISSION_KEYS = Object.keys(PERMISSIONS)

/** Ready-made sets for common jobs. The admin app shows these as quick picks. */
export const PERMISSION_PRESETS = {
  packer: { label: 'Packer', permissions: ['orders', 'inventory'] },
  support: { label: 'Support agent', permissions: ['support', 'orders', 'customers'] },
  catalog: { label: 'Catalogue manager', permissions: ['catalog', 'inventory', 'marketing'] },
  marketing: { label: 'Marketing', permissions: ['marketing', 'catalog'] },
  manager: { label: 'Store manager', permissions: PERMISSION_KEYS },
}

/** Matches the database default, so staff who existed before permissions keep what they had. */
export const DEFAULT_STAFF_PERMISSIONS = ['orders', 'catalog', 'inventory', 'marketing', 'support', 'customers']

/**
 * Which permission each admin URL needs. The first match wins, so list the narrow paths first.
 * Paths that are not listed here either allow any staff member (summary, uploads) or are
 * limited to administrators inside their own route (settings, team, coupons, analytics, audit).
 */
export const ROUTE_PERMISSIONS = [
  [/^\/variants\/[^/]+\/stock$/, 'inventory'],
  [/^\/inventory(\/|$)/, 'inventory'],
  [/^\/(products|categories|brands|variants|imports\/products)(\/|$)/, 'catalog'],
  [/^\/imports\/stock(\/|$)/, 'inventory'],
  [/^\/(offers|banners|reviews)(\/|$)/, 'marketing'],
  [/^\/(orders|print)(\/|$)/, 'orders'],
  [/^\/customers(\/|$)/, 'customers'],
  [/^\/support(\/|$)/, 'support'],
]
/** Admin paths that need no permission beyond being staff, or that guard themselves. */
export const UNGATED_ADMIN_PATHS = ['/summary', '/uploads', '/settings', '/staff', '/audit', '/analytics', '/coupons', '/payments/webhooks', '/reports', '/nimbuspost/warehouses']

export const requiredPermission = (path) => ROUTE_PERMISSIONS.find(([pattern]) => pattern.test(path))?.[1] ?? null

export const cleanPermissions = (list) => PERMISSION_KEYS.filter((key) => Array.isArray(list) && list.includes(key))

const TTL_MS = 10_000
const cache = new Map()
export const forgetPermissions = (userId) => cache.delete(userId)

/** Permissions for one person. Admins get all; staff are read from the database (cached for a few seconds). */
export async function permissionsFor(userId, role) {
  if (role === 'ADMIN') return PERMISSION_KEYS
  if (role !== 'STAFF') return []
  const hit = cache.get(userId)
  if (hit && hit.until > Date.now()) return hit.list
  const row = await maybe(from('Staff').select('permissions').eq('loginId', userId).maybeSingle())
  const list = cleanPermissions(row?.permissions ?? DEFAULT_STAFF_PERMISSIONS)
  cache.set(userId, { list, until: Date.now() + TTL_MS })
  return list
}
