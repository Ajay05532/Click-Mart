import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { env } from '../config/env.js'
import { exec, from, maybe, rows, rpc } from '../database/db.js'
import { badRequest } from '../utils/errors.js'
import { orderCode } from '../utils/serializers.js'
import { noticeEmail } from './emails.js'
import { getSettings } from './settings.js'

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

export const sameEmail = (left, right) =>
  String(left ?? '')
    .trim()
    .toLowerCase() ===
    String(right ?? '')
      .trim()
      .toLowerCase() && String(left ?? '').trim() !== ''

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
  const email = String(user?.email ?? '')
    .trim()
    .toLowerCase()
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

/* ---------------- Reply by email ---------------- */

export const inboundEnabled = () => !!(env.SUPPORT_INBOUND_EMAIL && env.SUPPORT_INBOUND_SECRET)

/** Secret part of a ticket's reply address. Only emails we sent carry it. */
const inboundToken = (number) =>
  createHmac('sha256', env.SUPPORT_INBOUND_SECRET ?? '')
    .update(`ticket:${number}`)
    .digest('hex')
    .slice(0, 16)

/** support@x.com becomes support+1001.<token>@x.com, so a reply finds its ticket and cannot be forged. */
export function replyToFor(ticket) {
  if (!inboundEnabled()) return undefined
  const [local, domain] = env.SUPPORT_INBOUND_EMAIL.split('@')
  return `${local}+${ticket.number}.${inboundToken(ticket.number)}@${domain}`
}

/** Finds the ticket number in a recipient address and checks the token. Returns null when it is not valid. */
export function ticketFromRecipient(candidates) {
  for (const value of candidates.filter(Boolean)) {
    const match = /\+(\d{1,9})\.([a-f0-9]{16})(?:@|$)/i.exec(String(value))
    if (!match) continue
    const expected = Buffer.from(inboundToken(Number(match[1])))
    const given = Buffer.from(match[2].toLowerCase())
    if (given.length === expected.length && timingSafeEqual(given, expected)) return Number(match[1])
  }
  return null
}

/** Keeps what the customer wrote and drops the quoted copy of our earlier email. */
export function stripQuoted(text) {
  const lines = String(text ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
  const cut = lines.findIndex(
    (line, index) =>
      /^on .{5,200}wrote:\s*$/i.test(line.trim()) ||
      /^-{2,}\s*(original message|forwarded message)/i.test(line.trim()) ||
      (/^from:\s.+/i.test(line.trim()) && /^(sent|date):/i.test((lines[index + 1] ?? '').trim())) ||
      /^_{5,}$/.test(line.trim()),
  )
  const kept = (cut === -1 ? lines : lines.slice(0, cut)).filter((line) => !line.trim().startsWith('>'))
  return kept.join('\n').trim()
}

/**
 * Adds an emailed reply to its ticket. Always answers quietly (the mail provider retries on errors),
 * and says why in `ignored` when nothing was saved.
 */
export async function receiveEmailReply(payload) {
  const number = ticketFromRecipient([
    payload.MailboxHash ? `+${payload.MailboxHash}` : null,
    payload.OriginalRecipient,
    payload.To,
    ...(payload.ToFull ?? []).map((item) => item.Email),
  ])
  if (number === null) return { ignored: 'unknown address' }
  const ticket = await maybe(from('SupportTicket').select('*').eq('number', number).maybeSingle())
  if (!ticket) return { ignored: 'no such ticket' }
  if (ticket.status === 'CLOSED') return { ignored: 'closed' }
  const body = (payload.StrippedTextReply?.trim() || stripQuoted(payload.TextBody)).slice(0, 5000).trim()
  if (!body) return { ignored: 'empty' }
  await rpc('add_support_message', {
    p_ticket_id: ticket.id,
    p_author_id: ticket.userId ?? null,
    p_author_role: 'CUSTOMER',
    p_author_name: ticket.name,
    p_body: body,
    p_internal: false,
    p_attachments: [],
  })
  return { saved: ticketCode(ticket.number) }
}

/* ---------------- Emails ---------------- */

const replyNote = () => (inboundEnabled() ? 'You can also just reply to this email.' : undefined)

export async function notifyTicketCreated(ticket) {
  const hours = SLA_HOURS[ticket.priority] ?? 24
  const code = ticketCode(ticket.number)
  await noticeEmail({
    to: ticket.email,
    subject: `We got your request · ${code}`,
    heading: 'We got your request',
    preheader: `${code} · ${ticket.subject}`,
    paragraphs: [
      `Hi ${ticket.name.split(' ')[0]},`,
      `Thanks for contacting ClickMart. Your request is logged as ${code}.`,
      `Subject: ${ticket.subject}`,
      `We usually reply within ${hours <= 24 ? `${hours} hours` : '2 days'}.${ticket.userId ? ' You can follow the conversation and add details on the request page.' : ' Log in or create an account with this email to follow the conversation online.'}`,
    ],
    cta: { label: 'Open your request', url: link(`/help/tickets/${code}`) },
    note: replyNote(),
    replyTo: replyToFor(ticket),
  })
}

export async function notifyStaffReply(ticket, body) {
  const code = ticketCode(ticket.number)
  await noticeEmail({
    to: ticket.email,
    subject: `New reply on ${code} · ${ticket.subject}`,
    heading: 'Our team replied',
    preheader: body.slice(0, 120),
    paragraphs: [`Hi ${ticket.name.split(' ')[0]},`, `Here is our reply to ${code} (${ticket.subject}):`, body],
    cta: { label: 'See the full conversation', url: link(`/help/tickets/${code}`) },
    note: replyNote(),
    replyTo: replyToFor(ticket),
  })
}

/** One email to the support inbox listing tickets that have just gone past their reply target. */
export async function alertOverdueTickets() {
  const tickets = (await rpc('claim_overdue_support_tickets')) ?? []
  if (!tickets.length) return 0
  const settings = await getSettings()
  const admin = env.ADMIN_URL.replace(/\/$/, '')
  const list = tickets.map((ticket) => `  ${ticketCode(ticket.number)} · ${ticket.priority} · ${ticket.subject} (${ticket.name})\n  ${admin}/support/${ticket.id}`).join('\n')
  await noticeEmail({
    to: settings.supportEmail,
    subject: `${tickets.length} support ${tickets.length === 1 ? 'ticket is' : 'tickets are'} past the reply target`,
    heading: 'Tickets waiting too long',
    paragraphs: ['These customers are still waiting for a first reply or an answer:', list, 'Open the Support inbox, filter by Overdue, and reply or reassign.'],
    cta: { label: 'Open the Support inbox', url: `${admin}/support?view=overdue` },
  })
  return tickets.length
}
