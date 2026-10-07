import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { env } from './env.js'

export type ProviderOrder = { providerOrderId: string; keyId?: string }

const hmac = (secret: string, data: string | Buffer) => createHmac('sha256', secret).update(data).digest('hex')
const safeEqual = (a: string, b: string) => {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

const MOCK_SECRET = `${env.JWT_REFRESH_SECRET}:mock-gateway`

export const paymentProvider = {
  name: env.PAYMENT_PROVIDER,

  async createOrder(code: string, amountRupees: number): Promise<ProviderOrder> {
    if (env.PAYMENT_PROVIDER === 'razorpay') {
      const response = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64')}`,
        },
        body: JSON.stringify({ amount: amountRupees * 100, currency: 'INR', receipt: code }),
      })
      if (!response.ok) throw new Error(`Razorpay order failed: ${response.status} ${await response.text()}`)
      const body = (await response.json()) as { id: string }
      return { providerOrderId: body.id, keyId: env.RAZORPAY_KEY_ID }
    }
    return { providerOrderId: `mock_order_${randomBytes(8).toString('hex')}` }
  },

  /** Checkout signature check (client calls this after the gateway returns). */
  verifyPayment(providerOrderId: string, providerPaymentId: string, signature: string) {
    const secret = env.PAYMENT_PROVIDER === 'razorpay' ? env.RAZORPAY_KEY_SECRET! : MOCK_SECRET
    return safeEqual(hmac(secret, `${providerOrderId}|${providerPaymentId}`), signature)
  },

  /** Stand-in for the hosted gateway page. Only available with the mock provider. */
  mockGatewayPay(providerOrderId: string) {
    const providerPaymentId = `mock_pay_${randomBytes(8).toString('hex')}`
    return { providerPaymentId, signature: hmac(MOCK_SECRET, `${providerOrderId}|${providerPaymentId}`) }
  },

  verifyWebhook(rawBody: Buffer, signature: string | undefined) {
    if (!signature) return false
    const secret = env.PAYMENT_PROVIDER === 'razorpay' ? env.PAYMENT_WEBHOOK_SECRET : env.PAYMENT_WEBHOOK_SECRET
    return safeEqual(hmac(secret, rawBody), signature)
  },

  signWebhookBody(body: string) {
    return hmac(env.PAYMENT_WEBHOOK_SECRET, body)
  },

  async refund(providerPaymentId: string, amountRupees: number) {
    if (env.PAYMENT_PROVIDER === 'razorpay') {
      const response = await fetch(`https://api.razorpay.com/v1/payments/${providerPaymentId}/refund`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64')}`,
        },
        body: JSON.stringify({ amount: amountRupees * 100 }),
      })
      if (!response.ok) throw new Error(`Razorpay refund failed: ${response.status} ${await response.text()}`)
      return (await response.json()) as { id: string }
    }
    return { id: `mock_refund_${randomBytes(6).toString('hex')}` }
  },
}
