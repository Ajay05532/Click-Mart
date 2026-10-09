import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  BoxIcon,
  CardIcon,
  HeartIcon,
  LockIcon,
  PhoneIcon,
  PinIcon,
  SettingsIcon,
  ShieldIcon,
  UserIcon,
} from '../components/icons.tsx'
import { Container } from '../components/layout/Container.tsx'
import { OrderList } from '../components/order/OrderList.tsx'
import { EmptyState } from '../components/ui/Primitives.tsx'
import { useAuth } from '../context/AuthContext.tsx'
import { errorMessage } from '../lib/api.ts'
import { useCart } from '../context/CartContext.tsx'
import { useWishlist } from '../context/WishlistContext.tsx'
import { indianStates } from '../data/india.ts'
import { api } from '../lib/api.ts'
import { formatPrice } from '../lib/money.ts'
import { useMyOrders } from '../lib/orders.ts'
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
  usePaymentHistory,
  type SavedAddress,
  type SavedPayment,
} from '../lib/wallet.ts'
import { useDocumentTitle } from '../lib/useDocumentTitle.ts'

const tabs = [
  { id: 'orders', label: 'Orders', icon: BoxIcon, group: 'Shopping' },
  { id: 'profile', label: 'Profile', icon: UserIcon, group: 'Account' },
  { id: 'security', label: 'Login & security', icon: LockIcon, group: 'Account' },
  { id: 'address', label: 'Addresses', icon: PinIcon, group: 'Account' },
  { id: 'payments', label: 'Saved payments', icon: CardIcon, group: 'Account' },
  { id: 'history', label: 'Payment history', icon: BoxIcon, group: 'Account' },
  { id: 'preferences', label: 'Notifications', icon: PhoneIcon, group: 'Preferences' },
  { id: 'language', label: 'Language', icon: SettingsIcon, group: 'Preferences' },
  { id: 'privacy', label: 'Privacy', icon: ShieldIcon, group: 'Preferences' },
] as const

type Tab = (typeof tabs)[number]['id']

const PREFS_KEY = 'clickmart-prefs'
const LOCALE_KEY = 'clickmart-locale'

const emptyAddress = (): Omit<SavedAddress, 'id'> => ({
  name: '',
  phone: '',
  line: '',
  city: '',
  state: 'Karnataka',
  pin: '',
  landmark: null,
  label: 'HOME',
  isDefault: true,
})

function readJson<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null
  } catch {
    return null
  }
}

