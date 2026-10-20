/** What the shop writes for a product when these fields are empty. Matches productSearchText in the storefront. */
export function autoProductText(input: { name: string; blurb: string; description: string; sizes: string[]; prices: number[] }) {
  const from = input.prices.length ? Math.min(...input.prices) : NaN
  const sizes = [...new Set(input.sizes.filter(Boolean))]
  const about = (input.blurb || input.description).trim()
  return {
    title: `Buy ${input.name.trim() || 'Product name'} Online${Number.isFinite(from) ? ` at ₹${from}` : ''}`,
    description: [`Buy ${input.name.trim() || 'this product'} online${Number.isFinite(from) ? ` at ₹${from}` : ''}.`, sizes.length ? `Packs: ${sizes.join(', ')}.` : '', 'Fresh from Patna, COD available.', about]
      .filter(Boolean)
      .join(' '),
  }
}

/** What the shop writes for a category when these fields are empty. Matches categorySearchText in the storefront. */
export function autoCategoryText(input: { name: string; tagline: string; description: string }) {
  const intro = (input.description || input.tagline).trim()
  const name = input.name.trim() || 'this category'
  return {
    title: `Buy ${name} Online at Best Price`,
    description: `Shop ${name} online at ClickMart. ${intro ? `${intro} ` : ''}Packed fresh to order, fast delivery across India, COD available.`,
  }
}
