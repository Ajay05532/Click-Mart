import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BoxIcon, HeartIcon, PinIcon, SettingsIcon, UserIcon } from '../components/icons.tsx'
import { Container } from '../components/layout/Container.tsx'
import { OrderList } from '../components/order/OrderList.tsx'
import { EmptyState } from '../components/ui/Primitives.tsx'
import { useAuth } from '../context/AuthContext.tsx'
import { useWishlist } from '../context/WishlistContext.tsx'
import { indianStates } from '../data/india.ts'
import { loadOrderRecords } from '../lib/orders.ts'
import { useDocumentTitle } from '../lib/useDocumentTitle.ts'

const tabs = [
  { id: 'orders', label: 'Orders & tracking', icon: BoxIcon },
  { id: 'profile', label: 'Profile', icon: UserIcon },
  { id: 'address', label: 'Address', icon: PinIcon },
  { id: 'preferences', label: 'Preferences', icon: SettingsIcon },
] as const
type Tab = (typeof tabs)[number]['id']

const ADDRESS_KEY = 'clickmart-address'
const PREFS_KEY = 'clickmart-prefs'

function read<T>(key: string, fallback: T): T {
  try {
    return { ...fallback, ...(JSON.parse(localStorage.getItem(key) ?? 'null') ?? {}) }
  } catch {
    return fallback
  }
}

export function SettingsPage() {
  useDocumentTitle('Settings')
  const { user, login, logout } = useAuth()
  const wishlist = useWishlist()
  const [params, setParams] = useSearchParams()
  const tab = (tabs.find((item) => item.id === params.get('tab'))?.id ?? 'orders') as Tab
  const orderCount = loadOrderRecords().length

  return (
    <div className="bg-canvas">
      <Container className="py-8 sm:py-12">
        <div className="card flex flex-wrap items-center gap-4 p-5 sm:p-6">
          <span className="grid size-14 place-items-center rounded-full bg-gradient-to-br from-brand to-[#2f6bd6] text-lg font-extrabold text-white">
            {(user?.name ?? 'G').slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-extrabold sm:text-2xl">{user ? user.name : 'Guest'}</h1>
            <p className="truncate text-sm text-muted">{user ? user.email : 'Log in to sync your details'}</p>
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

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[250px_1fr]">
          <nav aria-label="Settings" className="no-scrollbar card flex gap-1 overflow-x-auto p-2 lg:flex-col">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setParams({ tab: item.id })}
                aria-current={tab === item.id}
                className={`flex shrink-0 items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition ${
                  tab === item.id ? 'bg-brand-soft text-brand' : 'text-ink-soft hover:bg-canvas'
                }`}
              >
                <item.icon className="size-5" />
                {item.label}
                {item.id === 'orders' && orderCount > 0 && (
                  <span className="ml-auto rounded-full bg-accent px-2 py-0.5 text-[10px] font-extrabold text-white">{orderCount}</span>
                )}
              </button>
            ))}
          </nav>

          <div key={tab} className="motion-page min-w-0">
            {tab === 'orders' && (
              <div>
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-extrabold">Order history</h2>
                    <p className="text-sm text-muted">Track an order or review what you bought.</p>
                  </div>
                  <Link to="/track" className="btn btn-brand btn-sm">Track by order ID</Link>
                </div>
                {orderCount === 0 ? (
                  <EmptyState
                    icon={<BoxIcon className="size-9" />}
                    title="No orders yet"
                    text="Your orders and live tracking will appear here."
                    action={{ to: '/shop', label: 'Start shopping' }}
                  />
                ) : (
                  <OrderList />
                )}
              </div>
            )}
            {tab === 'profile' && <ProfileForm key={user?.email ?? 'guest'} user={user} login={login} />}
            {tab === 'address' && <AddressForm />}
            {tab === 'preferences' && <Preferences />}
          </div>
        </div>
      </Container>
    </div>
  )

}

function ProfileForm({ user, login }: { user: { name: string; email: string } | null; login: (u: { name: string; email: string }) => void }) {
  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [saved, setSaved] = useState(false)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    login({ name: name.trim() || 'Customer', email })
    setSaved(true)
  }
  if (!user) {
    return <EmptyState icon={<UserIcon className="size-9" />} title="You are not logged in" text="Log in to edit your profile." action={{ to: '/login', label: 'Log in' }} />
  }
  return (
    <Panel title="Profile" text="Your name and email are used for orders and receipts.">
      <form onSubmit={submit} className="grid gap-5 sm:grid-cols-2">
        <label className="block text-[13px] font-bold text-ink-soft">Full name
          <input required value={name} onChange={(e) => { setName(e.target.value); setSaved(false) }} className="field mt-1.5" />
        </label>
        <label className="block text-[13px] font-bold text-ink-soft">Email
          <input required type="email" value={email} onChange={(e) => { setEmail(e.target.value); setSaved(false) }} className="field mt-1.5" />
        </label>
        <div className="flex items-center gap-3 sm:col-span-2">
          <button type="submit" className="btn btn-accent">Save changes</button>
          {saved && <span className="motion-panel text-sm font-bold text-success">✓ Saved</span>}
        </div>
      </form>
    </Panel>
  )
}

