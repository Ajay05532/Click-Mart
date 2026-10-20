import { PUBLIC_PAGES, absolute, categoryPath, esc, getJson, siteOrigin } from './_shared.js'

const MAX_PAGES = 40

/** Builds the XML. Exported so it can be tested without a server. */
export function buildSitemap(site, { categories = [], products = [] }) {
  const today = new Date().toISOString().slice(0, 10)
  const entry = (loc, extra = '') => `  <url>\n    <loc>${esc(`${site}${loc}`)}</loc>${extra}\n  </url>`
  const out = []
  for (const page of PUBLIC_PAGES) out.push(entry(page.path, `\n    <lastmod>${today}</lastmod>\n    <changefreq>${page.changefreq}</changefreq>\n    <priority>${page.priority}</priority>`))
  for (const category of categories) {
    out.push(entry(categoryPath(category.id), `\n    <changefreq>daily</changefreq>\n    <priority>0.8</priority>`))
    for (const sub of category.subcategories ?? []) out.push(entry(categoryPath(category.id, sub.id), `\n    <changefreq>daily</changefreq>\n    <priority>0.6</priority>`))
  }
  for (const product of products) {
    const photos = (product.images?.length ? product.images : product.image ? [product.image] : []).slice(0, 5)
    const images = photos.map((src) => `\n    <image:image><image:loc>${esc(absolute(site, src))}</image:loc><image:title>${esc(product.name)}</image:title></image:image>`).join('')
    const lastmod = product.updatedAt ? `\n    <lastmod>${esc(String(product.updatedAt).slice(0, 10))}</lastmod>` : ''
    out.push(entry(`/product/${encodeURIComponent(product.slug)}`, `${lastmod}\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>${images}`))
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${out.join('\n')}\n</urlset>\n`
}

/** /sitemap.xml: the fixed pages plus every category and product, read live from the API. */
export default async function handler(req, res) {
  const categories = (await getJson('/categories')).data?.items ?? []
  const products = []
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const result = await getJson(`/products?pageSize=60&page=${page}`)
    if (!result.ok) break
    products.push(...(result.data.items ?? []))
    if (page >= (result.data.pages ?? 1)) break
  }
  res.setHeader('Content-Type', 'application/xml; charset=utf-8')
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
  res.status(200).send(buildSitemap(siteOrigin(req), { categories, products }))
}
