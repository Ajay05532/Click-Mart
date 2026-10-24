import { useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { api } from '../api.ts'
import { AdminOnly } from '../Layout.tsx'
import { inr } from '../format.ts'
import { useAction } from '../hooks.ts'
import { Badge, Button, Card, ErrorState, Field, Input, Modal, PageHeader, PageLoader, Select, Switch, Textarea, errorMessage } from '../ui.tsx'

type Settings = {
  storeName: string
  businessName: string
  gstin: string
  businessState: string
  supportEmail: string
  supportPhone: string
  address: string
  freeShippingThreshold: number
  shippingFee: number
  codEnabled: boolean
  codMaxOrder: number
  lowStockDefault: number
  nonServiceablePincodes: string[]
  nonServiceableStates: string[]
  pickupPincode: string
  nimbuspostWarehouseId: string
}
type PublicSettings = { paymentProvider: 'mock' | 'razorpay'; paymentTestMode: boolean }
type NumberKey = 'freeShippingThreshold' | 'shippingFee' | 'codMaxOrder' | 'lowStockDefault'
type Form = Omit<Settings, NumberKey> & Record<NumberKey, string>

/** GST state codes: the first two digits of a GSTIN. */
const GST_STATES: Record<string, string> = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan',
  '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya',
  '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu',
  '34': 'Puducherry', '35': 'Andaman and Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh',
}
const STATES = [...new Set(Object.values(GST_STATES))].sort()
const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
const EMAIL = /^\S+@\S+\.\S+$/

const toForm = (s: Settings): Form => ({ ...s, freeShippingThreshold: String(s.freeShippingThreshold), shippingFee: String(s.shippingFee), codMaxOrder: String(s.codMaxOrder), lowStockDefault: String(s.lowStockDefault) })
const whole = (value: string) => /^\d+$/.test(value.trim())

export function SettingsPage() {
  const query = useQuery({ queryKey: ['settings'], queryFn: () => api<{ settings: Settings; nimbuspostEnabled: boolean }>('/admin/settings') })
  return (
    <AdminOnly>
      <PageHeader title="Settings" subtitle="How your store presents itself, charges for delivery and takes payment." />
      {query.isLoading ? (
        <PageLoader />
      ) : query.error || !query.data ? (
        <Card><ErrorState error={query.error} retry={() => void query.refetch()} /></Card>
      ) : (
        <SettingsForm key={JSON.stringify(query.data)} initial={query.data.settings} nimbuspostEnabled={query.data.nimbuspostEnabled} />
      )}
    </AdminOnly>
  )
}

function Section({ icon, title, text, children }: { icon: string; title: string; text: string; children: ReactNode }) {
  return (
    <Card className="grid grid-cols-1 gap-5 p-5 md:grid-cols-[13rem_minmax(0,1fr)] md:p-6">
      <div>
        <span className="grid size-9 place-items-center rounded-xl bg-brand-soft text-brand" aria-hidden="true">
          <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d={icon} />
          </svg>
        </span>
        <h2 className="mt-3 font-extrabold">{title}</h2>
        <p className="mt-1 text-xs leading-5 text-muted">{text}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </Card>
  )
}

