import { inject, metaFor } from './_meta.js'
import { siteOrigin } from './_shared.js'

let shell = { html: '', at: 0 }

/** The built single-page app shell. Fetched from this same deployment and kept for five minutes. */
async function appShell(site) {
  if (shell.html && Date.now() - shell.at < 5 * 60_000) return shell.html
  const response = await fetch(`${site}/index.html`, { headers: { 'x-seo-shell': '1' }, signal: AbortSignal.timeout(8000) })
  if (!response.ok) throw new Error(`index.html answered ${response.status}`)
  shell = { html: await response.text(), at: Date.now() }
  return shell.html
}

/**
 * Served only to crawlers and link-preview bots (the rewrite in vercel.json matches their User-Agent).
 * They get the same app shell, with the real title, description, canonical address, social preview
 * tags, structured data and a plain HTML summary already in place. People get the normal app.
 */
export default async function handler(req, res) {
  const site = siteOrigin(req)
  const path = `/${String(req.query.path ?? '').replace(/^\/+/, '')}`
  const { path: _path, ...query } = req.query
  try {
    const meta = await metaFor(path, query, site)
    const html = inject(await appShell(site), meta)
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', meta.status === 200 ? 'public, s-maxage=300, stale-while-revalidate=3600' : 'public, s-maxage=60')
    res.status(meta.status).send(html)
  } catch {
    // Not a redirect: that would loop back here. Crawlers retry a 503 later.
    res.setHeader('Retry-After', '60')
    res.status(503).send('Temporarily unavailable')
  }
}
