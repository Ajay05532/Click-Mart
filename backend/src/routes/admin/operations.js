import { Router } from 'express'
import { z } from 'zod'
import { createAccount, findAccountByEmail, findAccountById, peopleByIds, setRole, updateLogin } from '../../services/account.js'
import { audit } from '../../services/audit.js'
import { hashPassword, revokeAllRefreshTokens } from '../../services/auth.js'
import { from, count, maybe, rows, rpc, toHttpError } from '../../database/db.js'
import { badRequest, conflict, notFound } from '../../utils/errors.js'
import { changeStatus, loadOrder, refundOrder } from '../../services/orders.js'
import { serializeOrder } from '../../utils/serializers.js'
import { getSettings, saveSettings } from '../../services/settings.js'
import { ORDER_SELECT } from '../../database/selects.js'
import { actor, adminOnly } from '../../middleware/auth.js'
import { renderInvoice } from '../orders.js'
export const adminOpsRouter = Router()
const statusEnum = z.enum(['PLACED', 'CONFIRMED', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'RETURNED'])
const like = (value) => value.replace(/[%,()*\\]/g, ' ')
adminOpsRouter.get('/orders', async (req, res) => {
  const q = z
    .object({
      status: statusEnum.optional(),
      paymentStatus: z.enum(['PENDING', 'PAID', 'FAILED', 'REFUNDED']).optional(),
      q: z.string().trim().optional(),
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
    })
    .parse(req.query)
  let request = from('Order')
    .select(ORDER_SELECT, {
      count: 'exact',
    })
    .order('createdAt', {
      ascending: false,
    })
    .range((q.page - 1) * q.pageSize, q.page * q.pageSize - 1)
  if (q.status) request = request.eq('status', q.status)
  if (q.paymentStatus) request = request.eq('paymentStatus', q.paymentStatus)
  if (q.from) request = request.gte('createdAt', q.from.toISOString())
  if (q.to) request = request.lte('createdAt', q.to.toISOString())
  if (q.q) {
    const num = Number(q.q.replace(/\D/g, ''))
    const clauses = [`customerName.ilike.%${like(q.q)}%`, `email.ilike.%${like(q.q)}%`, `phone.ilike.%${like(q.q)}%`]
    if (Number.isFinite(num) && num > 0) clauses.push(`number.eq.${num}`)
    request = request.or(clauses.join(','))
  }
  const { data, error, count: total } = await request
  if (error) throw toHttpError(error)
  const statusCounts = await rpc('order_status_counts')
  res.json({
    items: (data ?? []).map(serializeOrder),
    total: total ?? 0,
    page: q.page,
    pages: Math.max(1, Math.ceil((total ?? 0) / q.pageSize)),
    statusCounts,
  })
})
adminOpsRouter.get('/orders/:id', async (req, res) => {
  const order = await maybe(from('Order').select(ORDER_SELECT).eq('id', String(req.params.id)).maybeSingle())
  if (!order) throw notFound('Order')
  order.payments = await rows(from('Payment').select('*').eq('orderId', order.id).order('createdAt'))
  const account = order.userId ? await findAccountById(String(order.userId)) : null
  res.json({
    order: {
      ...serializeOrder(order),
      payments: order.payments,
      customerAccount: account
        ? {
            id: account.id,
            name: account.name,
            email: account.email,
          }
        : null,
    },
  })
})
adminOpsRouter.get('/payments/webhooks', adminOnly, async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : null
  let request = from('WebhookEvent')
    .select('id, provider, eventId, eventType, providerOrderId, providerPaymentId, status, error, receivedAt, processedAt')
    .order('receivedAt', {
      ascending: false,
    })
    .limit(100)
  if (status) request = request.eq('status', status)
  res.json({
    items: await rows(request),
  })
})
adminOpsRouter.get('/orders/:id/invoice', async (req, res) => {
  const order = await maybe(from('Order').select(ORDER_SELECT).eq('id', String(req.params.id)).maybeSingle())
  if (!order) throw notFound('Order')
  res.type('html').send(renderInvoice(order))
})
adminOpsRouter.patch('/orders/:id/status', async (req, res) => {
  const id = String(req.params.id)
  const data = z
    .object({
      status: statusEnum,
      note: z.string().trim().max(300).optional(),
      carrier: z.string().trim().max(60).optional(),
      trackingNumber: z.string().trim().max(60).optional(),
    })
    .parse(req.body)
  if (data.status === 'SHIPPED' && !data.trackingNumber) {
    const existing = await maybe(from('Order').select('trackingNumber').eq('id', id).maybeSingle())
    if (!existing?.trackingNumber) throw badRequest('Add a tracking number when marking an order as shipped')
  }
  await changeStatus(id, data.status, data)
  await audit(actor(req).id, `order.status.${data.status.toLowerCase()}`, 'Order', id, data)
  res.json({
    order: serializeOrder(await loadOrder(id)),
  })
})
adminOpsRouter.post('/orders/:id/refund', adminOnly, async (req, res) => {
  const id = String(req.params.id)
  await refundOrder(id)
  await audit(actor(req).id, 'order.refund', 'Order', id)
  res.json({
    order: serializeOrder(await loadOrder(id)),
  })
})
adminOpsRouter.get('/customers', async (req, res) => {
  const q = z
    .object({
      q: z.string().trim().optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
    })
    .parse(req.query)
  let request = from('Person')
    .select('id, name, email, phone, isBlocked, createdAt', {
      count: 'exact',
    })
    .eq('role', 'CUSTOMER')
    .order('createdAt', {
      ascending: false,
    })
    .range((q.page - 1) * q.pageSize, q.page * q.pageSize - 1)
  if (q.q) request = request.or(`name.ilike.%${like(q.q)}%,email.ilike.%${like(q.q)}%`)
  const { data, error, count: total } = await request
  if (error) throw toHttpError(error)
  const users = data ?? []
  const stats = users.length
    ? await rpc('customer_stats', {
        p_user_ids: users.map((user) => user.id),
      })
    : []
  res.json({
    items: users.map((user) => {
      const row = stats.find((item) => item.userId === user.id)
      return {
        ...user,
        orders: row?.orders ?? 0,
        spent: row?.spent ?? 0,
      }
    }),
    total: total ?? 0,
    page: q.page,
    pages: Math.max(1, Math.ceil((total ?? 0) / q.pageSize)),
  })
})
adminOpsRouter.get('/customers/:id', async (req, res) => {
  const id = String(req.params.id)
  const user = await maybe(from('Person').select('id, name, email, phone, isBlocked, createdAt, role').eq('id', id).eq('role', 'CUSTOMER').maybeSingle())
  if (!user) throw notFound('Customer')
  const [addresses, orders] = await Promise.all([
    rows(
      from('Address').select('*').eq('userId', id).order('isDefault', {
        ascending: false,
      }),
    ),
    rows(
      from('Order')
        .select(ORDER_SELECT)
        .eq('userId', id)
        .order('createdAt', {
          ascending: false,
        })
        .limit(50),
    ),
  ])
  res.json({
    customer: {
      ...user,
      addresses,
      orders: orders.map(serializeOrder),
    },
  })
})
adminOpsRouter.patch('/customers/:id', adminOnly, async (req, res) => {
  const data = z
    .object({
      isBlocked: z.boolean(),
    })
    .parse(req.body)
  const id = String(req.params.id)
  await updateLogin(id, data)
  if (data.isBlocked) await revokeAllRefreshTokens(id)
  await audit(actor(req).id, data.isBlocked ? 'customer.block' : 'customer.unblock', 'Login', id)
  res.json({
    ok: true,
  })
})
adminOpsRouter.get('/settings', adminOnly, async (_req, res) =>
  res.json({
    settings: await getSettings(),
  }),
)
adminOpsRouter.put('/settings', adminOnly, async (req, res) => {
  const data = z
    .object({
      storeName: z.string().trim().min(1).max(60),
      supportEmail: z.string().email(),
      supportPhone: z.string().max(30),
      address: z.string().max(200),
      freeShippingThreshold: z.number().int().min(0),
      shippingFee: z.number().int().min(0),
      codEnabled: z.boolean(),
      codMaxOrder: z.number().int().min(0),
      lowStockDefault: z.number().int().min(0),
    })
    .partial()
    .parse(req.body)
  const settings = await saveSettings(data)
  await audit(actor(req).id, 'settings.update', 'Setting', undefined, data)
  res.json({
    settings,
  })
})
adminOpsRouter.get('/staff', adminOnly, async (_req, res) => {
  res.json({
    items: await rows(from('Person').select('id, name, email, role, isBlocked, createdAt').in('role', ['ADMIN', 'STAFF']).order('createdAt')),
  })
})
adminOpsRouter.post('/staff', adminOnly, async (req, res) => {
  const data = z
    .object({
      name: z.string().trim().min(2).max(80),
      email: z.string().trim().toLowerCase().email(),
      password: z.string().min(8).max(100),
      role: z.enum(['STAFF', 'ADMIN']).default('STAFF'),
    })
    .parse(req.body)
  if (await findAccountByEmail(data.email)) throw conflict('An account with this email already exists')
  const user = await createAccount({
    name: data.name,
    email: data.email,
    role: data.role,
    passwordHash: await hashPassword(data.password),
  })
  await audit(actor(req).id, 'staff.create', 'Login', user.id, {
    role: data.role,
  })
  res.status(201).json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  })
})
adminOpsRouter.patch('/staff/:id', adminOnly, async (req, res) => {
  const data = z
    .object({
      role: z.enum(['CUSTOMER', 'STAFF', 'ADMIN']).optional(),
      isBlocked: z.boolean().optional(),
    })
    .parse(req.body)
  const id = String(req.params.id)
  if (id === actor(req).id) throw badRequest('You cannot change your own role or access')
  if (data.role) await setRole(id, data.role)
  if (data.isBlocked !== undefined)
    await updateLogin(id, {
      isBlocked: data.isBlocked,
    })
  if (data.isBlocked || data.role === 'CUSTOMER') await revokeAllRefreshTokens(id)
  await audit(actor(req).id, 'staff.update', 'Login', id, data)
  res.json({
    ok: true,
  })
})
adminOpsRouter.get('/audit', adminOnly, async (req, res) => {
  const q = z
    .object({
      entity: z.string().optional(),
      page: z.coerce.number().int().min(1).default(1),
    })
    .parse(req.query)
  let request = from('AuditLog')
    .select('*')
    .order('createdAt', {
      ascending: false,
    })
    .range((q.page - 1) * 50, q.page * 50 - 1)
  if (q.entity) request = request.eq('entity', q.entity)
  const items = await rows(request)
  const actors = await peopleByIds([...new Set(items.map((item) => item.actorId).filter(Boolean))])
  res.json({
    items: items.map((item) => ({
      ...item,
      actor: item.actorId ? (actors.get(item.actorId) ?? null) : null,
    })),
  })
})
adminOpsRouter.get('/summary', async (_req, res) => {
  const settings = await getSettings()
  const [pending, toPack, toShip, variants, supportNeedingReply] = await Promise.all([
    count(
      from('Order')
        .select('id', {
          count: 'exact',
          head: true,
        })
        .in('status', ['PLACED', 'CONFIRMED']),
    ),
    count(
      from('Order')
        .select('id', {
          count: 'exact',
          head: true,
        })
        .eq('status', 'CONFIRMED'),
    ),
    count(
      from('Order')
        .select('id', {
          count: 'exact',
          head: true,
        })
        .eq('status', 'PACKED'),
    ),
    rows(from('ProductVariant').select('stock, lowStockAt, product:Product!inner(isActive)').eq('isActive', true).eq('product.isActive', true)),
    count(
      from('SupportTicket')
        .select('id', {
          count: 'exact',
          head: true,
        })
        .eq('staffUnread', true)
        .in('status', ['OPEN', 'IN_PROGRESS']),
    ),
  ])
  res.json({
    ordersNeedingAction: pending,
    toPack,
    toShip,
    supportNeedingReply,
    outOfStock: variants.filter((v) => v.stock === 0).length,
    lowStock: variants.filter((v) => v.stock > 0 && v.stock <= (v.lowStockAt ?? settings.lowStockDefault)).length,
  })
})
adminOpsRouter.get('/analytics', adminOnly, async (req, res) => {
  const days = z.coerce.number().int().min(1).max(365).default(30).parse(req.query.days)
  const [stats, lowStock, coupons] = await Promise.all([
    rpc('admin_analytics', {
      p_days: days,
    }),
    rows(
      from('ProductVariant')
        .select('id, size, stock, product:Product!inner(name, isActive)')
        .eq('isActive', true)
        .eq('product.isActive', true)
        .lte('stock', 10)
        .order('stock')
        .limit(10),
    ),
    rows(
      from('Coupon')
        .select('code, usedCount')
        .gt('usedCount', 0)
        .order('usedCount', {
          ascending: false,
        })
        .limit(5),
    ),
  ])
  res.json({
    rangeDays: days,
    ...stats,
    lowStock: lowStock.map((variant) => ({
      variantId: variant.id,
      product: variant.product.name,
      size: variant.size,
      stock: variant.stock,
    })),
    topCoupons: coupons,
  })
})
