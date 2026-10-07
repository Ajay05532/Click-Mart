import { Router } from 'express'
import { z } from 'zod'
import { audit } from '../../lib/audit.js'
import { hashPassword } from '../../lib/auth.js'
import { badRequest, conflict, notFound } from '../../lib/errors.js'
import { changeStatus, orderInclude, refundOrder } from '../../lib/orders.js'
import { prisma } from '../../lib/prisma.js'
import { serializeOrder } from '../../lib/serializers.js'
import { getSettings, saveSettings } from '../../lib/settings.js'
import { actor, adminOnly } from '../../middleware/auth.js'
import { renderInvoice } from '../orders.js'
import type { Prisma } from '@prisma/client'

export const adminOpsRouter = Router()

const statusEnum = z.enum(['PLACED', 'CONFIRMED', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'RETURNED'])

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
  const where: Prisma.OrderWhereInput = { status: q.status, paymentStatus: q.paymentStatus }
  if (q.from || q.to) where.createdAt = { gte: q.from, lte: q.to }
  if (q.q) {
    const num = Number(q.q.replace(/\D/g, ''))
    where.OR = [
      { customerName: { contains: q.q, mode: 'insensitive' } },
      { email: { contains: q.q, mode: 'insensitive' } },
      { phone: { contains: q.q } },
      ...(Number.isFinite(num) && num > 0 ? [{ number: num }] : []),
    ]
  }
  const [rows, total, counts] = await Promise.all([
    prisma.order.findMany({ where, include: orderInclude, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.order.count({ where }),
    prisma.order.groupBy({ by: ['status'], _count: true }),
  ])
  res.json({
    items: rows.map(serializeOrder),
    total,
    page: q.page,
    pages: Math.max(1, Math.ceil(total / q.pageSize)),
    statusCounts: Object.fromEntries(counts.map((row) => [row.status, row._count])),
  })
})

adminOpsRouter.get('/orders/:id', async (req, res) => {
  const order = await prisma.order.findUnique({ where: { id: String(req.params.id) }, include: { ...orderInclude, payments: true, user: { select: { id: true, name: true, email: true } } } })
  if (!order) throw notFound('Order')
  res.json({ order: { ...serializeOrder(order), payments: order.payments, customerAccount: order.user } })
})

adminOpsRouter.get('/orders/:id/invoice', async (req, res) => {
  const order = await prisma.order.findUnique({ where: { id: String(req.params.id) }, include: orderInclude })
  if (!order) throw notFound('Order')
  res.type('html').send(renderInvoice(order))
})

adminOpsRouter.patch('/orders/:id/status', async (req, res) => {
  const data = z
    .object({ status: statusEnum, note: z.string().trim().max(300).optional(), carrier: z.string().trim().max(60).optional(), trackingNumber: z.string().trim().max(60).optional() })
    .parse(req.body)
  if (data.status === 'SHIPPED' && !data.trackingNumber) {
    const existing = await prisma.order.findUnique({ where: { id: String(req.params.id) } })
    if (!existing?.trackingNumber) throw badRequest('Add a tracking number when marking an order as shipped')
  }
  await changeStatus(String(req.params.id), data.status, data)
  await audit(actor(req).id, `order.status.${data.status.toLowerCase()}`, 'Order', String(req.params.id), data)
  const order = await prisma.order.findUniqueOrThrow({ where: { id: String(req.params.id) }, include: orderInclude })
  res.json({ order: serializeOrder(order) })
})

adminOpsRouter.post('/orders/:id/refund', adminOnly, async (req, res) => {
  await refundOrder(String(req.params.id))
  await audit(actor(req).id, 'order.refund', 'Order', String(req.params.id))
  res.json({ order: serializeOrder(await prisma.order.findUniqueOrThrow({ where: { id: String(req.params.id) }, include: orderInclude })) })
})

// ---- Customers ----
adminOpsRouter.get('/customers', async (req, res) => {
  const q = z.object({ q: z.string().trim().optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) }).parse(req.query)
  const where: Prisma.UserWhereInput = {
    role: 'CUSTOMER',
    ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { email: { contains: q.q, mode: 'insensitive' } }] } : {}),
  }
  const [users, total] = await Promise.all([
    prisma.user.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.user.count({ where }),
  ])
  const spend = await prisma.order.groupBy({
    by: ['userId'],
    where: { userId: { in: users.map((user) => user.id) }, status: { notIn: ['CANCELLED', 'RETURNED'] } },
    _sum: { total: true },
    _count: true,
  })
  res.json({
    items: users.map((user) => {
      const row = spend.find((item) => item.userId === user.id)
      return { id: user.id, name: user.name, email: user.email, phone: user.phone, isBlocked: user.isBlocked, createdAt: user.createdAt, orders: row?._count ?? 0, spent: row?._sum.total ?? 0 }
    }),
    total,
    page: q.page,
    pages: Math.max(1, Math.ceil(total / q.pageSize)),
  })
})

