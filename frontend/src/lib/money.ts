export const FREE_SHIPPING_AT = 499

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

export function shippingCost(subtotal: number, freeShippingCoupon: boolean) {
  if (subtotal <= 0) return 0
  if (freeShippingCoupon || subtotal >= FREE_SHIPPING_AT) return 0
  return 49
}