/** A row of removable chips plus a text box that adds one on Enter or comma. */
function TagField({ label, values, onChange, placeholder, normalize, options }: { label: string; values: string[]; onChange: (values: string[]) => void; placeholder: string; normalize: (raw: string) => string | null; options?: string[] }) {
  const [draft, setDraft] = useState('')
  const add = (raw: string) => {
    const value = normalize(raw)
    if (value && !values.includes(value)) onChange([...values, value])
    setDraft('')
  }
  return (
    <div>
      <span className="text-[13px] font-bold text-ink-soft">{label}</span>
      {values.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {values.map((value) => (
            <span key={value} className="flex items-center gap-1.5 rounded-full bg-rose-50 py-1 pr-1.5 pl-3 text-xs font-bold text-rose-700">
              {value}
              <button type="button" onClick={() => onChange(values.filter((v) => v !== value))} aria-label={`Remove ${value}`} className="grid size-4 place-items-center rounded-full hover:bg-rose-100">✕</button>
            </span>
          ))}
        </div>
      )}
      <input
        list={options ? `${label}-options` : undefined}
        value={draft}
        onChange={(e) => (e.target.value.includes(',') ? add(e.target.value) : setDraft(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            add(draft)
          }
        }}
        onBlur={() => draft && add(draft)}
        placeholder={placeholder}
        className="field mt-1.5"
      />
      {options && (
        <datalist id={`${label}-options`}>
          {options.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      )}
    </div>
  )
}
const PinTagField = ({ label, values, onChange }: { label: string; values: string[]; onChange: (values: string[]) => void }) => (
  <TagField label={label} values={values} onChange={onChange} placeholder="110022, then Enter" normalize={(raw) => (/^\d{6}$/.test(raw.trim()) ? raw.trim() : null)} />
)
const StateTagField = ({ label, values, onChange }: { label: string; values: string[]; onChange: (values: string[]) => void }) => (
  <TagField label={label} values={values} onChange={onChange} placeholder="Type a state, then Enter" normalize={(raw) => raw.trim().replace(/,$/, '') || null} options={STATES} />
)

type Warehouse = { warehouse_id: string; warehouse_code?: string; name: string; status: string }

/** Which NimbusPost warehouse orders are booked and picked up from. Needed before any order can be booked;
 * the account starts with none, so this also offers the OTP flow NimbusPost requires to add one. */
function WarehousePicker({ value, onChange, pickupPincode }: { value: string; onChange: (value: string) => void; pickupPincode: string }) {
  const [adding, setAdding] = useState(false)
  const list = useQuery({ queryKey: ['nimbuspost-warehouses'], queryFn: () => api<{ items: Warehouse[] }>('/admin/nimbuspost/warehouses').then((r) => r.items) })
  const warehouses = list.data ?? []
  return (
    <div>
      <span className="text-[13px] font-bold text-ink-soft">NimbusPost pickup warehouse</span>
      {list.isLoading ? (
        <p className="mt-1.5 text-xs text-muted">Loading your warehouses…</p>
      ) : list.error ? (
        <p className="mt-1.5 text-xs text-rose-600">{errorMessage(list.error)}</p>
      ) : warehouses.length === 0 ? (
        <p className="mt-1.5 text-xs text-muted">No warehouses on your NimbusPost account yet. Orders can't be booked until you add one.</p>
      ) : (
        <Select className="mt-1.5 max-w-xs" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Choose a warehouse</option>
          {warehouses.map((w) => (
            <option key={w.warehouse_id} value={w.warehouse_id}>{w.name}{w.warehouse_code ? ` (${w.warehouse_code})` : ''}</option>
          ))}
        </Select>
      )}
      <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setAdding(true)}>Add a warehouse</Button>
      {adding && (
        <AddWarehouseModal
          pickupPincode={pickupPincode}
          onClose={() => setAdding(false)}
          onCreated={(warehouseId) => {
            void list.refetch()
            onChange(warehouseId)
            setAdding(false)
          }}
        />
      )}
    </div>
  )
}

