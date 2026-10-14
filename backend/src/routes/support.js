import { Router } from 'express'
import { z } from 'zod'
import { findAccountById } from '../services/account.js'
import { count, exec, from, maybe, one, rows, rpc } from '../database/db.js'
import { actor, requireAuth } from '../middleware/auth.js'
import { badRequest, notFound } from '../utils/errors.js'
import { storeImage, supportUpload } from '../services/storage.js'
import {
  attachmentsSchema,
  categoryEnum,
  faqCategories,
  claimGuestTickets,
  findLinkableOrder,
  messageText,
  notifyTicketCreated,
  ordersById,
  parseOrderCode,
  parseTicketCode,
  previewsFor,
  serializeMessage,
  serializeTicketForCustomer,
  startingPriority,
  ticketCategories,
  ticketCode,
} from '../services/support.js'

export const supportRouter = Router()

const OPEN_STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER']
const MAX_OPEN_TICKETS = 10
const phone = z
  .string()
  .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number')
  .nullish()
  .transform((value) => value || null)

async function openTicket(input) {
  const created = await rpc('create_support_ticket', {
    p: {
      userId: input.userId ?? null,
      orderId: input.order?.id ?? null,
      name: input.name,
      email: input.email,
      phone: input.phone,
      category: input.category,
      subject: input.subject,
      body: input.message,
      attachments: input.attachments ?? [],
      priority: startingPriority(input.category),
      source: input.source,
    },
  })
  const ticket = await one(from('SupportTicket').select('*').eq('id', created.id).single())
  void notifyTicketCreated(ticket)
  return ticket
}

/* ---------------- Public: help articles and the contact form ---------------- */

supportRouter.get('/config', (_req, res) => {
  res.json({
    categories: Object.entries(ticketCategories).map(([id, label]) => ({ id, label })),
    faqCategories: Object.entries(faqCategories).map(([id, label]) => ({ id, label })),
  })
})

supportRouter.get('/faqs', async (_req, res) => {
  const items = await rows(from('Faq').select('id, category, question, answer').eq('isPublished', true).order('sortOrder').order('createdAt'))
  res.json({ items })
})

supportRouter.post('/faqs/:id/vote', async (req, res) => {
  const { helpful } = z.object({ helpful: z.boolean() }).parse(req.body)
  await rpc('vote_faq', { p_id: String(req.params.id), p_helpful: helpful })
  res.status(204).end()
})

supportRouter.post('/contact', async (req, res) => {
  const data = z
    .object({
      name: z.string().trim().min(2, 'Enter your name').max(80),
      email: z.string().trim().toLowerCase().email('Enter a valid email'),
      phone,
      category: categoryEnum.default('OTHER'),
      subject: z.string().trim().min(3, 'Add a short subject').max(150),
      message: messageText,
      orderCode: z.string().trim().max(20).nullish(),
      website: z.string().max(200).optional(),
    })
    .parse(req.body)
  // Hidden field only bots fill in. Pretend it worked so they move on.
  if (data.website) return res.status(201).json({ ticket: { code: ticketCode(1000) } })
  const userId = req.auth?.id ?? null
  const order = data.orderCode ? await findLinkableOrder(data.orderCode, { userId, email: data.email }) : null
  const ticket = await openTicket({ ...data, userId, order, source: 'CONTACT' })
  res.status(201).json({ ticket: { code: ticketCode(ticket.number) } })
})

/* ---------------- Signed-in customers ---------------- */

async function loadOwnedTicket(req, code) {
  const me = actor(req)
  const account = await findAccountById(me.id)
  if (account) await claimGuestTickets(account)
  const number = parseTicketCode(String(code))
  const ticket = number === null ? null : await maybe(from('SupportTicket').select('*').eq('number', number).maybeSingle())
  if (!ticket || ticket.userId !== me.id) throw notFound('Request')
  return ticket
}

supportRouter.get('/unread', requireAuth, async (req, res) => {
  const account = await findAccountById(actor(req).id)
  if (account) await claimGuestTickets(account)
  const unread = await count(from('SupportTicket').select('id', { count: 'exact', head: true }).eq('userId', actor(req).id).eq('customerUnread', true))
  res.json({ unread })
})

supportRouter.post('/attachments', requireAuth, supportUpload.array('images', 3), async (req, res) => {
  const files = req.files ?? []
  if (!files.length) throw badRequest('Choose a JPG, PNG or WebP photo')
  const urls = []
  for (const file of files) urls.push(await storeImage(file, 'support'))
  res.status(201).json({ urls })
})

