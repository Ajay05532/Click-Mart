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

export async function payWithRazorpay(input: { keyId: string; orderId: string; amount: number; customer: { name: string; email: string; phone: string } }) {
  await loadScript()
  return new Promise<{ providerPaymentId: string; signature: string }>((resolve, reject) => {
    const checkout = new window.Razorpay!({
      key: input.keyId,
      order_id: input.orderId,
      amount: input.amount * 100,
      currency: 'INR',
      name: 'ClickMart',
      prefill: { name: input.customer.name, email: input.customer.email, contact: input.customer.phone },
      theme: { color: '#123a86' },
      handler: (response: { razorpay_payment_id: string; razorpay_signature: string }) => resolve({ providerPaymentId: response.razorpay_payment_id, signature: response.razorpay_signature }),
      modal: { ondismiss: () => reject(new Error('Payment was cancelled. You have not been charged.')) },
    })
    checkout.on('payment.failed', (response) => reject(new Error(response.error?.description ?? 'The payment failed. Please try again.')))
    checkout.open()
  })
}
