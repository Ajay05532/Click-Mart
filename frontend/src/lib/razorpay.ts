// Razorpay Checkout (hosted payment window). Only used when the backend runs with PAYMENT_PROVIDER=razorpay.
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (event: string, handler: (response: { error?: { description?: string } }) => void) => void }
  }
}

function loadScript() {
  return new Promise<void>((resolve, reject) => {
    if (window.Razorpay) return resolve()
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Could not load the payment window. Check your connection and try again.'))
    document.head.appendChild(script)
  })
}

/** `method` opens the window on that option first (the shopper can still switch inside Razorpay). */
export async function payWithRazorpay(input: { keyId: string; orderId: string; amount: number; method?: 'upi' | 'card' | 'netbanking'; customer: { name: string; email: string; phone: string } }) {
  await loadScript()
  return new Promise<{ providerPaymentId: string; signature: string }>((resolve, reject) => {
    // A failed attempt leaves Razorpay's window open with "Retry", so it only counts once the shopper closes the window.
    let lastFailure = ''
    const checkout = new window.Razorpay!({
      key: input.keyId,
      order_id: input.orderId,
      amount: input.amount * 100,
      currency: 'INR',
      name: 'ClickMart',
      prefill: { name: input.customer.name, email: input.customer.email, contact: input.customer.phone, ...(input.method ? { method: input.method } : {}) },
      theme: { color: '#123a86' },
      handler: (response: { razorpay_payment_id: string; razorpay_signature: string }) => resolve({ providerPaymentId: response.razorpay_payment_id, signature: response.razorpay_signature }),
      modal: {
        ondismiss: () => reject(new Error(lastFailure ? `${lastFailure} You have not been charged.` : 'Payment was cancelled. You have not been charged.')),
      },
    })
    checkout.on('payment.failed', (response) => {
      lastFailure = response.error?.description ?? 'The payment failed.'
    })
    checkout.open()
  })
}
