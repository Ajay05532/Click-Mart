import './setup.js'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { describe, it } from 'node:test'
import { checkDelivery, isBlocked, rupeesFromPaise, weightSlab } from '../src/services/delivery.js'
import { isBooked, isCancelled, noteFor, orderStatusForCourier, returnArrived, storedStatus } from '../src/services/courierStatus.js'
import { verifyWebhookSignature } from '../src/services/nimbuspost.js'

const settings = { nonServiceablePincodes: ['110001'], nonServiceableStates: ['Lakshadweep'], pickupPincode: '804453' }

describe('delivery rules', () => {
  it('rounds weight up to 500 g slabs', () => {
    assert.equal(weightSlab(0), 500)
    assert.equal(weightSlab(250), 500)
    assert.equal(weightSlab(501), 1000)
    assert.equal(weightSlab(1500), 1500)
  })
  it('rounds courier rates up to whole rupees', () => {
    assert.equal(rupeesFromPaise(5900), 59)
    assert.equal(rupeesFromPaise(5901), 60)
  })
  it('applies the block-list by PIN and by state, ignoring case', () => {
    assert.equal(isBlocked(settings, '110001', 'Delhi'), true)
    assert.equal(isBlocked(settings, '682555', ' lakshadweep '), true)
    assert.equal(isBlocked(settings, '560001', 'Karnataka'), false)
  })
  it('refuses a blocked PIN even without NimbusPost', async () => {
    const result = await checkDelivery(settings, { pin: '110001', state: 'Delhi' })
    assert.equal(result.deliverable, false)
    assert.equal(result.codAvailable, false)
  })
  it('falls back to deliverable with no courier price when NimbusPost is not connected', async () => {
    const result = await checkDelivery(settings, { pin: '560001', state: 'Karnataka', paymentMode: 'cod' })
    assert.deepEqual(result, { deliverable: true, reason: null, codAvailable: true, courierCharge: null, etaDays: null, checked: false })
  })
})

describe('courier status', () => {
  it('moves orders forward from webhook and API spellings', () => {
    assert.equal(orderStatusForCourier('pickup completed'), 'SHIPPED')
    assert.equal(orderStatusForCourier('in_transit'), 'SHIPPED')
    assert.equal(orderStatusForCourier('Out For Delivery'), 'OUT_FOR_DELIVERY')
    assert.equal(orderStatusForCourier('delivered'), 'DELIVERED')
    assert.equal(orderStatusForCourier('rto delivered'), 'RETURNED')
  })
  it('leaves the order alone for statuses that are not a delivery step', () => {
    for (const status of ['booked', 'pickup_scheduled', 'ndr', 'exception', 'rto initiated', 'cancelled', '', undefined]) {
      assert.equal(orderStatusForCourier(status), null, String(status))
    }
  })
  it('recognises returns, bookings and cancellations', () => {
    assert.equal(returnArrived('delivered'), true)
    assert.equal(returnArrived('in transit'), false)
    assert.equal(isBooked('Booked'), true)
    assert.equal(isCancelled('cancelled'), true)
    assert.equal(storedStatus('out for delivery'), 'out_for_delivery')
    assert.match(noteFor('SHIPPED', 'Delhivery'), /Delhivery/)
  })
})

describe('NimbusPost webhook signature', () => {
  const body = Buffer.from('{"order_id":"abc","status":"delivered"}')
  const sign = (secret) => `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
  it('accepts the right signature', () => {
    assert.equal(verifyWebhookSignature(body, sign(process.env.NIMBUSPOST_WEBHOOK_SECRET)), true)
  })
  it('rejects a wrong, missing or tampered signature', () => {
    assert.equal(verifyWebhookSignature(body, sign('some-other-secret-000000')), false)
    assert.equal(verifyWebhookSignature(body, undefined), false)
    assert.equal(verifyWebhookSignature(Buffer.from('{"order_id":"abc","status":"rto delivered"}'), sign(process.env.NIMBUSPOST_WEBHOOK_SECRET)), false)
  })
})
