// Saved UPI IDs / cards, saved addresses and payment history. Card numbers and CVVs never reach the server:
// only brand, last 4 digits, expiry and name are sent when a card is saved.
import { useQuery } from '@tanstack/react-query'
import { api } from './api.ts'

export type SavedAddress = {
  id: string
  name: string
  phone: string
  line: string
  city: string
  state: string
  pin: string
  landmark: string | null
  label: 'HOME' | 'WORK' | 'OTHER'
  isDefault: boolean
}

export type SavedPayment = {
  id: string
  kind: 'UPI' | 'CARD'
  upiId: string | null
  cardBrand: string | null
  last4: string | null
  expMonth: number | null
  expYear: number | null
  holderName: string | null
  nickname: string | null
  isDefault: boolean
}

export type PaymentHistoryItem = {
  id: string
  orderCode: string
  orderStatus: string
  amount: number
  status: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED'
  method: 'UPI' | 'CARD' | 'NETBANKING' | 'COD'
  detail: string
  reference: string | null
  failureReason: string | null
  paidAt: string | null
  createdAt: string
  refunds: { id: string; amount: number; status: string; reason: string | null; createdAt: string }[]
}

export const addressLabels = { HOME: 'Home', WORK: 'Work', OTHER: 'Other' } as const

export const useSavedAddresses = (userId?: string) =>
  useQuery({ queryKey: ['addresses', userId], queryFn: () => api<{ items: SavedAddress[] }>('/me/addresses').then((r) => r.items), enabled: !!userId, staleTime: 60_000 })

export const useSavedPayments = (userId?: string) =>
  useQuery({ queryKey: ['payment-methods', userId], queryFn: () => api<{ items: SavedPayment[] }>('/me/payment-methods').then((r) => r.items), enabled: !!userId, staleTime: 60_000 })

export const usePaymentHistory = (userId?: string) =>
  useQuery({ queryKey: ['payment-history', userId], queryFn: () => api<{ items: PaymentHistoryItem[] }>('/me/payments').then((r) => r.items), enabled: !!userId })

export const savedPaymentTitle = (item: SavedPayment) => (item.kind === 'UPI' ? item.upiId ?? 'UPI' : `${item.cardBrand} •••• ${item.last4}`)
export const savedPaymentSub = (item: SavedPayment) =>
  item.kind === 'UPI' ? item.nickname || 'UPI ID' : `${item.holderName ?? ''} · expires ${String(item.expMonth).padStart(2, '0')}/${String(item.expYear).slice(-2)}`.replace(/^ · /, '')
export const isExpired = (item: SavedPayment) =>
  item.kind === 'CARD' && !!item.expMonth && !!item.expYear && new Date(item.expYear, item.expMonth, 0, 23, 59) < new Date()

// ---- Card form helpers (used by checkout and settings) ----
export const stripNonDigits = (value: string) => value.replace(/\D/g, '')
export const formatCard = (value: string) => stripNonDigits(value).slice(0, 16).replace(/(.{4})/g, '$1 ').trim()
export const formatExpiry = (value: string) => {
  const digits = stripNonDigits(value).slice(0, 4)
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits
}
export const cardBrand = (digits: string) => {
  if (/^4/.test(digits)) return 'VISA'
  if (/^(5[1-5]|2[2-7])/.test(digits)) return 'Mastercard'
  if (/^3[47]/.test(digits)) return 'Amex'
  if (/^(60|65|81|82)/.test(digits)) return 'RuPay'
  return ''
}
export const luhnValid = (digits: string) => {
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let n = Number(digits[digits.length - 1 - i])
    if (i % 2 === 1) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
  }
  return digits.length >= 13 && sum % 10 === 0
}
export const parseExpiry = (value: string) => {
  const match = /^(\d{2})\/(\d{2})$/.exec(value)
  if (!match) return null
  const month = Number(match[1])
  const year = 2000 + Number(match[2])
  if (month < 1 || month > 12 || new Date(year, month, 0, 23, 59) < new Date()) return null
  return { month, year }
}
export const upiIdValid = (value: string) => /^[a-z0-9._-]{2,}@[a-z]{2,}$/i.test(value.trim())

/** Body for POST /me/payment-methods from the card form. The number itself is reduced to brand + last 4 here. */
export function savedCardBody(card: { number: string; name: string; expiry: string }, isDefault = false) {
  const digits = stripNonDigits(card.number)
  const expiry = parseExpiry(card.expiry)!
  return { kind: 'CARD' as const, cardBrand: cardBrand(digits) || 'Card', last4: digits.slice(-4), expMonth: expiry.month, expYear: expiry.year, holderName: card.name.trim(), isDefault }
}
