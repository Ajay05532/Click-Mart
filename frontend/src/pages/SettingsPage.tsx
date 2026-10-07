import { useState, type FormEvent, type ReactNode } from 'react'
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
import { useCart } from '../context/CartContext.tsx'
import { useWishlist } from '../context/WishlistContext.tsx'
import { indianStates } from '../data/india.ts'
import { loadOrderRecords } from '../lib/orders.ts'
import { useDocumentTitle } from '../lib/useDocumentTitle.ts'

const tabs = [
  { id: 'orders', label: 'Orders', icon: BoxIcon, group: 'Shopping' },
  { id: 'profile', label: 'Profile', icon: UserIcon, group: 'Account' },
  { id: 'security', label: 'Login & security', icon: LockIcon, group: 'Account' },
  { id: 'address', label: 'Addresses', icon: PinIcon, group: 'Account' },
  { id: 'payments', label: 'Payments', icon: CardIcon, group: 'Account' },
  { id: 'preferences', label: 'Notifications', icon: PhoneIcon, group: 'Preferences' },
  { id: 'language', label: 'Language', icon: SettingsIcon, group: 'Preferences' },
  { id: 'privacy', label: 'Privacy', icon: ShieldIcon, group: 'Preferences' },
] as const

type Tab = (typeof tabs)[number]['id']

const ADDRESS_KEY = 'clickmart-address'
const ADDRESSES_KEY = 'clickmart-addresses'
const PREFS_KEY = 'clickmart-prefs'
const SECURITY_KEY = 'clickmart-security'
const PAYMENTS_KEY = 'clickmart-payments'
const LOCALE_KEY = 'clickmart-locale'

type SavedAddress = {
  id: string
  label: 'Home' | 'Work' | 'Other'
  name: string
  phone: string
  address: string
  city: string
  state: string
  pin: string
  isDefault: boolean
}

type SavedPayment = {
  id: string
  kind: 'upi' | 'card'
  label: string
  detail: string
  isDefault: boolean
}

const emptyAddress = (): SavedAddress => ({
  id: crypto.randomUUID(),
  label: 'Home',
  name: '',
  phone: '',
  address: '',
  city: '',
  state: 'Karnataka',
  pin: '',
  isDefault: true,
})

function readJson<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null
  } catch {
    return null
  }
}

function loadAddresses(): SavedAddress[] {
  const stored = readJson<SavedAddress[]>(ADDRESSES_KEY)
  if (Array.isArray(stored) && stored.length) return stored
  const legacy = readJson<Partial<SavedAddress>>(ADDRESS_KEY)
  if (legacy?.name || legacy?.address) {
    return [{ ...emptyAddress(), ...legacy, id: 'legacy', label: 'Home', isDefault: true }]
  }
  return []
}

function saveAddresses(list: SavedAddress[]) {
  localStorage.setItem(ADDRESSES_KEY, JSON.stringify(list))
  const chosen = list.find((item) => item.isDefault) ?? list[0]
  if (!chosen) {
    localStorage.removeItem(ADDRESS_KEY)
    return
  }
  localStorage.setItem(
    ADDRESS_KEY,
    JSON.stringify({
      name: chosen.name,
      phone: chosen.phone,
      address: chosen.address,
      city: chosen.city,
      state: chosen.state,
      pin: chosen.pin,
      email: '',
    }),
  )
}

export function SettingsPage() {
  useDocumentTitle('Your account')
  const { user, login, logout } = useAuth()
  const wishlist = useWishlist()
  const [params, setParams] = useSearchParams()
  const tab = (tabs.find((item) => item.id === params.get('tab'))?.id ?? 'orders') as Tab
  const orderCount = loadOrderRecords().length
  const groups = [...new Set(tabs.map((item) => item.group))]

  return (
    <div className="bg-canvas">
      <Container className="py-6 sm:py-8">
        <div className="card flex flex-wrap items-center gap-4 px-4 py-4 sm:px-5">
          <span className="grid size-12 place-items-center rounded-full bg-brand text-base font-extrabold text-white">
            {(user?.name ?? 'G').slice(0, 1).toUpperCase()}
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
            {tab === 'profile' && <ProfileForm key={user?.email ?? 'guest'} user={user} login={login} />}
            {tab === 'security' && <Security user={user} />}
            {tab === 'address' && <Addresses />}
            {tab === 'payments' && <Payments />}
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
          text="Orders you place on this browser show up here with their status."
          action={{ to: '/shop', label: 'Start shopping' }}
        />
      ) : (
        <OrderList />
      )}
    </div>
  )
}

