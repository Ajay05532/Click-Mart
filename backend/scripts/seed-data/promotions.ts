import type { Coupon } from './types.js'

export const coupons: Coupon[] = [
  { code: 'DRY15', label: '15% off all dry fruits', type: 'percent', value: 15 },
  { code: 'WELCOME10', label: '10% off your order', type: 'percent', value: 10 },
  { code: 'FREESHIP', label: 'Free shipping', type: 'shipping', value: 0 },
]
