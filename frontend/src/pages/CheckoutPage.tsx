import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { OrderSummary } from '../components/cart/OrderSummary.tsx'
import { BankIcon, CardIcon, CartIcon, CashIcon, ChevronIcon, LockIcon, PinIcon, QrIcon, ShieldIcon, TruckIcon } from '../components/icons.tsx'
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
  type SavedAddress,
} from '../lib/wallet.ts'
import { useNotice } from '../context/NoticeContext.tsx'

type Payment = 'upi' | 'card' | 'netbanking' | 'cod'
type Errors = Record<string, string>

const apiMethod: Record<Payment, 'UPI' | 'CARD' | 'NETBANKING' | 'COD'> = { upi: 'UPI', card: 'CARD', netbanking: 'NETBANKING', cod: 'COD' }

/**
 * Tells the API the gateway took the money. Network trouble is retried; if it still cannot confirm, the shopper
 * goes to the order page anyway (payment "Pending") and Razorpay's webhook marks it paid, so nobody pays twice.
 */
async function confirmPayment(providerOrderId: string, paid: { providerPaymentId: string; signature: string }, placed: ApiOrder) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return (await api<{ order: ApiOrder }>('/payments/verify', { body: { providerOrderId, ...paid } })).order
    } catch (error) {
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) break
      await new Promise((resolve) => window.setTimeout(resolve, 2000 * (attempt + 1)))
    }
  }
  return placed
}

const methods: { id: Payment; label: string; hint: string; icon: typeof CardIcon }[] = [
  { id: 'upi', label: 'UPI', hint: 'GPay, PhonePe, Paytm', icon: QrIcon },
  { id: 'card', label: 'Card', hint: 'Credit or debit', icon: CardIcon },
  { id: 'netbanking', label: 'Net banking', hint: 'All major banks', icon: BankIcon },
  { id: 'cod', label: 'Cash on delivery', hint: 'Pay when it arrives', icon: CashIcon },
]

const onlineMethods = methods.filter((method) => method.id !== 'cod').map((method) => ({ ...method, label: method.id === 'netbanking' ? 'Net banking' : method.label }))

