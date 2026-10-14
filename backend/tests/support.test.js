import './setup.js'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { attachmentsSchema, parseOrderCode, parseTicketCode, sameEmail, serializeTicketForCustomer, serializeTicketForStaff, startingPriority, ticketCode } from '../src/services/support.js'

const ticket = {
  id: 't1',
  number: 1042,
  userId: 'u1',
  name: 'Asha Rao',
  email: 'asha@example.com',
  phone: null,
  category: 'PAYMENT',
  subject: 'Charged twice',
  status: 'OPEN',
  priority: 'HIGH',
  assigneeId: 'a1',
  source: 'HELP',
  staffUnread: true,
  customerUnread: false,
  lastMessageBy: 'CUSTOMER',
  lastMessageAt: '2026-10-14T10:00:00Z',
  createdAt: '2026-10-14T10:00:00Z',
  dueAt: '2020-01-01T00:00:00Z',
}

describe('support helpers', () => {
  it('reads ticket and order codes with or without the prefix', () => {
    assert.equal(ticketCode(1042), 'TKT-1042')
    assert.equal(parseTicketCode('tkt-1042'), 1042)
    assert.equal(parseTicketCode('1042'), 1042)
    assert.equal(parseTicketCode('abc'), null)
    assert.equal(parseOrderCode('ORD-1044'), 1044)
    assert.equal(parseOrderCode('1044 '), 1044)
    assert.equal(parseOrderCode('1044; drop table'), null)
  })

  it('starts money and goods problems at high priority', () => {
    assert.equal(startingPriority('PAYMENT'), 'HIGH')
    assert.equal(startingPriority('WRONG_OR_MISSING'), 'HIGH')
    assert.equal(startingPriority('ACCOUNT'), 'NORMAL')
  })

  it('shows customers no priority, assignee or contact details of staff', () => {
    const view = serializeTicketForCustomer(ticket)
    assert.equal(view.code, 'TKT-1042')
    assert.ok(!('priority' in view) && !('assignee' in view) && !('customer' in view))
  })

  it('marks a past-due open ticket overdue for staff, but not a resolved one', () => {
    assert.equal(serializeTicketForStaff(ticket).overdue, true)
    assert.equal(serializeTicketForStaff({ ...ticket, status: 'RESOLVED' }).overdue, false)
    assert.equal(serializeTicketForStaff(ticket).needsReply, true)
  })

  it('matches an order email without caring about capital letters', () => {
    assert.equal(sameEmail('Admin@gmail.com', 'admin@gmail.com'), true)
    assert.equal(sameEmail('a@x.com', 'b@x.com'), false)
    assert.equal(sameEmail('', 'a@x.com'), false)
  })

  it('only accepts photos from the support bucket', () => {
    const ok = 'https://abc.supabase.co/storage/v1/object/public/support-attachments/1-a.jpg'
    assert.deepEqual(attachmentsSchema.parse([ok]), [ok])
    assert.throws(() => attachmentsSchema.parse(['https://evil.example.com/x.jpg']))
    assert.throws(() => attachmentsSchema.parse([ok, ok, ok, ok]))
  })
})

describe('support API guards (no database needed)', () => {
  let server
  let base
  before(async () => {
    const { createApp } = await import('../src/app.js')
    server = createApp().listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    base = `http://127.0.0.1:${server.address().port}/api/v1`
  })
  after(() => server.close())

  const post = (path, body) => fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

  it('keeps tickets, uploads and the admin inbox behind a login', async () => {
    for (const path of ['/support/tickets', '/support/unread', '/support/tickets/TKT-1001', '/admin/support/stats', '/admin/support/tickets']) {
      assert.equal((await fetch(`${base}${path}`)).status, 401, path)
    }
    assert.equal((await post('/support/tickets', { category: 'OTHER', subject: 'Hello', message: 'Hi' })).status, 401)
  })

  it('validates the public contact form', async () => {
    const bad = await post('/support/contact', { name: 'A', email: 'nope', category: 'OTHER', subject: 'Hi', message: '' })
    assert.equal(bad.status, 400)
    const unknownTopic = await post('/support/contact', { name: 'Asha Rao', email: 'asha@example.com', category: 'HACK', subject: 'Hello there', message: 'Hi' })
    assert.equal(unknownTopic.status, 400)
  })

  it('quietly drops bot submissions that fill the hidden field', async () => {
    const response = await post('/support/contact', { name: 'Bot Bot', email: 'bot@example.com', category: 'OTHER', subject: 'Buy now', message: 'spam', website: 'http://spam.example.com' })
    assert.equal(response.status, 201)
  })
})
