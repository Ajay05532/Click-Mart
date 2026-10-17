import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { fullTitle, inject, metaFor } from '../api/_meta.js'
import { esc } from '../api/_shared.js'
import robots from '../api/robots.js'
import { buildSitemap } from '../api/sitemap.js'

const site = 'https://shop.example.com'
const product = {
  id: 'p1',
  slug: 'california-almonds',
  name: 'California Almonds',
  category: 'dry-fruits-nuts',
  categoryName: 'Dry Fruits & Nuts',
  blurb: 'Crunchy and fresh <b>almonds</b>',
  description: 'Handpicked almonds.',
  image: 'https://cdn.example.com/a.jpg',
  images: ['https://cdn.example.com/a.jpg', '/images/almonds.jpg'],
  highlights: ['No preservatives'],
  rating: 4.6,
  reviewCount: 12,
  inStock: true,
  packs: [
    { variantId: 'v1', size: '250 g', price: 299, mrp: 349, stock: 10 },
    { variantId: 'v2', size: '500 g', price: 549, mrp: 649, stock: 0 },
  ],
}
const api = (map) => async (path) => map[path.split('?')[0]] ?? { ok: false, status: 404 }

describe('page meta for crawlers', () => {
  it('describes a product with price, availability and rating', async () => {
    const meta = await metaFor('/product/california-almonds', {}, site, api({ '/products/california-almonds': { ok: true, status: 200, data: { product } } }))
    assert.equal(meta.canonical, `${site}/product/california-almonds`)
    assert.equal(meta.type, 'product')
    assert.match(meta.description, /^From ₹299\./)
    assert.ok(meta.description.length <= 160)
    const ld = meta.jsonLd.find((item) => item['@type'] === 'Product')
    assert.equal(ld.aggregateRating.reviewCount, 12)
    assert.deepEqual(ld.offers.map((offer) => offer.availability.split('/').pop()), ['InStock', 'OutOfStock'])
    assert.ok(ld.image.every((url) => url.startsWith('http')), 'images are absolute')
    assert.equal(meta.jsonLd.find((item) => item['@type'] === 'BreadcrumbList').itemListElement.length, 4)
  })

  it('uses the search title and description set in the admin, and lists pack sizes otherwise', async () => {
    const custom = { ...product, metaTitle: 'California Almonds 250g & 500g', metaDescription: 'Crunchy California almonds, sealed fresh.' }
    const set = await metaFor('/product/california-almonds', {}, site, api({ '/products/california-almonds': { ok: true, status: 200, data: { product: custom } } }))
    assert.equal(set.title, 'California Almonds 250g & 500g')
    assert.equal(set.description, 'Crunchy California almonds, sealed fresh.')
    const auto = await metaFor('/product/california-almonds', {}, site, api({ '/products/california-almonds': { ok: true, status: 200, data: { product } } }))
    assert.match(auto.description, /Packs: 250 g, 500 g\./)
    assert.equal(auto.jsonLd.find((item) => item['@type'] === 'Product').url, `${site}/product/california-almonds`)
  })

  it('gives a category page its own text, intro and product list', async () => {
    const category = { id: 'dry-fruits-nuts', name: 'Dry Fruits & Nuts', tagline: 'Everyday crunch', description: 'Almonds, cashews and pistachios packed in Patna.', metaTitle: 'Dry Fruits Online in India', metaDescription: 'Shop dry fruits online.', subcategories: [] }
    const fetchJson = api({ '/categories': { ok: true, status: 200, data: { items: [category] } }, '/products': { ok: true, status: 200, data: { items: [product] } } })
    const meta = await metaFor('/shop', { category: 'dry-fruits-nuts' }, site, fetchJson)
    assert.equal(meta.title, 'Dry Fruits Online in India')
    assert.equal(meta.description, 'Shop dry fruits online.')
    assert.match(meta.body, /<p>Almonds, cashews and pistachios packed in Patna\.<\/p>/)
    const page = meta.jsonLd.find((item) => item['@type'] === 'CollectionPage')
    assert.equal(page.mainEntity.itemListElement[0].url, `${site}/product/california-almonds`)
  })

  it('answers 404 and noindex for a product that does not exist', async () => {
    const meta = await metaFor('/product/nope', {}, site, api({}))
    assert.equal(meta.status, 404)
    assert.equal(meta.noindex, true)
  })

  it('keeps accounts, carts and forms out of search', async () => {
    for (const path of ['/cart', '/checkout', '/orders', '/order/ORD-1', '/settings', '/login', '/wishlist', '/help/tickets/TKT-1001', '/help/new']) {
      const meta = await metaFor(path, {}, site, api({}))
      assert.equal(meta.noindex, true, path)
      assert.equal(meta.canonical, null, path)
    }
  })

  it('indexes a single category page but not searches or filters', async () => {
    const fetchJson = api({ '/categories': { ok: true, status: 200, data: { items: [{ id: 'dry-fruits-nuts', name: 'Dry Fruits & Nuts', tagline: 'Everyday crunch', subcategories: [] }] } }, '/products': { ok: true, status: 200, data: { items: [product] } } })
    const category = await metaFor('/shop', { category: 'dry-fruits-nuts' }, site, fetchJson)
    assert.equal(category.noindex, false)
    assert.equal(category.title, 'Buy Dry Fruits & Nuts Online')
    assert.equal(category.canonical, `${site}/shop?category=dry-fruits-nuts`)
    assert.equal((await metaFor('/shop', { q: 'almond' }, site, fetchJson)).noindex, true)
    assert.equal((await metaFor('/shop', { sort: 'discount' }, site, fetchJson)).noindex, true)
    assert.equal((await metaFor('/shop', {}, site, fetchJson)).noindex, false)
  })

  it('gives the home page organisation and website data', async () => {
    const meta = await metaFor('/', {}, site, api({}))
    assert.deepEqual(meta.jsonLd.map((item) => item['@type']), ['Organization', 'WebSite'])
    assert.equal(meta.jsonLd[1].potentialAction['@type'], 'SearchAction')
  })

  it('does not double the brand in titles', () => {
    assert.equal(fullTitle('About Us'), 'About Us · ClickMart')
    assert.equal(fullTitle('ClickMart · Premium dry fruits'), 'ClickMart · Premium dry fruits')
  })
})