export function SettingsPage() {
  useDocumentTitle('Your account')
  const { user, logout } = useAuth()
  const wishlist = useWishlist()
  const [params, setParams] = useSearchParams()
  const tab = (tabs.find((item) => item.id === params.get('tab'))?.id ?? 'orders') as Tab
  const orderCount = useMyOrders().data?.length ?? 0
  const groups = [...new Set(tabs.map((item) => item.group))]

  return (
    <div className="bg-canvas">
      <Container className="py-6 sm:py-8">
        <div className="card flex flex-wrap items-center gap-4 px-4 py-4 sm:px-5">
          <span className="grid size-12 place-items-center overflow-hidden rounded-full bg-brand text-base font-extrabold text-white">
            {user?.avatarUrl ? <img src={user.avatarUrl} alt="" className="size-full object-cover" /> : (user?.name ?? 'G').slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-extrabold">{user ? user.name : 'Guest'}</h1>
            <p className="truncate text-sm text-muted">{user ? user.email : 'Log in to save your account across this browser'}</p>
          </div>
          <Link to="/wishlist" className="btn btn-outline btn-sm">
            <HeartIcon className="size-4" /> Wishlist ({wishlist.ids.length})
          </Link>
          {user ? (
            <button type="button" onClick={logout} className="btn btn-soft btn-sm">Log out</button>
          ) : (
            <Link to="/login" className="btn btn-accent btn-sm">Log in</Link>
          )}
        </div>

        <div className="mt-4 grid items-start gap-4 lg:grid-cols-[230px_minmax(0,1fr)]">
          <nav aria-label="Account" className="card p-2">
            {groups.map((group) => (
              <div key={group} className="mb-1 last:mb-0">
                <p className="px-3 pt-2 pb-1 text-[10px] font-bold tracking-wide text-muted uppercase">{group}</p>
                {tabs
                  .filter((item) => item.group === group)
                  .map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setParams({ tab: item.id })}
                      aria-current={tab === item.id}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-semibold ${
                        tab === item.id ? 'bg-brand-soft text-brand' : 'text-ink hover:bg-canvas'
                      }`}
                    >
                      <item.icon className="size-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {item.id === 'orders' && orderCount > 0 && (
                        <span className="rounded-full bg-accent px-1.5 text-[10px] font-bold text-white">{orderCount}</span>
                      )}
                    </button>
                  ))}
              </div>
            ))}
          </nav>

          <div key={tab} className="motion-page min-w-0">
            {tab === 'orders' && <Orders orderCount={orderCount} />}
            {tab === 'profile' && <ProfileForm key={user?.id ?? 'guest'} />}
            {tab === 'security' && <Security />}
            {tab === 'address' && <Addresses />}
            {tab === 'payments' && <Payments />}
            {tab === 'history' && <PaymentHistory />}
            {tab === 'preferences' && <Notifications />}
            {tab === 'language' && <Language />}
            {tab === 'privacy' && <Privacy />}
          </div>
        </div>
      </Container>
    </div>
  )
}

function Orders({ orderCount }: { orderCount: number }) {
  return (
    <div>
      <SectionHead title="Your orders" text="Track a delivery or look back at what you bought.">
        <Link to="/track" className="btn btn-brand btn-sm">Track by order ID</Link>
      </SectionHead>
      {orderCount === 0 ? (
        <EmptyState
          icon={<BoxIcon className="size-8" />}
          title="No orders yet"
          text="Orders you place show up here with their status."
          action={{ to: '/shop', label: 'Start shopping' }}
        />
      ) : (
        <OrderList />
      )}
    </div>
  )
}

function ProfileForm() {
  const { user, updateProfile, uploadAvatar } = useAuth()
  const photo = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(user?.name ?? '')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  if (!user) return null

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (name.trim().length < 2) return setError('Enter your full name')
    if (phone && !/^[6-9]\d{9}$/.test(phone)) return setError('Enter a valid 10-digit mobile number')
    setBusy(true)
    setError('')
    try {
      await updateProfile({ name: name.trim(), phone: phone || null })
      setSaved(true)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title="Profile" text="This name and mobile number appear on receipts and order updates.">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid size-16 place-items-center overflow-hidden rounded-full bg-brand text-lg font-extrabold text-white">
          {user.avatarUrl ? <img src={user.avatarUrl} alt="" className="size-full object-cover" /> : user.name.slice(0, 1).toUpperCase()}
        </span>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => photo.current?.click()}>Upload photo</button>
        {user.avatarUrl && <button type="button" className="btn btn-soft btn-sm" onClick={() => void updateProfile({ avatarUrl: null }).catch((err) => setError(errorMessage(err)))}>Remove</button>}
        <input ref={photo} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAvatar(file).catch((err) => setError(errorMessage(err))); event.target.value = '' }} />
      </div>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name">
          <input required value={name} onChange={(event) => { setName(event.target.value); setSaved(false); setError('') }} className="field" autoComplete="name" />
        </Field>
        <Field label="Mobile number">
          <input value={phone} inputMode="numeric" maxLength={10} placeholder="10-digit mobile" onChange={(event) => { setPhone(event.target.value.replace(/\D/g, '')); setSaved(false); setError('') }} className="field" autoComplete="tel-national" />
        </Field>
        <Field label="Email" className="sm:col-span-2">
          <input value={user.email} readOnly disabled className="field" aria-describedby="email-note" />
          <span id="email-note" className="mt-1 block text-[11px] text-muted">Your email is your login, so it cannot be changed here.</span>
        </Field>
        {error && <p role="alert" className="text-sm font-semibold text-rose-600 sm:col-span-2">{error}</p>}
        <div className="flex items-center gap-3 sm:col-span-2">
          <button type="submit" disabled={busy} className="btn btn-accent btn-sm">Save profile</button>
          {saved && <span className="text-sm font-semibold text-success">Saved</span>}
        </div>
      </form>
    </Panel>
  )
}

function Security() {
  const { user, changePassword, logout } = useAuth()
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setMessage('')
    if (!form.current) return setError('Enter your current password')
    if (form.next.length < 8) return setError('Use at least 8 characters for the new password')
    if (form.next !== form.confirm) return setError('The two new passwords do not match')
    if (form.next === form.current) return setError('Choose a password you are not using already')
    setBusy(true)
    setError('')
    try {
      await changePassword(form.current, form.next)
      setForm({ current: '', next: '', confirm: '' })
      setMessage('Password updated. You have been signed out on your other devices.')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <Panel title="Login & security" text="You sign in with your email and password. Sessions are kept safely and renew on their own.">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-xl bg-canvas px-3 py-2.5">
            <dt className="text-xs text-muted">Email</dt>
            <dd className="font-semibold">{user?.email}</dd>
          </div>
          <div className="rounded-xl bg-canvas px-3 py-2.5">
            <dt className="text-xs text-muted">Password</dt>
            <dd className="font-semibold">••••••••</dd>
          </div>
        </dl>
        <button type="button" onClick={() => void logout()} className="btn btn-outline btn-sm mt-4">
          Log out
        </button>
      </Panel>
      <Panel title="Change password" text="You will need your current password. Other devices are signed out afterwards.">
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Current password" className="sm:col-span-2">
            <input type="password" value={form.current} onChange={(event) => { setForm({ ...form, current: event.target.value }); setError('') }} className="field" autoComplete="current-password" />
          </Field>
          <Field label="New password">
            <input type="password" value={form.next} onChange={(event) => { setForm({ ...form, next: event.target.value }); setError('') }} className="field" autoComplete="new-password" />
          </Field>
          <Field label="Confirm new password">
            <input type="password" value={form.confirm} onChange={(event) => { setForm({ ...form, confirm: event.target.value }); setError('') }} className="field" autoComplete="new-password" />
          </Field>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <button type="submit" disabled={busy} className="btn btn-brand btn-sm">Update password</button>
            <Link to="/forgot-password" className="text-sm font-bold text-brand hover:underline">Forgot your current password?</Link>
          </div>
          {error && <p role="alert" className="text-sm font-semibold text-rose-600 sm:col-span-2">{error}</p>}
          {message && <p className="text-sm font-semibold text-success sm:col-span-2">{message}</p>}
        </form>
      </Panel>
    </div>
  )
}

function Addresses() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const query = useSavedAddresses(user?.id)
  const list = query.data ?? []
  const [draft, setDraft] = useState<(Omit<SavedAddress, 'id'> & { id?: string }) | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['addresses'] })

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true)
    setError('')
    try {
      await action()
      await refresh()
      return true
    } catch (err) {
      setError(errorMessage(err))
      return false
    } finally {
      setBusy(false)
    }
  }

  const saveDraft = async (event: FormEvent) => {
    event.preventDefault()
    if (!draft) return
    if (draft.pin.length !== 6) return setError('Enter a 6-digit PIN code')
    if (!/^[6-9]\d{9}$/.test(draft.phone)) return setError('Enter a valid 10-digit mobile number')
    if (draft.line.trim().length < 8) return setError('Enter the full address (house no., street, area)')
    const body = { name: draft.name.trim(), phone: draft.phone, line: draft.line.trim(), city: draft.city.trim(), state: draft.state, pin: draft.pin, landmark: draft.landmark?.trim() || null, label: draft.label, isDefault: draft.isDefault || list.length === 0 }
    const ok = await run(() => (draft.id ? api(`/me/addresses/${draft.id}`, { method: 'PUT', body }) : api('/me/addresses', { body })))
    if (ok) setDraft(null)
  }

  return (
    <Panel title="Addresses" text="Your default address is filled in at checkout.">
      {query.isLoading && <p className="mb-4 text-sm text-muted">Loading your addresses…</p>}
      {!query.isLoading && list.length === 0 && !draft && (
        <p className="mb-4 text-sm text-muted">No saved addresses yet. Add one so checkout is faster.</p>
      )}
      <ul className="space-y-2">
        {list.map((item) => (
          <li key={item.id} className="flex flex-wrap items-start gap-3 rounded-xl border border-line px-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">
                {item.name}
                <span className="ml-2 rounded-full bg-canvas px-2 py-0.5 text-[10px] font-bold text-muted ring-1 ring-line">{addressLabels[item.label] ?? 'Home'}</span>
                {item.isDefault && <span className="ml-2 rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-bold text-brand">Default</span>}
              </p>
              <p className="mt-1 text-sm text-ink">+91 {item.phone}</p>
              <p className="text-sm text-muted">{item.line}, {item.city}, {item.state} {item.pin}</p>
              {item.landmark && <p className="text-xs text-muted">Landmark: {item.landmark}</p>}
            </div>
            <div className="flex gap-2">
              {!item.isDefault && (
                <button type="button" disabled={busy} className="text-xs font-semibold text-brand" onClick={() => void run(() => api(`/me/addresses/${item.id}/default`, { method: 'POST' }))}>
                  Make default
                </button>
              )}
              <button type="button" className="text-xs font-semibold text-ink" onClick={() => { setDraft(item); setError('') }}>Edit</button>
              <button type="button" disabled={busy} className="text-xs font-semibold text-rose-600" onClick={() => void run(() => api(`/me/addresses/${item.id}`, { method: 'DELETE' }))}>
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
      {!draft ? (
        <button type="button" className="btn btn-outline btn-sm mt-4" onClick={() => { setDraft({ ...emptyAddress(), name: user?.name ?? '', isDefault: list.length === 0 }); setError('') }}>
          Add address
        </button>
      ) : (
        <form onSubmit={saveDraft} className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
          <Field label="Full name">
            <input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="field" />
          </Field>
          <Field label="Mobile">
            <input required value={draft.phone} inputMode="numeric" maxLength={10} onChange={(event) => setDraft({ ...draft, phone: event.target.value.replace(/\D/g, '') })} className="field" />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <textarea required rows={2} value={draft.line} onChange={(event) => setDraft({ ...draft, line: event.target.value })} className="field" />
          </Field>
          <Field label="PIN code">
            <input required value={draft.pin} inputMode="numeric" maxLength={6} onChange={(event) => setDraft({ ...draft, pin: event.target.value.replace(/\D/g, '') })} className="field" />
          </Field>
          <Field label="City">
            <input required value={draft.city} onChange={(event) => setDraft({ ...draft, city: event.target.value })} className="field" />
          </Field>
          <Field label="State">
            <select value={draft.state} onChange={(event) => setDraft({ ...draft, state: event.target.value })} className="field">
              {indianStates.map((state) => <option key={state}>{state}</option>)}
            </select>
          </Field>
          <Field label="Landmark (optional)">
            <input value={draft.landmark ?? ''} maxLength={120} onChange={(event) => setDraft({ ...draft, landmark: event.target.value })} className="field" placeholder="Near the temple" />
          </Field>
          <div className="sm:col-span-2">
            <span className="text-[13px] font-bold text-ink-soft">Address type</span>
            <div className="mt-1.5 flex gap-2">
              {(['HOME', 'WORK', 'OTHER'] as const).map((label) => (
                <button key={label} type="button" aria-pressed={draft.label === label} onClick={() => setDraft({ ...draft, label })} className={`rounded-full border-2 px-4 py-1.5 text-sm font-bold transition ${draft.label === label ? 'border-brand bg-brand-soft text-brand' : 'border-line hover:border-brand/40'}`}>
                  {addressLabels[label]}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2">
            <input type="checkbox" checked={draft.isDefault} onChange={(event) => setDraft({ ...draft, isDefault: event.target.checked })} /> Use as my default address
          </label>
          {error && <p role="alert" className="text-sm font-semibold text-rose-600 sm:col-span-2">{error}</p>}
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <button type="submit" disabled={busy} className="btn btn-accent btn-sm">Save address</button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </form>
      )}
      {!draft && error && <p role="alert" className="mt-3 text-sm font-semibold text-rose-600">{error}</p>}
    </Panel>
  )
}

function Payments() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const query = useSavedPayments(user?.id)
  const list = query.data ?? []
  const [kind, setKind] = useState<'UPI' | 'CARD'>('UPI')
  const [upi, setUpi] = useState('')
  const [card, setCard] = useState({ number: '', expiry: '', name: '' })
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true)
    setError('')
    try {
      await action()
      await queryClient.invalidateQueries({ queryKey: ['payment-methods'] })
      return true
    } catch (err) {
      setError(errorMessage(err))
      return false
    } finally {
      setBusy(false)
    }
  }

  const add = async (event: FormEvent) => {
    event.preventDefault()
    let body: Record<string, unknown>
    if (kind === 'UPI') {
      if (!upiIdValid(upi)) return setError('Enter a UPI ID like name@okbank.')
      body = { kind: 'UPI', upiId: upi.trim() }
    } else {
      const digits = stripNonDigits(card.number)
      if (!luhnValid(digits)) return setError('That card number does not look right. Check it and try again.')
      if (card.name.trim().length < 2) return setError('Enter the name on the card.')
      if (!parseExpiry(card.expiry)) return setError('Enter a valid expiry as MM/YY.')
      body = savedCardBody(card)
    }
    if (await run(() => api('/me/payment-methods', { body }))) {
      setUpi('')
      setCard({ number: '', expiry: '', name: '' })
      setAdding(false)
    }
  }

  return (
    <Panel title="Saved payments" text="UPI IDs and cards you keep for faster checkout. We never store full card numbers or CVV: only the last 4 digits and expiry.">
      {query.isLoading && <p className="mb-4 text-sm text-muted">Loading your saved methods…</p>}
      {!query.isLoading && list.length === 0 && !adding && <p className="mb-4 text-sm text-muted">Nothing saved yet. You can also tick “Save for next time” while paying at checkout.</p>}
      <ul className="space-y-2">
        {list.map((item: SavedPayment) => (
          <li key={item.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line px-3 py-2.5">
            <span className="grid size-9 place-items-center rounded-lg bg-brand-soft text-[11px] font-extrabold text-brand">{item.kind === 'UPI' ? 'UPI' : (item.cardBrand ?? 'CARD').slice(0, 4).toUpperCase()}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">
                {savedPaymentTitle(item)}
                {item.isDefault && <span className="ml-2 rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-bold text-brand">Default</span>}
                {isExpired(item) && <span className="ml-2 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-600">Expired</span>}
              </p>
              <p className="truncate text-xs text-muted">{savedPaymentSub(item)}</p>
            </div>
            {!item.isDefault && (
              <button type="button" disabled={busy} className="text-xs font-semibold text-brand" onClick={() => void run(() => api(`/me/payment-methods/${item.id}`, { method: 'PATCH', body: { isDefault: true } }))}>
                Make default
              </button>
            )}
            <button type="button" disabled={busy} className="text-xs font-semibold text-rose-600" onClick={() => void run(() => api(`/me/payment-methods/${item.id}`, { method: 'DELETE' }))}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      {!adding ? (
        <button type="button" className="btn btn-outline btn-sm mt-4" onClick={() => { setAdding(true); setError('') }}>Add UPI ID or card</button>
      ) : (
        <form onSubmit={add} className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
          <Field label="Type" className="sm:col-span-2">
            <select value={kind} onChange={(event) => { setKind(event.target.value as 'UPI' | 'CARD'); setError('') }} className="field">
              <option value="UPI">UPI</option>
              <option value="CARD">Debit or credit card</option>
            </select>
          </Field>
          {kind === 'UPI' ? (
            <Field label="UPI ID" className="sm:col-span-2">
              <input value={upi} placeholder="name@okbank" autoCapitalize="none" onChange={(event) => setUpi(event.target.value)} className="field" />
            </Field>
          ) : (
            <>
              <Field label="Name on card">
                <input value={card.name} autoComplete="cc-name" onChange={(event) => setCard({ ...card, name: event.target.value })} className="field" />
              </Field>
              <Field label={`Card number${cardBrand(stripNonDigits(card.number)) ? ` · ${cardBrand(stripNonDigits(card.number))}` : ''}`}>
                <input value={card.number} inputMode="numeric" autoComplete="cc-number" placeholder="1234 5678 9012 3456" onChange={(event) => setCard({ ...card, number: formatCard(event.target.value) })} className="field font-mono" />
              </Field>
              <Field label="Expiry">
                <input value={card.expiry} placeholder="MM/YY" inputMode="numeric" autoComplete="cc-exp" maxLength={5} onChange={(event) => setCard({ ...card, expiry: formatExpiry(event.target.value) })} className="field font-mono" />
              </Field>
              <p className="self-end text-xs text-muted">Only the last 4 digits and expiry are saved. You will enter the CVV each time you pay.</p>
            </>
          )}
          {error && <p role="alert" className="text-sm font-semibold text-rose-600 sm:col-span-2">{error}</p>}
          <div className="flex gap-3 sm:col-span-2">
            <button type="submit" disabled={busy} className="btn btn-accent btn-sm">Save method</button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => { setAdding(false); setError('') }}>Cancel</button>
          </div>
        </form>
      )}
      {!adding && error && <p role="alert" className="mt-3 text-sm font-semibold text-rose-600">{error}</p>}
    </Panel>
  )
}

const statusStyle = {
  PAID: 'bg-emerald-50 text-emerald-700',
  PENDING: 'bg-amber-50 text-amber-700',
  FAILED: 'bg-rose-50 text-rose-700',
  REFUNDED: 'bg-sky-50 text-sky-700',
} as const
const statusLabel = { PAID: 'Paid', PENDING: 'Pending', FAILED: 'Failed', REFUNDED: 'Refunded' } as const

function PaymentHistory() {
  const { user } = useAuth()
  const query = usePaymentHistory(user?.id)
  const items = query.data ?? []
  const [filter, setFilter] = useState<'ALL' | 'PAID' | 'FAILED' | 'REFUNDED'>('ALL')
  const shown = items.filter((item) => filter === 'ALL' || item.status === filter || (filter === 'REFUNDED' && item.refunds.length > 0))
  const paidTotal = items.filter((item) => item.status === 'PAID' || item.status === 'REFUNDED').reduce((sum, item) => sum + item.amount, 0)
  const date = (value: string) => new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })

  return (
    <Panel title="Payment history" text="Every payment on your orders, including failed attempts and refunds.">
      {query.isLoading && <p className="text-sm text-muted">Loading your payments…</p>}
      {query.isError && <p className="text-sm font-semibold text-rose-600">Could not load your payments. Please try again.</p>}
      {!query.isLoading && items.length === 0 && !query.isError && (
        <EmptyState icon={<CardIcon className="size-8" />} title="No payments yet" text="Once you place an order, its payment shows up here." action={{ to: '/shop', label: 'Browse dry fruits' }} />
      )}
      {items.length > 0 && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {(['ALL', 'PAID', 'FAILED', 'REFUNDED'] as const).map((value) => (
              <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`rounded-full border-2 px-3.5 py-1 text-xs font-bold transition ${filter === value ? 'border-brand bg-brand-soft text-brand' : 'border-line hover:border-brand/40'}`}>
                {value === 'ALL' ? 'All' : statusLabel[value]}
              </button>
            ))}
            <span className="ml-auto text-xs text-muted">Total paid: <b className="text-ink">{formatPrice(paidTotal)}</b></span>
          </div>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {shown.map((item) => (
              <li key={item.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">
                    <Link to={`/order/${item.orderCode}`} className="text-brand hover:underline">{item.orderCode}</Link>
                    <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${statusStyle[item.status]}`}>{statusLabel[item.status]}</span>
                  </p>
                  <p className="mt-0.5 text-sm text-ink">{item.detail}</p>
                  <p className="text-xs text-muted">{date(item.paidAt ?? item.createdAt)}{item.reference ? ` · Ref ${item.reference}` : ''}</p>
                  {item.failureReason && item.status === 'FAILED' && <p className="mt-0.5 text-xs font-semibold text-rose-600">{item.failureReason}</p>}
                  {item.refunds.map((refund) => (
                    <p key={refund.id} className="mt-0.5 text-xs font-semibold text-sky-700">Refunded {formatPrice(refund.amount)} on {date(refund.createdAt)}</p>
                  ))}
                </div>
                <p className={`text-sm font-extrabold ${item.status === 'FAILED' ? 'text-muted line-through' : ''}`}>{formatPrice(item.amount)}</p>
              </li>
            ))}
            {shown.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">No payments match this filter.</li>}
          </ul>
        </>
      )}
    </Panel>
  )
}