function AddressForm() {
  const [form, setForm] = useState(() => read(ADDRESS_KEY, { name: '', phone: '', address: '', city: '', state: 'Karnataka', pin: '', email: '' }))
  const [saved, setSaved] = useState(false)
  const set = (key: string, value: string) => { setForm({ ...form, [key]: value }); setSaved(false) }
  return (
    <Panel title="Delivery address" text="Pre-filled at checkout so ordering takes seconds.">
      <form
        onSubmit={(event) => { event.preventDefault(); localStorage.setItem(ADDRESS_KEY, JSON.stringify(form)); setSaved(true) }}
        className="grid gap-5 sm:grid-cols-2"
      >
        <label className="block text-[13px] font-bold text-ink-soft">Full name
          <input value={form.name} onChange={(e) => set('name', e.target.value)} className="field mt-1.5" /></label>
        <label className="block text-[13px] font-bold text-ink-soft">Mobile number
          <input value={form.phone} inputMode="numeric" maxLength={10} onChange={(e) => set('phone', e.target.value.replace(/\D/g, ''))} className="field mt-1.5" /></label>
        <label className="block text-[13px] font-bold text-ink-soft sm:col-span-2">Address
          <textarea rows={3} value={form.address} onChange={(e) => set('address', e.target.value)} className="field mt-1.5" /></label>
        <label className="block text-[13px] font-bold text-ink-soft">City
          <input value={form.city} onChange={(e) => set('city', e.target.value)} className="field mt-1.5" /></label>
        <label className="block text-[13px] font-bold text-ink-soft">PIN code
          <input value={form.pin} inputMode="numeric" maxLength={6} onChange={(e) => set('pin', e.target.value.replace(/\D/g, ''))} className="field mt-1.5" /></label>
        <label className="block text-[13px] font-bold text-ink-soft sm:col-span-2">State
          <select value={form.state} onChange={(e) => set('state', e.target.value)} className="field mt-1.5">
            {indianStates.map((state) => <option key={state}>{state}</option>)}
          </select></label>
        <div className="flex items-center gap-3 sm:col-span-2">
          <button type="submit" className="btn btn-accent">Save address</button>
          {saved && <span className="motion-panel text-sm font-bold text-success">✓ Saved</span>}
        </div>
      </form>
    </Panel>
  )
}

function Preferences() {
  const [prefs, setPrefs] = useState(() => read(PREFS_KEY, { orderUpdates: true, offers: true, newsletter: false }))
  const toggle = (key: keyof typeof prefs) => {
    const next = { ...prefs, [key]: !prefs[key] }
    setPrefs(next)
    localStorage.setItem(PREFS_KEY, JSON.stringify(next))
  }
  const rows: { key: keyof typeof prefs; title: string; text: string }[] = [
    { key: 'orderUpdates', title: 'Order updates', text: 'Confirmation, shipping and delivery alerts.' },
    { key: 'offers', title: 'Offers & coupons', text: 'Be first to know about discounts.' },
    { key: 'newsletter', title: 'Harvest notes', text: 'New packs and recipes, occasionally.' },
  ]
  return (
    <Panel title="Preferences" text="Choose what we send you. Changes save automatically.">
      <ul className="divide-y divide-line">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
            <div>
              <p className="font-extrabold">{row.title}</p>
              <p className="text-sm text-muted">{row.text}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={prefs[row.key]}
              aria-label={row.title}
              onClick={() => toggle(row.key)}
              className={`relative h-7 w-12 shrink-0 rounded-full transition ${prefs[row.key] ? 'bg-brand' : 'bg-slate-300'}`}
            >
              <span className={`absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow transition-transform ${prefs[row.key] ? 'translate-x-5' : ''}`} />
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

function Panel({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  return (
    <section className="card p-5 sm:p-7">
      <h2 className="text-xl font-extrabold">{title}</h2>
      <p className="mt-1 mb-6 text-sm text-muted">{text}</p>
      {children}
    </section>
  )
}
