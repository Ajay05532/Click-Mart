import { Router } from 'express'
import { z } from 'zod'
import { createAccount, findAccountByEmail, findAccountById, peopleByIds, setRole, updateLogin } from '../../services/account.js'
import { audit } from '../../services/audit.js'
import { sendStaffInvite } from '../../services/emails.js'
import { hashPassword, revokeAllRefreshTokens } from '../../services/auth.js'
import { from, count, exec, maybe, rows, rpc, toHttpError } from '../../database/db.js'
import { badRequest, conflict, notFound } from '../../utils/errors.js'
import { changeStatus, loadOrder, refundOrder } from '../../services/orders.js'
import { orderCode, serializeOrder } from '../../utils/serializers.js'
import { getSettings, saveSettings } from '../../services/settings.js'
import {
  cancelOrder as npCancelOrder,
  cancelOrders as npCancelOrders,
  createOrder as npCreateOrder,
  createWarehouse,
  getDeliveryRates,
  getOrder as npGetOrder,
  listWarehouses,
  nimbuspostEnabled,
  sendWarehouseOtp,
  setEwayBill,
  verifyWarehouseOtp,
} from '../../services/nimbuspost.js'
import { ORDER_SELECT } from '../../database/selects.js'
import { actor, adminOnly } from '../../middleware/auth.js'
import { renderInvoiceHtml } from '../../services/invoice.js'
import { DEFAULT_STAFF_PERMISSIONS, PERMISSIONS, PERMISSION_KEYS, PERMISSION_PRESETS, cleanPermissions, forgetPermissions } from '../../services/permissions.js'
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
// Dry fruit packs are light; stand in for a pack whose weight was never filled in on the product.
const DEFAULT_ITEM_WEIGHT_GRAMS = 250
/** Total weight (grams) and each item's ProductVariant.sku, looked up in one go since OrderItem itself
 * snapshots neither (sales and catalog are separate schemas, so this is always its own query). */
