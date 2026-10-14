import { Router } from 'express'
import { z } from 'zod'
import { findAccountById, peopleByIds } from '../../services/account.js'
import { audit } from '../../services/audit.js'
import { count, exec, from, maybe, one, rows, rpc, toHttpError } from '../../database/db.js'
import { ORDER_SELECT } from '../../database/selects.js'
import { actor } from '../../middleware/auth.js'
import { badRequest, notFound } from '../../utils/errors.js'
import { serializeOrder } from '../../utils/serializers.js'
import {
  SLA_HOURS,
  attachmentsSchema,
  categoryEnum,
  faqCategoryEnum,
  messageText,
  notifyStaffReply,
  ordersById,
  previewsFor,
  priorityEnum,
  serializeMessage,
  serializeTicketForStaff,
  statusEnum,
  ticketCode,
} from '../../services/support.js'

export const adminSupportRouter = Router()

const ACTIVE = ['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER']
const like = (value) => value.replace(/[%,()*\\]/g, ' ')
const pretty = (value) => String(value).replaceAll('_', ' ').toLowerCase()

async function loadTicket(id) {
  const ticket = await maybe(from('SupportTicket').select('*').eq('id', String(id)).maybeSingle())
  if (!ticket) throw notFound('Ticket')
  return ticket
}

async function staffName(id) {
  const person = id ? await findAccountById(id) : null
  return person?.name ?? 'Staff'
}

const systemNote = (ticketId, body, isInternal = true) => exec(from('SupportMessage').insert({ ticketId, authorRole: 'SYSTEM', authorName: 'ClickMart', body, isInternal }))

/* ---------------- Overview ---------------- */

adminSupportRouter.get('/support/stats', async (req, res) => {
  const [stats, mine] = await Promise.all([
    rpc('support_stats'),
    count(from('SupportTicket').select('id', { count: 'exact', head: true }).eq('assigneeId', actor(req).id).in('status', ACTIVE)),
  ])
  res.json({ ...stats, mine, sla: SLA_HOURS })
})

adminSupportRouter.get('/support/agents', async (_req, res) => {
  res.json({ items: await rows(from('Person').select('id, name, role').in('role', ['ADMIN', 'STAFF']).eq('isBlocked', false).order('name')) })
})

/* ---------------- Tickets ---------------- */

adminSupportRouter.get('/support/tickets', async (req, res) => {
  const q = z
    .object({
      status: z.union([statusEnum, z.literal('active')]).optional(),
      priority: priorityEnum.optional(),
      category: categoryEnum.optional(),
      assignee: z.string().max(60).optional(),
      overdue: z.enum(['1']).optional(),
      needsReply: z.enum(['1']).optional(),
      q: z.string().trim().max(80).optional(),
      sort: z.enum(['recent', 'oldest', 'priority']).default('recent'),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(25),
    })
    .parse(req.query)
  let request = from('SupportTicket')
    .select('*', { count: 'exact' })
    .range((q.page - 1) * q.pageSize, q.page * q.pageSize - 1)
  if (q.sort === 'priority') request = request.order('priority', { ascending: false }).order('lastMessageAt', { ascending: true })
  else request = request.order('lastMessageAt', { ascending: q.sort === 'oldest' })
  if (q.status === 'active') request = request.in('status', ACTIVE)
  else if (q.status) request = request.eq('status', q.status)
  if (q.priority) request = request.eq('priority', q.priority)
  if (q.category) request = request.eq('category', q.category)
  if (q.assignee === 'me') request = request.eq('assigneeId', actor(req).id)
  else if (q.assignee === 'unassigned') request = request.is('assigneeId', null)
  else if (q.assignee) request = request.eq('assigneeId', q.assignee)
  if (q.overdue) request = request.lt('dueAt', new Date().toISOString()).in('status', ['OPEN', 'IN_PROGRESS'])
  if (q.needsReply) request = request.eq('staffUnread', true).in('status', ['OPEN', 'IN_PROGRESS'])
  if (q.q) {
    const num = Number(q.q.replace(/\D/g, ''))
    const clauses = [`subject.ilike.%${like(q.q)}%`, `name.ilike.%${like(q.q)}%`, `email.ilike.%${like(q.q)}%`]
    if (Number.isFinite(num) && num > 0) clauses.push(`number.eq.${num}`)
    request = request.or(clauses.join(','))
  }
  const { data, error, count: total } = await request
  if (error) throw toHttpError(error)
  const tickets = data ?? []
  const [people, orders, previews] = await Promise.all([
    peopleByIds([...new Set(tickets.map((t) => t.assigneeId).filter(Boolean))]),
    ordersById(tickets.map((t) => t.orderId)),
    previewsFor(tickets.map((t) => t.id)),
  ])
  res.json({
    items: tickets.map((t) =>
      serializeTicketForStaff(t, { assigneeName: people.get(t.assigneeId)?.name, order: orders.get(t.orderId) ?? null, preview: previews.get(t.id) ?? null }),
    ),
    total: total ?? 0,
    page: q.page,
    pages: Math.max(1, Math.ceil((total ?? 0) / q.pageSize)),
  })
})

