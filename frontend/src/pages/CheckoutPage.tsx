import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { OrderSummary } from '../components/cart/OrderSummary.tsx'
import { BankIcon, CardIcon, CartIcon, CashIcon, ChevronIcon, LockIcon, PinIcon, QrIcon, ShieldIcon } from '../components/icons.tsx'
import { Container } from '../components/layout/Container.tsx'
import { Breadcrumbs } from '../components/ui/Breadcrumbs.tsx'
import { EmptyState, Stepper } from '../components/ui/Primitives.tsx'
import { useAuth } from '../context/AuthContext.tsx'
import { useCart } from '../context/CartContext.tsx'
import { useDeliveryLocation } from '../context/LocationContext.tsx'
import { indianStates } from '../data/india.ts'
import { formatPrice } from '../lib/money.ts'
import { ApiError, api, errorMessage } from '../lib/api.ts'
import { useStoreSettings } from '../lib/catalog.ts'
import type { ApiOrder } from '../lib/orders.ts'
import { payWithRazorpay } from '../lib/razorpay.ts'
import { useDocumentTitle } from '../lib/useDocumentTitle.ts'
import {
  addressLabels,
  cardBrand,
  formatCard,
  formatExpiry,
  isExpired,
  luhnValid,
  parseExpiry,
  savedCardBody,
  savedPaymentSub,
  savedPaymentTitle,
  stripNonDigits,
  upiIdValid,
  useSavedAddresses,
  useSavedPayments,
} from '../lib/wallet.ts'

type Payment = 'upi' | 'card' | 'netbanking' | 'cod'
type Errors = Record<string, string>

const apiMethod: Record<Payment, 'UPI' | 'CARD' | 'NETBANKING' | 'COD'> = { upi: 'UPI', card: 'CARD', netbanking: 'NETBANKING', cod: 'COD' }

const methods: { id: Payment; label: string; hint: string; icon: typeof CardIcon }[] = [
  { id: 'upi', label: 'UPI', hint: 'GPay, PhonePe, Paytm', icon: QrIcon },
  { id: 'card', label: 'Card', hint: 'Credit or debit', icon: CardIcon },
  { id: 'netbanking', label: 'Net banking', hint: 'All major banks', icon: BankIcon },
  { id: 'cod', label: 'Cash on delivery', hint: 'Pay when it arrives', icon: CashIcon },
]

const upiApps = ['Google Pay', 'PhonePe', 'Paytm', 'BHIM']
const banks = ['HDFC Bank', 'ICICI Bank', 'SBI', 'Axis Bank', 'Kotak', 'Yes Bank', 'PNB', 'Bank of Baroda']
const ADDRESS_KEY = 'clickmart-address'

const matchState = (name: string | null | undefined, fallback: string) => {
  if (!name?.trim()) return fallback
  const lower = name.trim().toLowerCase()
  return (
    indianStates.find((state) => state.toLowerCase() === lower) ??
    indianStates.find((state) => lower.includes(state.toLowerCase()) || state.toLowerCase().includes(lower)) ??
    fallback
  )
}

function loadAddress() {
  try {
    return JSON.parse(localStorage.getItem(ADDRESS_KEY) ?? 'null') as Record<string, string> | null
  } catch {
    return null
  }
}