function ProfileForm({
  user,
  login,
}: {
  user: { name: string; email: string } | null
  login: (next: { name: string; email: string }) => void
}) {
  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [saved, setSaved] = useState(false)
  if (!user) {
    return (
      <EmptyState
        icon={<UserIcon className="size-8" />}
        title="You are browsing as a guest"
        text="Log in to keep your name and email on orders."
        action={{ to: '/login', label: 'Log in' }}
      />
    )
  }
  return (
    <Panel title="Profile" text="This name and email appear on receipts and order updates.">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          login({ name: name.trim() || 'Customer', email })
          setSaved(true)
        }}
        className="grid gap-4 sm:grid-cols-2"
      >
        <Field label="Full name">
          <input required value={name} onChange={(event) => { setName(event.target.value); setSaved(false) }} className="field" />
        </Field>
        <Field label="Email">
          <input required type="email" value={email} onChange={(event) => { setEmail(event.target.value); setSaved(false) }} className="field" />
        </Field>
        <SaveRow saved={saved} label="Save profile" />
      </form>
    </Panel>
  )
}

function Security({ user }: { user: { name: string; email: string } | null }) {
  const [security, setSecurity] = useState(() => readJson<{ phone: string; passwordSet: boolean }>(SECURITY_KEY) ?? { phone: '', passwordSet: false })
  const [phone, setPhone] = useState(security.phone)
  const [password, setPassword] = useState({ next: '', confirm: '' })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const savePhone = (event: FormEvent) => {
    event.preventDefault()
    if (phone && phone.length !== 10) {
      setError('Enter a 10-digit mobile number.')
      return
    }
    const next = { ...security, phone }
    setSecurity(next)
    localStorage.setItem(SECURITY_KEY, JSON.stringify(next))
    setError('')
    setMessage('Mobile number saved on this device.')
  }

  const savePassword = (event: FormEvent) => {
    event.preventDefault()
    if (password.next.length < 6) {
      setError('Use at least 6 characters.')
      return
    }
    if (password.next !== password.confirm) {
      setError('The two passwords do not match.')
      return
    }
    const next = { ...security, passwordSet: true }
    setSecurity(next)
    localStorage.setItem(SECURITY_KEY, JSON.stringify(next))
    setPassword({ next: '', confirm: '' })
    setError('')
    setMessage('Password updated for this browser. It is not sent to a server.')
  }

  return (
    <div className="space-y-4">
      <Panel title="Login & security" text="Mobile and password stay in this browser, the same way your cart does.">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-xl bg-canvas px-3 py-2.5">
            <dt className="text-xs text-muted">Email</dt>
            <dd className="font-semibold">{user?.email ?? 'Not signed in'}</dd>
          </div>
          <div className="rounded-xl bg-canvas px-3 py-2.5">
            <dt className="text-xs text-muted">Password</dt>
            <dd className="font-semibold">{security.passwordSet ? 'Set on this device' : 'Not set'}</dd>
          </div>
        </dl>
        <form onSubmit={savePhone} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field label="Mobile number">
            <input
              value={phone}
              inputMode="numeric"
              maxLength={10}
              placeholder="10-digit mobile"
              onChange={(event) => setPhone(event.target.value.replace(/\D/g, ''))}
              className="field"
            />
          </Field>
          <button type="submit" className="btn btn-accent btn-sm h-12">Save mobile</button>
        </form>
      </Panel>
      <Panel title="Change password" text="Used only as a local lock for this demo account.">
        <form onSubmit={savePassword} className="grid gap-4 sm:grid-cols-2">
          <Field label="New password">
            <input type="password" value={password.next} onChange={(event) => setPassword({ ...password, next: event.target.value })} className="field" />
          </Field>
          <Field label="Confirm password">
            <input type="password" value={password.confirm} onChange={(event) => setPassword({ ...password, confirm: event.target.value })} className="field" />
          </Field>
          <div className="sm:col-span-2">
            <button type="submit" className="btn btn-brand btn-sm">Update password</button>
          </div>
        </form>
        {error && <p className="mt-3 text-sm font-semibold text-rose-600">{error}</p>}
        {message && <p className="mt-3 text-sm font-semibold text-success">{message}</p>}
      </Panel>
    </div>
  )
}

