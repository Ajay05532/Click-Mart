/** What the shop writes for a product when these fields are empty. Matches productSearchText in the storefront. */
export function autoProductText(input: { name: string; blurb: string; description: string; sizes: string[]; prices: number[] }) {
  const from = input.prices.length ? Math.min(...input.prices) : NaN
  const sizes = [...new Set(input.sizes.filter(Boolean))]
  const about = (input.blurb || input.description).trim()
  return {
    title: `${input.name.trim() || 'Product name'} — Buy Online`,
    description: [Number.isFinite(from) ? `From ₹${from}.` : '', sizes.length ? `Packs: ${sizes.join(', ')}.` : '', about || `Buy ${input.name.trim() || 'this product'} online from ClickMart.`, 'Packed fresh in Patna, delivered across India.']
      .filter(Boolean)
      .join(' '),
  }
}

/** What the shop writes for a category when these fields are empty. Matches categorySearchText in the storefront. */
export function autoCategoryText(input: { name: string; tagline: string; description: string }) {
  const intro = (input.description || input.tagline).trim()
  const name = input.name.trim() || 'this category'
  return {
    title: `Buy ${name} Online`,
    description: `${intro ? `${intro} ` : ''}Buy ${name} online from ClickMart. Packed fresh to order and delivered across India.`,
  }
}
