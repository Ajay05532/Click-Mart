import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { env } from '../config/env.js'
import { unauthorized } from '../utils/errors.js'
const hmac = (secret, data) => createHmac('sha256', secret).update(data).digest('hex')
const safeEqual = (a, b) => {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}
const MOCK_SECRET = `${env.JWT_REFRESH_SECRET}:mock-gateway`
const razorpayAuth = () => {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) throw new Error('Razorpay keys are missing')
  return `Basic ${Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64')}`
}
async function razorpay(path, options = {}) {
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...options,
    headers: {
      Authorization: razorpayAuth(),
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body?.error?.description || 'Razorpay could not complete that request')
  return body
}
export const paymentProvider = {
  name: env.PAYMENT_PROVIDER,
  async createOrder(code, amountRupees) {
    if (env.PAYMENT_PROVIDER === 'razorpay') {
      const body = await razorpay('/orders', {
        method: 'POST',
        body: JSON.stringify({
          amount: amountRupees * 100,
          currency: 'INR',
          receipt: code,
        }),
      })
      return {
        providerOrderId: body.id,
        keyId: env.RAZORPAY_KEY_ID,
      }
    }
    return {
      providerOrderId: `mock_order_${randomBytes(8).toString('hex')}`,
    }
  },
  verifyPayment(providerOrderId, providerPaymentId, signature) {
    const secret = env.PAYMENT_PROVIDER === 'razorpay' ? env.RAZORPAY_KEY_SECRET : MOCK_SECRET
    if (!secret) return false
    return safeEqual(hmac(secret, `${providerOrderId}|${providerPaymentId}`), signature)
  },
  /** After the Checkout signature matches, confirm Razorpay captured this exact amount. */
  async assertCaptured(providerOrderId, providerPaymentId, amountRupees) {
    if (env.PAYMENT_PROVIDER !== 'razorpay') return
    if (!/^order_[A-Za-z0-9]+$/.test(providerOrderId) || !/^pay_[A-Za-z0-9]+$/.test(providerPaymentId)) {
      throw unauthorized('Payment was not completed')
    }
    let payment = await razorpay(`/payments/${providerPaymentId}`)
    const expected = amountRupees * 100
    if (payment.order_id !== providerOrderId || payment.amount !== expected || payment.currency !== 'INR') {
      throw unauthorized('Payment does not match this order')
    }
    if (payment.status === 'authorized') {
      payment = await razorpay(`/payments/${providerPaymentId}/capture`, {
        method: 'POST',
        body: JSON.stringify({ amount: expected, currency: 'INR' }),
      })
    }
    if (payment.status !== 'captured') throw unauthorized('Payment was not completed')
  },
  mockGatewayPay(providerOrderId) {
    const providerPaymentId = `mock_pay_${randomBytes(8).toString('hex')}`
    return {
      providerPaymentId,
      signature: hmac(MOCK_SECRET, `${providerOrderId}|${providerPaymentId}`),
    }
  },
  verifyWebhook(rawBody, signature) {
    if (!signature) return false
    const secret = env.PAYMENT_PROVIDER === 'razorpay' ? env.PAYMENT_WEBHOOK_SECRET : env.PAYMENT_WEBHOOK_SECRET
    return safeEqual(hmac(secret, rawBody), signature)
  },
  signWebhookBody(body) {
    return hmac(env.PAYMENT_WEBHOOK_SECRET, body)
  },
  async refund(providerPaymentId, amountRupees) {
    if (env.PAYMENT_PROVIDER === 'razorpay') {
      return razorpay(`/payments/${providerPaymentId}/refund`, {
        method: 'POST',
        body: JSON.stringify({
          amount: amountRupees * 100,
        }),
      })
    }
    return {
      id: `mock_refund_${randomBytes(6).toString('hex')}`,
    }
  },
}
