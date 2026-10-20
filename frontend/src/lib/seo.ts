import { useEffect } from 'react'

export const SITE_NAME = 'ClickMart'
export const DEFAULT_DESCRIPTION = 'Premium dry fruits, nuts and seeds from ClickMart, packed fresh in Patna and delivered across India. Pay by UPI, card, net banking or cash on delivery.'
const DEFAULT_IMAGE = '/images/seeds.jpg'

/** The public address of the site. Set VITE_SITE_URL once you have a domain; until then the current address is used. */
export const siteUrl = () => ((import.meta.env.VITE_SITE_URL as string | undefined) || window.location.origin).replace(/\/$/, '')
export const absoluteUrl = (value: string) => (/^https?:\/\//i.test(value) ? value : `${siteUrl()}${value.startsWith('/') ? '' : '/'}${value}`)

export type Seo = {
  /** Page name. " · ClickMart" is added unless the title already says ClickMart. */
  title?: string
  description?: string
  /** Canonical path (and query) of this page. Defaults to the current path without its query string. */
  path?: string
  image?: string | null
  type?: 'website' | 'product' | 'article'
  /** Keep the page out of search results (cart, account, order pages, search results). */
  noindex?: boolean
  jsonLd?: object | object[] | null
}

/**
 * Search text for a product when the admin left it empty: price, pack sizes and the short
 * description. Keep in step with api/_meta.js so crawlers and the browser agree.
 */
export function productSearchText(product: { name: string; blurb?: string; description?: string; packs: { size: string; price: number }[]; rating?: number; reviewCount?: number; metaTitle?: string; metaDescription?: string }) {
  const from = Math.min(...product.packs.map((pack) => pack.price))
  const sizes = [...new Set(product.packs.map((pack) => pack.size))]
  const about = (product.blurb || product.description || '').trim()
  const rated = (product.reviewCount ?? 0) > 0 && (product.rating ?? 0) > 0 ? `Rated ${Number((product.rating ?? 0).toFixed(1))}/5 by ${product.reviewCount} shoppers.` : ''
  return {
    title: product.metaTitle?.trim() || (Number.isFinite(from) ? `Buy ${product.name} Online at ₹${from}` : `Buy ${product.name} Online`),
    description:
      product.metaDescription?.trim() ||
      [`Buy ${product.name} online${Number.isFinite(from) ? ` at ₹${from}` : ''}.`, sizes.length ? `Packs: ${sizes.join(', ')}.` : '', rated, 'Fresh from Patna, COD available.', about]
        .filter(Boolean)
        .join(' '),
  }
}

/** Search text for a category or sub-category page. The admin's own text wins when it is set. */
export function categorySearchText(category: { name: string; tagline?: string; description?: string; metaTitle?: string; metaDescription?: string }) {
  const intro = (category.description || category.tagline || '').trim()
  return {
    title: category.metaTitle?.trim() || `Buy ${category.name} Online at Best Price`,
    description: category.metaDescription?.trim() || `Shop ${category.name} online at ClickMart. ${intro ? `${intro} ` : ''}Packed fresh to order, fast delivery across India, COD available.`,
  }
}

const fullTitle = (title?: string) => (!title ? `${SITE_NAME} · Premium dry fruits, nuts and seeds` : /clickmart/i.test(title) ? title : `${title} · ${SITE_NAME}`)
const clip = (text: string, max = 160) => {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).replace(/\s+\S*$/, '')}…`
}

function setMeta(attribute: 'name' | 'property', key: string, content: string | null) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`)
  if (content === null) return element?.remove()
  if (!element) {
    element = document.createElement('meta')
    element.setAttribute(attribute, key)
    document.head.append(element)
  }
  element.content = content
}

function setCanonical(href: string | null) {
  let element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (href === null) return element?.remove()
  if (!element) {
    element = document.createElement('link')
    element.rel = 'canonical'
    document.head.append(element)
  }
  element.href = href
}

function setJsonLd(data: object | object[] | null | undefined) {
  document.head.querySelectorAll('script[data-seo="jsonld"]').forEach((element) => element.remove())
  for (const item of Array.isArray(data) ? data : data ? [data] : []) {
    const script = document.createElement('script')
    script.type = 'application/ld+json'
    script.dataset.seo = 'jsonld'
    // "<" is escaped so the data can never close the script tag.
    script.textContent = JSON.stringify(item).replace(/</g, '\\u003c')
    document.head.append(script)
  }
}

export function applySeo(input: Seo) {
  const title = fullTitle(input.title)
  const description = clip(input.description || DEFAULT_DESCRIPTION)
  const url = absoluteUrl(input.path ?? window.location.pathname)
  const image = absoluteUrl(input.image || DEFAULT_IMAGE)
  document.title = title
  setMeta('name', 'description', description)
  setMeta('name', 'robots', input.noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large')
  setCanonical(input.noindex ? null : url)
  setMeta('property', 'og:site_name', SITE_NAME)
  setMeta('property', 'og:locale', 'en_IN')
  setMeta('property', 'og:type', input.type ?? 'website')
  setMeta('property', 'og:title', title)
  setMeta('property', 'og:description', description)
  setMeta('property', 'og:url', url)
  setMeta('property', 'og:image', image)
  setMeta('name', 'twitter:card', 'summary_large_image')
  setMeta('name', 'twitter:title', title)
  setMeta('name', 'twitter:description', description)
  setMeta('name', 'twitter:image', image)
  setJsonLd(input.noindex ? null : input.jsonLd)
}

/**
 * Sets the title, description, canonical address, social preview tags and structured data of the
 * current page. Use it once per page. Pass `noindex` for pages that should not appear in search.
 */
export function useSeo(input: Seo) {
  const key = JSON.stringify(input)
  useEffect(() => {
    applySeo(JSON.parse(key) as Seo)
    // Leaving the page puts the plain defaults back, so a page without its own call never shows stale tags.
    return () => applySeo({})
  }, [key])
}