adminSupportRouter.get('/support/tickets/:id', async (req, res) => {
  const ticket = await loadTicket(req.params.id)
  const [messages, people, order, history] = await Promise.all([
    rows(from('SupportMessage').select('*').eq('ticketId', ticket.id).order('createdAt')),
    peopleByIds(ticket.assigneeId ? [ticket.assigneeId] : []),
    ticket.orderId ? maybe(from('Order').select(ORDER_SELECT).eq('id', ticket.orderId).maybeSingle()) : null,
    rows(
      from('SupportTicket')
        .select('id, number, subject, status, createdAt')
        .neq('id', ticket.id)
        .or(ticket.userId ? `userId.eq.${ticket.userId},email.eq.${ticket.email}` : `email.eq.${ticket.email}`)
        .order('createdAt', { ascending: false })
        .limit(5),
    ),
  ])
  const fullOrder = order ? serializeOrder(order) : null
  res.json({
    ticket: serializeTicketForStaff(ticket, {
      assigneeName: people.get(ticket.assigneeId)?.name,
      order: fullOrder && { id: fullOrder.id, code: fullOrder.code, status: fullOrder.status, total: fullOrder.total, placedAt: fullOrder.placedAt },
    }),
    messages: messages.map(serializeMessage),
    order: fullOrder,
    history: history.map((t) => ({ id: t.id, code: ticketCode(t.number), subject: t.subject, status: t.status, createdAt: t.createdAt })),
  })
})

adminSupportRouter.patch('/support/tickets/:id', async (req, res) => {
  const data = z
    .object({
      status: statusEnum.optional(),
      priority: priorityEnum.optional(),
      category: categoryEnum.optional(),
      assigneeId: z.string().max(60).nullable().optional(),
    })
    .parse(req.body)
  const ticket = await loadTicket(req.params.id)
  const me = actor(req).id
  const update = {}
  const notes = []
  const who = await staffName(me)
  if (data.category && data.category !== ticket.category) update.category = data.category
  if (data.priority && data.priority !== ticket.priority) {
    update.priority = data.priority
    notes.push(`${who} changed the priority to ${pretty(data.priority)}`)
    const stillOpen = ['OPEN', 'IN_PROGRESS'].includes(data.status ?? ticket.status)
    if (stillOpen && ticket.dueAt) update.dueAt = new Date(Date.now() + (SLA_HOURS[data.priority] ?? 24) * 3600_000).toISOString()
  }
  if (data.assigneeId !== undefined && data.assigneeId !== ticket.assigneeId) {
    if (data.assigneeId) {
      const agent = await findAccountById(data.assigneeId)
      if (!agent || !['ADMIN', 'STAFF'].includes(agent.role)) throw badRequest('Only team members can be assigned')
      notes.push(agent.id === me ? `${who} took this ticket` : `${who} assigned this to ${agent.name}`)
    } else notes.push(`${who} unassigned this ticket`)
    update.assigneeId = data.assigneeId
  }
  let publicNote = null
  if (data.status && data.status !== ticket.status) {
    update.status = data.status
    const now = new Date().toISOString()
    if (data.status === 'RESOLVED' || data.status === 'CLOSED') {
      update.dueAt = null
      update.staffUnread = false
      if (data.status === 'RESOLVED') update.resolvedAt = now
      else {
        update.closedAt = now
        update.resolvedAt = ticket.resolvedAt ?? now
      }
      update.customerUnread = true
      publicNote =
        data.status === 'RESOLVED'
          ? 'Our team marked this request as resolved. Reply here any time to re-open it.'
          : 'This request is now closed. If you need more help, please start a new request.'
    } else {
      if (['RESOLVED', 'CLOSED'].includes(ticket.status)) {
        update.resolvedAt = null
        update.closedAt = null
      }
      if (data.status === 'OPEN' || data.status === 'IN_PROGRESS')
        update.dueAt = new Date(Date.now() + (SLA_HOURS[data.priority ?? ticket.priority] ?? 24) * 3600_000).toISOString()
      else update.dueAt = null
    }
    notes.push(`${who} changed the status to ${pretty(data.status)}`)
  }
  if (!Object.keys(update).length) return res.json({ ticket: serializeTicketForStaff(ticket) })
  await exec(from('SupportTicket').update(update).eq('id', ticket.id))
  for (const note of notes) await systemNote(ticket.id, note)
  if (publicNote) {
    await systemNote(ticket.id, publicNote, false)
    await exec(from('SupportTicket').update({ lastMessageAt: new Date().toISOString() }).eq('id', ticket.id))
  }
  await audit(me, 'support.update', 'SupportTicket', ticket.id, { ...update, code: ticketCode(ticket.number) })
  const fresh = await one(from('SupportTicket').select('*').eq('id', ticket.id).single())
  const people = await peopleByIds(fresh.assigneeId ? [fresh.assigneeId] : [])
  res.json({ ticket: serializeTicketForStaff(fresh, { assigneeName: people.get(fresh.assigneeId)?.name }) })
})