function Radio({ on }: { on: boolean }) {
  return (
    <span aria-hidden="true" className={`grid size-5 shrink-0 place-items-center rounded-full border-2 transition ${on ? 'border-brand' : 'border-line bg-white'}`}>
      {on && <span className="size-2.5 rounded-full bg-brand" />}
    </span>
  )
}

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
      // The signed-in account's email, never one remembered from an earlier checkout in this browser.
      email: user?.email || saved?.email || '',
      phone: (saved?.phone || user?.phone || '').replace(/\D/g, '').slice(-10),
      pin: complete ? saved?.pin ?? '' : delivery?.pin || saved?.pin || '',
      address: complete ? saved?.address ?? '' : '',
      city: complete ? saved?.city ?? '' : delivery?.city || saved?.city || '',
      state: complete ? saved?.state || 'Karnataka' : matchState(delivery?.state, saved?.state || 'Karnataka'),
      landmark: complete ? saved?.landmark ?? '' : '',
    }
  })
  const [addressLabel, setAddressLabel] = useState<SavedAddress['label']>('HOME')
  const [savingAddress, setSavingAddress] = useState(false)
  const [detailsError, setDetailsError] = useState('')
  const [payment, setPayment] = useState<Payment>('upi')
  const [upiId, setUpiId] = useState('')
  const [upiApp, setUpiApp] = useState('')
  const [card, setCard] = useState({ number: '', name: '', expiry: '', cvv: '' })
  const [bank, setBank] = useState('')
  const [savedId, setSavedId] = useState<{ UPI: string; CARD: string }>({ UPI: '', CARD: '' })
  const [saveMethod, setSaveMethod] = useState(true)
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
  const savedAddresses = addresses.data ?? []
  const notify = useNotice()
  const continueLabel = savingAddress ? 'Saving address…' : !addressId && user ? 'Save address & continue' : 'Continue to payment'
  const [prefilled, setPrefilled] = useState(false)
  const chooseAddress = (item: NonNullable<typeof addresses.data>[number]) => {
    setAddressId(item.id)
    setErrors({})
    setDetailsError('')
    setForm((current) => ({ ...current, email: current.email || user?.email || '', name: item.name, phone: item.phone, address: item.line, city: item.city, state: item.state, pin: item.pin, landmark: item.landmark ?? '' }))
  }
  const startNewAddress = () => {
    setAddressId('')
    setErrors({})
    setDetailsError('')
    setForm((current) => ({
      ...current,
      name: current.name || user?.name || '',
      phone: addressId ? (user?.phone ?? '').replace(/\D/g, '').slice(-10) : current.phone,
      address: '',
      landmark: '',
      pin: delivery?.pin || '',
      city: delivery?.city || '',
      state: matchState(delivery?.state, current.state),
    }))
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
    if (!form.phone) next.phone = 'Mobile number is required for delivery'
    else if (!/^[6-9]\d{9}$/.test(form.phone)) next.phone = 'Enter a valid 10-digit mobile number'
    if (!/^\d{6}$/.test(form.pin)) next.pin = 'Enter a 6-digit PIN code'
    if (form.address.trim().length < 8) next.address = 'Enter house no., street and area'
    if (form.city.trim().length < 2) next.city = 'Enter your city'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const razorpay = settings.paymentProvider === 'razorpay'
  const online = payment !== 'cod'
  // The server checks the route for the address PIN (services/delivery.js) and, with courier rates on, prices it.
  const pinReady = /^\d{6}$/.test(form.pin)
  const routeFor = cart.delivery && cart.delivery.pin === form.pin ? cart.delivery : null
  const undeliverable = !!routeFor && !routeFor.deliverable
  const [noCodPin, setNoCodPin] = useState('')
  useEffect(() => {
    cart.setDeliveryTarget(pinReady ? { pin: form.pin, state: form.state, paymentMethod: step === 1 ? apiMethod[payment] : undefined } : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinReady, form.pin, form.state, step, payment])
  useEffect(() => () => cart.setDeliveryTarget(null), [])  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (payment === 'cod' && routeFor && !routeFor.codAvailable) {
      setNoCodPin(routeFor.pin)
      notify({ tone: 'warning', title: 'Cash on delivery is not offered here', text: `Couriers do not collect cash at PIN code ${routeFor.pin}. Please pay online.` })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payment, routeFor?.pin, routeFor?.codAvailable])
  const courierNoCod = noCodPin === form.pin
  const codAvailable = settings.codEnabled && cart.total <= settings.codMaxOrder && !courierNoCod
  const chosenLabel = addressLabels[savedAddresses.find((item) => item.id === addressId)?.label ?? addressLabel] ?? 'Home'
  const choosePayment = (next: Payment) => {
    setPayment(next)
    setErrors({})
    setFailed('')
  }
  useEffect(() => {
    if (payment === 'cod' && !codAvailable) setPayment('upi')
  }, [payment, codAvailable])
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

  const continueToPayment = async (event: FormEvent) => {
    event.preventDefault()
    if (savingAddress || !validateDetails()) return
    if (undeliverable) return setDetailsError(`We cannot deliver to PIN code ${form.pin} yet. Please choose another address.`)
    setDetailsError('')
    // A new address is saved to the account before the order, so it is picked from the list next time.
    if (user && !addressId) {
      setSavingAddress(true)
      try {
        const created = await api<SavedAddress>('/me/addresses', {
          body: {
            name: form.name.trim(),
            phone: form.phone,
            line: form.address.trim(),
            landmark: form.landmark.trim() || null,
            city: form.city.trim(),
            state: form.state,
            pin: form.pin,
            label: addressLabel,
            isDefault: !addresses.data?.length,
          },
        })
        setAddressId(created.id)
        await queryClient.invalidateQueries({ queryKey: ['addresses'] })
        notify({ title: 'Address saved', text: `${addressLabels[created.label] ?? 'Home'} · ${created.city} ${created.pin}. You can pick it next time.` })
      } catch (error) {
        setDetailsError(errorMessage(error))
        return
      } finally {
        setSavingAddress(false)
      }
    }
    const { email: _email, ...remembered } = form
    localStorage.setItem(ADDRESS_KEY, JSON.stringify(remembered))
    setStep(1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const placeOrder = async () => {
    if (!validatePayment() || cart.count === 0 || processing || undeliverable) return
    setFailed('')
    setProcessing(true)
    const digits = selectedSaved ? (selectedSaved.last4 ?? '') : stripNonDigits(card.number)
    let providerOrderId: string | null = null
    // Once the gateway has taken the money, never report the payment as failed; the webhook confirms it if we cannot.
    let paymentTaken = false
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
          address: { line: (form.landmark.trim() ? `${form.address.trim()}, near ${form.landmark.trim()}` : form.address.trim()).slice(0, 250), city: form.city.trim(), state: form.state, pin: form.pin },
        },
      })
      let order = result.order
      if (result.payment) {
        providerOrderId = result.payment.providerOrderId
        let paid: { providerPaymentId: string; signature: string }
        if (result.payment.provider === 'razorpay') {
          setProcessing(false)
          paid = await payWithRazorpay({ keyId: result.payment.keyId!, orderId: providerOrderId, amount: result.payment.amount, method: payment === 'cod' ? undefined : payment, customer: { name: form.name.trim(), email: form.email.trim(), phone: form.phone } })
          setProcessing(true)
        } else {
          // Development gateway only (the API refuses it in production). A card ending 0002 is declined.
          const outcome = (payment === 'card' && digits.endsWith('0002')) || (payment === 'upi' && upiId.trim().toLowerCase().startsWith('fail@')) ? 'failure' : 'success'
          paid = await api<{ providerPaymentId: string; signature: string }>('/payments/mock/pay', { body: { providerOrderId, outcome } })
        }
        paymentTaken = true
        order = await confirmPayment(providerOrderId, paid, order)
      }
      setPlaced(true)
      cart.clear()
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
      if (providerOrderId && !paymentTaken && !(error instanceof ApiError && error.status === 402)) {
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

  const payLabel = payment === 'cod' ? `Place order · ${formatPrice(cart.total)}` : razorpay ? `Pay ${formatPrice(cart.total)} securely` : `Pay ${formatPrice(cart.total)}`

  return (
    <div className="bg-canvas pb-28 lg:pb-0">
      <Container className="py-8 sm:py-10">
        <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Cart', to: '/cart' }, { label: 'Checkout' }]} />
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight">Checkout</h1>
        <div className="mt-6 max-w-xl">
          <Stepper steps={['Cart', 'Details', 'Payment']} current={step + 1} />
        </div>

        <div className="mt-8 grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div>
            {step === 0 ? (
              <form id="checkout-details" onSubmit={continueToPayment} noValidate className="card motion-page p-5 sm:p-7">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-extrabold">Delivery address</h2>
                    <p className="mt-1 text-sm text-muted">{savedAddresses.length ? 'Choose where this order should arrive.' : 'Add the address this order should go to.'}</p>
                  </div>
                  {delivery && (
                    <p className="inline-flex items-center gap-2 rounded-full bg-canvas px-3 py-1.5 text-xs font-bold">
                      <PinIcon className="size-4 text-brand" />
                      Delivering near {delivery.city ? `${delivery.city} ` : ''}{delivery.pin}
                    </p>
                  )}
                </div>

                {addresses.isLoading ? (
                  <div className="mt-5 grid gap-3" aria-label="Loading your addresses">
                    {[0, 1].map((key) => <div key={key} className="h-24 animate-pulse rounded-2xl bg-canvas" />)}
                  </div>
                ) : savedAddresses.length > 0 ? (
                  <div role="radiogroup" aria-label="Saved addresses" className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {savedAddresses.map((item) => {
                      const active = addressId === item.id
                      return (
                        <button
                          key={item.id}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => chooseAddress(item)}
                          className={`relative flex min-w-0 gap-3 rounded-2xl border-2 p-4 text-left text-sm transition ${active ? 'border-brand bg-brand-soft shadow-[0_0_0_4px_rgb(18_58_134/0.08)]' : 'border-line bg-white hover:border-brand/40'}`}
                        >
                          <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2 text-[10px] ${active ? 'border-brand bg-brand text-white' : 'border-line'}`}>{active ? '✓' : ''}</span>
                          <span className="min-w-0">
                            <span className="flex flex-wrap items-center gap-2 font-extrabold">
                              {addressLabels[item.label] ?? 'Home'}
                              {item.isDefault && <span className="rounded-md bg-white px-1.5 py-0.5 text-[10px] font-bold text-brand ring-1 ring-line">Default</span>}
                            </span>
                            <span className="mt-1 block font-semibold">{item.name}</span>
                            <span className="mt-0.5 block leading-5 break-words text-muted">
                              {item.line}
                              {item.landmark ? `, near ${item.landmark}` : ''}, {item.city}, {item.state} {item.pin}
                            </span>
                            <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-bold text-ink-soft">📞 +91 {item.phone}</span>
                          </span>
                        </button>
                      )
                    })}
                    <button
                      type="button"
                      onClick={startNewAddress}
                      className={`flex min-h-24 items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-3 text-sm font-bold transition ${!addressId ? 'border-brand bg-brand-soft text-brand' : 'border-line text-muted hover:border-brand/40 hover:text-brand'}`}
                    >
                      <span className="grid size-7 place-items-center rounded-full bg-white text-lg leading-none ring-1 ring-line">+</span>
                      Add a new address
                    </button>
                  </div>
                ) : (
                  <p className="mt-5 flex items-start gap-3 rounded-2xl border border-brand/15 bg-brand-soft/70 p-4 text-sm text-ink-soft">
                    <PinIcon className="mt-0.5 size-5 shrink-0 text-brand" />
                    <span>
                      <span className="font-extrabold text-brand">No saved address yet.</span> Add one below. We save it to your account so you can pick it next time.
                    </span>
                  </p>
                )}

                {!addresses.isLoading && !addressId && (
                  <div className="motion-panel mt-6 rounded-2xl border border-line p-4 sm:p-5">
                    <p className="text-sm font-extrabold">{savedAddresses.length ? 'New address' : 'Add a delivery address'}</p>
                    <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
                      <Field label="Full name" required error={errors.name}>
                        <input value={form.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" className="field" aria-invalid={!!errors.name} placeholder="Who will receive it" />
                      </Field>
                      <Field label="Mobile number" required error={errors.phone} hint="The courier calls this number on delivery day.">
                        <div className="flex">
                          <span className="grid h-12 place-items-center rounded-l-[0.85rem] border-[1.5px] border-r-0 border-line bg-canvas px-3 text-sm font-bold text-muted">+91</span>
                          <input value={form.phone} onChange={(e) => set('phone', stripNonDigits(e.target.value).slice(0, 10))} inputMode="numeric" autoComplete="tel-national" required className="field rounded-l-none!" aria-invalid={!!errors.phone} placeholder="98765 43210" />
                        </div>
                      </Field>
                      <Field label="Address" required error={errors.address} className="sm:col-span-2">
                        <textarea value={form.address} onChange={(e) => set('address', e.target.value)} autoComplete="street-address" rows={2} className="field" aria-invalid={!!errors.address} placeholder="Flat / house no., building, street, area" />
                      </Field>
                      <Field label="Landmark (optional)" className="sm:col-span-2">
                        <input value={form.landmark} onChange={(e) => set('landmark', e.target.value)} className="field" placeholder="Near a school, temple, shop…" />
                      </Field>
                      <Field label="PIN code" required error={errors.pin}>
                        <input value={form.pin} onChange={(e) => set('pin', stripNonDigits(e.target.value).slice(0, 6))} inputMode="numeric" autoComplete="postal-code" className="field" aria-invalid={!!errors.pin} placeholder="6-digit PIN" />
                      </Field>
                      <Field label="City" required error={errors.city}>
                        <input value={form.city} onChange={(e) => set('city', e.target.value)} autoComplete="address-level2" className="field" aria-invalid={!!errors.city} placeholder="City" />
                      </Field>
                      <Field label="State" required className="sm:col-span-2">
                        <select value={form.state} onChange={(e) => set('state', e.target.value)} className="field cursor-pointer">
                          {indianStates.map((state) => (
                            <option key={state}>{state}</option>
                          ))}
                        </select>
                      </Field>
                    </div>
                    <div className="mt-5">
                      <p className="text-[13px] font-bold text-ink-soft">Save as</p>
                      <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Address type">
                        {(['HOME', 'WORK', 'OTHER'] as const).map((label) => (
                          <button
                            key={label}
                            type="button"
                            role="radio"
                            aria-checked={addressLabel === label}
                            onClick={() => setAddressLabel(label)}
                            className={`rounded-full border-2 px-4 py-1.5 text-sm font-bold transition ${addressLabel === label ? 'border-brand bg-brand-soft text-brand' : 'border-line text-muted hover:border-brand/40'}`}
                          >
                            {addressLabels[label]}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <Field label="Email for the receipt" required error={errors.email} className="mt-6">
                  <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" className="field" aria-invalid={!!errors.email} placeholder="you@example.com" />
                </Field>

                {undeliverable && (
                  <p role="alert" className="motion-panel mt-5 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    <PinIcon className="mt-0.5 size-4 shrink-0" />
                    <span>
                      <span className="font-extrabold">We cannot deliver to PIN code {form.pin} yet.</span> {savedAddresses.length > 1 ? 'Pick another address or add a new one.' : 'Please use a different address.'}
                    </span>
                  </p>
                )}
                {detailsError && (
                  <p role="alert" className="motion-panel mt-5 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                    {detailsError}
                  </p>
                )}
                <div className="mt-6 flex items-center gap-3 rounded-2xl bg-brand-soft p-4 text-sm">
                  <ShieldIcon className="size-6 shrink-0 text-brand" />
                  <p className="text-ink-soft">
                    <span className="font-extrabold text-brand">Standard delivery</span> in 3–5 working days. You can track every step live after ordering.
                  </p>
                </div>
                <button type="submit" disabled={savingAddress || addresses.isLoading || undeliverable} className="btn btn-accent btn-lg mt-7 hidden w-full sm:w-auto lg:inline-flex">
                  {continueLabel} <ChevronIcon className="size-4" />
                </button>
              </form>
            ) : (
              <div className="motion-page space-y-5">
                <div className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:p-6">
                  <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand">
                    <PinIcon className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="flex flex-wrap items-center gap-2 text-xs font-extrabold tracking-wider text-muted uppercase">
                      Delivering to
                      <span className="rounded-md bg-canvas px-1.5 py-0.5 text-[10px] tracking-normal text-brand normal-case ring-1 ring-line">{chosenLabel}</span>
                    </p>
                    <p className="mt-1.5 font-extrabold text-ink">
                      {form.name} <span className="font-semibold text-muted">· +91 {form.phone}</span>
                    </p>
                    <p className="mt-0.5 leading-6 break-words text-muted">
                      {form.address}{form.landmark ? `, near ${form.landmark}` : ''}, {form.city}, {form.state} {form.pin}
                    </p>
                    <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-success">
                      <TruckIcon className="size-4" /> {routeFor?.etaDays ? `Delivery in about ${routeFor.etaDays} ${routeFor.etaDays === 1 ? 'day' : 'days'}` : 'Delivery in 3–5 working days'}
                    </p>
                  </div>
                  <button type="button" onClick={() => setStep(0)} className="btn btn-outline btn-sm shrink-0 self-start">
                    Change
                  </button>
                </div>

                {razorpay ? (
                  <div className="card overflow-hidden">
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line p-5 sm:px-7 sm:py-6">
                      <div>
                        <h2 className="text-xl font-extrabold">How would you like to pay?</h2>
                        <p className="mt-1 text-sm text-muted">Choose a payment option for this order.</p>
                      </div>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-extrabold text-success ring-1 ring-emerald-100">
                        <LockIcon className="size-3.5" /> 100% secure
                      </span>
                    </div>

                    <div className="space-y-3 p-5 sm:p-7">
                      {failed && (
                        <div role="alert" className="motion-panel flex gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-rose-600 text-xs font-bold text-white">!</span>
                          <p><span className="font-extrabold">Payment not completed.</span> {failed}</p>
                        </div>
                      )}

                      <div role="radiogroup" aria-label="Payment option" className="space-y-3">
                        <div className={`rounded-2xl border-2 transition ${online ? 'border-brand bg-brand-soft/40 shadow-[0_0_0_4px_rgb(18_58_134/0.06)]' : 'border-line bg-white hover:border-brand/40'}`}>
                          <button type="button" role="radio" aria-checked={online} onClick={() => choosePayment(online ? payment : 'upi')} className="flex w-full items-center gap-4 p-4 text-left sm:p-5">
                            <Radio on={online} />
                            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white text-brand ring-1 ring-line">
                              <CardIcon className="size-6" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block font-extrabold text-ink">Pay online</span>
                              <span className="block text-xs text-muted">UPI, credit and debit cards, net banking and wallets</span>
                            </span>
                            <span className="hidden shrink-0 flex-wrap justify-end gap-1.5 sm:flex">
                              {['UPI', 'VISA', 'Mastercard', 'RuPay'].map((name) => (
                                <span key={name} className="rounded-md bg-white px-2 py-1 text-[10px] font-extrabold tracking-wide text-ink-soft ring-1 ring-line">{name}</span>
                              ))}
                            </span>
                          </button>
                          {online && (
                            <div className="motion-panel border-t border-brand/10 px-4 pt-4 pb-5 sm:px-5">
                              <p className="text-xs font-extrabold tracking-wider text-muted uppercase">Preferred method</p>
                              <div className="mt-2.5 grid grid-cols-3 gap-2">
                                {onlineMethods.map((method) => {
                                  const active = payment === method.id
                                  return (
                                    <button
                                      key={method.id}
                                      type="button"
                                      aria-pressed={active}
                                      onClick={() => choosePayment(method.id)}
                                      className={`flex flex-col items-center gap-1.5 rounded-xl border-2 px-2 py-3 text-xs font-extrabold transition sm:flex-row sm:justify-center ${active ? 'border-brand bg-white text-brand' : 'border-transparent bg-white/70 text-muted hover:border-brand/30'}`}
                                    >
                                      <method.icon className="size-5" /> {method.label}
                                    </button>
                                  )
                                })}
                              </div>
                              <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-ink-soft">
                                <ShieldIcon className="mt-0.5 size-4 shrink-0 text-brand" />
                                You will finish paying in Razorpay’s secure window. ClickMart never sees your card number, CVV or UPI PIN.
                              </p>
                            </div>
                          )}
                        </div>

                        {settings.codEnabled && (
                          <button
                            type="button"
                            role="radio"
                            aria-checked={payment === 'cod'}
                            disabled={!codAvailable}
                            onClick={() => choosePayment('cod')}
                            className={`flex w-full items-center gap-4 rounded-2xl border-2 p-4 text-left transition sm:p-5 ${payment === 'cod' ? 'border-brand bg-brand-soft/40 shadow-[0_0_0_4px_rgb(18_58_134/0.06)]' : 'border-line bg-white hover:border-brand/40'} disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:border-line`}
                          >
                            <Radio on={payment === 'cod'} />
                            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white text-brand ring-1 ring-line">
                              <CashIcon className="size-6" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block font-extrabold text-ink">Cash on delivery</span>
                              <span className="block text-xs text-muted">
                                {codAvailable ? 'Pay by cash or UPI to the delivery partner when it arrives' : courierNoCod ? `Not offered for PIN code ${form.pin}` : `Available on orders up to ${formatPrice(settings.codMaxOrder)}`}
                              </span>
                            </span>
                          </button>
                        )}
                      </div>

                      {payment === 'cod' && (
                        <p className="motion-panel rounded-2xl bg-canvas px-4 py-3 text-sm leading-6 text-ink-soft">
                          Keep <span className="font-extrabold text-ink">{formatPrice(cart.total)}</span> ready. The delivery partner gives you a receipt, and your invoice is emailed too.
                        </p>
                      )}

                      <div className="flex items-center justify-between rounded-2xl bg-canvas px-4 py-3.5 text-sm">
                        <span className="font-semibold text-muted">Amount to pay</span>
                        <span className="text-lg font-extrabold text-ink">{formatPrice(cart.total)}</span>
                      </div>

                      <button type="button" onClick={placeOrder} disabled={processing || undeliverable} className="btn btn-accent btn-lg hidden w-full lg:inline-flex">
                        <LockIcon className="size-4" /> {payLabel}
                      </button>
                      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 pt-1 text-[11px] font-bold text-muted">
                        <span className="inline-flex items-center gap-1"><LockIcon className="size-3.5" /> 256-bit encryption</span>
                        <span className="inline-flex items-center gap-1"><ShieldIcon className="size-3.5" /> PCI DSS compliant</span>
                        <span>Secured by <span className="font-extrabold text-[#072654]">Razorpay</span></span>
                      </div>
                      <p className="text-center text-xs text-muted">
                        By placing your order you agree to our <Link to="/terms" className="font-bold text-brand">Terms</Link> and <Link to="/privacy" className="font-bold text-brand">Privacy Policy</Link>.
                      </p>
                    </div>
                  </div>
                ) : (
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

                  <button type="button" onClick={placeOrder} disabled={processing || undeliverable} className="btn btn-accent btn-lg mt-8 hidden w-full lg:inline-flex">
                    <LockIcon className="size-4" /> {payLabel}
                  </button>
                  <p className="mt-3 hidden text-center text-xs text-muted lg:block">
                    By placing your order you agree to our <Link to="/terms" className="font-bold text-brand">Terms</Link> and <Link to="/privacy" className="font-bold text-brand">Privacy Policy</Link>.
                  </p>
                </div>
                )}
              </div>
            )}
          </div>

          <OrderSummary showItems />
        </div>
      </Container>

      {step === 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 p-4 shadow-[0_-10px_30px_-12px_rgb(21_32_51/0.2)] backdrop-blur lg:hidden">
          <button type="submit" form="checkout-details" disabled={savingAddress || addresses.isLoading || undeliverable} className="btn btn-accent btn-lg w-full">
            {continueLabel} <ChevronIcon className="size-4" />
          </button>
        </div>
      )}

      {step === 1 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 p-4 shadow-[0_-10px_30px_-12px_rgb(21_32_51/0.2)] backdrop-blur lg:hidden">
          <button type="button" onClick={placeOrder} disabled={processing || undeliverable} className="btn btn-accent btn-lg w-full">
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
  hint,
  required = false,
  children,
  className = '',
}: {
  label: string
  error?: string
  hint?: string
  required?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-[13px] font-bold text-ink-soft">
        {label}
        {required && <span className="ml-0.5 text-rose-600" aria-hidden="true">*</span>}
      </span>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <span role="alert" className="mt-1.5 block text-xs font-semibold text-rose-600">
          {error}
        </span>
      ) : (
        hint && <span className="mt-1.5 block text-xs text-muted">{hint}</span>
      )}
    </label>
  )
}