adminOpsRouter.get('/customers/:id', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: String(req.params.id) }, include: { addresses: true, orders: { include: orderInclude, orderBy: { createdAt: 'desc' }, take: 50 } } })
  if (!user) throw notFound('Customer')
  res.json({ customer: { id: user.id, name: user.name, email: user.email, phone: user.phone, isBlocked: user.isBlocked, createdAt: user.createdAt, addresses: user.addresses, orders: user.orders.map(serializeOrder) } })
})

adminOpsRouter.patch('/customers/:id', adminOnly, async (req, res) => {
  const data = z.object({ isBlocked: z.boolean() }).parse(req.body)
  const user = await prisma.user.update({ where: { id: String(req.params.id) }, data })
  if (data.isBlocked) await prisma.refreshToken.deleteMany({ where: { userId: user.id } })
  await audit(actor(req).id, data.isBlocked ? 'customer.block' : 'customer.unblock', 'User', user.id)
  res.json({ ok: true })
})

// ---- Settings ----
adminOpsRouter.get('/settings', adminOnly, async (_req, res) => res.json({ settings: await getSettings() }))

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
  res.json({ settings })
})

// ---- Staff accounts and audit trail ----
adminOpsRouter.get('/staff', adminOnly, async (_req, res) => {
  const items = await prisma.user.findMany({ where: { role: { in: ['ADMIN', 'STAFF'] } }, select: { id: true, name: true, email: true, role: true, isBlocked: true, createdAt: true }, orderBy: { createdAt: 'asc' } })
  res.json({ items })
})

adminOpsRouter.post('/staff', adminOnly, async (req, res) => {
  const data = z
    .object({ name: z.string().trim().min(2).max(80), email: z.string().trim().toLowerCase().email(), password: z.string().min(8).max(100), role: z.enum(['STAFF', 'ADMIN']).default('STAFF') })
    .parse(req.body)
  if (await prisma.user.findUnique({ where: { email: data.email } })) throw conflict('An account with this email already exists')
  const user = await prisma.user.create({ data: { name: data.name, email: data.email, role: data.role, passwordHash: await hashPassword(data.password) } })
  await audit(actor(req).id, 'staff.create', 'User', user.id, { role: data.role })
  res.status(201).json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } })
})

adminOpsRouter.patch('/staff/:id', adminOnly, async (req, res) => {
  const data = z.object({ role: z.enum(['CUSTOMER', 'STAFF', 'ADMIN']).optional(), isBlocked: z.boolean().optional() }).parse(req.body)
  if (String(req.params.id) === actor(req).id) throw badRequest('You cannot change your own role or access')
  const user = await prisma.user.update({ where: { id: String(req.params.id) }, data })
  if (data.isBlocked || data.role === 'CUSTOMER') await prisma.refreshToken.deleteMany({ where: { userId: user.id } })
  await audit(actor(req).id, 'staff.update', 'User', user.id, data)
  res.json({ ok: true })
})

adminOpsRouter.get('/audit', adminOnly, async (req, res) => {
  const q = z.object({ entity: z.string().optional(), page: z.coerce.number().int().min(1).default(1) }).parse(req.query)
  const items = await prisma.auditLog.findMany({ where: { entity: q.entity }, include: { actor: { select: { name: true, email: true } } }, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * 50, take: 50 })
  res.json({ items })
})

// ---- Analytics (revenue figures are admin-only; staff see operational counts via /admin/summary) ----
const REVENUE = { status: { notIn: ['CANCELLED', 'RETURNED'] as ('CANCELLED' | 'RETURNED')[] }, paymentStatus: { in: ['PAID', 'PENDING'] as ('PAID' | 'PENDING')[] } }

