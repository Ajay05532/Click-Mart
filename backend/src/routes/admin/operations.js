import { Router } from 'express'
import { z } from 'zod'
import { createAccount, findAccountByEmail, findAccountById, peopleByIds, setRole, updateLogin } from '../../services/account.js'
import { audit } from '../../services/audit.js'
import { sendStaffInvite } from '../../services/emails.js'
import { hashPassword, revokeAllRefreshTokens } from '../../services/auth.js'
import { from, count, exec, maybe, rows, rpc, toHttpError } from '../../database/db.js'
import { badRequest, conflict, notFound } from '../../utils/errors.js'
import { changeStatus, loadOrder, refundOrder } from '../../services/orders.js'
import { serializeOrder } from '../../utils/serializers.js'
import { lookupPin } from '../location.js'
import { getSettings, saveSettings } from '../../services/settings.js'
import { cancelProviderBooking, cancelReturnPickup, createProviderOrder, createReturnPickup, providerBooking, weighOrderItems } from '../../services/shipping.js'
import {
  RETURN_REASONS,
  bookShipment,
  cancelOrders as npCancelOrders,
  createWarehouse,
  getDeliveryRates,
  getLabels,
  getOrder as npGetOrder,
  listWarehouses,
  listWebhooks,
  pickupServiceable,
  registerWebhook,
  webhookSecretSet,
  nimbuspostEnabled,
  schedulePickup,
  sendWarehouseOtp,
  setEwayBill,
  setShipmentEwayBill,
  trackOrder,
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
/** Before adding a warehouse: will couriers collect from this PIN code, and which city and state is it? */
adminOpsRouter.post('/nimbuspost/warehouses/check', adminOnly, async (req, res) => {
  if (!nimbuspostEnabled()) throw badRequest('NimbusPost is not connected. Add NIMBUSPOST_API_KEY and NIMBUSPOST_API_SECRET on the server.')
  const { pincode } = z.object({ pincode: z.string().regex(/^\d{6}$/, 'Enter a 6-digit PIN code') }).parse(req.body)
  const [pickup, place] = await Promise.all([
    pickupServiceable(pincode).catch((error) => ({ error: error.message })),
    lookupPin(pincode).catch(() => null),
  ])
  if ('error' in pickup) throw badRequest(`NimbusPost could not check this PIN code: ${pickup.error}`)
  res.json({ pincode, serviceable: pickup.serviceable, couriers: pickup.couriers, city: place?.city ?? null, state: place?.state ?? null, area: place?.area ?? null })
})
const warehouseSchema = z.object({
  name: z.string().trim().min(2, 'Give the warehouse a name').max(100),
  address: z.string().trim().min(10, 'Enter the full address: building, street and area').max(200),
  addressLine2: z.string().trim().max(200).optional(),
  pincode: z.string().regex(/^\d{6}$/, 'Enter a 6-digit PIN code'),
  city: z.string().trim().min(2, 'Enter the city').max(80),
  state: z.string().trim().min(2, 'Choose the state').max(60),
  contactName: z.string().trim().min(2, 'Enter the pickup contact name').max(100),
  contactPhone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit mobile number'),
  contactEmail: z.string().trim().email().optional(),
  gst: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'Enter a valid 15-character GSTIN')
    .optional(),
  verificationId: z.string().trim().min(1),
})
adminOpsRouter.post('/nimbuspost/warehouses', adminOnly, async (req, res) => {
  const data = warehouseSchema.parse(req.body)
  // NimbusPost would accept an address no courier collects from; refuse it here so orders can always be booked.
  const pickup = await pickupServiceable(data.pincode).catch(() => null)
  if (pickup && !pickup.serviceable) throw badRequest(`No courier collects parcels from PIN code ${data.pincode}. Use a pickup address in a serviceable area.`)
  const warehouse = await createWarehouse({
    name: data.name,
    address: { address: data.address, ...(data.addressLine2 ? { address_opt: data.addressLine2 } : {}), pincode: Number(data.pincode), city: data.city, state: data.state, country: 'India' },
    contactName: data.contactName,
    contactPhone: Number(data.contactPhone),
    contactEmail: data.contactEmail,
    gst: data.gst,
    verificationId: data.verificationId,
    isPrimary: true,
  }).catch((error) => {
    throw badRequest(`NimbusPost: ${error.message}`)
  })
  // Orders are booked from this warehouse and rates are priced from its PIN code, so keep both settings in step.
  if (warehouse?.warehouse_id) await saveSettings({ nimbuspostWarehouseId: warehouse.warehouse_id, pickupPincode: data.pincode })
  await audit(actor(req).id, 'settings.nimbuspost_warehouse_created', 'Setting', undefined, { name: data.name, pincode: data.pincode })
  res.status(201).json(warehouse)
})
adminOpsRouter.get('/orders/:id/nimbuspost', async (req, res) => {
  const id = String(req.params.id)
  const [shipment, order] = await Promise.all([
    providerBooking(id),
    maybe(from('Order').select('carrier, trackingNumber').eq('id', id).maybeSingle()),
  ])
  if (!shipment?.providerOrderId) return res.json({ booked: false })
  const returnPickup =
    shipment.returnProviderOrderId && shipment.returnStatus !== 'cancelled'
      ? { orderId: shipment.returnProviderOrderId, status: shipment.returnStatus, awb: shipment.returnAwb, courierName: shipment.returnCourier, reason: shipment.returnReason }
      : null
  // Once booked, tracking (by order id) has richer, fresher data than a plain order-status check; fall back
  // to the order-status call for a created-but-not-yet-booked order (tracking 404s with NO_SHIPMENT there).
  let tracking = null
  let status = shipment.providerStatus
  if (nimbuspostEnabled()) {
    tracking = await trackOrder(shipment.providerOrderId).catch(() => null)
    if (!tracking) {
      const live = await npGetOrder(shipment.providerOrderId).catch(() => null)
      status = live?.order_status ?? status
    } else {
      status = tracking.orderStatus ?? status
    }
    if (status !== shipment.providerStatus) await exec(from('Shipment').update({ providerStatus: status }).eq('orderId', id))
  }
  res.json({
    booked: true,
    orderId: shipment.providerOrderId,
    orderNumber: shipment.providerOrderNumber,
    status,
    ewayBillNumber: shipment.ewayBillNumber,
    awb: order?.trackingNumber ?? null,
    courierName: order?.carrier ?? null,
    latest: tracking?.latest ?? null,
    scans: tracking?.scans ?? [],
    trackingUrl: tracking?.tracking_url ?? null,
    returnPickup,
  })
})
adminOpsRouter.post('/orders/:id/nimbuspost/book', async (req, res) => {
  const id = String(req.params.id)
  const data = z.object({ courierId: z.string().trim().max(100).optional() }).parse(req.body)
  const shipment = await maybe(from('Shipment').select('providerOrderId').eq('orderId', id).maybeSingle())
  if (!shipment?.providerOrderId) throw badRequest('Create the NimbusPost order first.')
  const result = await bookShipment(shipment.providerOrderId, data.courierId).catch((error) => {
    throw badRequest(`NimbusPost could not book a courier: ${error.message}`)
  })
  await exec(from('Shipment').update({ providerStatus: result.order_status ?? 'booked' }).eq('orderId', id))
  await exec(from('Order').update({ carrier: result.courier_name, trackingNumber: result.awb }).eq('id', id))
  await audit(actor(req).id, 'order.nimbuspost.booked', 'Order', id, { awb: result.awb, courierName: result.courier_name })
  res.json(result)
})
adminOpsRouter.post('/orders/:id/nimbuspost/pickup', async (req, res) => {
  const id = String(req.params.id)
  const data = z.object({ pickupDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional() }).parse(req.body)
  const shipment = await maybe(from('Shipment').select('providerOrderId').eq('orderId', id).maybeSingle())
  if (!shipment?.providerOrderId) throw badRequest('This order has no NimbusPost booking yet.')
  const result = await schedulePickup([shipment.providerOrderId], data.pickupDate).catch((error) => {
    throw badRequest(`NimbusPost could not schedule the pickup: ${error.message}`)
  })
  await audit(actor(req).id, 'order.nimbuspost.pickup_scheduled', 'Order', id, { pickupDate: data.pickupDate })
  res.json(result)
})
adminOpsRouter.get('/orders/:id/nimbuspost/label', async (req, res) => {
  const id = String(req.params.id)
  const shipment = await maybe(from('Shipment').select('providerOrderId').eq('orderId', id).maybeSingle())
  if (!shipment?.providerOrderId) throw badRequest('This order has no NimbusPost booking yet.')
  const result = await getLabels([shipment.providerOrderId]).catch((error) => {
    throw badRequest(`NimbusPost could not generate a label: ${error.message}`)
  })
  res.json(result)
})
adminOpsRouter.post('/orders/:id/nimbuspost/create', async (req, res) => {
  const id = String(req.params.id)
  const result = await createProviderOrder(id).catch((error) => {
    throw badRequest(`NimbusPost could not create this order: ${error.message}`)
  })
  await audit(actor(req).id, 'order.nimbuspost.created', 'Order', id, { providerOrderId: result.order_id })
  res.status(201).json(result)
})
const returnSchema = z.object({
  reason: z.enum(RETURN_REASONS),
  note: z.string().trim().max(300).optional(),
  book: z.boolean().default(true),
})
adminOpsRouter.post('/orders/:id/nimbuspost/return', async (req, res) => {
  const id = String(req.params.id)
  const data = returnSchema.parse(req.body)
  const result = await createReturnPickup(id, data).catch((error) => {
    throw badRequest(`NimbusPost could not arrange the return pickup: ${error.message}`)
  })
  await audit(actor(req).id, 'order.nimbuspost.return_created', 'Order', id, { reason: data.reason, awb: result.returnAwb })
  res.status(201).json(result)
})
adminOpsRouter.post('/orders/:id/nimbuspost/return/cancel', async (req, res) => {
  const id = String(req.params.id)
  const data = z.object({ reason: z.string().trim().max(300).optional() }).parse(req.body)
  const result = await cancelReturnPickup(id, data.reason).catch((error) => {
    throw badRequest(`NimbusPost could not cancel the return pickup: ${error.message}`)
  })
  if (!result) throw badRequest('This order has no return pickup to cancel.')
  await audit(actor(req).id, 'order.nimbuspost.return_cancelled', 'Order', id, { reason: data.reason })
  res.json(result)
})
/** Where NimbusPost should send tracking events: this API's own public https address. */
const webhookUrl = (req) => `https://${req.get('host')}/api/v1/shipping/webhook`
adminOpsRouter.get('/nimbuspost/webhook', adminOnly, async (req, res) => {
  if (!nimbuspostEnabled()) return res.json({ connected: false, secretSet: webhookSecretSet(), url: webhookUrl(req), reason: 'NimbusPost is not connected.' })
  const list = await listWebhooks().catch(() => null)
  const items = Array.isArray(list) ? list : (list?.items ?? [])
  const ours = items.find((item) => item.url === webhookUrl(req))
  res.json({ connected: !!ours && ours.active !== false, secretSet: webhookSecretSet(), url: webhookUrl(req), subscription: ours ?? null })
})
adminOpsRouter.post('/nimbuspost/webhook', adminOnly, async (req, res) => {
  if (!nimbuspostEnabled()) throw badRequest('NimbusPost is not connected. Add NIMBUSPOST_API_KEY and NIMBUSPOST_API_SECRET on the server.')
  if (!webhookSecretSet()) throw badRequest('Add NIMBUSPOST_WEBHOOK_SECRET (16+ random characters) on the server first, then try again.')
  const url = webhookUrl(req)
  if (/localhost|127\.0\.0\.1/.test(url)) throw badRequest('Connect this from the live admin: NimbusPost can only reach a public https address.')
  const result = await registerWebhook(url).catch((error) => {
    throw badRequest(`NimbusPost could not register the webhook: ${error.message}`)
  })
  await audit(actor(req).id, 'settings.nimbuspost_webhook', 'Setting', undefined, { url })
  res.status(201).json({ connected: true, url, subscription: { ...result, secret: undefined } })
})
adminOpsRouter.post('/orders/:id/nimbuspost/cancel', async (req, res) => {
  const id = String(req.params.id)
  const data = z.object({ reason: z.string().trim().max(300).optional() }).parse(req.body)
  // Shared with the customer's own "Cancel order": by AWB (shipment-cancel) once a courier is assigned,
  // by order id before that -- cancelling the order itself only works before a courier is booked.
  const result = await cancelProviderBooking(id, data.reason).catch((error) => {
    throw badRequest(`NimbusPost could not cancel this booking: ${error.message}`)
  })
  if (!result) throw badRequest('This order has no NimbusPost booking to cancel.')
  await audit(actor(req).id, 'order.nimbuspost.cancelled', 'Order', id, { reason: data.reason })
  res.json(result)
})
adminOpsRouter.post('/orders/nimbuspost/cancel-bulk', adminOnly, async (req, res) => {
  const data = z.object({ ids: z.array(z.string().max(60)).min(1).max(50), reason: z.string().trim().max(300).optional() }).parse(req.body)
  const shipments = await rows(from('Shipment').select('orderId, providerOrderId').in('orderId', data.ids).not('providerOrderId', 'is', null))
  if (!shipments.length) throw badRequest('None of the selected orders have a NimbusPost booking.')
  const result = await npCancelOrders(
    shipments.map((s) => s.providerOrderId),
    data.reason,
  ).catch((error) => {
    throw badRequest(`NimbusPost: ${error.message}`)
  })
  await exec(
    from('Shipment')
      .update({ providerStatus: 'cancelled' })
      .in('orderId', shipments.map((s) => s.orderId)),
  )
  await audit(actor(req).id, 'order.nimbuspost.cancelled_bulk', 'Order', undefined, { ids: data.ids, reason: data.reason })
  res.json(result)
})
adminOpsRouter.patch('/orders/:id/nimbuspost/eway-bill', async (req, res) => {
  const id = String(req.params.id)
  const data = z.object({ ewayBillNumber: z.string().regex(/^\d{12}$/, 'A 12-digit e-way bill number'), documentUrl: z.string().url().optional() }).parse(req.body)
  const [shipment, order] = await Promise.all([
    maybe(from('Shipment').select('providerOrderId').eq('orderId', id).maybeSingle()),
    maybe(from('Order').select('trackingNumber').eq('id', id).maybeSingle()),
  ])
  if (!shipment?.providerOrderId) throw badRequest('This order has no NimbusPost booking yet.')
  // Once booked (AWB exists) the e-way bill goes to the courier directly by AWB; before that it is saved on
  // the order and sent along when booked.
  await (order?.trackingNumber ? setShipmentEwayBill(order.trackingNumber, data.ewayBillNumber, data.documentUrl) : setEwayBill(shipment.providerOrderId, data.ewayBillNumber, data.documentUrl)).catch((error) => {
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
      shippingMode: z.enum(['flat', 'courier']),
      autoCreateShipments: z.boolean(),
      autoStatusFromCourier: z.boolean(),
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
