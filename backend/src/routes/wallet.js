import { Router } from 'express'
import { z } from 'zod'
import { exec, from, maybe, one, rows, rpc } from '../database/db.js'
import { notFound } from '../utils/errors.js'
import { orderCode } from '../utils/serializers.js'
import { actor } from '../middleware/auth.js'
export const walletRouter = Router()
export const upiIdSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{2,}@[a-z]{2,}$/, 'Enter a valid UPI ID, e.g. name@okhdfcbank')
const cardSchema = z.object({
  kind: z.literal('CARD'),
  cardBrand: z.string().trim().min(2).max(20),
  last4: z.string().regex(/^\d{4}$/, 'Last 4 digits only'),
  expMonth: z.number().int().min(1).max(12),
  expYear: z
    .number()
    .int()
    .min(new Date().getFullYear())
    .max(new Date().getFullYear() + 25),
  holderName: z.string().trim().min(2).max(80),
  nickname: z.string().trim().max(40).nullish(),
  isDefault: z.boolean().default(false),
})
const upiSchema = z.object({
  kind: z.literal('UPI'),
  upiId: upiIdSchema,
  nickname: z.string().trim().max(40).nullish(),
  isDefault: z.boolean().default(false),
})
const savedSchema = z.discriminatedUnion('kind', [cardSchema, upiSchema])
const SAVED_COLUMNS = 'id, kind, upiId, cardBrand, last4, expMonth, expYear, holderName, nickname, isDefault, createdAt'
export const describeSaved = (row) => (row.kind === 'UPI' ? `UPI · ${row.upiId}` : `${row.cardBrand} •••• ${row.last4}`)
walletRouter.get('/payment-methods', async (req, res) => {
  const items = await rows(
    from('SavedPayment')
      .select(SAVED_COLUMNS)
      .eq('userId', actor(req).id)
      .order('isDefault', {
        ascending: false,
      })
      .order('createdAt', {
        ascending: false,
      }),
  )
  res.json({
    items,
  })
})
walletRouter.post('/payment-methods', async (req, res) => {
  const data = savedSchema.parse(req.body)
  const userId = actor(req).id
  const { isDefault, ...fields } = data
  const query = from('SavedPayment').select(SAVED_COLUMNS).eq('userId', userId).eq('kind', data.kind)
  const existing = await maybe(
    data.kind === 'UPI'
      ? query.ilike('upiId', data.upiId).maybeSingle()
      : query.eq('cardBrand', data.cardBrand).eq('last4', data.last4).eq('expMonth', data.expMonth).eq('expYear', data.expYear).maybeSingle(),
  )
  let id = existing?.id
  if (!id) {
    const hasAny = await maybe(from('SavedPayment').select('id').eq('userId', userId).limit(1).maybeSingle())
    const created = await one(
      from('SavedPayment')
        .insert({
          ...fields,
          userId,
          isDefault: false,
        })
        .select('id')
        .single(),
    )
    id = created.id
    if (!hasAny)
      await rpc('set_default_payment', {
        p_user: userId,
        p_id: id,
      })
  }
  if (isDefault)
    await rpc('set_default_payment', {
      p_user: userId,
      p_id: id,
    })
  res.status(existing ? 200 : 201).json(await one(from('SavedPayment').select(SAVED_COLUMNS).eq('id', id).single()))
})
walletRouter.patch('/payment-methods/:id', async (req, res) => {
  const data = z
    .object({
      nickname: z.string().trim().max(40).nullable().optional(),
      isDefault: z.boolean().optional(),
    })
    .parse(req.body)
  const userId = actor(req).id
  const id = String(req.params.id)
  if (data.nickname !== undefined) {
    const updated = await rows(
      from('SavedPayment')
        .update({
          nickname: data.nickname || null,
        })
        .eq('id', id)
        .eq('userId', userId)
        .select('id'),
    )
    if (updated.length === 0) throw notFound('Payment method')
  }
  if (data.isDefault)
    await rpc('set_default_payment', {
      p_user: userId,
      p_id: id,
    })
  const row = await maybe(from('SavedPayment').select(SAVED_COLUMNS).eq('id', id).eq('userId', userId).maybeSingle())
  if (!row) throw notFound('Payment method')
  res.json(row)
})
walletRouter.delete('/payment-methods/:id', async (req, res) => {
  const userId = actor(req).id
  const deleted = await rows(from('SavedPayment').delete().eq('id', String(req.params.id)).eq('userId', userId).select('isDefault'))
  if (deleted.length === 0) throw notFound('Payment method')
  if (deleted[0].isDefault) {
    const next = await maybe(
      from('SavedPayment')
        .select('id')
        .eq('userId', userId)
        .order('createdAt', {
          ascending: false,
        })
        .limit(1)
        .maybeSingle(),
    )
    if (next)
      await rpc('set_default_payment', {
        p_user: userId,
        p_id: next.id,
      })
  }
  res.status(204).end()
})
walletRouter.get('/payments', async (req, res) => {
  const userId = actor(req).id
  const limit = Math.min(Number(req.query.limit) || 50, 100)
  const orders = await rows(
    from('Order')
      .select('id, number, status')
      .eq('userId', userId)
      .order('createdAt', {
        ascending: false,
      })
      .limit(200),
  )
  const byId = new Map(orders.map((order) => [order.id, order]))
  const payments = orders.length
    ? await rows(
        from('Payment')
          .select('id, orderId, providerPaymentId, amount, status, method, detail, failureReason, paidAt, createdAt, refunds:Refund(id, amount, status, reason, createdAt)')
          .in('orderId', [...byId.keys()])
          .order('createdAt', {
            ascending: false,
          })
          .limit(limit),
      )
    : []
  res.json({
    items: payments.map((payment) => {
      const order = byId.get(payment.orderId)
      return {
        id: payment.id,
        orderCode: orderCode(order.number),
        orderStatus: order.status,
        amount: payment.amount,
        status: payment.status,
        method: payment.method,
        detail: payment.detail ?? (payment.method === 'COD' ? 'Cash on delivery' : String(payment.method)),
        reference: payment.providerPaymentId ?? null,
        failureReason: payment.failureReason ?? null,
        paidAt: payment.paidAt ?? null,
        createdAt: payment.createdAt,
        refunds: payment.refunds,
      }
    }),
  })
})