async function weighOrderItems(items) {
  const variantIds = [...new Set(items.map((item) => item.variantId).filter(Boolean))]
  const variants = variantIds.length ? new Map((await rows(from('ProductVariant').select('id, weightGrams, sku').in('id', variantIds))).map((v) => [v.id, v])) : new Map()
  const weightGrams = items.reduce((sum, item) => sum + (variants.get(item.variantId)?.weightGrams || DEFAULT_ITEM_WEIGHT_GRAMS) * item.quantity, 0)
  return { weightGrams: Math.max(weightGrams, DEFAULT_ITEM_WEIGHT_GRAMS), variants }
}
adminOpsRouter.get('/orders/:id/delivery-rate', async (req, res) => {
  const order = await maybe(from('Order').select('pin, total, paymentMethod, items:OrderItem(variantId, quantity)').eq('id', String(req.params.id)).maybeSingle())
  if (!order) throw notFound('Order')
  if (!nimbuspostEnabled()) throw badRequest('NimbusPost is not connected. Add NIMBUSPOST_API_KEY and NIMBUSPOST_API_SECRET on the server.')
  const settings = await getSettings()
  if (!settings.pickupPincode) throw badRequest('Set a pickup PIN code first, in Settings -> Delivery.')
  const { weightGrams } = await weighOrderItems(order.items)
  const rates = await getDeliveryRates({
    pickupPincode: settings.pickupPincode,
    deliveryPincode: order.pin,
    paymentMode: order.paymentMethod === 'COD' ? 'cod' : 'prepaid',
    weightGrams,
    orderValuePaise: Math.round(order.total * 100),
  }).catch((error) => {
    throw badRequest(`NimbusPost could not price this route: ${error.message}`)
  })
  res.json(rates)
})
adminOpsRouter.get('/nimbuspost/warehouses', adminOnly, async (req, res) => {
  if (!nimbuspostEnabled()) throw badRequest('NimbusPost is not connected. Add NIMBUSPOST_API_KEY and NIMBUSPOST_API_SECRET on the server.')
  const data = await listWarehouses().catch((error) => {
    throw badRequest(`NimbusPost: ${error.message}`)
  })
  res.json({ items: data.items ?? data ?? [] })
})
adminOpsRouter.post('/nimbuspost/warehouses/otp/send', adminOnly, async (req, res) => {
  const data = z.object({ phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit mobile number'), purpose: z.enum(['pickup', 'rto']) }).parse(req.body)
  const result = await sendWarehouseOtp(Number(data.phone), data.purpose).catch((error) => {
    throw badRequest(`NimbusPost: ${error.message}`)
  })
  res.json(result)
})
adminOpsRouter.post('/nimbuspost/warehouses/otp/verify', adminOnly, async (req, res) => {
  const data = z.object({ phone: z.string().regex(/^[6-9]\d{9}$/), otp: z.string().trim().min(4).max(8), purpose: z.enum(['pickup', 'rto']) }).parse(req.body)
  const result = await verifyWarehouseOtp(Number(data.phone), data.otp, data.purpose).catch((error) => {
    throw badRequest(`NimbusPost: ${error.message}`)
  })
  res.json(result)
})
adminOpsRouter.post('/nimbuspost/warehouses', adminOnly, async (req, res) => {
  const data = z
    .object({
      name: z.string().trim().min(1).max(100),
      address: z.string().trim().min(1).max(200),
      pincode: z.string().regex(/^\d{6}$/),
      city: z.string().trim().min(1),
      state: z.string().trim().min(1),
      contactName: z.string().trim().min(1).max(100),
      contactPhone: z.string().regex(/^[6-9]\d{9}$/),
      verificationId: z.string().trim().min(1),
    })
    .parse(req.body)
  const warehouse = await createWarehouse({
    name: data.name,
    address: { address: data.address, pincode: data.pincode, city: data.city, state: data.state, country: 'India' },
    contactName: data.contactName,
    contactPhone: Number(data.contactPhone),
    verificationId: data.verificationId,
    isPrimary: true,
  }).catch((error) => {
    throw badRequest(`NimbusPost: ${error.message}`)
  })
  await audit(actor(req).id, 'settings.nimbuspost_warehouse_created', 'Setting', undefined, { name: data.name })
  res.status(201).json(warehouse)
})
adminOpsRouter.get('/orders/:id/nimbuspost', async (req, res) => {
  const shipment = await maybe(from('Shipment').select('nimbuspostOrderId, nimbuspostOrderNumber, nimbuspostStatus, ewayBillNumber').eq('orderId', String(req.params.id)).maybeSingle())
  if (!shipment?.nimbuspostOrderId) return res.json({ booked: false })
  let live = null
  if (nimbuspostEnabled()) {
    live = await npGetOrder(shipment.nimbuspostOrderId).catch(() => null)
    if (live?.order_status && live.order_status !== shipment.nimbuspostStatus) await exec(from('Shipment').update({ nimbuspostStatus: live.order_status }).eq('orderId', String(req.params.id)))
  }
  res.json({
    booked: true,
    orderId: shipment.nimbuspostOrderId,
    orderNumber: shipment.nimbuspostOrderNumber,
    status: live?.order_status ?? shipment.nimbuspostStatus,
    ewayBillNumber: shipment.ewayBillNumber,
    awb: live?.shipment?.awb ?? null,
    courierName: live?.shipment?.courier_name ?? null,
    labelUrl: live?.shipment?.label_url ?? null,
  })
})
adminOpsRouter.post('/orders/:id/nimbuspost/create', async (req, res) => {
  const id = String(req.params.id)
  if (!nimbuspostEnabled()) throw badRequest('NimbusPost is not connected. Add NIMBUSPOST_API_KEY and NIMBUSPOST_API_SECRET on the server.')
  const settings = await getSettings()
  if (!settings.nimbuspostWarehouseId) throw badRequest('Pick a NimbusPost pickup warehouse first, in Settings -> Delivery.')
  const existing = await maybe(from('Shipment').select('nimbuspostOrderId').eq('orderId', id).maybeSingle())
  if (existing?.nimbuspostOrderId) throw conflict('This order is already booked with NimbusPost')
  const order = await maybe(
    from('Order')
      .select('number, customerName, email, phone, addressLine, city, state, pin, shipping, total, paymentMethod, items:OrderItem(variantId, name, unitPrice, quantity, hsnCode, gstPercent)')
      .eq('id', id)
      .maybeSingle(),
  )
  if (!order) throw notFound('Order')
  const { weightGrams, variants } = await weighOrderItems(order.items)
  const result = await npCreateOrder({
    orderNumber: orderCode(order.number),
    paymentMode: order.paymentMethod === 'COD' ? 'cod' : 'prepaid',
    warehouseId: settings.nimbuspostWarehouseId,
    shippingCharges: order.shipping,
    orderTotal: order.total,
    weightGrams,
    address: { name: order.customerName, email: order.email, line: order.addressLine, pin: order.pin, city: order.city, state: order.state, phone: order.phone },
    items: order.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unitPriceInclGst: item.unitPrice,
      gstPercent: item.gstPercent,
      hsnCode: item.hsnCode,
      sku: variants.get(item.variantId)?.sku,
    })),
  }).catch((error) => {
    throw badRequest(`NimbusPost could not create this order: ${error.message}`)
  })
  await exec(
    from('Shipment').upsert(
      { orderId: id, nimbuspostOrderId: result.order_id, nimbuspostOrderNumber: orderCode(order.number), nimbuspostStatus: result.order_status ?? 'created', updatedAt: new Date().toISOString() },
      { onConflict: 'orderId' },
    ),
  )
  await audit(actor(req).id, 'order.nimbuspost.created', 'Order', id, { nimbuspostOrderId: result.order_id })
  res.status(201).json(result)
})
adminOpsRouter.post('/orders/:id/nimbuspost/cancel', async (req, res) => {
  const id = String(req.params.id)
  const data = z.object({ reason: z.string().trim().max(300).optional() }).parse(req.body)
  const shipment = await maybe(from('Shipment').select('nimbuspostOrderId').eq('orderId', id).maybeSingle())
  if (!shipment?.nimbuspostOrderId) throw badRequest('This order has no NimbusPost booking to cancel.')
  const result = await npCancelOrder(shipment.nimbuspostOrderId, data.reason).catch((error) => {
    throw badRequest(`NimbusPost could not cancel this order: ${error.message}`)
  })
  await exec(from('Shipment').update({ nimbuspostStatus: 'cancelled' }).eq('orderId', id))
  await audit(actor(req).id, 'order.nimbuspost.cancelled', 'Order', id, { reason: data.reason })
  res.json(result)
})
adminOpsRouter.post('/orders/nimbuspost/cancel-bulk', adminOnly, async (req, res) => {
  const data = z.object({ ids: z.array(z.string().max(60)).min(1).max(50), reason: z.string().trim().max(300).optional() }).parse(req.body)
  const shipments = await rows(from('Shipment').select('orderId, nimbuspostOrderId').in('orderId', data.ids).not('nimbuspostOrderId', 'is', null))
  if (!shipments.length) throw badRequest('None of the selected orders have a NimbusPost booking.')
  const result = await npCancelOrders(
    shipments.map((s) => s.nimbuspostOrderId),
    data.reason,
  ).catch((error) => {
    throw badRequest(`NimbusPost: ${error.message}`)
  })
  await exec(
    from('Shipment')
      .update({ nimbuspostStatus: 'cancelled' })
      .in('orderId', shipments.map((s) => s.orderId)),
  )
  await audit(actor(req).id, 'order.nimbuspost.cancelled_bulk', 'Order', undefined, { ids: data.ids, reason: data.reason })
  res.json(result)
})
adminOpsRouter.patch('/orders/:id/nimbuspost/eway-bill', async (req, res) => {
  const id = String(req.params.id)
  const data = z.object({ ewayBillNumber: z.string().regex(/^\d{12}$/, 'A 12-digit e-way bill number'), documentUrl: z.string().url().optional() }).parse(req.body)
  const shipment = await maybe(from('Shipment').select('nimbuspostOrderId').eq('orderId', id).maybeSingle())
  if (!shipment?.nimbuspostOrderId) throw badRequest('This order has no NimbusPost booking yet.')
  await setEwayBill(shipment.nimbuspostOrderId, data.ewayBillNumber, data.documentUrl).catch((error) => {
    throw badRequest(`NimbusPost could not save the e-way bill: ${error.message}`)
  })
  await exec(from('Shipment').update({ ewayBillNumber: data.ewayBillNumber }).eq('orderId', id))
  await audit(actor(req).id, 'order.nimbuspost.eway_bill', 'Order', id, { ewayBillNumber: data.ewayBillNumber })
  res.json({ ok: true })
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
  res.type('html').send(renderInvoiceHtml(serializeOrder(order), await getSettings()))
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
adminOpsRouter.post('/orders/bulk-status', async (req, res) => {
  const data = z
    .object({
      ids: z.array(z.string().max(60)).min(1).max(50),
      status: z.enum(['CONFIRMED', 'PACKED']),
    })
    .parse(req.body)
  const results = []
  for (const id of data.ids) {
    try {
      await changeStatus(id, data.status, {})
      results.push({ id, ok: true })
    } catch (error) {
      results.push({ id, ok: false, message: error?.message ?? 'Could not change this order' })
    }
  }
  await audit(actor(req).id, `order.bulk.${data.status.toLowerCase()}`, 'Order', undefined, { count: data.ids.length, failed: results.filter((item) => !item.ok).length })
  res.json({ results })
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
    nimbuspostEnabled: nimbuspostEnabled(),
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
      businessName: z.string().trim().max(120),
      gstin: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z])?$/, 'Enter a valid 15-character GSTIN, or leave it blank'),
      businessState: z.string().trim().max(60),
      nonServiceablePincodes: z.array(z.string().trim().regex(/^\d{6}$/, '6-digit PIN codes only')).max(1000),
      nonServiceableStates: z.array(z.string().trim().max(60)).max(60),
      pickupPincode: z.string().trim().regex(/^(\d{6})?$/, 'Enter a 6-digit PIN code, or leave it blank'),
      nimbuspostWarehouseId: z.string().trim().max(100),
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
  const people = await rows(from('Person').select('id, name, email, role, isBlocked, createdAt').in('role', ['ADMIN', 'STAFF']).order('createdAt'))
  const profiles = await rows(from('Staff').select('loginId, permissions'))
  const byId = new Map(profiles.map((profile) => [profile.loginId, profile.permissions]))
  res.json({
    items: people.map((person) => ({
      ...person,
      permissions: person.role === 'ADMIN' ? PERMISSION_KEYS : cleanPermissions(byId.get(person.id) ?? DEFAULT_STAFF_PERMISSIONS),
    })),
    permissions: PERMISSIONS,
    presets: PERMISSION_PRESETS,
  })
})
adminOpsRouter.post('/staff', adminOnly, async (req, res) => {
  const data = z
    .object({
      name: z.string().trim().min(2).max(80),
      email: z.string().trim().toLowerCase().email(),
      password: z.string().min(8).max(100),
      role: z.enum(['STAFF', 'ADMIN']).default('STAFF'),
      permissions: z.array(z.enum(PERMISSION_KEYS)).max(PERMISSION_KEYS.length).optional(),
    })
    .parse(req.body)
  if (await findAccountByEmail(data.email)) throw conflict('An account with this email already exists')
  const user = await createAccount({
    name: data.name,
    email: data.email,
    role: data.role,
    passwordHash: await hashPassword(data.password),
  })
  if (data.role === 'STAFF' && data.permissions) await exec(from('Staff').update({ permissions: cleanPermissions(data.permissions) }).eq('loginId', user.id))
  void sendStaffInvite({ ...user, name: data.name })
  await audit(actor(req).id, 'staff.create', 'Login', user.id, {
    role: data.role,
    permissions: data.permissions,
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
      permissions: z.array(z.enum(PERMISSION_KEYS)).max(PERMISSION_KEYS.length).optional(),
    })
    .parse(req.body)
  const id = String(req.params.id)
  if (id === actor(req).id) throw badRequest('You cannot change your own role or access')
  if (data.role) await setRole(id, data.role)
  if (data.permissions) {
    const target = await findAccountById(id)
    if (!target || target.role !== 'STAFF') throw badRequest('Permissions can only be set for staff accounts')
    await exec(from('Staff').update({ permissions: cleanPermissions(data.permissions) }).eq('loginId', id))
    forgetPermissions(id)
  }
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
/** Readable names for the records in a page of the activity log. Deleted records simply get no name. */
async function auditRecordNames(items) {
  const idsOf = (entity) => [...new Set(items.filter((item) => item.entity === entity && item.entityId).map((item) => item.entityId))]
  const names = new Map()
  const put = (entity, id, label) => label && names.set(`${entity}:${id}`, label)
  const lookups = {
    Product: async (ids) => (await rows(from('Product').select('id, name').in('id', ids))).forEach((row) => put('Product', row.id, row.name)),
    ProductVariant: async (ids) =>
      (await rows(from('ProductVariant').select('id, size, product:Product(name)').in('id', ids))).forEach((row) => put('ProductVariant', row.id, `${row.product?.name ?? 'Product'} · ${row.size}`)),
    Category: async (ids) => (await rows(from('Category').select('id, name').in('id', ids))).forEach((row) => put('Category', row.id, row.name)),
    Brand: async (ids) => (await rows(from('Brand').select('id, name').in('id', ids))).forEach((row) => put('Brand', row.id, row.name)),
    Order: async (ids) => (await rows(from('Order').select('id, number').in('id', ids))).forEach((row) => put('Order', row.id, `ORD-${row.number}`)),
    Offer: async (ids) => (await rows(from('Offer').select('id, name').in('id', ids))).forEach((row) => put('Offer', row.id, row.name)),
    Coupon: async (ids) => (await rows(from('Coupon').select('id, code').in('id', ids))).forEach((row) => put('Coupon', row.id, row.code)),
    Banner: async (ids) => (await rows(from('Banner').select('id, title').in('id', ids))).forEach((row) => put('Banner', row.id, row.title)),
    Faq: async (ids) => (await rows(from('Faq').select('id, question').in('id', ids))).forEach((row) => put('Faq', row.id, row.question)),
    SupportTicket: async (ids) => (await rows(from('SupportTicket').select('id, number, subject').in('id', ids))).forEach((row) => put('SupportTicket', row.id, `TKT-${row.number} · ${row.subject}`)),
    Review: async (ids) => {
      const reviews = await rows(from('Review').select('id, productId').in('id', ids))
      const products = new Map((await rows(from('Product').select('id, name').in('id', [...new Set(reviews.map((row) => row.productId))]))).map((row) => [row.id, row.name]))
      reviews.forEach((row) => put('Review', row.id, `Review on ${products.get(row.productId) ?? 'a product'}`))
    },
    Login: async (ids) => (await peopleByIds(ids)).forEach((person, id) => put('Login', id, person.name || person.email)),
  }
  await Promise.all(
    Object.entries(lookups).map(async ([entity, lookup]) => {
      const ids = idsOf(entity)
      if (!ids.length) return
      try {
        await lookup(ids)
      } catch (error) {
        console.error(`audit names for ${entity} failed`, error.message)
      }
    }),
  )
  return names
}

adminOpsRouter.get('/audit', adminOnly, async (req, res) => {
  const q = z
    .object({
      entity: z.string().optional(),
      actor: z.string().optional(),
      page: z.coerce.number().int().min(1).default(1),
    })
    .parse(req.query)
  const PAGE = 50
  let request = from('AuditLog')
    .select('*', { count: 'exact' })
    .order('createdAt', {
      ascending: false,
    })
    .range((q.page - 1) * PAGE, q.page * PAGE - 1)
  const entities = (q.entity ?? '').split(',').map((value) => value.trim()).filter(Boolean)
  if (entities.length) request = request.in('entity', entities)
  if (q.actor) request = request.eq('actorId', q.actor)
  const { data, error, count: total } = await request
  if (error) throw toHttpError(error)
  const items = data ?? []
  const [actors, names] = await Promise.all([peopleByIds([...new Set(items.map((item) => item.actorId).filter(Boolean))]), auditRecordNames(items)])
  res.json({
    items: items.map((item) => ({
      ...item,
      actor: item.actorId ? (actors.get(item.actorId) ?? null) : null,
      record: (item.entityId && names.get(`${item.entity}:${item.entityId}`)) || item.diff?.name || item.diff?.code || item.diff?.title || null,
    })),
    total: total ?? items.length,
    page: q.page,
    pages: Math.max(1, Math.ceil((total ?? items.length) / PAGE)),
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
