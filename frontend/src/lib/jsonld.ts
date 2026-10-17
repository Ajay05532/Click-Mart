import { storeAddress, storeEmail, storePhone } from './store.ts'
import { SITE_NAME, absoluteUrl, siteUrl } from './seo.ts'
import type { Product } from '../types.ts'

const plain = (text: string, max = 5000) => text.replace(/\s+/g, ' ').trim().slice(0, max)

/** The business itself. Shown by Google next to the brand name in results. */
export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${siteUrl()}/#organization`,
    name: SITE_NAME,
    url: siteUrl(),
    logo: absoluteUrl('/logo.png'),
    email: storeEmail,
    telephone: storePhone,
    address: { '@type': 'PostalAddress', streetAddress: storeAddress.replace(/,?\s*Patna.*$/, ''), addressLocality: 'Patna', addressRegion: 'Bihar', postalCode: '804453', addressCountry: 'IN' },
  }
}

/** Lets Google show a search box for the shop inside the site's result. */
export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${siteUrl()}/#website`,
    name: SITE_NAME,
    url: siteUrl(),
    inLanguage: 'en-IN',
    publisher: { '@id': `${siteUrl()}/#organization` },
    potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: `${siteUrl()}/shop?q={search_term_string}` }, 'query-input': 'required name=search_term_string' },
  }
}

export function localBusinessJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Store',
    '@id': `${siteUrl()}/#store`,
    name: SITE_NAME,
    url: siteUrl(),
    image: absoluteUrl('/images/seeds.jpg'),
    telephone: storePhone,
    email: storeEmail,
    address: organizationJsonLd().address,
    openingHoursSpecification: [{ '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], opens: '09:00', closes: '18:00' }],
    paymentAccepted: 'UPI, Credit Card, Debit Card, Net Banking, Cash on delivery',
    currenciesAccepted: 'INR',
  }
}

export const breadcrumbJsonLd = (trail: { name: string; path: string }[]) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: trail.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.name, item: absoluteUrl(item.path) })),
})

export const faqJsonLd = (faqs: { question: string; answer: string }[]) => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map((faq) => ({ '@type': 'Question', name: faq.question, acceptedAnswer: { '@type': 'Answer', text: plain(faq.answer) } })),
})

/** A category page: what it is about and the products listed on it, in order. */
export function categoryJsonLd(input: { name: string; path: string; description: string; products: Pick<Product, 'name' | 'slug'>[] }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: input.name,
    url: absoluteUrl(input.path),
    description: plain(input.description, 500),
    isPartOf: { '@id': `${siteUrl()}/#website` },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: input.products.length,
      itemListElement: input.products.map((product, index) => ({ '@type': 'ListItem', position: index + 1, name: product.name, url: absoluteUrl(`/product/${product.slug}`) })),
    },
  }
}

/** Price, stock and rating for search results. One offer per pack size. */
export function productJsonLd(product: Product) {
  const images = (product.images?.length ? product.images : product.image ? [product.image] : []).map(absoluteUrl)
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    url: absoluteUrl(`/product/${product.slug}`),
    description: plain(product.description || product.blurb || product.name, 5000),
    sku: product.packs[0]?.variantId,
    ...(images.length ? { image: images } : {}),
    brand: { '@type': 'Brand', name: SITE_NAME },
    ...(product.category ? { category: product.categoryName ?? product.category } : {}),
    ...(product.reviewCount > 0 && product.rating > 0 ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: Number(product.rating.toFixed(1)), reviewCount: product.reviewCount } } : {}),
    offers: product.packs.map((pack) => ({
      '@type': 'Offer',
      name: `${product.name} ${pack.size}`,
      url: absoluteUrl(`/product/${product.slug}?size=${encodeURIComponent(pack.size)}`),
      price: pack.price,
      priceCurrency: 'INR',
      itemCondition: 'https://schema.org/NewCondition',
      availability: (pack.stock ?? (product.inStock ? 1 : 0)) > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      seller: { '@type': 'Organization', name: SITE_NAME },
    })),
  }
}
