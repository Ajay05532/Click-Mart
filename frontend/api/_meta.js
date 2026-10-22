// What a search or link-preview crawler should see for a page. The browser app sets the same tags
// itself with src/lib/seo.ts, so keep the wording here in step with the pages in src/pages.
import { PRIVATE_PREFIXES, absolute, categoryPath, esc, getJson } from './_shared.js'

const SITE = 'ClickMart'
const PHONE = '+91 93048 37512'
const EMAIL = 'tanusharmaa79@gmail.com'
const DEFAULT_DESCRIPTION = 'Premium dry fruits, nuts and seeds from ClickMart, packed fresh in Patna and delivered across India. Pay by UPI, card, net banking or cash on delivery.'

export const fullTitle = (title) => (!title ? `${SITE} · Premium dry fruits, nuts and seeds` : /clickmart/i.test(title) ? title : `${title} · ${SITE}`)
const plain = (text, max) => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
/** Cuts at a word boundary with an ellipsis, the way src/lib/seo.ts does. */
const clipWords = (text, max) => {
  const flat = plain(text, 100000)
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).replace(/\s+\S*$/, '')}…`
}

const STATIC = {
  '/sale': ['Dry fruit offers and coupons', "Today's deals on premium almonds, cashews, raisins and seeds, plus coupon codes you can use at checkout. Prices drop by up to the discount shown on each pack."],
  '/about': ['About Us', 'ClickMart began as a small packing desk in Patna. We pack premium almonds, cashews, raisins, walnuts and seeds fresh after you order, and deliver across India.'],
  '/contact': ['Contact us', 'Call, email or write to ClickMart in Patna. Questions about an order, a pouch or a bulk box are answered Monday to Saturday, 9:00 to 18:00 IST.'],
  '/recipes': ['Dry fruit recipes', 'Quick, simple recipes with almonds, cashews, pistachios, raisins and seeds. Ideas for breakfast, snacks and desserts from the ClickMart kitchen.'],
  '/wellness': ['Health & Wellness', 'How to enjoy almonds, walnuts, dates and seeds through the week. Practical, no-hype ideas for everyday eating.'],
  '/help': ['Help centre', 'Answers about orders, delivery, payments, refunds and returns, plus a team that replies to every request. ClickMart support, Monday to Saturday.'],
  '/privacy': ['Privacy Policy', 'How ClickMart collects, uses and protects account, order, payment and support data for customers in India.'],
  '/terms': ['Terms & Conditions', 'How ClickMart orders, shipping, payments, cancellations and returns work, in plain language.'],
}

const organization = (site) => ({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${site}/#organization`,
  name: SITE,
  url: site,
  logo: `${site}/logo.png`,
  email: EMAIL,
  telephone: PHONE,
  address: { '@type': 'PostalAddress', addressLocality: 'Patna', addressRegion: 'Bihar', postalCode: '804453', addressCountry: 'IN' },
})
const website = (site) => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${site}/#website`,
  name: SITE,
  url: site,
  inLanguage: 'en-IN',
  publisher: { '@id': `${site}/#organization` },
  potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: `${site}/shop?q={search_term_string}` }, 'query-input': 'required name=search_term_string' },
})
const breadcrumbs = (site, trail) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: trail.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.name, item: `${site}${item.path}` })),
})
/** Same rules as productSearchText in src/lib/seo.ts. Shaped like a marketplace listing: name, price, trust words. */
export function productText(product) {
  const prices = (product.packs ?? []).map((pack) => pack.price)
  const from = prices.length ? Math.min(...prices) : NaN
  const sizes = [...new Set((product.packs ?? []).map((pack) => pack.size))]
  const about = plain(product.blurb || product.description, 400)
  const rated = product.reviewCount > 0 && product.rating > 0 ? `Rated ${Number(product.rating.toFixed(1))}/5 by ${product.reviewCount} shoppers.` : ''
  return {
    title: plain(product.metaTitle, 70) || (Number.isFinite(from) ? `Buy ${product.name} Online at ₹${from}` : `Buy ${product.name} Online`),
    description: clipWords(
      plain(product.metaDescription, 400) ||
        [`Buy ${product.name} online${Number.isFinite(from) ? ` at ₹${from}` : ''}.`, sizes.length ? `Packs: ${sizes.join(', ')}.` : '', rated, 'Fresh from Patna, COD available.', about]
          .filter(Boolean)
          .join(' '),
      160,
    ),
  }
}
export function categoryText(category) {
  const intro = plain(category.description || category.tagline, 400)
  return {
    title: plain(category.metaTitle, 70) || `Buy ${category.name} Online at Best Price`,
    description: clipWords(plain(category.metaDescription, 400) || `Shop ${category.name} online at ClickMart. ${intro ? `${intro} ` : ''}Packed fresh to order, fast delivery across India, COD available.`, 160),
  }
}
const collection = (site, { name, path, description, products }) => ({
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name,
  url: `${site}${path}`,
  description,
  isPartOf: { '@id': `${site}/#website` },
  mainEntity: {
    '@type': 'ItemList',
    numberOfItems: products.length,
    itemListElement: products.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.name, url: `${site}/product/${encodeURIComponent(item.slug)}` })),
  },
})

