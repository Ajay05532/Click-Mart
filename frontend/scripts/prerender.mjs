// Runs after `vite build`. Writes plain HTML for every public page into dist/ so search engines and link
// previews see real titles, descriptions, structured data and product text without running JavaScript.
// Also writes sitemap.xml and robots.txt. This is what makes SEO work on a static host such as MilesWeb.
// The page rules are the ones in api/_meta.js (shared with the Vercel crawler function).
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PRIVATE_PREFIXES, PUBLIC_PAGES, categoryPath } from '../api/_shared.js'
import { inject, metaFor } from '../api/_meta.js'
import { buildSitemap } from '../api/sitemap.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')

function readEnv() {
  const out = {}
  const file = join(root, '.env.production')
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line)
      if (match && !line.trim().startsWith('#')) out[match[1]] = match[2].replace(/^["']|["']$/g, '')
    }
  }
  return { ...out, ...Object.fromEntries(['VITE_API_URL', 'VITE_SITE_URL', 'SITE_URL'].filter((key) => process.env[key]).map((key) => [key, process.env[key]])) }
}

const env = readEnv()
const site = (env.SITE_URL || env.VITE_SITE_URL || '').replace(/\/$/, '')
const api = (env.VITE_API_URL || '').replace(/\/$/, '')
if (!site) throw new Error('prerender: set VITE_SITE_URL (for example https://theclickmart.com) in frontend/.env.production')
if (!existsSync(join(dist, 'index.html'))) throw new Error('prerender: dist/index.html is missing. Run vite build first.')

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
const cache = new Map()
/** GET from the API. A sleeping Render service can take a minute to wake, so wait and retry. */
async function fetchJson(path) {
  if (cache.has(path)) return cache.get(path)
  let result = { ok: false, status: 0 }
  for (let attempt = 1; attempt <= 4 && api; attempt += 1) {
    try {
      const response = await fetch(`${api}/api/v1${path}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(100_000) })
      if (response.status === 404) { result = { ok: false, status: 404 }; break }
      if (response.ok) { result = { ok: true, status: 200, data: await response.json() }; break }
      result = { ok: false, status: response.status }
    } catch {
      result = { ok: false, status: 0 }
    }
    await sleep(attempt * 3000)
  }
  cache.set(path, result)
  return result
}

const shell = readFileSync(join(dist, 'index.html'), 'utf8')
// Unknown addresses fall back to the plain app shell, so keep a copy that no page overwrites.
writeFileSync(join(dist, 'spa.html'), shell)

const categories = (await fetchJson('/categories')).data?.items ?? []
const products = []
for (let page = 1; page <= 60; page += 1) {
  const result = await fetchJson(`/products?pageSize=60&page=${page}`)
  if (!result.ok) break
  products.push(...(result.data.items ?? []))
  if (page >= (result.data.pages ?? 1)) break
}
if (!categories.length || !products.length) {
  console.warn('\n  WARNING: prerender could not read the catalogue from the API. Category and product pages were NOT generated and the sitemap has only the fixed pages.\n  Check VITE_API_URL, that the API is awake, then build again.\n')
}

const paths = [...PUBLIC_PAGES.map((page) => page.path)]
for (const category of categories) {
  paths.push(categoryPath(category.id))
  for (const sub of category.subcategories ?? []) paths.push(categoryPath(category.id, sub.id))
}
for (const product of products) paths.push(`/product/${encodeURIComponent(product.slug)}`)

// "/shop" -> shop.html, "/product/x" -> product/x.html, "/" -> index.html. The .htaccess maps addresses to these files.
const fileFor = (path) => (path === '/' ? 'index.html' : `${decodeURIComponent(path).replace(/^\//, '')}.html`)
let written = 0
let skipped = 0
for (const path of paths) {
  const meta = await metaFor(path, {}, site, fetchJson)
  if (meta.status !== 200) { skipped += 1; console.warn(`  skipped ${path} (${meta.status})`); continue }
  const target = join(dist, fileFor(path))
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, inject(shell, meta))
  written += 1
}

writeFileSync(join(dist, 'sitemap.xml'), buildSitemap(site, { categories, products }))
writeFileSync(
  join(dist, 'robots.txt'),
  ['User-agent: *', 'Allow: /', ...PRIVATE_PREFIXES.map((path) => `Disallow: ${path}`), 'Disallow: /*?q=', 'Disallow: /*?sort=', '', `Sitemap: ${site}/sitemap.xml`, ''].join('\n'),
)
if (!existsSync(join(dist, 'favicon.ico'))) copyFileSync(join(dist, 'favicon.png'), join(dist, 'favicon.ico'))
console.log(`prerender: ${written} pages (${products.length} products, ${categories.length} categories), sitemap.xml and robots.txt written for ${site}${skipped ? `, ${skipped} skipped` : ''}`)