export function CheckoutPage() {
  useDocumentTitle('Checkout', { noindex: true })
  const { user } = useAuth()
  const cart = useCart()
  const { location: delivery } = useDeliveryLocation()
  const navigate = useNavigate()
  const [saved] = useState(loadAddress)
  const [step, setStep] = useState(0)
  const [form, setForm] = useState(() => {
    const complete = (saved?.address ?? '').trim().length >= 8
    return {
      name: saved?.name || user?.name || '',
      email: saved?.email || user?.email || '',
      phone: (saved?.phone || user?.phone || '').replace(/\D/g, '').slice(-10),
      pin: complete ? saved?.pin ?? '' : delivery?.pin || saved?.pin || '',
      address: complete ? saved?.address ?? '' : '',
      city: complete ? saved?.city ?? '' : delivery?.city || saved?.city || '',
      state: complete ? saved?.state || 'Karnataka' : matchState(delivery?.state, saved?.state || 'Karnataka'),
    }
  })
  const [payment, setPayment] = useState<Payment>('upi')
  const [upiId, setUpiId] = useState('')
  const [upiApp, setUpiApp] = useState('')
  const [card, setCard] = useState({ number: '', name: '', expiry: '', cvv: '' })
  const [bank, setBank] = useState('')
  const [savedId, setSavedId] = useState<{ UPI: string; CARD: string }>({ UPI: '', CARD: '' })
  const [saveMethod, setSaveMethod] = useState(true)
  const [saveAddress, setSaveAddress] = useState(true)
  const [addressId, setAddressId] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [processing, setProcessing] = useState(false)
  const [failed, setFailed] = useState('')
  const [placed, setPlaced] = useState(false)
  const settings = useStoreSettings()

  // Logged-in customers: start from their default saved address (once, and only into an empty form).
  const queryClient = useQueryClient()
  const addresses = useSavedAddresses(user?.id)
  const savedPayments = useSavedPayments(user?.id)
  const [prefilled, setPrefilled] = useState(false)
  const chooseAddress = (item: NonNullable<typeof addresses.data>[number]) => {
    setAddressId(item.id)
    setErrors({})
    setForm((current) => ({ ...current, email: current.email || user?.email || '', name: item.name, phone: item.phone, address: item.line, city: item.city, state: item.state, pin: item.pin }))
  }
  useEffect(() => {
    const chosen = addresses.data?.find((item) => item.isDefault) ?? addresses.data?.[0]
    if (prefilled || !chosen) return
    setPrefilled(true)
    chooseAddress(chosen)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addresses.data, prefilled])

  // Pre-select the default saved UPI ID / card once they load.
  useEffect(() => {
    const list = savedPayments.data ?? []
    setSavedId((current) => ({
      UPI: current.UPI || list.find((item) => item.kind === 'UPI' && item.isDefault)?.id || list.find((item) => item.kind === 'UPI')?.id || '',
      CARD: current.CARD || list.find((item) => item.kind === 'CARD' && !isExpired(item) && item.isDefault)?.id || list.find((item) => item.kind === 'CARD' && !isExpired(item))?.id || '',
    }))
  }, [savedPayments.data])
  const savedList = (savedPayments.data ?? []).filter((item) => item.kind === (payment === 'card' ? 'CARD' : 'UPI'))
  const selectedSaved = payment === 'upi' || payment === 'card' ? savedList.find((item) => item.id === savedId[payment === 'card' ? 'CARD' : 'UPI']) : undefined

  const set = (key: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: '' }))
  }

  const validateDetails = () => {
    const next: Errors = {}
    if (form.name.trim().length < 2) next.name = 'Enter your full name'
    if (!/^\S+@\S+\.\S+$/.test(form.email)) next.email = 'Enter a valid email for your receipt'
    if (!/^[6-9]\d{9}$/.test(form.phone)) next.phone = 'Enter a valid 10-digit mobile number'
    if (!/^\d{6}$/.test(form.pin)) next.pin = 'Enter a 6-digit PIN code'
    if (form.address.trim().length < 8) next.address = 'Enter house no., street and area'
    if (form.city.trim().length < 2) next.city = 'Enter your city'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const razorpay = settings.paymentProvider === 'razorpay'
  const validatePayment = () => {
    const next: Errors = {}
    if (razorpay && payment !== 'cod') {
      setErrors({})
      return true
    }
    if (payment === 'upi' && !selectedSaved && !upiIdValid(upiId)) next.upi = 'Enter a valid UPI ID, e.g. name@okhdfc'
    if (payment === 'card') {
      if (selectedSaved) {
        if (!/^\d{3,4}$/.test(card.cvv)) next.cvv = 'Enter the CVV to pay with this card'
      } else {
        const digits = stripNonDigits(card.number)
        if (!luhnValid(digits)) next.number = 'Enter a valid card number'
        if (card.name.trim().length < 2) next.cardName = 'Enter the name on the card'
        if (!parseExpiry(card.expiry)) next.expiry = 'Enter a valid expiry'
        if (!/^\d{3,4}$/.test(card.cvv)) next.cvv = 'Enter CVV'
      }
    }
    if (payment === 'netbanking' && !bank) next.bank = 'Choose your bank'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const continueToPayment = (event: FormEvent) => {
    event.preventDefault()
    if (!validateDetails()) return
    localStorage.setItem(ADDRESS_KEY, JSON.stringify(form))
    setStep(1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const placeOrder = async () => {
    if (!validatePayment() || cart.count === 0 || processing) return
    setFailed('')
    setProcessing(true)
    const digits = selectedSaved ? (selectedSaved.last4 ?? '') : stripNonDigits(card.number)
    let providerOrderId: string | null = null
    try {
      const result = await api<{ order: ApiOrder; payment: { provider: 'mock' | 'razorpay'; providerOrderId: string; keyId?: string; amount: number } | null }>('/checkout', {
        body: {
          items: cart.items.map((line) => ({ variantId: line.variantId, quantity: line.quantity })),
          couponCode: cart.coupon?.code ?? null,
          paymentMethod: apiMethod[payment],
          // Display details only. The card number and CVV never leave this browser.
          paymentDetail: razorpay
            ? undefined
            : payment === 'upi' ? (selectedSaved ? { savedPaymentId: selectedSaved.id } : { upiId: upiId.trim() })
            : payment === 'card' ? (selectedSaved ? { savedPaymentId: selectedSaved.id } : { cardBrand: cardBrand(digits) || 'Card', cardLast4: digits.slice(-4) })
            : payment === 'netbanking' ? { bank }
            : undefined,
          customer: { name: form.name.trim(), email: form.email.trim(), phone: form.phone },
          address: { line: form.address.trim(), city: form.city.trim(), state: form.state, pin: form.pin },
        },
      })
      let order = result.order
      if (result.payment) {
        providerOrderId = result.payment.providerOrderId
        const started = Date.now()
        let paid: { providerPaymentId: string; signature: string }
        if (result.payment.provider === 'razorpay') {
          setProcessing(false)
          paid = await payWithRazorpay({ keyId: result.payment.keyId!, orderId: providerOrderId, amount: result.payment.amount, customer: { name: form.name.trim(), email: form.email.trim(), phone: form.phone } })
          setProcessing(true)
        } else {
          // Development gateway. A card ending 0002 is declined so the failure path can be seen.
          const outcome = (payment === 'card' && digits.endsWith('0002')) || (payment === 'upi' && upiId.trim().toLowerCase().startsWith('fail@')) ? 'failure' : 'success'
          paid = await api<{ providerPaymentId: string; signature: string }>('/payments/mock/pay', { body: { providerOrderId, outcome } })
        }
        // Keep the "processing" moment long enough to read, like a real bank page.
        await new Promise((resolve) => window.setTimeout(resolve, Math.max(0, 1800 - (Date.now() - started))))
        order = (await api<{ order: ApiOrder }>('/payments/verify', { body: { providerOrderId, ...paid } })).order
      }
      setPlaced(true)
      cart.clear()
      if (user && (!addresses.data?.length || (!addressId && saveAddress))) {
        // First order, or the shopper asked to keep a new address.
        api('/me/addresses', { body: { name: form.name.trim(), phone: form.phone, line: form.address.trim(), city: form.city.trim(), state: form.state, pin: form.pin, isDefault: !addresses.data?.length } })
          .then(() => queryClient.invalidateQueries({ queryKey: ['addresses'] }))
          .catch(() => undefined)
      }
      if (user && saveMethod && !selectedSaved && result.payment && !razorpay) {
        const body =
          payment === 'upi' ? { kind: 'UPI', upiId: upiId.trim() }
          : payment === 'card' ? savedCardBody(card)
          : null
        if (body) {
          api('/me/payment-methods', { body })
            .then(() => queryClient.invalidateQueries({ queryKey: ['payment-methods'] }))
            .catch(() => undefined)
        }
      }
      navigate(`/order/${order.code}`, { replace: true, state: { order } })
    } catch (error) {
      if (providerOrderId && !(error instanceof ApiError && error.status === 402)) {
        // The shopper closed the payment window or it errored: release the held stock right away.
        api('/payments/fail', { body: { providerOrderId, reason: errorMessage(error) } }).catch(() => undefined)
      }
      setFailed(
        error instanceof ApiError && error.status === 402
          ? 'Your bank declined this payment. Try another card or a different payment method.'
          : errorMessage(error),
      )
    } finally {
      setProcessing(false)
    }
  }

  if (cart.count === 0 && !placed) {
    return (
      <Container className="py-16">
        <EmptyState
          icon={<CartIcon className="size-9" />}
          title="Nothing to check out"
          text="Add a few pouches to your cart first, then come back here to complete your order."
          action={{ to: '/shop', label: 'Browse dry fruits' }}
        />
      </Container>
    )
  }

  if (cart.lines.length === 0 && !placed) {
    return (
      <Container className="grid min-h-60 place-items-center py-16 text-center">
        {cart.quoteError ? (
          <div>
            <p className="font-semibold text-rose-600">{cart.quoteError}</p>
            <button type="button" onClick={cart.reloadQuote} className="btn btn-accent mt-4">
              Try again
            </button>
          </div>
        ) : (
          <span className="motion-spin block size-10 rounded-full border-4 border-brand-soft border-t-brand" role="status" aria-label="Loading your cart" />
        )}
      </Container>
    )
  }

  const SavedPicker = ({ kind }: { kind: 'UPI' | 'CARD' }) => {
    const items = (savedPayments.data ?? []).filter((item) => item.kind === kind)
    if (!items.length) return null
    const key = kind
    return (
      <div role="radiogroup" aria-label={kind === 'UPI' ? 'Saved UPI IDs' : 'Saved cards'} className="mt-4 space-y-2">
        <p className="text-sm font-bold">{kind === 'UPI' ? 'Your saved UPI IDs' : 'Your saved cards'}</p>
        {items.map((item) => {
          const expired = isExpired(item)
          const active = savedId[key] === item.id
          return (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={expired}
              onClick={() => { setSavedId((current) => ({ ...current, [key]: item.id })); setErrors({}) }}
              className={`flex w-full items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left text-sm transition disabled:opacity-50 ${active ? 'border-brand bg-brand-soft' : 'border-line bg-white hover:border-brand/40'}`}
            >
              <span className={`grid size-5 place-items-center rounded-full border-2 ${active ? 'border-brand bg-brand text-[10px] text-white' : 'border-line'}`}>{active ? '✓' : ''}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-extrabold">{savedPaymentTitle(item)}</span>
                <span className="block truncate text-xs text-muted">{expired ? 'Expired' : savedPaymentSub(item)}</span>
              </span>
              {item.isDefault && <span className="text-[10px] font-bold text-brand">Default</span>}
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => { setSavedId((current) => ({ ...current, [key]: '' })); setErrors({}) }}
          className={`w-full rounded-2xl border-2 border-dashed px-4 py-3 text-left text-sm font-bold transition ${!savedId[key] ? 'border-brand bg-brand-soft text-brand' : 'border-line text-muted hover:border-brand/40'}`}
        >
          + {kind === 'UPI' ? 'Use a different UPI ID' : 'Use a different card'}
        </button>
      </div>
    )
  }

  const SaveToggle = () =>
    user ? (
      <label className="mt-3 flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={saveMethod} onChange={(e) => setSaveMethod(e.target.checked)} /> Save for next time
        <span className="text-xs font-normal text-muted">{payment === 'card' ? '(last 4 digits only, never the CVV)' : ''}</span>
      </label>
    ) : null

  const payLabel = payment === 'cod' ? 'Place order' : razorpay ? `Pay ${formatPrice(cart.total)} with Razorpay` : `Pay ${formatPrice(cart.total)}`

  return (
    <div className="bg-canvas pb-28 lg:pb-0">
      <Container className="py-8 sm:py-10">
        <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Cart', to: '/cart' }, { label: 'Checkout' }]} />
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight">Checkout</h1>
        <div className="mt-6 max-w-xl">
          <Stepper steps={['Cart', 'Details', 'Payment']} current={step + 1} />
        </div>

        <div className="mt-8 grid items-start gap-6 lg:grid-cols-[1fr_380px]">
          <div>
            {step === 0 ? (
              <form id="checkout-details" onSubmit={continueToPayment} noValidate className="card motion-page p-5 sm:p-7">
                <h2 className="text-xl font-extrabold">Delivery address</h2>
                <p className="mt-1 text-sm text-muted">Choose where this order should arrive.</p>
                {delivery && (
                  <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-canvas px-3 py-1.5 text-xs font-bold">
                    <PinIcon className="size-4 text-brand" />
                    Delivering near {delivery.city ? `${delivery.city} ` : ''}{delivery.pin}
                  </p>
                )}
                {!!addresses.data?.length && (
                  <div role="radiogroup" aria-label="Saved addresses" className="mt-5 grid gap-3">
                    {addresses.data.map((item) => {
                      const active = addressId === item.id
                      return (
                        <button
                          key={item.id}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => chooseAddress(item)}
                          className={`flex gap-3 rounded-2xl border-2 p-4 text-left text-sm transition ${active ? 'border-brand bg-brand-soft' : 'border-line bg-white hover:border-brand/40'}`}
                        >
                          <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2 text-[10px] ${active ? 'border-brand bg-brand text-white' : 'border-line'}`}>{active ? '✓' : ''}</span>
                          <span className="min-w-0">
                            <span className="flex flex-wrap items-center gap-2 font-extrabold">
                              {addressLabels[item.label] ?? 'Home'}
                              {item.isDefault && <span className="rounded-md bg-white px-1.5 py-0.5 text-[10px] font-bold text-brand ring-1 ring-line">Default</span>}
                            </span>
                            <span className="mt-1 block font-semibold">{item.name} · {item.phone}</span>
                            <span className="mt-0.5 block leading-5 text-muted">{item.line}, {item.city}, {item.state} — {item.pin}</span>
                          </span>
                        </button>
                      )
                    })}
                    <button
                      type="button"
                      onClick={() => {
                        setAddressId('')
                        setErrors({})
                        setForm((current) => ({
                          ...current,
                          address: '',
                          pin: delivery?.pin || '',
                          city: delivery?.city || '',
                          state: matchState(delivery?.state, current.state),
                        }))
                      }}
                      className={`rounded-2xl border-2 border-dashed px-4 py-3 text-left text-sm font-bold transition ${!addressId ? 'border-brand bg-brand-soft text-brand' : 'border-line text-muted hover:border-brand/40'}`}
                    >
                      + Deliver to a new address
                    </button>
                  </div>
                )}
                {addressId && (
                  <Field label="Email for the receipt" error={errors.email} className="mt-5">
                    <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" className="field" aria-invalid={!!errors.email} placeholder="you@example.com" />
                  </Field>
                )}
                <div className={`mt-6 grid gap-5 sm:grid-cols-2 ${addressId ? 'hidden' : ''}`}>
                  <Field label="Full name" error={errors.name} className={`sm:col-span-2 ${addressId ? 'hidden' : ''}`}>
                    <input value={form.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" className="field" aria-invalid={!!errors.name} placeholder="As on your ID" />
                  </Field>
                  <Field label="Email" error={errors.email}>
                    <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" className="field" aria-invalid={!!errors.email} placeholder="you@example.com" />
                  </Field>
                  <Field label="Mobile number" error={errors.phone} className={addressId ? 'hidden' : ''}>
                    <div className="flex">
                      <span className="grid h-12 place-items-center rounded-l-[0.85rem] border-[1.5px] border-r-0 border-line bg-canvas px-3 text-sm font-bold text-muted">+91</span>
                      <input value={form.phone} onChange={(e) => set('phone', stripNonDigits(e.target.value).slice(0, 10))} inputMode="numeric" autoComplete="tel-national" className="field rounded-l-none!" aria-invalid={!!errors.phone} placeholder="98765 43210" />
                    </div>
                  </Field>
                  <Field label="Address" error={errors.address} className={`sm:col-span-2 ${addressId ? 'hidden' : ''}`}>
                    <textarea value={form.address} onChange={(e) => set('address', e.target.value)} autoComplete="street-address" rows={3} className="field" aria-invalid={!!errors.address} placeholder="House no., building, street, area" />
                  </Field>
                  <Field label="PIN code" error={errors.pin} className={addressId ? 'hidden' : ''}>
                    <input value={form.pin} onChange={(e) => set('pin', stripNonDigits(e.target.value).slice(0, 6))} inputMode="numeric" autoComplete="postal-code" className="field" aria-invalid={!!errors.pin} placeholder="6-digit PIN" />
                  </Field>
                  <Field label="City" error={errors.city} className={addressId ? 'hidden' : ''}>
                    <input value={form.city} onChange={(e) => set('city', e.target.value)} autoComplete="address-level2" className="field" aria-invalid={!!errors.city} placeholder="City" />
                  </Field>
                  <Field label="State" className={`sm:col-span-2 ${addressId ? 'hidden' : ''}`}>
                    <select value={form.state} onChange={(e) => set('state', e.target.value)} className="field cursor-pointer">
                      {indianStates.map((state) => (
                        <option key={state}>{state}</option>
                      ))}
                    </select>
                  </Field>
                </div>
                {user && !addressId && !!addresses.data?.length && (
                  <label className="mt-5 flex items-center gap-2 text-sm font-semibold">
                    <input type="checkbox" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} /> Save this address for next time
                  </label>
                )}
                <div className="mt-6 flex items-center gap-3 rounded-2xl bg-brand-soft p-4 text-sm">
                  <ShieldIcon className="size-6 shrink-0 text-brand" />
                  <p className="text-ink-soft">
                    <span className="font-extrabold text-brand">Standard delivery</span> in 3–5 working days. You can track every step live after ordering.
                  </p>
                </div>
                <button type="submit" className="btn btn-accent btn-lg mt-7 hidden w-full sm:w-auto lg:inline-flex">
                  Continue to payment <ChevronIcon className="size-4" />
                </button>
              </form>
            ) : (
              <div className="motion-page space-y-5">
                <div className="card flex items-start justify-between gap-4 p-5">
                  <div className="text-sm">
                    <p className="text-xs font-extrabold tracking-wider text-muted uppercase">Delivering to</p>
                    <p className="mt-1 font-extrabold">
                      {form.name} <span className="font-medium text-muted">· +91 {form.phone}</span>
                    </p>
                    <p className="mt-0.5 leading-6 text-muted">
                      {form.address}, {form.city}, {form.state} {form.pin}
                    </p>
                  </div>
                  <button type="button" onClick={() => setStep(0)} className="shrink-0 text-sm font-bold text-brand hover:underline">
                    Change
                  </button>
                </div>

                <div className="card p-5 sm:p-7">
                  <h2 className="text-xl font-extrabold">Payment method</h2>
                  <p className="mt-1 text-sm text-muted">Every transaction is encrypted and secure.</p>

                  {failed && (
                    <div role="alert" className="motion-panel mt-5 flex gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-rose-600 text-xs font-bold text-white">!</span>
                      <p><span className="font-extrabold">Payment failed.</span> {failed}</p>
                    </div>
                  )}

                  <div role="radiogroup" aria-label="Payment method" className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {methods.filter((method) => method.id !== 'cod' || settings.codEnabled).map((method) => {
                      const active = payment === method.id
                      return (
                        <button
                          key={method.id}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => {
                            setPayment(method.id)
                            setErrors({})
                            setFailed('')
                          }}
                          className={`relative rounded-2xl border-2 p-3.5 text-left transition duration-200 ${
                            active ? 'border-brand bg-brand-soft shadow-[0_0_0_4px_rgb(18_58_134/0.08)]' : 'border-line bg-white hover:border-brand/40'
                          }`}
                        >
                          <method.icon className={`size-6 ${active ? 'text-brand' : 'text-muted'}`} />
                          <span className="mt-2 block text-sm font-extrabold">{method.label}</span>
                          <span className="block text-[11px] leading-4 text-muted">{method.hint}</span>
                          {active && <span className="absolute top-2.5 right-2.5 grid size-5 place-items-center rounded-full bg-brand text-[10px] font-bold text-white">✓</span>}
                        </button>
                      )
                    })}
                  </div>

                  <div key={payment} className="motion-panel mt-6">
                    {razorpay && payment !== 'cod' && (
                      <div className="rounded-2xl bg-canvas p-5 text-sm leading-6">
                        <p className="font-extrabold">Pay in Razorpay’s window</p>
                        <p className="mt-1 text-muted">Card, UPI and net banking are entered there. ClickMart never sees the card number or CVV.</p>
                        {settings.paymentTestMode && (
                          <p className="mt-3 text-ink-soft">
                            Test card <span className="font-mono font-bold">4100 2800 0000 1007</span>, any future expiry, any CVV. On the bank page use an OTP of 4 to 10 digits, such as <span className="font-mono font-bold">1234</span>. A shorter OTP declines the payment. No money is charged.
                          </p>
                        )}
                      </div>
                    )}

                    {!razorpay && payment === 'upi' && (
                      <div>
                        <p className="text-sm font-bold">Pay with your UPI app</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {upiApps.map((app) => (
                            <button
                              key={app}
                              type="button"
                              onClick={() => setUpiApp(upiApp === app ? '' : app)}
                              aria-pressed={upiApp === app}
                              className={`rounded-full border-2 px-4 py-2 text-sm font-bold transition ${
                                upiApp === app ? 'border-brand bg-brand-soft text-brand' : 'border-line hover:border-brand/40'
                              }`}
                            >
                              {app}
                            </button>
                          ))}
                        </div>
                        {SavedPicker({ kind: 'UPI' })}
                        {!selectedSaved && (
                          <>
                            <Field label="UPI ID" error={errors.upi} className="mt-5">
                              <input value={upiId} onChange={(e) => { setUpiId(e.target.value); setErrors({}) }} className="field" aria-invalid={!!errors.upi} placeholder="yourname@okhdfcbank" autoCapitalize="none" />
                            </Field>
                            {SaveToggle()}
                          </>
                        )}
                        <p className="mt-2 text-xs text-muted">
                          {upiApp ? `A collect request will be sent to your ${upiApp} app.` : 'You will get a collect request on your UPI app to approve.'}
                        </p>
                      </div>
                    )}

                    {!razorpay && payment === 'card' && (
                      <div>
                        {SavedPicker({ kind: 'CARD' })}
                        {selectedSaved ? (
                          <div className="mt-4 grid max-w-xs gap-5">
                            <Field label={`CVV for ${savedPaymentTitle(selectedSaved)}`} error={errors.cvv}>
                              <input type="password" value={card.cvv} onChange={(e) => { setCard({ ...card, cvv: stripNonDigits(e.target.value).slice(0, 4) }); setErrors({}) }} inputMode="numeric" autoComplete="cc-csc" className="field font-mono" aria-invalid={!!errors.cvv} placeholder="•••" />
                            </Field>
                            <p className="-mt-3 text-xs text-muted">For your safety we never store the CVV.</p>
                          </div>
                        ) : (
                          <div className="grid gap-5 sm:grid-cols-2">
                        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-dark via-brand to-[#2f6bd6] p-5 text-white shadow-lift sm:col-span-2 sm:max-w-sm">
                          <div className="absolute -top-10 -right-10 size-36 rounded-full bg-white/10" />
                          <div className="flex items-center justify-between">
                            <span className="h-7 w-10 rounded-md bg-gradient-to-br from-amber-200 to-amber-400" />
                            <span className="text-xs font-extrabold tracking-widest">{cardBrand(stripNonDigits(card.number)) || 'CARD'}</span>
                          </div>
                          <p className="mt-6 font-mono text-lg tracking-[0.18em]">{card.number || '•••• •••• •••• ••••'}</p>
                          <div className="mt-4 flex items-end justify-between text-xs">
                            <span className="max-w-40 truncate font-bold tracking-wider uppercase">{card.name || 'Name on card'}</span>
                            <span className="font-mono">{card.expiry || 'MM/YY'}</span>
                          </div>
                        </div>
                        <Field label="Card number" error={errors.number} className="sm:col-span-2">
                          <input value={card.number} onChange={(e) => { setCard({ ...card, number: formatCard(e.target.value) }); setErrors({}) }} inputMode="numeric" autoComplete="cc-number" className="field font-mono tracking-wider" aria-invalid={!!errors.number} placeholder="1234 5678 9012 3456" />
                        </Field>
                        <Field label="Name on card" error={errors.cardName} className="sm:col-span-2">
                          <input value={card.name} onChange={(e) => { setCard({ ...card, name: e.target.value }); setErrors({}) }} autoComplete="cc-name" className="field" aria-invalid={!!errors.cardName} placeholder="As printed on card" />
                        </Field>
                        <Field label="Expiry" error={errors.expiry}>
                          <input value={card.expiry} onChange={(e) => { setCard({ ...card, expiry: formatExpiry(e.target.value) }); setErrors({}) }} inputMode="numeric" autoComplete="cc-exp" className="field font-mono" aria-invalid={!!errors.expiry} placeholder="MM/YY" />
                        </Field>
                        <Field label="CVV" error={errors.cvv}>
                          <input type="password" value={card.cvv} onChange={(e) => { setCard({ ...card, cvv: stripNonDigits(e.target.value).slice(0, 4) }); setErrors({}) }} inputMode="numeric" autoComplete="cc-csc" className="field font-mono" aria-invalid={!!errors.cvv} placeholder="•••" />
                        </Field>
                        <div className="sm:col-span-2">{SaveToggle()}</div>
                      </div>
                        )}
                      </div>
                    )}

                    {!razorpay && payment === 'netbanking' && (
                      <div>
                        <p className="text-sm font-bold">Choose your bank</p>
                        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                          {banks.map((name) => (
                            <button
                              key={name}
                              type="button"
                              onClick={() => { setBank(name); setErrors({}) }}
                              aria-pressed={bank === name}
                              className={`flex flex-col items-center gap-2 rounded-2xl border-2 px-2 py-3.5 text-xs font-bold transition ${
                                bank === name ? 'border-brand bg-brand-soft text-brand' : 'border-line hover:border-brand/40'
                              }`}
                            >
                              <span className="grid size-9 place-items-center rounded-full bg-canvas text-sm font-extrabold text-brand ring-1 ring-line">{name[0]}</span>
                              {name}
                            </button>
                          ))}
                        </div>
                        {errors.bank && <p className="mt-2 text-xs font-semibold text-rose-600">{errors.bank}</p>}
                      </div>
                    )}

                    {payment === 'cod' && (
                      <div className="rounded-2xl bg-canvas p-5 text-sm leading-6">
                        <p className="font-extrabold">Pay {formatPrice(cart.total)} in cash or UPI when your order arrives.</p>
                        <p className="mt-1 text-muted">Please keep the exact amount handy. Our delivery partner will hand you a receipt.</p>
                      </div>
                    )}
                  </div>

                  <button type="button" onClick={placeOrder} disabled={processing} className="btn btn-accent btn-lg mt-8 hidden w-full lg:inline-flex">
                    <LockIcon className="size-4" /> {payLabel}
                  </button>
                  <p className="mt-3 hidden text-center text-xs text-muted lg:block">
                    By placing your order you agree to our <Link to="/terms" className="font-bold text-brand">Terms</Link> and <Link to="/privacy" className="font-bold text-brand">Privacy Policy</Link>.
                  </p>
                </div>
              </div>
            )}
          </div>

          <OrderSummary showItems />
        </div>
      </Container>

      {step === 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 p-4 shadow-[0_-10px_30px_-12px_rgb(21_32_51/0.2)] backdrop-blur lg:hidden">
          <button type="submit" form="checkout-details" className="btn btn-accent btn-lg w-full">
            Continue to payment <ChevronIcon className="size-4" />
          </button>
        </div>
      )}

      {step === 1 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 p-4 shadow-[0_-10px_30px_-12px_rgb(21_32_51/0.2)] backdrop-blur lg:hidden">
          <button type="button" onClick={placeOrder} disabled={processing} className="btn btn-accent btn-lg w-full">
            <LockIcon className="size-4" /> {payLabel}
          </button>
        </div>
      )}

      {processing && (
        <div role="alertdialog" aria-modal="true" aria-label="Processing payment" className="motion-fade fixed inset-0 z-[60] grid place-items-center bg-ink/60 p-4 backdrop-blur-sm">
          <div className="motion-panel w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-pop">
            <span className="motion-spin mx-auto block size-14 rounded-full border-4 border-brand-soft border-t-brand" />
            <h2 className="mt-6 text-lg font-extrabold">{payment === 'cod' ? 'Confirming your order' : 'Processing payment'}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              {payment === 'upi' ? 'Approve the request in your UPI app.' : 'Please do not refresh or press back.'}
            </p>
            <p className="mt-5 inline-flex items-center gap-1.5 text-xs font-bold text-success">
              <LockIcon className="size-3.5" /> Secured by ClickMart Pay
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({
  label,
  error,
  children,
  className = '',
}: {
  label: string
  error?: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-[13px] font-bold text-ink-soft">{label}</span>
      <div className="mt-1.5">{children}</div>
      {error && (
        <span role="alert" className="mt-1.5 block text-xs font-semibold text-rose-600">
          {error}
        </span>
      )}
    </label>
  )
}
