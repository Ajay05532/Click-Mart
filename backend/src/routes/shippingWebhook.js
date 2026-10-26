import { createHash } from 'node:crypto'
import { HttpError, unauthorized } from '../utils/errors.js'
import { exec, from, maybe, one } from '../database/db.js'
import { changeStatus } from '../services/orders.js'
import { getSettings } from '../services/settings.js'
import { verifyWebhookSignature } from '../services/nimbuspost.js'
import { isBooked, isCancelled, noteFor, orderStatusForCourier, returnArrived, storedStatus } from '../services/courierStatus.js'

/**
 * POST /api/v1/shipping/webhook — NimbusPost's signed order.updated / tracking.updated events.
 * Mounted with a raw body (before express.json) because the signature covers the exact bytes.
 * Every event is logged in payment."WebhookEvent" (provider 'nimbuspost'); a repeat delivery id is skipped.
 */
export async function shippingWebhook(req, res) {
  const raw = req.body
  if (!Buffer.isBuffer(raw) || !verifyWebhookSignature(raw, req.header('x-nimbus-signature'))) throw unauthorized('Invalid webhook signature')
  let event
  try {
    event = JSON.parse(raw.toString('utf8'))
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' })
  }
  const eventType = req.header('x-nimbus-event') ?? 'unknown'
  const eventId = req.header('x-nimbus-delivery') ?? createHash('sha256').update(raw).digest('hex')

  let logId
  try {
    logId = (
      await one(
        from('WebhookEvent')
          .insert({ provider: 'nimbuspost', eventId, eventType, providerOrderId: event.order_id || null, providerPaymentId: event.awb_number || null, payload: event })
          .select('id')
          .single(),
      )
    ).id
  } catch (error) {
    if (!(error instanceof HttpError) || error.status !== 409) throw error
    const existing = await one(from('WebhookEvent').select('id, status').eq('provider', 'nimbuspost').eq('eventId', eventId).single())
    if (existing.status === 'PROCESSED' || existing.status === 'IGNORED') return res.json({ received: true, duplicate: true })
    logId = existing.id
  }

  try {
    const handled = await applyCourierEvent(event)
    await exec(from('WebhookEvent').update({ status: handled ? 'PROCESSED' : 'IGNORED', error: null, processedAt: new Date().toISOString() }).eq('id', logId))
  } catch (error) {
    await exec(
      from('WebhookEvent')
        .update({ status: 'FAILED', error: error instanceof Error ? error.message.slice(0, 500) : 'Unknown error' })
        .eq('id', logId),
    ).catch(() => undefined)
    throw error
  }
  res.json({ received: true })
}

/** Applies one event. Returns false when it is not about one of our shipments. */
async function applyCourierEvent(event) {
  const providerOrderId = String(event.order_id ?? '')
  if (!providerOrderId) return false
  const status = String(event.status ?? '')
  const awb = String(event.awb_number ?? '') || null
  const courier = String(event.courier_name ?? '') || null

  const forward = await maybe(from('Shipment').select('orderId, providerStatus').eq('providerOrderId', providerOrderId).maybeSingle())
  if (forward) {
    await exec(from('Shipment').update({ providerStatus: storedStatus(status), updatedAt: new Date().toISOString() }).eq('orderId', forward.orderId))
    const order = await maybe(from('Order').select('id, status, carrier, trackingNumber').eq('id', forward.orderId).maybeSingle())
    if (!order) return true
    // Booked from NimbusPost's own dashboard too: keep our carrier and AWB in step.
    if (awb && !isCancelled(status) && (order.trackingNumber !== awb || (courier && order.carrier !== courier))) {
      await exec(from('Order').update({ trackingNumber: awb, ...(courier ? { carrier: courier } : {}) }).eq('id', order.id))
    }
    if (isBooked(status) || isCancelled(status)) return true
    const to = orderStatusForCourier(status)
    if (!to || to === order.status) return true
    const settings = await getSettings()
    if (settings.autoStatusFromCourier === false) return true
    await changeStatus(order.id, to, { note: noteFor(to, courier ?? order.carrier), carrier: courier ?? undefined, trackingNumber: awb ?? undefined }).catch((error) => {
      // Behind already (e.g. staff marked it delivered by hand) or a move our rules do not allow: nothing to do.
      if (!(error instanceof HttpError)) throw error
    })
    return true
  }

  const back = await maybe(from('Shipment').select('orderId').eq('returnProviderOrderId', providerOrderId).maybeSingle())
  if (back) {
    await exec(
      from('Shipment')
        .update({ returnStatus: storedStatus(status), ...(awb && !isCancelled(status) ? { returnAwb: awb } : {}), ...(courier ? { returnCourier: courier } : {}), updatedAt: new Date().toISOString() })
        .eq('orderId', back.orderId),
    )
    if (returnArrived(status)) {
      await changeStatus(back.orderId, 'RETURNED', { note: 'Return received at our warehouse' }).catch((error) => {
        if (!(error instanceof HttpError)) throw error
      })
    }
    return true
  }
  return false
}
