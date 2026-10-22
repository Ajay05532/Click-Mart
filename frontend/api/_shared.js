// Shared helpers for the serverless functions in this folder. Files starting with "_" are not routes.

/** Where the ClickMart API lives. VITE_API_URL is already set in the Vercel project for the build. */
export const apiBase = () => (process.env.VITE_API_URL || process.env.API_URL || '').replace(/\/$/, '')

/** The public address of the site: SITE_URL if set, otherwise the address the visitor used. */
export function siteOrigin(req) {
  const fixed = process.env.SITE_URL || process.env.VITE_SITE_URL
  if (fixed) return fixed.replace(/\/$/, '')
  const host = req.headers['x-forwarded-host'] || req.headers.host
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0]
  return `${proto}://${host}`
}

const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => entities[char])

/** GET a JSON path from the API. Never throws: returns { ok: false, status } when it cannot. */
export async function getJson(path) {
  const base = apiBase()
  if (!base) return { ok: false, status: 0 }
  try {
    const response = await fetch(`${base}/api/v1${path}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) })
    if (!response.ok) return { ok: false, status: response.status }
    return { ok: true, status: response.status, data: await response.json() }
  } catch {
    return { ok: false, status: 0 }
  }
}

export const absolute = (site, value) => (!value ? '' : /^https?:\/\//i.test(value) ? value : `${site}${value.startsWith('/') ? '' : '/'}${value}`)

/** Pages that are public and worth listing. Keep in step with the routes in src/App.tsx. */
export const PUBLIC_PAGES = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/shop', changefreq: 'daily', priority: '0.9' },
  { path: '/sale', changefreq: 'daily', priority: '0.8' },
  { path: '/recipes', changefreq: 'monthly', priority: '0.5' },
  { path: '/wellness', changefreq: 'monthly', priority: '0.5' },
  { path: '/about', changefreq: 'monthly', priority: '0.4' },
  { path: '/contact', changefreq: 'monthly', priority: '0.4' },
  { path: '/help', changefreq: 'weekly', priority: '0.5' },
  { path: '/privacy', changefreq: 'yearly', priority: '0.2' },
  { path: '/terms', changefreq: 'yearly', priority: '0.2' },
]

/** Pages that must never be indexed (accounts, money, forms). */
export const PRIVATE_PREFIXES = ['/cart', '/checkout', '/order', '/orders', '/settings', '/account', '/login', '/verify-email', '/forgot-password', '/reset-password', '/wishlist', '/track', '/help/tickets', '/help/new']

/** Address of a category (or sub-category) page. Keep in step with categoryPath in src/lib/paths.ts. */
export const categoryPath = (category, sub) => `/category/${encodeURIComponent(category)}${sub ? `/${encodeURIComponent(sub)}` : ''}`