/** Google wants a price expiry date on offers. A year ahead, refreshed on every build or request. */
const validUntil = () => new Date(Date.now() + 365 * 86400_000).toISOString().slice(0, 10)

export function productJsonLd(site, product) {
  const photos = (product.images?.length ? product.images : product.image ? [product.image] : []).map((src) => absolute(site, src))
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    url: `${site}/product/${product.slug}`,
    description: plain(product.description || product.blurb || product.name, 5000),
    sku: product.packs?.[0]?.variantId,
    mpn: product.slug,
    ...(photos.length ? { image: photos } : {}),
    brand: { '@type': 'Brand', name: product.brand || SITE },
    ...(product.category ? { category: product.categoryName ?? product.category } : {}),
    ...(product.reviewCount > 0 && product.rating > 0 ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: Number(product.rating.toFixed(1)), reviewCount: product.reviewCount } } : {}),
    offers: (product.packs ?? []).map((pack) => ({
      '@type': 'Offer',
      name: `${product.name} ${pack.size}`,
      url: `${site}/product/${product.slug}?size=${encodeURIComponent(pack.size)}`,
      price: pack.price,
      priceCurrency: 'INR',
      sku: pack.variantId,
      priceValidUntil: validUntil(),
      itemCondition: 'https://schema.org/NewCondition',
      availability: (pack.stock ?? (product.inStock ? 1 : 0)) > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      seller: { '@type': 'Organization', name: SITE },
    })),
  }
}

const productLinks = (items) => `<ul>${items.map((item) => `<li><a href="/product/${esc(encodeURIComponent(item.slug))}">${esc(item.name)}</a>${item.packs?.[0] ? ` from ₹${esc(Math.min(...item.packs.map((pack) => pack.price)))}` : ''}</li>`).join('')}</ul>`

/**
 * Works out the meta tags, structured data and a plain HTML summary for a path.
 * `fetchJson` is injected so tests do not need a network.
 */