adminSupportRouter.post('/support/tickets/:id/messages', async (req, res) => {
  const data = z
    .object({
      body: messageText,
      internal: z.boolean().default(false),
      resolve: z.boolean().default(false),
      attachments: attachmentsSchema,
    })
    .parse(req.body)
  const ticket = await loadTicket(req.params.id)
  const me = actor(req).id
  const message = await rpc('add_support_message', {
    p_ticket_id: ticket.id,
    p_author_id: me,
    p_author_role: 'STAFF',
    p_author_name: await staffName(me),
    p_body: data.body,
    p_internal: data.internal,
    p_attachments: data.attachments,
  })
  if (!data.internal && ['RESOLVED', 'CLOSED'].includes(ticket.status)) {
    const now = new Date().toISOString()
    await exec(
      from('SupportTicket')
        .update(
          data.resolve
            ? { status: 'RESOLVED', resolvedAt: ticket.resolvedAt ?? now, closedAt: null, dueAt: null, customerUnread: true }
            : { status: 'WAITING_CUSTOMER', resolvedAt: null, closedAt: null, dueAt: null, customerUnread: true },
        )
        .eq('id', ticket.id),
    )
  } else if (data.resolve && !data.internal) {
    await exec(from('SupportTicket').update({ status: 'RESOLVED', resolvedAt: new Date().toISOString(), dueAt: null }).eq('id', ticket.id))
  }
  if (!data.internal) void notifyStaffReply(ticket, data.body)
  const fresh = await one(from('SupportTicket').select('*').eq('id', ticket.id).single())
  const people = await peopleByIds(fresh.assigneeId ? [fresh.assigneeId] : [])
  res.status(201).json({ message: serializeMessage(message), ticket: serializeTicketForStaff(fresh, { assigneeName: people.get(fresh.assigneeId)?.name }) })
})

/* ---------------- Canned replies ---------------- */

const cannedSchema = z.object({ title: z.string().trim().min(2).max(60), body: z.string().trim().min(2).max(2000) })

adminSupportRouter.get('/support/canned', async (_req, res) => {
  res.json({ items: await rows(from('CannedReply').select('*').order('title')) })
})
adminSupportRouter.post('/support/canned', async (req, res) => {
  const item = await one(from('CannedReply').insert(cannedSchema.parse(req.body)).select('*').single())
  res.status(201).json({ item })
})
adminSupportRouter.patch('/support/canned/:id', async (req, res) => {
  const item = await maybe(from('CannedReply').update(cannedSchema.partial().parse(req.body)).eq('id', String(req.params.id)).select('*').maybeSingle())
  if (!item) throw notFound('Reply')
  res.json({ item })
})
adminSupportRouter.delete('/support/canned/:id', async (req, res) => {
  await exec(from('CannedReply').delete().eq('id', String(req.params.id)))
  res.status(204).end()
})

/* ---------------- Help articles ---------------- */

const faqSchema = z.object({
  category: faqCategoryEnum,
  question: z.string().trim().min(5).max(200),
  answer: z.string().trim().min(5).max(4000),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  isPublished: z.boolean().default(true),
})

adminSupportRouter.get('/support/faqs', async (_req, res) => {
  res.json({ items: await rows(from('Faq').select('*').order('category').order('sortOrder').order('createdAt')) })
})
adminSupportRouter.post('/support/faqs', async (req, res) => {
  const item = await one(from('Faq').insert(faqSchema.parse(req.body)).select('*').single())
  await audit(actor(req).id, 'faq.create', 'Faq', item.id)
  res.status(201).json({ item })
})
adminSupportRouter.patch('/support/faqs/:id', async (req, res) => {
  const item = await maybe(from('Faq').update(faqSchema.partial().parse(req.body)).eq('id', String(req.params.id)).select('*').maybeSingle())
  if (!item) throw notFound('Article')
  await audit(actor(req).id, 'faq.update', 'Faq', item.id)
  res.json({ item })
})
adminSupportRouter.delete('/support/faqs/:id', async (req, res) => {
  await exec(from('Faq').delete().eq('id', String(req.params.id)))
  await audit(actor(req).id, 'faq.delete', 'Faq', String(req.params.id))
  res.status(204).end()
})
