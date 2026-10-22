// `npm run check:live`: after uploading to MilesWeb, checks the live site the way Google sees it.
// Uses VITE_SITE_URL from .env.production, or pass an address: npm run check:live -- https://theclickmart.com
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const envFile = join(root, '.env.production')
const fromEnv = existsSync(envFile) ? /^\s*VITE_SITE_URL\s*=\s*(\S+)/m.exec(readFileSync(envFile, 'utf8'))?.[1] : undefined
const site = (process.argv[2] || fromEnv || '').replace(/\/+$/, '')
if (!site) {
  console.error('check:live: set VITE_SITE_URL in .env.production or pass the address, e.g. npm run check:live -- https://theclickmart.com')
  process.exit(1)
}
const host = new URL(site).host
const BOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'

const get = async (url, redirect = 'manual') => {
  try {
    const response = await fetch(url, { redirect, headers: { 'user-agent': BOT }, signal: AbortSignal.timeout(15000) })
    return { status: response.status, location: response.headers.get('location') ?? '', body: redirect === 'manual' && response.status >= 300 && response.status < 400 ? '' : await response.text() }
  } catch (error) {
    return { status: 0, location: '', body: String(error) }
  }
}

const results = []
const check = (ok, name, hint) => results.push({ ok, name, hint })
const htaccessHint = '.htaccess is missing or not working. Upload clickmart-storefront.zip and Extract it (do not drag files from Finder: macOS hides .htaccess).'

const sitemap = await get(`${site}/sitemap.xml`)
check(sitemap.status === 200 && sitemap.body.includes('<urlset'), 'sitemap.xml is served', 'sitemap.xml is missing from the upload. Upload the whole zip again.')
const pages = [...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].replace(/&amp;/g, '&'))
const product = pages.find((url) => url.includes('/product/'))
const category = pages.find((url) => url.includes('/category/'))

const robots = await get(`${site}/robots.txt`)
check(robots.status === 200 && robots.body.includes(`Sitemap: ${site}/sitemap.xml`), 'robots.txt names the sitemap', 'Upload the latest build (npm run package).')

for (const path of ['/', '/about', '/shop', '/contact', '/privacy', '/terms']) {
  const page = await get(`${site}${path}`)
  const canonical = /<link rel="canonical" href="([^"]+)"/.exec(page.body)?.[1]
  check(page.status === 200 && Boolean(canonical), `${path} opens with its own title and canonical`, page.status === 404 ? htaccessHint : `Answered ${page.status}. Upload the whole zip again.`)
}
for (const url of [product, category].filter(Boolean)) {
  const page = await get(url)
  check(page.status === 200 && /<h1>/.test(page.body), `${new URL(url).pathname} opens for search engines`, page.status === 404 ? htaccessHint : `Answered ${page.status}.`)
}
const unknown = await get(`${site}/checkout`)
check(unknown.status === 200, 'app pages without a pre-built file (e.g. /checkout) open', 'spa.html or .htaccess is missing. Upload the whole zip again.')

const www = await get(`https://www.${host}/about`)
check(www.status === 301 && www.location.startsWith(`${site}/`), `www.${host} redirects to ${host}`, htaccessHint)
const http = await get(`http://${host}/`)
check(http.status === 301 && http.location.startsWith('https://'), 'http redirects to https', htaccessHint)

const favicon = await get(`${site}/favicon.ico`)
check(favicon.status === 200, 'favicon.ico is served', 'favicon.ico is missing from the upload.')

const failed = results.filter((result) => !result.ok)
for (const result of results) console.log(`${result.ok ? '✓' : '✗'} ${result.name}${result.ok ? '' : `\n    → ${result.hint}`}`)
console.log(failed.length ? `\n${failed.length} of ${results.length} checks failed on ${site}.` : `\nAll ${results.length} checks passed on ${site}. Submit ${site}/sitemap.xml in Google Search Console.`)
process.exit(failed.length ? 1 : 0)