describe('injecting tags into the app shell', () => {
  const shell = '<!doctype html><html><head><title>ClickMart</title>\n<meta\n name="description"\n content="old"\n/><meta property="og:title" content="old"><meta name="viewport" content="x"></head><body><div id="root"></div></body></html>'

  it('replaces the title and old tags, adds the new ones and fills the root', async () => {
    const meta = await metaFor('/product/california-almonds', {}, site, api({ '/products/california-almonds': { ok: true, status: 200, data: { product } } }))
    const html = inject(shell, meta)
    assert.match(html, /<title>California Almonds — Buy Online · ClickMart<\/title>/)
    assert.equal((html.match(/name="description"/g) ?? []).length, 1)
    assert.equal((html.match(/property="og:title"/g) ?? []).length, 1)
    assert.match(html, /<link rel="canonical" href="https:\/\/shop\.example\.com\/product\/california-almonds">/)
    assert.match(html, /<script type="application\/ld\+json">/)
    assert.match(html, /<div id="root"><nav>/)
    assert.match(html, /<h1>California Almonds<\/h1>/)
    assert.match(html, /viewport/, 'unrelated tags stay')
  })

  it('escapes product text so it cannot break out of a tag or script', async () => {
    const evil = { ...product, name: '</script><script>alert(1)</script>', blurb: '"><img src=x onerror=alert(1)>' }
    const meta = await metaFor('/product/x', {}, site, api({ '/products/x': { ok: true, status: 200, data: { product: evil } } }))
    const html = inject(shell, meta)
    assert.ok(!html.includes('<script>alert(1)</script>'))
    assert.ok(!html.includes('<img src=x onerror'))
    assert.equal(esc('<&>"\''), '&lt;&amp;&gt;&quot;&#39;')
  })
})

describe('robots.txt and sitemap', () => {
  const reply = () => {
    const out = { headers: {} }
    out.setHeader = (key, value) => (out.headers[key] = value)
    out.status = (code) => ((out.code = code), out)
    out.send = (body) => ((out.body = body), out)
    return out
  }

  it('blocks private pages and points to the sitemap on the visitor\'s own domain', () => {
    const res = reply()
    robots({ headers: { host: 'shop.example.com' } }, res)
    assert.match(res.body, /Disallow: \/checkout/)
    assert.match(res.body, /Disallow: \/help\/tickets/)
    assert.match(res.body, /Sitemap: https:\/\/shop\.example\.com\/sitemap\.xml/)
    assert.match(res.headers['Content-Type'], /text\/plain/)
  })

  it('lists pages, categories, sub-categories and products with images, escaped', () => {
    const xml = buildSitemap(site, { categories: [{ id: 'dry-fruits-nuts', subcategories: [{ id: 'almonds' }] }], products: [product, { slug: 'a&b', name: 'Salt & pepper', image: null }] })
    assert.match(xml, /<loc>https:\/\/shop\.example\.com\/<\/loc>/)
    assert.match(xml, /<loc>https:\/\/shop\.example\.com\/shop\?category=dry-fruits-nuts&amp;sub=almonds<\/loc>/)
    assert.match(xml, /<loc>https:\/\/shop\.example\.com\/product\/california-almonds<\/loc>/)
    assert.match(xml, /<image:loc>https:\/\/shop\.example\.com\/images\/almonds\.jpg<\/image:loc>/)
    assert.match(xml, /product\/a%26b/)
    assert.match(buildSitemap(site, { products: [{ ...product, updatedAt: '2026-10-17T10:00:00.000Z' }] }), /<lastmod>2026-10-17<\/lastmod>/)
    assert.ok(!/\/cart|\/checkout|\/login/.test(xml))
  })
})

describe('vercel.json', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
  it('sends crawlers to the page function, only for pages, and everyone else to the app', () => {
    const [, , bots, spa] = config.rewrites
    assert.equal(bots.destination, '/api/page?path=/$1')
    assert.equal(spa.destination, '/index.html')
    const pattern = new RegExp(`^${bots.source}$`)
    assert.ok(pattern.test('/'), 'home matches')
    assert.ok(pattern.test('/shop'))
    assert.ok(pattern.test('/product/x'))
    for (const asset of ['/assets/index-abc.js', '/images/a.jpg', '/api/page', '/logo.png', '/favicon.svg']) assert.ok(!pattern.test(asset), `${asset} must not go to the page function`)
    assert.match('Mozilla/5.0 (compatible; Googlebot/2.1)', new RegExp(bots.has[0].value.replace('(?i)', ''), 'i'))
    assert.match('WhatsApp/2.23.20', new RegExp(bots.has[0].value.replace('(?i)', ''), 'i'))
    assert.doesNotMatch('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 Safari/604.1', new RegExp(bots.has[0].value.replace('(?i)', ''), 'i'))
  })
})