supportRouter.get('/tickets', requireAuth, async (req, res) => {
  const q = z
    .object({
      status: z.enum(['all', 'open', 'closed']).default('all'),
      orderCode: z.string().trim().max(20).optional(),
    })
    .parse(req.query)
  const me = actor(req).id
  const account = await findAccountById(me)
  if (account) await claimGuestTickets(account)
  let request = from('SupportTicket').select('*').eq('userId', me).order('lastMessageAt', { ascending: false }).limit(100)
  if (q.status === 'open') request = request.in('status', OPEN_STATUSES)
  if (q.status === 'closed') request = request.in('status', ['RESOLVED', 'CLOSED'])
  if (q.orderCode) {
    const number = parseOrderCode(q.orderCode)
    const order = number === null ? null : await maybe(from('Order').select('id').eq('number', number).eq('userId', me).maybeSingle())
    if (!order) return res.json({ items: [], unread: 0 })
    request = request.eq('orderId', order.id)
  }
  const tickets = await rows(request)
  const [orders, previews] = await Promise.all([ordersById(tickets.map((t) => t.orderId)), previewsFor(tickets.map((t) => t.id))])
  res.json({
    items: tickets.map((t) => serializeTicketForCustomer(t, { order: orders.get(t.orderId) ?? null, preview: previews.get(t.id) ?? null })),
    unread: tickets.filter((t) => t.customerUnread).length,
  })
})

supportRouter.post('/tickets', requireAuth, async (req, res) => {
  const data = z
    .object({
      category: categoryEnum,
      subject: z.string().trim().min(3, 'Add a short subject').max(150),
      message: messageText,
      orderCode: z.string().trim().max(20).nullish(),
      attachments: attachmentsSchema,
    })
    .parse(req.body)
  const me = actor(req).id
  const account = await findAccountById(me)
  if (!account) throw notFound('Account')
  await claimGuestTickets(account)
  const open = await count(from('SupportTicket').select('id', { count: 'exact', head: true }).eq('userId', me).in('status', OPEN_STATUSES))
  if (open >= MAX_OPEN_TICKETS) throw badRequest('You have several open requests already. Please wait for a reply or add to an existing one.')
  const order = data.orderCode ? await findLinkableOrder(data.orderCode, { userId: me, email: account.email }) : null
  const ticket = await openTicket({
    userId: me,
    name: account.name || account.email,
    email: account.email,
    phone: account.phone ?? null,
    category: data.category,
    subject: data.subject,
    message: data.message,
    attachments: data.attachments,
    order,
    source: order ? 'ORDER' : 'HELP',
  })
  res.status(201).json({ ticket: serializeTicketForCustomer(ticket) })
})

supportRouter.get('/tickets/:code', requireAuth, async (req, res) => {
  const ticket = await loadOwnedTicket(req, req.params.code)
  const [messages, orders] = await Promise.all([
    rows(from('SupportMessage').select('*').eq('ticketId', ticket.id).eq('isInternal', false).order('createdAt')),
    ordersById([ticket.orderId]),
  ])
  if (ticket.customerUnread) await exec(from('SupportTicket').update({ customerUnread: false }).eq('id', ticket.id))
  res.json({
    ticket: serializeTicketForCustomer({ ...ticket, customerUnread: false }, { order: orders.get(ticket.orderId) ?? null }),
    messages: messages.map(serializeMessage),
  })
})

supportRouter.post('/tickets/:code/messages', requireAuth, async (req, res) => {
  const data = z.object({ message: messageText, attachments: attachmentsSchema }).parse(req.body)
  const ticket = await loadOwnedTicket(req, req.params.code)
  const account = await findAccountById(actor(req).id)
  const message = await rpc('add_support_message', {
    p_ticket_id: ticket.id,
    p_author_id: actor(req).id,
    p_author_role: 'CUSTOMER',
    p_author_name: account?.name || 'Customer',
    p_body: data.message,
    p_internal: false,
    p_attachments: data.attachments,
  })
  const fresh = await one(from('SupportTicket').select('*').eq('id', ticket.id).single())
  res.status(201).json({ message: serializeMessage(message), ticket: serializeTicketForCustomer(fresh) })
})

supportRouter.post('/tickets/:code/resolve', requireAuth, async (req, res) => {
  const ticket = await loadOwnedTicket(req, req.params.code)
  if (!OPEN_STATUSES.includes(ticket.status)) throw badRequest('This request is already resolved')
  const now = new Date().toISOString()
  await exec(from('SupportTicket').update({ status: 'RESOLVED', resolvedAt: now, dueAt: null, staffUnread: false, lastMessageAt: now }).eq('id', ticket.id))
  await exec(
    from('SupportMessage').insert({
      ticketId: ticket.id,
      authorRole: 'SYSTEM',
      authorName: 'ClickMart',
      body: 'You marked this request as resolved. Reply here any time to re-open it.',
    }),
  )
  const fresh = await one(from('SupportTicket').select('*').eq('id', ticket.id).single())
  res.json({ ticket: serializeTicketForCustomer(fresh) })
})

supportRouter.post('/tickets/:code/rating', requireAuth, async (req, res) => {
  const data = z
    .object({
      rating: z.number().int().min(1).max(5),
      comment: z.string().trim().max(500).optional(),
    })
    .parse(req.body)
  const ticket = await loadOwnedTicket(req, req.params.code)
  if (!['RESOLVED', 'CLOSED'].includes(ticket.status)) throw badRequest('You can rate a request once it is resolved')
  if (ticket.rating) throw badRequest('You have already rated this request')
  await exec(
    from('SupportTicket')
      .update({ rating: data.rating, ratingComment: data.comment || null })
      .eq('id', ticket.id),
  )
  res.json({ ok: true })
})
