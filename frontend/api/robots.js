import { PRIVATE_PREFIXES, siteOrigin } from './_shared.js'

/** /robots.txt (see the rewrite in vercel.json). */
export default function handler(req, res) {
  const lines = ['User-agent: *', 'Allow: /', ...PRIVATE_PREFIXES.map((path) => `Disallow: ${path}`), 'Disallow: /*?q=', 'Disallow: /*?sort=', '', `Sitemap: ${siteOrigin(req)}/sitemap.xml`, '']
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800')
  res.status(200).send(lines.join('\n'))
}