export async function metaFor(path, query, site, fetchJson = getJson) {
  const clean = path.replace(/\/+$/, '') || '/'
  const base = { title: undefined, description: DEFAULT_DESCRIPTION, canonical: `${site}${clean === '/' ? '' : clean}`, image: `${site}/logo.png`, type: 'website', noindex: false, status: 200, jsonLd: [], body: '' }

  if (PRIVATE_PREFIXES.some((prefix) => clean === prefix || clean.startsWith(`${prefix}/`))) return { ...base, noindex: true, canonical: null }

  const product = /^\/product\/([^/]+)$/.exec(clean)
  if (product) {
    const slug = decodeURIComponent(product[1])
    const result = await fetchJson(`/products/${encodeURIComponent(slug)}`)
    if (result.status === 404) return { ...base, title: 'Product not found', noindex: true, canonical: null, status: 404, body: '<h1>Product not found</h1><p><a href="/shop">Browse the shop</a></p>' }
    if (!result.ok) return { ...base, canonical: `${site}/product/${slug}` }
    const item = result.data.product
    const text = productText(item)
    return {
      ...base,
      title: text.title,
      description: text.description,
      canonical: `${site}/product/${item.slug}`,
      image: absolute(site, item.image) || base.image,
      type: 'product',
      jsonLd: [productJsonLd(site, item), breadcrumbs(site, [{ name: 'Home', path: '/' }, { name: 'Shop', path: '/shop' }, { name: item.categoryName ?? 'Product', path: categoryPath(item.category) }, { name: item.name, path: `/product/${item.slug}` }])],
      body: `<nav><a href="/">Home</a> › <a href="/shop">Shop</a> › <a href="${esc(categoryPath(item.category))}">${esc(item.categoryName ?? 'Product')}</a></nav><h1>${esc(item.name)}</h1>${item.image ? `<img src="${esc(absolute(site, item.image))}" alt="${esc(item.name)}" width="480">` : ''}<p>${esc(plain(item.description || item.blurb, 1500))}</p>${item.highlights?.length ? `<ul>${item.highlights.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>` : ''}<h2>Pack sizes and prices</h2><ul>${item.packs.map((pack) => `<li>${esc(pack.size)}: ₹${esc(pack.price)}${pack.mrp > pack.price ? ` (MRP ₹${esc(pack.mrp)})` : ''} — ${(pack.stock ?? 0) > 0 ? 'In stock' : 'Out of stock'}</li>`).join('')}</ul>`,
    }
  }

  // A category page lives at /category/<id>[/<sub>]. The old /shop?category=<id> address still works in the app
  // and is reported with the new address as its canonical.
  const categoryMatch = /^\/category\/([^/]+)(?:\/([^/]+))?$/.exec(clean)
  if (categoryMatch || clean === '/shop') {
    const categoryId = categoryMatch ? decodeURIComponent(categoryMatch[1]) : typeof query.category === 'string' ? query.category : undefined
    const subId = categoryMatch ? (categoryMatch[2] ? decodeURIComponent(categoryMatch[2]) : undefined) : typeof query.sub === 'string' ? query.sub : undefined
    const filtered = Object.keys(query).some((key) => key !== 'category' && key !== 'sub') || Array.isArray(query.category)
    const categories = (await fetchJson('/categories')).data?.items ?? []
    const category = categories.find((item) => item.id === categoryId)
    const sub = category?.subcategories?.find((item) => item.id === subId)
    if (categoryMatch && (!category || (subId && !sub))) return { ...base, title: 'Category not found', noindex: true, canonical: null, status: 404, body: '<h1>Category not found</h1><p><a href="/shop">Browse the shop</a></p>' }
    const name = sub?.name ?? category?.name
    const list = await fetchJson(`/products?pageSize=24${category ? `&category=${encodeURIComponent(category.id)}` : ''}${sub ? `&sub=${encodeURIComponent(sub.id)}` : ''}`)
    const items = list.ok ? (list.data.items ?? []) : []
    const text = category ? categoryText(sub ? { ...sub, tagline: category.tagline } : category) : null
    const heading = name ? `Buy ${name} Online` : 'Shop Dry Fruits, Nuts and Seeds Online'
    const path = category ? categoryPath(category.id, sub?.id) : '/shop'
    const description = text ? text.description : 'Browse premium almonds, cashews, raisins, walnuts and seeds. Packed fresh to order, delivered across India, with cash on delivery available.'
    const intro = plain((sub ?? category)?.description, 1500)
    return {
      ...base,
      title: text ? text.title : heading,
      description,
      canonical: `${site}${path}`,
      noindex: filtered,
      jsonLd: [
        breadcrumbs(site, [{ name: 'Home', path: '/' }, { name: 'Shop', path: '/shop' }, ...(category ? [{ name: category.name, path: categoryPath(category.id) }] : []), ...(category && sub ? [{ name: sub.name, path }] : [])]),
        ...(items.length ? [collection(site, { name: name ?? 'All dry fruits', path, description, products: items })] : []),
      ],
      body: `<h1>${esc(heading)}</h1>${intro ? `<p>${esc(intro)}</p>` : ''}${items.length ? productLinks(items) : ''}${category && !sub && category.subcategories?.length ? `<h2>Browse by type</h2><ul>${category.subcategories.map((item) => `<li><a href="${esc(categoryPath(category.id, item.id))}">${esc(item.name)}</a></li>`).join('')}</ul>` : ''}`,
    }
  }

  if (clean === '/') {
    const [categories, list] = await Promise.all([fetchJson('/categories'), fetchJson('/products?pageSize=12&sort=popular')])
    return {
      ...base,
      title: 'ClickMart · Premium dry fruits, nuts and seeds delivered across India',
      description: 'Buy fresh almonds, cashews, raisins, walnuts and seeds online. Packed after you order in Patna, delivered across India. Pay by UPI, card or cash on delivery.',
      canonical: `${site}/`,
      jsonLd: [organization(site), website(site)],
      body: `<h1>ClickMart: premium dry fruits, nuts and seeds</h1><p>${esc(DEFAULT_DESCRIPTION)}</p>${categories.ok ? `<h2>Categories</h2><ul>${(categories.data.items ?? []).map((item) => `<li><a href="${esc(categoryPath(item.id))}">${esc(item.name)}</a></li>`).join('')}</ul>` : ''}${list.ok ? `<h2>Popular</h2>${productLinks(list.data.items ?? [])}` : ''}`,
    }
  }

  const known = STATIC[clean]
  if (known) return { ...base, title: known[0], description: known[1], jsonLd: clean === '/about' || clean === '/contact' ? [organization(site)] : [], body: `<h1>${esc(known[0])}</h1><p>${esc(known[1])}</p>` }

  return { ...base, title: 'Page not found', noindex: true, canonical: null, status: 404 }
}

// The plain HTML summary is for crawlers. It is moved off screen (not display:none) so shoppers never see
// unstyled text while the app loads; React replaces it as soon as it starts.
const HIDE_FALLBACK = '.seo-fallback{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}'

/** Puts the tags into the built index.html and fills the empty app root with a plain HTML summary. */
export function inject(shell, meta) {
  const title = fullTitle(meta.title)
  const tags = [
    `<meta name="description" content="${esc(meta.description)}">`,
    `<meta name="robots" content="${meta.noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large'}">`,
    meta.canonical ? `<link rel="canonical" href="${esc(meta.canonical)}">` : '',
    `<meta property="og:site_name" content="${SITE}">`,
    '<meta property="og:locale" content="en_IN">',
    `<meta property="og:type" content="${meta.type}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(meta.description)}">`,
    meta.canonical ? `<meta property="og:url" content="${esc(meta.canonical)}">` : '',
    `<meta property="og:image" content="${esc(meta.image)}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(meta.description)}">`,
    `<meta name="twitter:image" content="${esc(meta.image)}">`,
    ...meta.jsonLd.map((item) => `<script type="application/ld+json">${JSON.stringify(item).replace(/</g, '\\u003c')}</script>`),
  ]
    .filter(Boolean)
    .join('\n')
  return shell
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(title)}</title>`)
    .replace(/<meta\s+name="description"[^>]*>/gi, '')
    .replace(/<meta\s+property="og:[^>]*>/gi, '')
    .replace('</head>', () => `<style>${HIDE_FALLBACK}</style>\n${tags}\n</head>`)
    .replace(/<div id="root"><\/div>/, () => `<div id="root"><div class="seo-fallback">${meta.body}</div></div>`)
}
