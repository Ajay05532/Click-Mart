export function formatPrice(value: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat('en-IN').format(value)
}

export function discountPercent(price: number, mrp: number) {
  if (mrp <= price) return 0
  return Math.round((1 - price / mrp) * 100)
}
