import { Router } from 'express'
import { z } from 'zod'
import { from, rows } from '../../database/db.js'
import { ORDER_SELECT } from '../../database/selects.js'
import { PRINT_KINDS, renderers } from '../../services/printables.js'
import { getSettings } from '../../services/settings.js'
import { badRequest, notFound } from '../../utils/errors.js'

export const adminPrintRouter = Router()

const MAX_ORDERS = 60

/** /admin/print/packing-slips?ids=a,b,c  (also pick-list and labels). Returns a page ready to print. */
adminPrintRouter.get('/print/:kind', async (req, res) => {
  const kind = z.enum(PRINT_KINDS).safeParse(req.params.kind)
  if (!kind.success) throw notFound('Document')
  const ids = [
    ...new Set(
      String(req.query.ids ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ]
  if (!ids.length) throw badRequest('Choose at least one order')
  if (ids.length > MAX_ORDERS) throw badRequest(`Print up to ${MAX_ORDERS} orders at a time`)
  const [orders, store] = await Promise.all([rows(from('Order').select(ORDER_SELECT).in('id', ids)), getSettings()])
  if (!orders.length) throw notFound('Orders')
  orders.sort((a, b) => a.number - b.number)
  res.type('html').set('Cache-Control', 'no-store').send(renderers[kind.data](orders, store))
})
