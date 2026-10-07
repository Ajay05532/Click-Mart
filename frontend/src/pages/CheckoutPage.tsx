import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { OrderSummary } from '../components/cart/OrderSummary.tsx'
import { BankIcon, CardIcon, CartIcon, CashIcon, ChevronIcon, LockIcon, QrIcon, ShieldIcon } from '../components/icons.tsx'
import { Container } from '../components/layout/Container.tsx'
import { Breadcrumbs } from '../components/ui/Breadcrumbs.tsx'
import { EmptyState, Stepper } from '../components/ui/Primitives.tsx'
import { useAuth } from '../context/AuthContext.tsx'
import { useCart } from '../context/CartContext.tsx'
import { indianStates } from '../data/india.ts'
import { formatPrice } from '../lib/money.ts'
import { createOrderId, saveOrderRecord, savePlacedOrder } from '../lib/orders.ts'
import { useDocumentTitle } from '../lib/useDocumentTitle.ts'

type Payment = 'upi' | 'card' | 'netbanking' | 'cod'
type Errors = Record<string, string>

const methods: { id: Payment; label: string; hint: string; icon: typeof CardIcon }[] = [
  { id: 'upi', label: 'UPI', hint: 'GPay, PhonePe, Paytm', icon: QrIcon },
  { id: 'card', label: 'Card', hint: 'Credit or debit', icon: CardIcon },
  { id: 'netbanking', label: 'Net banking', hint: 'All major banks', icon: BankIcon },
  { id: 'cod', label: 'Cash on delivery', hint: 'Pay when it arrives', icon: CashIcon },
]

const upiApps = ['Google Pay', 'PhonePe', 'Paytm', 'BHIM']
const banks = ['HDFC Bank', 'ICICI Bank', 'SBI', 'Axis Bank', 'Kotak', 'Yes Bank', 'PNB', 'Bank of Baroda']
const ADDRESS_KEY = 'clickmart-address'

const stripNonDigits = (value: string) => value.replace(/\D/g, '')
const formatCard = (value: string) => stripNonDigits(value).slice(0, 16).replace(/(.{4})/g, '$1 ').trim()
const formatExpiry = (value: string) => {
  const digits = stripNonDigits(value).slice(0, 4)
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits
}
const cardBrand = (digits: string) => {
  if (/^4/.test(digits)) return 'VISA'
  if (/^(5[1-5]|2[2-7])/.test(digits)) return 'Mastercard'
  if (/^3[47]/.test(digits)) return 'Amex'
  if (/^(60|65|81|82)/.test(digits)) return 'RuPay'
  return ''
}
const expiryValid = (value: string) => {
  const match = /^(\d{2})\/(\d{2})$/.exec(value)
  if (!match) return false
  const month = Number(match[1])
  const year = 2000 + Number(match[2])
  if (month < 1 || month > 12) return false
  return new Date(year, month, 0, 23, 59) >= new Date()
}

function loadAddress() {
  try {
    return JSON.parse(localStorage.getItem(ADDRESS_KEY) ?? 'null') as Record<string, string> | null
  } catch {
    return null
  }
}

