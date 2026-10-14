import { z } from 'zod'
import { env } from '../config/env.js'
import { exec, from, maybe, rows } from '../database/db.js'
import { badRequest } from '../utils/errors.js'
import { orderCode } from '../utils/serializers.js'
import { sendMail } from './mailer.js'

export const ticketCategories = {
  ORDER_STATUS: 'Where is my order',
  DELIVERY: 'Delivery problem',
  PAYMENT: 'Payment or refund',
  REFUND_RETURN: 'Return or replacement',
  PRODUCT_QUALITY: 'Product quality',
  WRONG_OR_MISSING: 'Wrong or missing item',
  ACCOUNT: 'My account',
  COUPON_OFFER: 'Coupon or offer',
  OTHER: 'Something else',
}
export const faqCategories = {
  ORDERS: 'Orders',
  DELIVERY: 'Delivery',
  PAYMENTS: 'Payments',
  RETURNS: 'Returns and refunds',
  PRODUCTS: 'Products',
  ACCOUNT: 'Account',
}

export const categoryEnum = z.enum(Object.keys(ticketCategories))
export const faqCategoryEnum = z.enum(Object.keys(faqCategories))
export const statusEnum = z.enum(['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED'])
export const priorityEnum = z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT'])

/** Problems with money or the goods start as HIGH so they are answered sooner. */
export const startingPriority = (category) => (['PAYMENT', 'REFUND_RETURN', 'PRODUCT_QUALITY', 'WRONG_OR_MISSING'].includes(category) ? 'HIGH' : 'NORMAL')

export const SLA_HOURS = { URGENT: 2, HIGH: 8, NORMAL: 24, LOW: 48 }

export const ticketCode = (number) => `TKT-${number}`
export function parseTicketCode(value) {
  const match = /^(?:TKT-)?(\d{1,9})$/i.exec(String(value).trim())
  return match ? Number(match[1]) : null
}
export function parseOrderCode(value) {
  const match = /^(?:ORD-)?(\d{1,9})$/i.exec(String(value).trim())
  return match ? Number(match[1]) : null
}

export const attachmentsSchema = z
  .array(
    z
      .string()
      .url()
      .max(500)
      .refine((url) => url.includes('/storage/v1/object/public/support-attachments/'), 'Photos must be uploaded from this page'),
  )
  .max(3)
  .default([])

export const messageText = z.string().trim().min(1, 'Write a message').max(5000, 'That message is too long')

export const sameEmail = (left, right) => String(left ?? '').trim().toLowerCase() === String(right ?? '').trim().toLowerCase() && String(left ?? '').trim() !== ''

/** The order behind a ticket, only if this person may link it (their own order, or one placed with the same email). */
export async function findLinkableOrder(orderCodeValue, { userId, email }) {
  const number = parseOrderCode(orderCodeValue)
  if (number === null) throw badRequest('That order number does not look right')
  const order = await maybe(from('Order').select('id, number, userId, email, status, total, createdAt').eq('number', number).maybeSingle())
  const mine = order && ((userId && order.userId === userId) || sameEmail(order.email, email))
  if (!mine) throw badRequest('We could not find that order on your account')
  return order
}

/** A guest request is filed with an email and no login. Once that person signs in, the request becomes theirs. */
export async function claimGuestTickets(user) {
  const email = String(user?.email ?? '').trim().toLowerCase()
  if (!user?.id || !email) return
  await exec(from('SupportTicket').update({ userId: user.id }).is('userId', null).eq('email', email))
}

/** Order summaries for a set of tickets. They live in another schema, so they are fetched separately. */
export async function ordersById(ids) {
  const unique = [...new Set(ids.filter(Boolean))]
  if (!unique.length) return new Map()
  const data = await rows(from('Order').select('id, number, status, total, createdAt').in('id', unique))
  return new Map(
    data.map((order) => [
      order.id,
      {
        id: order.id,
        code: orderCode(order.number),
        status: order.status,
        total: order.total,
        placedAt: order.createdAt,
      },
    ]),
  )
}

const preview = (text, length = 120) => {
  const flat = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat
}