adminOpsRouter.get('/summary', async (_req, res) => {
  const settings = await getSettings()
  const [pending, toPack, toShip, variants] = await Promise.all([
    prisma.order.count({ where: { status: { in: ['PLACED', 'CONFIRMED'] } } }),
    prisma.order.count({ where: { status: 'CONFIRMED' } }),
    prisma.order.count({ where: { status: 'PACKED' } }),
    prisma.productVariant.findMany({ where: { isActive: true, product: { isActive: true } }, select: { stock: true, lowStockAt: true } }),
  ])
  res.json({
    ordersNeedingAction: pending,
    toPack,
    toShip,
    outOfStock: variants.filter((v) => v.stock === 0).length,
    lowStock: variants.filter((v) => v.stock > 0 && v.stock <= (v.lowStockAt ?? settings.lowStockDefault)).length,
  })
})

adminOpsRouter.get('/analytics', adminOnly, async (req, res) => {
  const days = z.coerce.number().int().min(1).max(365).default(30).parse(req.query.days)
  const since = new Date(Date.now() - days * 86400000)
  since.setHours(0, 0, 0, 0)
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  const [period, today, customersNew, statusCounts, series, topProducts, lowStock, coupons, byCategory] = await Promise.all([
    prisma.order.aggregate({ where: { ...REVENUE, createdAt: { gte: since } }, _sum: { total: true, discount: true }, _count: true, _avg: { total: true } }),
    prisma.order.aggregate({ where: { ...REVENUE, createdAt: { gte: startOfToday } }, _sum: { total: true }, _count: true }),
    prisma.user.count({ where: { role: 'CUSTOMER', createdAt: { gte: since } } }),
    prisma.order.groupBy({ by: ['status'], where: { createdAt: { gte: since } }, _count: true }),
    prisma.$queryRaw<{ day: Date; revenue: bigint; orders: bigint }[]>`
      SELECT date_trunc('day', "createdAt") AS day, COALESCE(SUM("total"),0) AS revenue, COUNT(*) AS orders
      FROM "Order"
      WHERE "createdAt" >= ${since} AND "status" NOT IN ('CANCELLED','RETURNED') AND "paymentStatus" IN ('PAID','PENDING')
      GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<{ name: string; units: bigint; revenue: bigint }[]>`
      SELECT oi."name" AS name, SUM(oi."quantity") AS units, SUM(oi."quantity" * oi."unitPrice") AS revenue
      FROM "OrderItem" oi JOIN "Order" o ON o.id = oi."orderId"
      WHERE o."createdAt" >= ${since} AND o."status" NOT IN ('CANCELLED','RETURNED')
      GROUP BY oi."name" ORDER BY revenue DESC LIMIT 8`,
    prisma.productVariant.findMany({ where: { isActive: true, stock: { lte: 10 }, product: { isActive: true } }, include: { product: { select: { name: true } } }, orderBy: { stock: 'asc' }, take: 10 }),
    prisma.coupon.findMany({ where: { usedCount: { gt: 0 } }, orderBy: { usedCount: 'desc' }, take: 5, select: { code: true, usedCount: true } }),
    prisma.$queryRaw<{ category: string; revenue: bigint }[]>`
      SELECT p."categoryId" AS category, SUM(oi."quantity" * oi."unitPrice") AS revenue
      FROM "OrderItem" oi JOIN "Order" o ON o.id = oi."orderId" JOIN "Product" p ON p.id = oi."productId"
      WHERE o."createdAt" >= ${since} AND o."status" NOT IN ('CANCELLED','RETURNED')
      GROUP BY 1 ORDER BY revenue DESC`,
  ])

  const byDay = new Map(series.map((row) => [row.day.toISOString().slice(0, 10), { revenue: Number(row.revenue), orders: Number(row.orders) }]))
  const daily = Array.from({ length: days }, (_, index) => {
    const day = new Date(since.getTime() + index * 86400000).toISOString().slice(0, 10)
    return { day, ...(byDay.get(day) ?? { revenue: 0, orders: 0 }) }
  })

  res.json({
    rangeDays: days,
    revenue: period._sum.total ?? 0,
    orders: period._count,
    averageOrderValue: Math.round(period._avg.total ?? 0),
    couponDiscountGiven: period._sum.discount ?? 0,
    today: { revenue: today._sum.total ?? 0, orders: today._count },
    newCustomers: customersNew,
    ordersByStatus: Object.fromEntries(statusCounts.map((row) => [row.status, row._count])),
    daily,
    topProducts: topProducts.map((row) => ({ name: row.name, units: Number(row.units), revenue: Number(row.revenue) })),
    revenueByCategory: byCategory.map((row) => ({ category: row.category, revenue: Number(row.revenue) })),
    lowStock: lowStock.map((variant) => ({ variantId: variant.id, product: variant.product.name, size: variant.size, stock: variant.stock })),
    topCoupons: coupons,
  })
})
