import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext.tsx'
import { api, apiUrl, getAccessToken } from './api.ts'

export type OrderStatus = 'PLACED' | 'CONFIRMED' | 'PACKED' | 'SHIPPED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED' | 'RETURNED'

export type OrderItem = { id?: string; name: string; slug?: string | null; image: string | null; art: string | null; size: string; quantity: number; unitPrice?: number; mrp?: number }
export type OrderEvent = { status: OrderStatus; note: string | null; at: string }

export type ApiOrder = {
  id: string
  code: string
  status: OrderStatus
  paymentStatus: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED'
  paymentMethod: 'UPI' | 'CARD' | 'NETBANKING' | 'COD'
  payment?: { detail: string | null; status: string; failureReason: string | null; paidAt: string | null } | null
  customer: { name: string; email: string; phone: string }
  address: { line: string; city: string; state: string; pin: string }
  items: (OrderItem & { unitPrice: number })[]
  subtotal: number
  offerDiscount: number
  discount: number
  shipping: number
  total: number
  couponCode: string | null
  carrier: string | null
  trackingNumber: string | null
  events: OrderEvent[]
  placedAt: string
  estimatedDelivery: string
}

export const useMyOrders = () => {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['orders', user?.id],
    queryFn: () => api<{ items: ApiOrder[] }>('/orders').then((result) => result.items),
    enabled: !!user,
    staleTime: 15_000,
  })
}

export const useOrder = (code: string, enabled = true) => {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['order', code, user?.id],
    queryFn: () => api<{ order: ApiOrder }>(`/orders/${encodeURIComponent(code)}`).then((result) => result.order),
    enabled: enabled && !!user && !!code,
    retry: false,
  })
}

export type OrderTracking = {
  available: boolean
  status?: string
  latest?: { shipStatus: string; location: string; message: string; eventTime: string } | null
  scans?: { timestamp: string; status: string; location: string; remark: string }[]
  trackingUrl?: string | null
}

/** Real courier tracking from NimbusPost, once a courier has been booked. Not every order has one — most
 * stores are still moving the status along by hand (see OrderStatus), so this is extra detail, not the
 * only source of truth. */
export const useOrderTracking = (code: string, enabled = true) => {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['order-tracking', code, user?.id],
    queryFn: () => api<OrderTracking>(`/orders/${encodeURIComponent(code)}/tracking`),
    enabled: enabled && !!user && !!code,
    staleTime: 60_000,
    retry: false,
  })
}

/** The five steps shown to customers. Several back-office statuses can map to one step. */
export const trackingStages = [
  { key: 'placed', label: 'Order placed', note: 'We have received your order.', statuses: ['PLACED', 'CONFIRMED'], expectedHours: 0 },
  { key: 'packed', label: 'Packed fresh', note: 'Sealed and quality checked in our kitchen.', statuses: ['PACKED'], expectedHours: 6 },
  { key: 'shipped', label: 'Shipped', note: 'Handed to our courier partner.', statuses: ['SHIPPED'], expectedHours: 20 },
  { key: 'out', label: 'Out for delivery', note: 'Your pouches are on the way to you.', statuses: ['OUT_FOR_DELIVERY'], expectedHours: 68 },
  { key: 'delivered', label: 'Delivered', note: 'Enjoy your dry fruits!', statuses: ['DELIVERED'], expectedHours: 74 },
] as const

const statusToStage: Record<OrderStatus, number> = { PLACED: 0, CONFIRMED: 0, PACKED: 1, SHIPPED: 2, OUT_FOR_DELIVERY: 3, DELIVERED: 4, CANCELLED: 0, RETURNED: 4 }

export const isEnded = (status: OrderStatus) => status === 'CANCELLED' || status === 'RETURNED'

/** Index (0-4) of the furthest step reached. For cancelled/returned orders, the furthest step before the end. */
export function stageOf(view: { status: OrderStatus; events: OrderEvent[] }) {
  if (!isEnded(view.status)) return statusToStage[view.status]
  const reached = view.events.filter((event) => !isEnded(event.status)).map((event) => statusToStage[event.status])
  return Math.max(0, ...reached)
}

export const statusLabel: Record<OrderStatus, string> = {
  PLACED: 'Order placed',
  CONFIRMED: 'Confirmed',
  PACKED: 'Packed',
  SHIPPED: 'Shipped',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  RETURNED: 'Returned',
}

export const paymentLabel: Record<ApiOrder['paymentMethod'], string> = { UPI: 'UPI', CARD: 'Card', NETBANKING: 'Net banking', COD: 'Cash on delivery' }

export const formatDateTime = (value: string | number) =>
  new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' })

export const formatDay = (value: string | number) => new Date(value).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })

/** Opens the printable invoice (needs the customer's login). */
export async function openInvoice(code: string) {
  const response = await fetch(apiUrl(`/orders/${encodeURIComponent(code)}/invoice`), { credentials: 'include', headers: authHeader() })
  if (!response.ok) throw new Error('Could not load the invoice')
  const blob = new Blob([await response.text()], { type: 'text/html' })
  window.open(URL.createObjectURL(blob), '_blank', 'noopener')
}

function authHeader(): Record<string, string> {
  const token = getAccessToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}