function Addresses() {
  const [list, setList] = useState(loadAddresses)
  const [draft, setDraft] = useState<SavedAddress | null>(null)
  const [saved, setSaved] = useState(false)

  const commit = (next: SavedAddress[]) => {
    setList(next)
    saveAddresses(next)
    setSaved(true)
  }

  const saveDraft = (event: FormEvent) => {
    event.preventDefault()
    if (!draft) return
    if (draft.pin.length !== 6 || draft.phone.length !== 10 || !draft.address.trim()) return
    const without = list.filter((item) => item.id !== draft.id)
    const nextDraft = { ...draft, isDefault: draft.isDefault || without.length === 0 }
    const next = nextDraft.isDefault
      ? [...without.map((item) => ({ ...item, isDefault: false })), nextDraft]
      : [...without, nextDraft]
    commit(next)
    setDraft(null)
  }

  return (
    <Panel title="Addresses" text="Your default address is filled in at checkout.">
      {list.length === 0 && !draft && (
        <p className="mb-4 text-sm text-muted">No saved addresses yet. Add home or work so checkout is faster.</p>
      )}
      <ul className="space-y-2">
        {list.map((item) => (
          <li key={item.id} className="flex flex-wrap items-start gap-3 rounded-xl border border-line px-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">
                {item.label}
                {item.isDefault && <span className="ml-2 rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-bold text-brand">Default</span>}
              </p>
              <p className="mt-1 text-sm text-ink">{item.name} · {item.phone}</p>
              <p className="text-sm text-muted">{item.address}, {item.city}, {item.state} {item.pin}</p>
            </div>
            <div className="flex gap-2">
              {!item.isDefault && (
                <button type="button" className="text-xs font-semibold text-brand" onClick={() => commit(list.map((row) => ({ ...row, isDefault: row.id === item.id })))}>
                  Make default
                </button>
              )}
              <button type="button" className="text-xs font-semibold text-ink" onClick={() => { setDraft(item); setSaved(false) }}>Edit</button>
              <button
                type="button"
                className="text-xs font-semibold text-rose-600"
                onClick={() => {
                  const next = list.filter((row) => row.id !== item.id)
                  if (item.isDefault && next[0]) next[0] = { ...next[0], isDefault: true }
                  commit(next)
                }}
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
      {!draft ? (
        <button type="button" className="btn btn-outline btn-sm mt-4" onClick={() => { setDraft({ ...emptyAddress(), isDefault: list.length === 0 }); setSaved(false) }}>
          Add address
        </button>
      ) : (
        <form onSubmit={saveDraft} className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
          <Field label="Label">
            <select value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value as SavedAddress['label'] })} className="field">
              <option>Home</option>
              <option>Work</option>
              <option>Other</option>
            </select>
          </Field>
          <Field label="Full name">
            <input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="field" />
          </Field>
          <Field label="Mobile">
            <input required value={draft.phone} inputMode="numeric" maxLength={10} onChange={(event) => setDraft({ ...draft, phone: event.target.value.replace(/\D/g, '') })} className="field" />
          </Field>
          <Field label="PIN code">
            <input required value={draft.pin} inputMode="numeric" maxLength={6} onChange={(event) => setDraft({ ...draft, pin: event.target.value.replace(/\D/g, '') })} className="field" />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <textarea required rows={2} value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} className="field" />
          </Field>
          <Field label="City">
            <input required value={draft.city} onChange={(event) => setDraft({ ...draft, city: event.target.value })} className="field" />
          </Field>
          <Field label="State">
            <select value={draft.state} onChange={(event) => setDraft({ ...draft, state: event.target.value })} className="field">
              {indianStates.map((state) => <option key={state}>{state}</option>)}
            </select>
          </Field>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <button type="submit" className="btn btn-accent btn-sm">Save address</button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setDraft(null)}>Cancel</button>
            {saved && <span className="text-sm font-semibold text-success">Saved</span>}
          </div>
        </form>
      )}
    </Panel>
  )
}