function Notifications() {
  const [prefs, setPrefs] = useState(() => ({
    orderEmail: true,
    orderSms: true,
    offers: true,
    whatsapp: false,
    newsletter: false,
    ...((readJson<Record<string, boolean>>(PREFS_KEY) ?? {}) as object),
  }))
  const rows = [
    { key: 'orderEmail', title: 'Order emails', text: 'Confirmation, dispatch and delivery.' },
    { key: 'orderSms', title: 'Order SMS', text: 'Shipping updates on your mobile.' },
    { key: 'whatsapp', title: 'WhatsApp updates', text: 'Delivery messages on WhatsApp.' },
    { key: 'offers', title: 'Offers and coupons', text: 'Sales, DRY15 and new harvests.' },
    { key: 'newsletter', title: 'Harvest notes', text: 'Recipes and new packs, occasionally.' },
  ] as const
  return (
    <Panel title="Notifications" text="Choose how ClickMart reaches you. Saved on this device.">
      <ul className="divide-y divide-line">
        {rows.map((row) => {
          const on = Boolean(prefs[row.key as keyof typeof prefs])
          return (
            <li key={row.key} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
              <div>
                <p className="text-sm font-bold">{row.title}</p>
                <p className="text-xs text-muted">{row.text}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={row.title}
                onClick={() => {
                  const next = { ...prefs, [row.key]: !on }
                  setPrefs(next)
                  localStorage.setItem(PREFS_KEY, JSON.stringify(next))
                }}
                className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? 'bg-brand' : 'bg-slate-300'}`}
              >
                <span className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
              </button>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}

function Language() {
  const [language, setLanguage] = useState(() => readJson<{ language: string }>(LOCALE_KEY)?.language ?? 'en')
  const choose = (value: string) => {
    setLanguage(value)
    localStorage.setItem(LOCALE_KEY, JSON.stringify({ language: value }))
  }
  return (
    <Panel title="Language" text="Prices stay in rupees. The language preference is saved for this browser.">
      <div className="grid gap-2 sm:grid-cols-2">
        {[
          { id: 'en', title: 'English', text: 'Default store language' },
          { id: 'hi', title: 'हिन्दी', text: 'Hindi preference' },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => choose(item.id)}
            className={`rounded-xl border px-4 py-3 text-left ${language === item.id ? 'border-brand bg-brand-soft' : 'border-line hover:border-brand/30'}`}
          >
            <span className="block text-sm font-bold">{item.title}</span>
            <span className="block text-xs text-muted">{item.text}</span>
          </button>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted">Currency is INR. ClickMart ships across India.</p>
    </Panel>
  )
}

function Privacy() {
  const cart = useCart()
  const { user } = useAuth()
  const orders = useMyOrders()
  const addresses = useSavedAddresses(user?.id)
  const savedPayments = useSavedPayments(user?.id)
  const paymentHistory = usePaymentHistory(user?.id)
  const [note, setNote] = useState('')
  const download = () => {
    const blob = new Blob(
      [JSON.stringify({ account: user, addresses: addresses.data ?? [], savedPayments: savedPayments.data ?? [], payments: paymentHistory.data ?? [], orders: orders.data ?? [], preferences: readJson(PREFS_KEY) }, null, 2)],
      { type: 'application/json' },
    )
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'clickmart-account.json'
    link.click()
    URL.revokeObjectURL(url)
  }
  return (
    <Panel title="Privacy" text="Download everything we hold about your account, or tidy up this device.">
      <div className="grid gap-2">
        <button type="button" onClick={download} className="btn btn-outline btn-sm w-fit">Download my data</button>
        <button
          type="button"
          className="btn btn-soft btn-sm w-fit"
          onClick={() => {
            cart.clear()
            setNote('Cart cleared.')
          }}
        >
          Clear cart
        </button>
        <div className="flex flex-wrap gap-3 pt-2 text-sm font-semibold">
          <Link to="/privacy" className="text-brand">Privacy policy</Link>
          <Link to="/terms" className="text-brand">Terms</Link>
        </div>
        {note && <p className="text-sm font-semibold text-success">{note}</p>}
      </div>
    </Panel>
  )
}

function SectionHead({ title, text, children }: { title: string; text: string; children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-lg font-extrabold">{title}</h2>
        <p className="text-sm text-muted">{text}</p>
      </div>
      {children}
    </div>
  )
}

function Panel({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  return (
    <section className="card p-4 sm:p-5">
      <h2 className="text-lg font-extrabold">{title}</h2>
      <p className="mt-1 mb-4 text-sm text-muted">{text}</p>
      {children}
    </section>
  )
}

function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block text-xs font-bold text-ink ${className}`}>
      {label}
      <span className="mt-1.5 block font-normal">{children}</span>
    </label>
  )
}