function AddWarehouseModal({ pickupPincode, onClose, onCreated }: { pickupPincode: string; onClose: () => void; onCreated: (warehouseId: string) => void }) {
  const [step, setStep] = useState<'details' | 'otp'>('details')
  const [form, setForm] = useState({ name: '', address: '', pincode: pickupPincode, city: '', state: '', contactName: '', contactPhone: '' })
  const [otp, setOtp] = useState('')
  const [wait, setWait] = useState(0)
  const [error, setError] = useState('')

  const sendOtp = useAction(() => api<{ otp_sent: boolean; resend_in_sec: number }>('/admin/nimbuspost/warehouses/otp/send', { method: 'POST', body: { phone: form.contactPhone, purpose: 'pickup' } }), {
    onDone: (result) => {
      setStep('otp')
      setWait(result.resend_in_sec || 30)
      setError('')
    },
  })
  const verifyOtp = useAction(() => api<{ verified: boolean; verification_id: string }>('/admin/nimbuspost/warehouses/otp/verify', { method: 'POST', body: { phone: form.contactPhone, otp, purpose: 'pickup' } }), {
    onDone: (result) =>
      create.mutate({
        name: form.name,
        address: form.address,
        pincode: form.pincode,
        city: form.city,
        state: form.state,
        contactName: form.contactName,
        contactPhone: form.contactPhone,
        verificationId: result.verification_id,
      }),
  })
  const create = useAction((body: Record<string, string>) => api<{ warehouse_id: string }>('/admin/nimbuspost/warehouses', { method: 'POST', body }), {
    success: 'Warehouse added',
    onDone: (result) => onCreated(result.warehouse_id),
  })

  const detailsValid = form.name.trim() && form.address.trim() && /^\d{6}$/.test(form.pincode) && form.city.trim() && form.state.trim() && form.contactName.trim() && /^[6-9]\d{9}$/.test(form.contactPhone)

  return (
    <Modal title={step === 'details' ? 'Add a pickup warehouse' : 'Confirm the contact phone'} onClose={onClose}>
      {step === 'details' ? (
        <div className="space-y-3">
          <Field label="Warehouse name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Main warehouse" /></Field>
          <Field label="Address"><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="PIN code"><Input value={form.pincode} inputMode="numeric" maxLength={6} onChange={(e) => setForm({ ...form, pincode: e.target.value.replace(/\D/g, '') })} /></Field>
            <Field label="City"><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
          </div>
          <Field label="State"><Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} placeholder="Bihar" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Pickup contact name"><Input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} /></Field>
            <Field label="Contact mobile"><Input value={form.contactPhone} inputMode="numeric" maxLength={10} onChange={(e) => setForm({ ...form, contactPhone: e.target.value.replace(/\D/g, '') })} /></Field>
          </div>
          <p className="text-xs text-muted">NimbusPost will text a code to this number to confirm it's a real pickup contact.</p>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button variant="accent" disabled={!detailsValid} loading={sendOtp.isPending} onClick={() => sendOtp.mutate(undefined)}>Send code</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted">Enter the code texted to {form.contactPhone}.</p>
          <Input value={otp} inputMode="numeric" maxLength={8} autoFocus onChange={(e) => { setOtp(e.target.value.replace(/\D/g, '')); setError('') }} placeholder="123456" className="max-w-40 text-center font-mono text-lg tracking-widest" />
          {error && <p className="text-sm font-semibold text-rose-600">{error}</p>}
          <div className="flex items-center justify-between pt-1">
            <button type="button" disabled={wait > 0 || sendOtp.isPending} onClick={() => sendOtp.mutate(undefined)} className="text-sm font-bold text-brand disabled:text-muted">
              {wait > 0 ? `Resend in ${wait}s` : 'Resend code'}
            </button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button variant="accent" disabled={otp.length < 4} loading={verifyOtp.isPending || create.isPending} onClick={() => verifyOtp.mutate(undefined)}>Verify & add</Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

function SettingsForm({ initial, nimbuspostEnabled }: { initial: Settings; nimbuspostEnabled: boolean }) {
  const start = toForm(initial)
  const [f, setF] = useState<Form>(start)
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setF((current) => ({ ...current, [key]: value }))
  const publicSettings = useQuery({ queryKey: ['public-settings'], queryFn: () => api<PublicSettings>('/settings/public'), staleTime: 60_000 })

  const errors: Partial<Record<keyof Form, string>> = {}
  if (!f.storeName.trim()) errors.storeName = 'Enter the store name'
  if (!EMAIL.test(f.supportEmail.trim())) errors.supportEmail = 'Enter a valid email'
  if (f.supportPhone.replace(/\D/g, '').length < 10) errors.supportPhone = 'Enter a full phone number'
  if (f.gstin && !GSTIN.test(f.gstin)) errors.gstin = 'A GSTIN is 15 characters, like 10ABCDE1234F1Z5'
  if (f.pickupPincode && !/^\d{6}$/.test(f.pickupPincode)) errors.pickupPincode = 'Enter a 6-digit PIN code, or leave it blank'
  for (const key of ['freeShippingThreshold', 'shippingFee', 'codMaxOrder', 'lowStockDefault'] as const) if (!whole(f[key])) errors[key] = 'Whole rupees, 0 or more'
  const invalid = Object.keys(errors).length > 0
  const dirty = JSON.stringify(f) !== JSON.stringify(start)

  const gstState = GSTIN.test(f.gstin) ? GST_STATES[f.gstin.slice(0, 2)] : undefined
  const stateMismatch = gstState && f.businessState && gstState.toLowerCase() !== f.businessState.trim().toLowerCase()
  const stateOptions = f.businessState && !STATES.includes(f.businessState) ? [f.businessState, ...STATES] : STATES

  const save = useAction(
    () =>
      api('/admin/settings', {
        method: 'PUT',
        body: {
          ...f,
          storeName: f.storeName.trim(),
          supportEmail: f.supportEmail.trim(),
          supportPhone: f.supportPhone.trim(),
          address: f.address.trim(),
          freeShippingThreshold: Number(f.freeShippingThreshold),
          shippingFee: Number(f.shippingFee),
          codMaxOrder: Number(f.codMaxOrder),
          lowStockDefault: Number(f.lowStockDefault),
        },
      }),
    { success: 'Settings saved', invalidate: ['settings', 'public-settings'] },
  )

  const free = whole(f.freeShippingThreshold) ? Number(f.freeShippingThreshold) : null
  const fee = whole(f.shippingFee) ? Number(f.shippingFee) : null
  const provider = publicSettings.data

  return (
    <div className="grid grid-cols-1 items-start gap-5 pb-24 xl:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="space-y-5">
        <Section icon="M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9h18M9 20v-6h6v6" title="Store details" text="Shown in the shop header and footer, on the contact and help pages, and in the policies.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Store name" error={errors.storeName}><Input value={f.storeName} onChange={(e) => set('storeName', e.target.value)} aria-invalid={!!errors.storeName} /></Field>
            <Field label="Support phone" error={errors.supportPhone}><Input value={f.supportPhone} onChange={(e) => set('supportPhone', e.target.value)} inputMode="tel" placeholder="+91 93048 37512" aria-invalid={!!errors.supportPhone} /></Field>
            <Field label="Support email" error={errors.supportEmail} className="sm:col-span-2"><Input type="email" value={f.supportEmail} onChange={(e) => set('supportEmail', e.target.value)} aria-invalid={!!errors.supportEmail} /></Field>
            <Field label="Store address" hint="Your packing kitchen or office. Shown on the contact page and in the footer." className="sm:col-span-2"><Textarea rows={2} value={f.address} onChange={(e) => set('address', e.target.value)} /></Field>
          </div>
        </Section>

        <Section icon="M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21zM9 8h6M9 12h6M9 16h3" title="Tax & invoicing" text="Printed on packing slips and used by the GST report to split CGST, SGST and IGST.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Registered business name" hint="Leave blank to print the store name"><Input value={f.businessName} onChange={(e) => set('businessName', e.target.value)} placeholder={f.storeName || 'ClickMart'} /></Field>
            <Field label="GSTIN" error={errors.gstin} hint={gstState ? `State code ${f.gstin.slice(0, 2)}: ${gstState}` : 'Optional, 15 characters'}>
              <Input value={f.gstin} maxLength={15} onChange={(e) => set('gstin', e.target.value.toUpperCase().replace(/\s/g, ''))} className="font-mono tracking-wide" placeholder="10ABCDE1234F1Z5" aria-invalid={!!errors.gstin} />
            </Field>
            <Field label="Business state" className="sm:col-span-2" hint="Orders delivered inside this state are taxed as CGST + SGST, others as IGST.">
              <Select value={f.businessState} onChange={(e) => set('businessState', e.target.value)}>
                <option value="">Choose a state</option>
                {stateOptions.map((state) => (
                  <option key={state} value={state}>{state}</option>
                ))}
              </Select>
            </Field>
            {stateMismatch && (
              <p className="rounded-xl bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-800 sm:col-span-2">
                Your GSTIN is registered in {gstState}, but the business state is {f.businessState}.{' '}
                <button type="button" className="font-extrabold underline" onClick={() => set('businessState', gstState!)}>Use {gstState}</button>
              </p>
            )}
          </div>
        </Section>

        <Section icon="M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" title="Delivery" text="What shoppers pay to ship. The cart and checkout show the same rule.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Free delivery from (₹)" error={errors.freeShippingThreshold}><Input type="number" min={0} inputMode="numeric" value={f.freeShippingThreshold} onChange={(e) => set('freeShippingThreshold', e.target.value)} /></Field>
            <Field label="Delivery fee below that (₹)" error={errors.shippingFee}><Input type="number" min={0} inputMode="numeric" value={f.shippingFee} onChange={(e) => set('shippingFee', e.target.value)} /></Field>
          </div>
          {free !== null && fee !== null && (
            <p className="mt-3 rounded-xl bg-canvas px-3 py-2 text-xs text-ink-soft">
              {free === 0 ? 'Every order ships free.' : fee === 0 ? 'Every order ships free.' : <>Orders under <b>{inr(free)}</b> pay <b>{inr(fee)}</b> for delivery. <b>{inr(free)}</b> and above ship free.</>}
            </p>
          )}
          <div className="mt-5 border-t border-line pt-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-bold">Pincode serviceability</p>
              <Badge tone={nimbuspostEnabled ? 'green' : 'gray'}>{nimbuspostEnabled ? 'NimbusPost connected' : 'NimbusPost not connected'}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted">
              {nimbuspostEnabled
                ? 'When a shopper sets their delivery PIN on the home page, we ask NimbusPost whether a courier reaches it from this PIN.'
                : 'Add NIMBUSPOST_API_KEY and NIMBUSPOST_API_SECRET on the server to check live courier coverage. Until then, only the block list below applies.'}
            </p>
            <Field label="Pickup PIN code" error={errors.pickupPincode} hint="Where NimbusPost collects your orders from" className="mt-3 max-w-56">
              <Input value={f.pickupPincode} inputMode="numeric" maxLength={6} onChange={(e) => set('pickupPincode', e.target.value.replace(/\D/g, ''))} placeholder="804453" aria-invalid={!!errors.pickupPincode} />
            </Field>
            {nimbuspostEnabled && (
              <div className="mt-3">
                <WarehousePicker value={f.nimbuspostWarehouseId} onChange={(v) => set('nimbuspostWarehouseId', v)} pickupPincode={f.pickupPincode} />
              </div>
            )}
          </div>
          <div className="mt-5 border-t border-line pt-4">
            <p className="text-sm font-bold">Areas we don't deliver to</p>
            <p className="mt-1 text-xs text-muted">Optional. Blocked here regardless of what NimbusPost says — shown when a shopper sets their delivery PIN on the home page.</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <PinTagField label="Specific PIN codes" values={f.nonServiceablePincodes} onChange={(v) => set('nonServiceablePincodes', v)} />
              <StateTagField label="Whole states" values={f.nonServiceableStates} onChange={(v) => set('nonServiceableStates', v)} />
            </div>
          </div>
        </Section>

        <Section icon="M3 7h18v10H3zM3 11h18M7 15h3" title="Payments" text="Cash on delivery limits. Online payments are configured on the server.">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-line p-3">
              <div>
                <p className="text-sm font-bold">Online payments</p>
                <p className="text-xs text-muted">UPI, cards and net banking at checkout</p>
              </div>
              {provider ? (
                <Badge tone={provider.paymentProvider === 'razorpay' && !provider.paymentTestMode ? 'green' : 'orange'}>
                  {provider.paymentProvider === 'razorpay' ? (provider.paymentTestMode ? 'Razorpay · test mode' : 'Razorpay · live') : 'Mock gateway'}
                </Badge>
              ) : (
                <span className="text-xs text-muted">Checking…</span>
              )}
            </div>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-line p-3">
              <span>
                <span className="block text-sm font-bold">Cash on delivery</span>
                <span className="block text-xs text-muted">{f.codEnabled ? 'Shoppers can pay when the order arrives' : 'Only online payment is offered'}</span>
              </span>
              <Switch checked={f.codEnabled} onChange={(value) => set('codEnabled', value)} label="Cash on delivery" />
            </label>
            <Field label="Largest COD order (₹)" error={errors.codMaxOrder} hint={f.codEnabled ? 'Bigger orders must be paid online' : 'Turn on cash on delivery to use this'}>
              <Input type="number" min={0} inputMode="numeric" value={f.codMaxOrder} disabled={!f.codEnabled} onChange={(e) => set('codMaxOrder', e.target.value)} className="sm:max-w-56" />
            </Field>
          </div>
        </Section>

        <Section icon="M3 8l9-5 9 5-9 5-9-5zM3 8v8l9 5 9-5V8M12 13v8" title="Inventory" text="When a pack size counts as running low, unless it has its own alert level.">
          <Field label="Low-stock alert at" error={errors.lowStockDefault} hint="Packs at or below this count show on the dashboard and in Inventory">
            <Input type="number" min={0} inputMode="numeric" value={f.lowStockDefault} onChange={(e) => set('lowStockDefault', e.target.value)} className="sm:max-w-56" />
          </Field>
        </Section>
      </div>

      <aside className="space-y-4 xl:sticky xl:top-20">
        <Card className="p-5">
          <p className="text-[11px] font-extrabold tracking-wider text-muted uppercase">What shoppers see</p>
          <p className="mt-3 font-extrabold">{f.storeName || 'ClickMart'}</p>
          <ul className="mt-2 space-y-1.5 text-sm text-ink-soft">
            <li>{f.supportPhone || '—'}</li>
            <li className="break-all">{f.supportEmail || '—'}</li>
            <li className="text-xs leading-5 text-muted">{f.address || 'No address yet'}</li>
          </ul>
          <div className="mt-4 space-y-1.5 border-t border-line pt-4 text-xs text-ink-soft">
            <p>{free !== null && fee !== null && free > 0 && fee > 0 ? `Free delivery above ${inr(free)}, otherwise ${inr(fee)}` : 'Free delivery on every order'}</p>
            <p>{f.codEnabled && whole(f.codMaxOrder) ? `Cash on delivery up to ${inr(Number(f.codMaxOrder))}` : 'Online payment only'}</p>
          </div>
        </Card>
        <Card className="p-5">
          <p className="text-[11px] font-extrabold tracking-wider text-muted uppercase">On packing slips</p>
          <p className="mt-3 text-sm font-extrabold">{f.businessName || f.storeName || 'ClickMart'}</p>
          <p className="mt-1 font-mono text-xs text-ink-soft">{f.gstin ? `GSTIN ${f.gstin}` : 'No GSTIN'}</p>
          <p className="mt-1 text-xs text-muted">{f.businessState || 'Business state not set: the GST report cannot run'}</p>
        </Card>
      </aside>

      {(dirty || save.isPending) && (
        <div className="anim-rise fixed inset-x-4 bottom-4 z-30 mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 rounded-2xl bg-ink px-4 py-3 text-white shadow-pop lg:left-[calc(260px+2rem)]">
          <p className="text-sm font-semibold">{invalid ? 'Fix the highlighted fields to save' : 'You have unsaved changes'}</p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="!text-white hover:!bg-white/10" onClick={() => setF(start)} disabled={save.isPending}>Discard</Button>
            <Button variant="accent" size="sm" disabled={invalid} loading={save.isPending} onClick={() => save.mutate(undefined)}>Save changes</Button>
          </div>
        </div>
      )}
    </div>
  )
}