function Payments() {
  const [list, setList] = useState<SavedPayment[]>(() => readJson<SavedPayment[]>(PAYMENTS_KEY) ?? [])
  const [kind, setKind] = useState<'upi' | 'card'>('upi')
  const [upi, setUpi] = useState('')
  const [card, setCard] = useState({ number: '', expiry: '', name: '' })
  const [error, setError] = useState('')

  const commit = (next: SavedPayment[]) => {
    setList(next)
    localStorage.setItem(PAYMENTS_KEY, JSON.stringify(next))
  }

  const add = (event: FormEvent) => {
    event.preventDefault()
    if (kind === 'upi') {
      if (!upi.includes('@')) {
        setError('Enter a UPI ID like name@okbank.')
        return
      }
      const row: SavedPayment = { id: crypto.randomUUID(), kind, label: 'UPI', detail: upi.trim(), isDefault: list.length === 0 }
      commit(row.isDefault ? [row] : [...list, row])
      setUpi('')
    } else {
      const digits = card.number.replace(/\D/g, '')
      if (digits.length < 12 || !/^\d{2}\/\d{2}$/.test(card.expiry)) {
        setError('Enter a card number and expiry as MM/YY. Only the last 4 digits are saved.')
        return
      }
      const row: SavedPayment = {
        id: crypto.randomUUID(),
        kind,
        label: card.name.trim() || 'Card',
        detail: `•••• ${digits.slice(-4)} · ${card.expiry}`,
        isDefault: list.length === 0,
      }
      commit(row.isDefault ? [row] : [...list, row])
      setCard({ number: '', expiry: '', name: '' })
    }
    setError('')
  }

  return (
    <Panel title="Payments" text="Saved methods are stored on this device. Full card numbers are not kept.">
      <ul className="space-y-2">
        {list.map((item) => (
          <li key={item.id} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5">
            <span className="text-sm font-bold">{item.kind === 'upi' ? 'UPI' : 'Card'}</span>
            <span className="min-w-0 flex-1 truncate text-sm text-muted">{item.detail}</span>
            {item.isDefault && <span className="text-[10px] font-bold text-brand">Default</span>}
            {!item.isDefault && (
              <button type="button" className="text-xs font-semibold text-brand" onClick={() => commit(list.map((row) => ({ ...row, isDefault: row.id === item.id })))}>
                Default
              </button>
            )}
            <button type="button" className="text-xs font-semibold text-rose-600" onClick={() => {
              const next = list.filter((row) => row.id !== item.id)
              if (item.isDefault && next[0]) next[0] = { ...next[0], isDefault: true }
              commit(next)
            }}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
        <Field label="Type">
          <select value={kind} onChange={(event) => setKind(event.target.value as 'upi' | 'card')} className="field">
            <option value="upi">UPI</option>
            <option value="card">Debit or credit card</option>
          </select>
        </Field>
        {kind === 'upi' ? (
          <Field label="UPI ID">
            <input value={upi} placeholder="name@okbank" onChange={(event) => setUpi(event.target.value)} className="field" />
          </Field>
        ) : (
          <>
            <Field label="Name on card">
              <input value={card.name} onChange={(event) => setCard({ ...card, name: event.target.value })} className="field" />
            </Field>
            <Field label="Card number">
              <input value={card.number} inputMode="numeric" onChange={(event) => setCard({ ...card, number: event.target.value })} className="field" />
            </Field>
            <Field label="Expiry">
              <input value={card.expiry} placeholder="MM/YY" maxLength={5} onChange={(event) => setCard({ ...card, expiry: event.target.value })} className="field" />
            </Field>
          </>
        )}
        <div className="sm:col-span-2">
          <button type="submit" className="btn btn-accent btn-sm">Save method</button>
          {error && <p className="mt-2 text-sm font-semibold text-rose-600">{error}</p>}
        </div>
      </form>
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
  const [note, setNote] = useState('')
  const download = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            user: readJson('clickmart-user'),
            addresses: readJson(ADDRESSES_KEY),
            payments: readJson(PAYMENTS_KEY),
            preferences: readJson(PREFS_KEY),
            orders: loadOrderRecords(),
          },
          null,
          2,
        ),
      ],
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
    <Panel title="Privacy" text="Your account data on this site is stored in the browser, not in a cloud profile.">
      <div className="grid gap-2">
        <button type="button" onClick={download} className="btn btn-outline btn-sm w-fit">Download my data</button>
        <button
          type="button"
          className="btn btn-soft btn-sm w-fit"
          onClick={() => {
            cart.clear()
            setNote('Cart cleared on this device.')
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

function SaveRow({ saved, label }: { saved: boolean; label: string }) {
  return (
    <div className="flex items-center gap-3 sm:col-span-2">
      <button type="submit" className="btn btn-accent btn-sm">{label}</button>
      {saved && <span className="text-sm font-semibold text-success">Saved</span>}
    </div>
  )
}
