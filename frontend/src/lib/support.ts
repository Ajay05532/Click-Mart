import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext.tsx'
import { api } from './api.ts'

export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING_CUSTOMER' | 'RESOLVED' | 'CLOSED'
export type TopicId = 'ORDER_STATUS' | 'DELIVERY' | 'PAYMENT' | 'REFUND_RETURN' | 'PRODUCT_QUALITY' | 'WRONG_OR_MISSING' | 'ACCOUNT' | 'COUPON_OFFER' | 'OTHER'
export type FaqCategory = 'ORDERS' | 'DELIVERY' | 'PAYMENTS' | 'RETURNS' | 'PRODUCTS' | 'ACCOUNT'

export type TicketOrder = { id: string; code: string; status: string; total: number; placedAt: string }
export type Ticket = {
  id: string
  code: string
  subject: string
  category: TopicId
  categoryLabel: string
  status: TicketStatus
  order: TicketOrder | null
  unread: boolean
  lastMessageBy: 'CUSTOMER' | 'STAFF'
  lastMessageAt: string
  createdAt: string
  resolvedAt: string | null
  rating: number | null
  preview: string | null
}
export type TicketMessage = { id: string; authorRole: 'CUSTOMER' | 'STAFF' | 'SYSTEM'; authorName: string; body: string; attachments: string[]; createdAt: string }
export type Faq = { id: string; category: FaqCategory; question: string; answer: string }

/** What a customer can ask about. `hint` pre-fills the subject, `time` is how fast we aim to answer. */
export const topics: { id: TopicId; label: string; text: string; subject: string; needsOrder?: boolean }[] = [
  { id: 'ORDER_STATUS', label: 'Where is my order?', text: 'Tracking, delays and delivery dates', subject: 'Where is my order?', needsOrder: true },
  { id: 'DELIVERY', label: 'Delivery problem', text: 'Address, courier or a missed delivery', subject: 'Problem with my delivery', needsOrder: true },
  { id: 'PAYMENT', label: 'Payment or refund', text: 'Money deducted, failed payment or refund status', subject: 'Payment or refund query' },
  { id: 'REFUND_RETURN', label: 'Return or replacement', text: 'Send something back or get a replacement', subject: 'I would like to return or replace an item', needsOrder: true },
  { id: 'PRODUCT_QUALITY', label: 'Product quality', text: 'Stale, damaged or not as described', subject: 'Quality problem with my order', needsOrder: true },
  { id: 'WRONG_OR_MISSING', label: 'Wrong or missing item', text: 'Received something different or less', subject: 'Wrong or missing item in my order', needsOrder: true },
  { id: 'ACCOUNT', label: 'My account', text: 'Login, profile, addresses or saved payments', subject: 'Help with my account' },
  { id: 'COUPON_OFFER', label: 'Coupon or offer', text: 'A code did not apply or an offer is missing', subject: 'Coupon or offer did not work' },
  { id: 'OTHER', label: 'Something else', text: 'Bulk orders, feedback or any other question', subject: '' },
]
export const topicLabel = (id: string) => topics.find((topic) => topic.id === id)?.label ?? 'Support'

export const faqCategoryLabel: Record<FaqCategory, string> = {
  ORDERS: 'Orders',
  DELIVERY: 'Delivery',
  PAYMENTS: 'Payments',
  RETURNS: 'Returns and refunds',
  PRODUCTS: 'Products',
  ACCOUNT: 'Account',
}

export const statusInfo: Record<TicketStatus, { label: string; tone: 'brand' | 'accent' | 'success' | 'dark'; note: string }> = {
  OPEN: { label: 'Open', tone: 'brand', note: 'We have your request and will reply soon.' },
  IN_PROGRESS: { label: 'In progress', tone: 'brand', note: 'Our team is working on this.' },
  WAITING_CUSTOMER: { label: 'Needs your reply', tone: 'accent', note: 'We replied and are waiting to hear from you.' },
  RESOLVED: { label: 'Resolved', tone: 'success', note: 'Marked as resolved. Reply to re-open it.' },
  CLOSED: { label: 'Closed', tone: 'dark', note: 'This request is closed.' },
}

export const isActiveTicket = (status: TicketStatus) => status === 'OPEN' || status === 'IN_PROGRESS' || status === 'WAITING_CUSTOMER'

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
export function timeAgo(value: string | number) {
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000)
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ]
  for (const [unit, size] of steps) if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit)
  return 'just now'
}

export const formatWhen = (value: string | number) => new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

export const useFaqs = () =>
  useQuery({
    queryKey: ['faqs'],
    queryFn: () => api<{ items: Faq[] }>('/support/faqs').then((result) => result.items),
    staleTime: 5 * 60_000,
  })

export const useMyTickets = (status: 'all' | 'open' | 'closed' = 'all', orderCode?: string) => {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['tickets', user?.id, status, orderCode ?? null],
    queryFn: () => api<{ items: Ticket[]; unread: number }>('/support/tickets', { query: { status, orderCode } }),
    enabled: !!user,
    staleTime: 15_000,
  })
}

export const useTicket = (code: string) => {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['ticket', code, user?.id],
    queryFn: () => api<{ ticket: Ticket; messages: TicketMessage[] }>(`/support/tickets/${encodeURIComponent(code)}`),
    enabled: !!user && !!code,
    retry: false,
    refetchInterval: 20_000,
  })
}

/** Tickets with a new reply from us. Drives the dot in the header. */
export const useUnreadTickets = () => {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['tickets-unread', user?.id],
    queryFn: () => api<{ unread: number }>('/support/unread').then((result) => result.unread),
    enabled: !!user,
    refetchInterval: 60_000,
    staleTime: 30_000,
  })
}

/** Uploads photos for a ticket and returns their URLs. */
export async function uploadAttachments(files: File[]) {
  if (!files.length) return []
  const form = new FormData()
  for (const file of files) form.append('images', file)
  return (await api<{ urls: string[] }>('/support/attachments', { form })).urls
}

export const MAX_PHOTOS = 3
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024
export const photoTypes = ['image/jpeg', 'image/png', 'image/webp']