export function CheckoutPage() {
  useDocumentTitle('Checkout')
  const { user } = useAuth()
  const cart = useCart()
  const navigate = useNavigate()
  const [saved] = useState(loadAddress)
  const [step, setStep] = useState(0)
  const [form, setForm] = useState({
    name: saved?.name ?? user?.name ?? '',
    email: saved?.email ?? user?.email ?? '',
    phone: saved?.phone ?? '',
    pin: saved?.pin ?? localStorage.getItem('clickmart-pin') ?? '',
    address: saved?.address ?? '',
    city: saved?.city ?? '',
    state: saved?.state ?? 'Karnataka',
  })
  const [payment, setPayment] = useState<Payment>('upi')
  const [upiId, setUpiId] = useState('')
  const [upiApp, setUpiApp] = useState('')
  const [card, setCard] = useState({ number: '', name: '', expiry: '', cvv: '' })
  const [bank, setBank] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [processing, setProcessing] = useState(false)
  const [failed, setFailed] = useState('')
  const [placed, setPlaced] = useState(false)
  const timer = useRef<number>(0)

  useEffect(() => () => window.clearTimeout(timer.current), [])

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

  const validatePayment = () => {
    const next: Errors = {}
    if (payment === 'upi' && !/^[\w.-]{2,}@[a-z]{2,}$/i.test(upiId.trim())) next.upi = 'Enter a valid UPI ID, e.g. name@okhdfc'
    if (payment === 'card') {
      const digits = stripNonDigits(card.number)
      if (digits.length < 13) next.number = 'Enter a valid card number'
      if (card.name.trim().length < 2) next.cardName = 'Enter the name on the card'
      if (!expiryValid(card.expiry)) next.expiry = 'Enter a valid expiry'
      if (!/^\d{3,4}$/.test(card.cvv)) next.cvv = 'Enter CVV'
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

  const placeOrder = () => {
    if (!validatePayment() || cart.lines.length === 0 || processing) return
    setFailed('')
    const digits = stripNonDigits(card.number)
    const delay = payment === 'cod' ? 900 : 2400
    setProcessing(true)
    timer.current = window.setTimeout(() => {
      // Test hook: this card number always declines so the failure state can be exercised.
      if (payment === 'card' && digits.endsWith('0002')) {
        setProcessing(false)
        setFailed('Your bank declined this card. Try another card or a different payment method.')
        return
      }
      const id = createOrderId()
      const placedAt = Date.now()
      const detail =
        payment === 'upi'
          ? upiId.trim()
          : payment === 'card'
            ? `${cardBrand(digits) || 'Card'} •••• ${digits.slice(-4)}`
            : payment === 'netbanking'
              ? bank
              : 'Pay on delivery'
      const label = methods.find((item) => item.id === payment)?.label ?? payment
      setPlaced(true)
      saveOrderRecord({
        id,
        placedAt,
        customer: form.name.trim(),
        phone: form.phone,
        email: form.email.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
        state: form.state,
        pin: form.pin,
        lines: cart.lines.map((line) => ({
          name: line.name,
          slug: line.slug,
          size: line.size,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          image: line.image,
          art: line.art,
        })),
        subtotal: cart.subtotal,
        discount: cart.discount,
        shipping: cart.shipping,
        total: cart.total,
        coupon: cart.coupon?.code ?? null,
        payment: { method: label, detail, paid: payment !== 'cod', ref: `TXN${Date.now().toString().slice(-9)}` },
      })
      savePlacedOrder({
        id,
        customer: form.name.trim(),
        items: cart.lines.map((line) => `${line.name} (${line.size})`).join(', '),
        amount: cart.total,
        status: 'Processing',
        date: new Date(placedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      })
      cart.clear()
      navigate(`/order/${id}`, { replace: true, state: { fresh: true } })
    }, delay)
  }

  if (cart.lines.length === 0 && !placed) {
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

  const payLabel = payment === 'cod' ? 'Place order' : `Pay ${formatPrice(cart.total)}`

  return (
    <div className="bg-canvas pb-28 lg:pb-0">
      <Container className="py-8 sm:py-10">
        <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Cart', to: '/cart' }, { label: 'Checkout' }]} />
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-3xl font-extrabold tracking-tight">Checkout</h1>
          <p className="inline-flex items-center gap-1.5 text-xs font-bold text-success">
            <LockIcon className="size-4" /> 256-bit SSL secured
          </p>
        </div>
        <div className="mt-6 max-w-xl">
          <Stepper steps={['Cart', 'Details', 'Payment']} current={step + 1} />
        </div>

        <div className="mt-8 grid items-start gap-6 lg:grid-cols-[1fr_380px]">
          <div>
            {step === 0 ? (
              <form onSubmit={continueToPayment} noValidate className="card motion-page p-5 sm:p-7">
                <h2 className="text-xl font-extrabold">Delivery details</h2>
                <p className="mt-1 text-sm text-muted">Where should we send your order?</p>
                <div className="mt-6 grid gap-5 sm:grid-cols-2">
                  <Field label="Full name" error={errors.name} className="sm:col-span-2">
                    <input value={form.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" className="field" aria-invalid={!!errors.name} placeholder="As on your ID" />
                  </Field>
                  <Field label="Email" error={errors.email}>
                    <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" className="field" aria-invalid={!!errors.email} placeholder="you@example.com" />
                  </Field>
                  <Field label="Mobile number" error={errors.phone}>
                    <div className="flex">
                      <span className="grid h-12 place-items-center rounded-l-[0.85rem] border-[1.5px] border-r-0 border-line bg-canvas px-3 text-sm font-bold text-muted">+91</span>
                      <input value={form.phone} onChange={(e) => set('phone', stripNonDigits(e.target.value).slice(0, 10))} inputMode="numeric" autoComplete="tel-national" className="field rounded-l-none!" aria-invalid={!!errors.phone} placeholder="98765 43210" />
                    </div>
                  </Field>
                  <Field label="Address" error={errors.address} className="sm:col-span-2">
                    <textarea value={form.address} onChange={(e) => set('address', e.target.value)} autoComplete="street-address" rows={3} className="field" aria-invalid={!!errors.address} placeholder="House no., building, street, area" />
                  </Field>
                  <Field label="PIN code" error={errors.pin}>
                    <input value={form.pin} onChange={(e) => set('pin', stripNonDigits(e.target.value).slice(0, 6))} inputMode="numeric" autoComplete="postal-code" className="field" aria-invalid={!!errors.pin} placeholder="560025" />
                  </Field>
                  <Field label="City" error={errors.city}>
                    <input value={form.city} onChange={(e) => set('city', e.target.value)} autoComplete="address-level2" className="field" aria-invalid={!!errors.city} placeholder="Bengaluru" />
                  </Field>
                  <Field label="State" className="sm:col-span-2">
                    <select value={form.state} onChange={(e) => set('state', e.target.value)} className="field cursor-pointer">
                      {indianStates.map((state) => (
                        <option key={state}>{state}</option>
                      ))}
                    </select>
                  </Field>
                </div>
                <div className="mt-6 flex items-center gap-3 rounded-2xl bg-brand-soft p-4 text-sm">
                  <ShieldIcon className="size-6 shrink-0 text-brand" />
                  <p className="text-ink-soft">
                    <span className="font-extrabold text-brand">Standard delivery</span> in 3–5 working days. You can track every step live after ordering.
                  </p>
                </div>
                <button type="submit" className="btn btn-accent btn-lg mt-7 w-full sm:w-auto">
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
                    {methods.map((method) => {
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
                    {payment === 'upi' && (
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
                        <Field label="UPI ID" error={errors.upi} className="mt-5">
                          <input value={upiId} onChange={(e) => { setUpiId(e.target.value); setErrors({}) }} className="field" aria-invalid={!!errors.upi} placeholder="yourname@okhdfcbank" autoCapitalize="none" />
                        </Field>
                        <p className="mt-2 text-xs text-muted">
                          {upiApp ? `A collect request will be sent to your ${upiApp} app.` : 'You will get a collect request on your UPI app to approve.'}
                        </p>
                      </div>
                    )}

                    {payment === 'card' && (
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
                      </div>
                    )}

                    {payment === 'netbanking' && (
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
