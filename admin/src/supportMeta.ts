import { timeAgo } from './format.ts'
import type { SupportTicket, TicketPriority, TicketStatus } from './types.ts'
import type { Tone } from './ui.tsx'

export const statusTone: Record<TicketStatus, Tone> = { OPEN: 'blue', IN_PROGRESS: 'blue', WAITING_CUSTOMER: 'orange', RESOLVED: 'green', CLOSED: 'gray' }
export const statusText: Record<TicketStatus, string> = { OPEN: 'Open', IN_PROGRESS: 'In progress', WAITING_CUSTOMER: 'Waiting on customer', RESOLVED: 'Resolved', CLOSED: 'Closed' }
export const priorityTone: Record<TicketPriority, Tone> = { LOW: 'gray', NORMAL: 'blue', HIGH: 'orange', URGENT: 'red' }

export const categories: [string, string][] = [
  ['ORDER_STATUS', 'Where is my order'],
  ['DELIVERY', 'Delivery problem'],
  ['PAYMENT', 'Payment or refund'],
  ['REFUND_RETURN', 'Return or replacement'],
  ['PRODUCT_QUALITY', 'Product quality'],
  ['WRONG_OR_MISSING', 'Wrong or missing item'],
  ['ACCOUNT', 'My account'],
  ['COUPON_OFFER', 'Coupon or offer'],
  ['OTHER', 'Something else'],
]

/** "Reply in 3 hours" or "Overdue by 5 hours" while a ticket waits on us. */
export function dueLabel(ticket: Pick<SupportTicket, 'dueAt' | 'overdue' | 'status'>) {
  if (!ticket.dueAt || !['OPEN', 'IN_PROGRESS'].includes(ticket.status)) return null
  return ticket.overdue ? `Overdue by ${timeAgo(ticket.dueAt).replace(' ago', '')}` : `Reply ${timeAgo(ticket.dueAt)}`
}

/** Placeholders a saved reply can use. They are filled in from the ticket when the reply is inserted. */
export const replyVariables: { key: string; hint: string }[] = [
  { key: 'name', hint: "Customer's first name" },
  { key: 'agent', hint: 'Your first name' },
  { key: 'ticket', hint: 'Ticket number, like TKT-1042' },
  { key: 'order', hint: 'Order number, like ORD-1044' },
  { key: 'total', hint: 'Order total' },
  { key: 'status', hint: 'Order status' },
  { key: 'tracking', hint: 'Courier tracking number' },
]

export function fillReply(body: string, values: Record<string, string>) {
  return body.replace(/\{\{\s*([a-z]+)\s*\}\}/gi, (match, key: string) => values[key.toLowerCase()] ?? match)
}