export function serializeMessage(message) {
  return {
    id: message.id,
    authorRole: message.authorRole,
    authorName: message.authorName,
    body: message.body,
    isInternal: message.isInternal,
    attachments: message.attachments ?? [],
    createdAt: message.createdAt,
  }
}

/** What a customer sees. No priority, assignee or internal notes. */
export function serializeTicketForCustomer(ticket, extra = {}) {
  return {
    id: ticket.id,
    code: ticketCode(ticket.number),
    subject: ticket.subject,
    category: ticket.category,
    categoryLabel: ticketCategories[ticket.category] ?? 'Support',
    status: ticket.status,
    order: extra.order ?? null,
    unread: ticket.customerUnread,
    lastMessageBy: ticket.lastMessageBy,
    lastMessageAt: ticket.lastMessageAt,
    createdAt: ticket.createdAt,
    resolvedAt: ticket.resolvedAt,
    rating: ticket.rating,
    preview: extra.preview ?? null,
  }
}

export function serializeTicketForStaff(ticket, extra = {}) {
  const overdue = !!ticket.dueAt && new Date(ticket.dueAt) < new Date() && ['OPEN', 'IN_PROGRESS'].includes(ticket.status)
  return {
    id: ticket.id,
    code: ticketCode(ticket.number),
    subject: ticket.subject,
    category: ticket.category,
    categoryLabel: ticketCategories[ticket.category] ?? 'Support',
    status: ticket.status,
    priority: ticket.priority,
    source: ticket.source,
    customer: { id: ticket.userId, name: ticket.name, email: ticket.email, phone: ticket.phone },
    assignee: ticket.assigneeId ? { id: ticket.assigneeId, name: extra.assigneeName ?? 'Staff' } : null,
    order: extra.order ?? null,
    needsReply: ticket.staffUnread && ['OPEN', 'IN_PROGRESS'].includes(ticket.status),
    overdue,
    dueAt: ticket.dueAt,
    firstResponseAt: ticket.firstResponseAt,
    lastMessageBy: ticket.lastMessageBy,
    lastMessageAt: ticket.lastMessageAt,
    createdAt: ticket.createdAt,
    resolvedAt: ticket.resolvedAt,
    rating: ticket.rating,
    ratingComment: ticket.ratingComment,
    preview: extra.preview ?? null,
  }
}

/** Latest public message text per ticket, for list previews. */
export async function previewsFor(ticketIds) {
  if (!ticketIds.length) return new Map()
  const data = await rows(
    from('SupportMessage')
      .select('ticketId, body, createdAt')
      .in('ticketId', ticketIds)
      .eq('isInternal', false)
      .order('createdAt', { ascending: false })
      .limit(ticketIds.length * 4),
  )
  const map = new Map()
  for (const row of data) if (!map.has(row.ticketId)) map.set(row.ticketId, preview(row.body))
  return map
}

const link = (path) => `${env.STORE_URL.replace(/\/$/, '')}${path}`

export async function notifyTicketCreated(ticket) {
  const hours = SLA_HOURS[ticket.priority] ?? 24
  const page = link(`/help/tickets/${ticketCode(ticket.number)}`)
  const follow = ticket.userId
    ? `You can follow the conversation and add details here:\n${page}`
    : `Log in or create an account with ${ticket.email} to follow this request and reply:\n${page}`
  await sendMail(
    ticket.email,
    `We got your request · ${ticketCode(ticket.number)}`,
    `Hi ${ticket.name.split(' ')[0]},\n\nThanks for contacting ClickMart. Your request is logged as ${ticketCode(ticket.number)}.\n\nSubject: ${ticket.subject}\n\nWe usually reply within ${hours <= 24 ? `${hours} hours` : '2 days'}. ${follow}\n\nClickMart Support`,
  )
}

export async function notifyStaffReply(ticket, body) {
  await sendMail(
    ticket.email,
    `New reply on ${ticketCode(ticket.number)} · ${ticket.subject}`,
    `Hi ${ticket.name.split(' ')[0]},\n\nOur team replied to your request:\n\n${body}\n\nReply or see the full conversation here:\n${link(`/help/tickets/${ticketCode(ticket.number)}`)}\n\nClickMart Support`,
  )
}
