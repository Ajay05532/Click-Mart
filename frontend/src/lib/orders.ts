import { seedOrders } from '../data/admin.ts'
import type { ArtTone, OrderStatus, PackSize, StoreOrder } from '../types.ts'

const KEY = 'clickmart-orders'
const DETAIL_KEY = 'clickmart-order-details'

export function loadPlacedOrders(): StoreOrder[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as StoreOrder[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function savePlacedOrder(order: StoreOrder) {
  const existing = loadPlacedOrders()
  localStorage.setItem(KEY, JSON.stringify([order, ...existing]))
}

/* ---------- Rich order records (confirmation, history, tracking) ---------- */

export type OrderLine = {
  name: string
  slug: string
  size: PackSize
  quantity: number
  unitPrice: number
  image: string | null
  art: ArtTone
}

export type OrderRecord = {
  id: string
  placedAt: number
  customer: string
  phone: string
  email: string
  address: string
  city: string
  state: string
  pin: string
  lines: OrderLine[]
  subtotal: number
  discount: number
  shipping: number
  total: number
  coupon: string | null
  payment: { method: string; detail: string; paid: boolean; ref: string }
}

export function loadOrderRecords(): OrderRecord[] {
  try {
    const raw = localStorage.getItem(DETAIL_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as OrderRecord[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveOrderRecord(record: OrderRecord) {
  localStorage.setItem(DETAIL_KEY, JSON.stringify([record, ...loadOrderRecords()]))
}

export function findOrderRecord(id: string): OrderRecord | undefined {
  const needle = id.trim().toUpperCase()
  return loadOrderRecords().find((order) => order.id.toUpperCase() === needle)
}

export function createOrderId() {
  return `ORD-${Math.floor(2000 + Math.random() * 7000)}`
}

/* ---------- Tracking ---------- */

export const trackingStages = [
  { key: 'placed', label: 'Order placed', note: 'We have received your order.', afterMin: 0, offsetH: 0 },
  { key: 'packed', label: 'Packed fresh', note: 'Sealed and quality checked in Patna.', afterMin: 1, offsetH: 6 },
  { key: 'shipped', label: 'Shipped', note: 'Handed to our courier partner.', afterMin: 3, offsetH: 20 },
  { key: 'out', label: 'Out for delivery', note: 'Your pouches are on the way to you.', afterMin: 6, offsetH: 68 },
  { key: 'delivered', label: 'Delivered', note: 'Enjoy your dry fruits!', afterMin: 10, offsetH: 74 },
] as const

/**
 * Demo clock: the storefront has no courier backend, so progress advances
 * with minutes since the order was placed. Seeded orders map from their status.
 */
export function stageIndex(placedAt: number, now = Date.now()) {
  const minutes = (now - placedAt) / 60000
  let index = 0
  trackingStages.forEach((stage, i) => {
    if (minutes >= stage.afterMin) index = i
  })
  return index
}

const statusStage: Record<OrderStatus, number> = {
  Processing: 1,
  Shipped: 2,
  Delivered: 4,
  Cancelled: 0,
}

export type TrackedOrder = {
  record: OrderRecord
  stage: number
  cancelled: boolean
}

function parseDate(value: string) {
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? Date.now() - 86400000 : parsed
}

function recordFromSeed(order: StoreOrder): OrderRecord {
  return {
    id: order.id,
    placedAt: parseDate(order.date),
    customer: order.customer,
    phone: '',
    email: '',
    address: 'Address on file',
    city: '',
    state: '',
    pin: '',
    lines: order.items.split(', ').map((name) => ({
      name,
      slug: '',
      size: '250g' as PackSize,
      quantity: 1,
      unitPrice: Math.round(order.amount / order.items.split(', ').length),
      image: null,
      art: 'mix' as ArtTone,
    })),
    subtotal: order.amount,
    discount: 0,
    shipping: 0,
    total: order.amount,
    coupon: null,
    payment: { method: 'Paid online', detail: '', paid: true, ref: `TXN${order.id.slice(4)}` },
  }
}

export function trackOrder(id: string): TrackedOrder | undefined {
  const record = findOrderRecord(id)
  if (record) return { record, stage: stageIndex(record.placedAt), cancelled: false }
  const seed = seedOrders.find((order) => order.id.toUpperCase() === id.trim().toUpperCase())
  if (seed) {
    return {
      record: recordFromSeed(seed),
      stage: statusStage[seed.status],
      cancelled: seed.status === 'Cancelled',
    }
  }
  return undefined
}

export function formatDateTime(timestamp: number) {
  return new Date(timestamp).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatDay(timestamp: number) {
  return new Date(timestamp).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function estimatedDelivery(record: OrderRecord) {
  const eta = record.placedAt + 3 * 86400000
  return formatDay(eta)
}
