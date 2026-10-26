import { useQuery } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
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
  shippingMode: 'flat' | 'courier'
  autoCreateShipments: boolean
  autoStatusFromCourier: boolean
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

type WebhookStatus = { connected: boolean; secretSet: boolean; url: string; reason?: string }

/** NimbusPost's tracking webhook: what turns courier scans into order status changes. Registered once. */
function LiveTracking() {
  const status = useQuery({ queryKey: ['nimbuspost-webhook'], queryFn: () => api<WebhookStatus>('/admin/nimbuspost/webhook'), staleTime: 60_000 })
  const connect = useAction(() => api<WebhookStatus>('/admin/nimbuspost/webhook', { method: 'POST' }), { success: 'Live tracking connected', invalidate: ['nimbuspost-webhook'] })
  const data = status.data
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3">
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-sm font-bold">
          Live tracking updates
          {data && <Badge tone={data.connected ? 'green' : 'orange'}>{data.connected ? 'Connected' : 'Not connected'}</Badge>}
        </span>
        <span className="block text-xs text-muted">
          {!data
            ? 'Checking…'
            : data.connected
              ? 'NimbusPost sends every courier scan to your API, so the steps above happen on their own.'
              : !data.secretSet
                ? 'Add NIMBUSPOST_WEBHOOK_SECRET (16+ random characters) on the server, redeploy, then connect here.'
                : 'Connect once from the live admin so NimbusPost sends courier scans to your API.'}
        </span>
        {data && <span className="mt-0.5 block truncate font-mono text-[11px] text-muted">{data.url}</span>}
      </span>
      {data && !data.connected && (
        <Button size="sm" variant="accent" loading={connect.isPending} disabled={!data.secretSet} onClick={() => connect.mutate(undefined)}>
          Connect live tracking
        </Button>
      )}
    </div>
  )
}

type WarehouseAddress = { address: string; address_opt?: string; pincode: number | string; city: string; state: string }
type Warehouse = {
  warehouse_id: string
  warehouse_code?: string
  name: string
  status: 'active' | 'inactive' | 'incomplete' | string
  address?: WarehouseAddress
  contact_person?: { name: string; phone: number | string }
}
type PickupCheck = { pincode: string; serviceable: boolean; couriers: string[]; city: string | null; state: string | null; area: string | null }

const warehousePin = (w: Warehouse) => String(w.address?.pincode ?? '')

/**
 * Where couriers collect packed orders. Orders are booked from the chosen warehouse and delivery rates are
 * priced from its PIN code, so picking one also sets the pickup PIN. Only active warehouses can be chosen.
 */
function WarehousePicker({ value, onChange, gstin, businessName }: { value: string; onChange: (id: string, pincode: string) => void; gstin: string; businessName: string }) {
  const [adding, setAdding] = useState(false)
  const list = useQuery({ queryKey: ['nimbuspost-warehouses'], queryFn: () => api<{ items: Warehouse[] }>('/admin/nimbuspost/warehouses').then((r) => r.items) })
  const warehouses = list.data ?? []
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] font-bold text-ink-soft">Pickup address (where couriers collect your parcels)</span>
        <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}>+ Add pickup address</Button>
      </div>
      {list.isLoading ? (
        <p className="mt-2 text-xs text-muted">Loading your pickup addresses…</p>
      ) : list.error ? (
        <p className="mt-2 text-xs text-rose-600">{errorMessage(list.error)}</p>
      ) : warehouses.length === 0 ? (
        <p className="mt-2 rounded-xl border border-dashed border-orange-300 bg-orange-50 px-3 py-3 text-xs font-semibold text-orange-800">
          No pickup address yet. Add the place where your orders are packed; couriers cannot collect, and orders cannot be booked, until you do.
        </p>
      ) : (
        <div role="radiogroup" aria-label="Pickup address" className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {warehouses.map((w) => {
            const active = value === w.warehouse_id
            const usable = w.status === 'active'
            return (
              <button
                key={w.warehouse_id}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={!usable}
                onClick={() => onChange(w.warehouse_id, warehousePin(w))}
                className={`relative min-w-0 rounded-xl border-2 p-3 text-left text-xs transition disabled:cursor-not-allowed disabled:opacity-60 ${active ? 'border-brand bg-brand-soft' : 'border-line hover:border-brand/40'}`}
              >
                <span className="flex flex-wrap items-center gap-2 pr-6 text-sm font-bold">
                  {w.name}
                  <Badge tone={usable ? 'green' : 'orange'}>{w.status}</Badge>
                </span>
                {w.address && (
                  <span className="mt-1 block leading-5 break-words text-ink-soft">
                    {w.address.address}
                    {w.address.address_opt ? `, ${w.address.address_opt}` : ''}, {w.address.city}, {w.address.state} <b>{warehousePin(w)}</b>
                  </span>
                )}
                {w.contact_person && <span className="mt-1 block text-muted">Contact: {w.contact_person.name} · {String(w.contact_person.phone)}</span>}
                {!usable && <span className="mt-1 block font-semibold text-orange-700">Finish or activate it in NimbusPost before using it.</span>}
                {active && <span className="absolute top-2.5 right-2.5 grid size-5 place-items-center rounded-full bg-brand text-[10px] font-bold text-white">✓</span>}
              </button>
            )
          })}
        </div>
      )}
      {adding && (
        <AddWarehouseModal
          gstin={gstin}
          businessName={businessName}
          onClose={() => setAdding(false)}
          onCreated={(warehouseId, pincode) => {
            void list.refetch()
            onChange(warehouseId, pincode)
            setAdding(false)
          }}
        />
      )}
    </div>
  )
}

type WarehouseForm = { name: string; address: string; addressLine2: string; pincode: string; city: string; state: string; contactName: string; contactPhone: string; contactEmail: string; gst: string }

/** Add a pickup address in three steps: address (checked for courier pickup), contact, then the OTP NimbusPost requires. */
function AddWarehouseModal({ gstin, businessName, onClose, onCreated }: { gstin: string; businessName: string; onClose: () => void; onCreated: (warehouseId: string, pincode: string) => void }) {
  const [step, setStep] = useState<'address' | 'contact' | 'otp'>('address')
  const [form, setForm] = useState<WarehouseForm>({ name: businessName ? `${businessName} warehouse` : 'Main warehouse', address: '', addressLine2: '', pincode: '', city: '', state: '', contactName: '', contactPhone: '', contactEmail: '', gst: gstin })
  const [otp, setOtp] = useState('')
  const [wait, setWait] = useState(0)
  const set = (key: keyof WarehouseForm, value: string) => setForm((current) => ({ ...current, [key]: value }))

  useEffect(() => {
    if (wait <= 0) return
    const timer = window.setTimeout(() => setWait((value) => value - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [wait])

  const pinValid = /^\d{6}$/.test(form.pincode)
  const check = useQuery({
    queryKey: ['pickup-check', form.pincode],
    queryFn: () =>
      api<PickupCheck>('/admin/nimbuspost/warehouses/check', { method: 'POST', body: { pincode: form.pincode } }).then((result) => {
        // Fill the city and state from the PIN code, without overwriting what the admin already typed.
        setForm((current) =>
          current.pincode !== result.pincode
            ? current
            : {
                ...current,
                city: current.city || result.city || '',
                state: current.state || (STATES.find((name) => name.toLowerCase() === (result.state ?? '').toLowerCase()) ?? ''),
              },
        )
        return result
      }),
    enabled: pinValid,
    staleTime: 10 * 60_000,
    retry: false,
  })

  const serviceable = check.data?.pincode === form.pincode && check.data.serviceable
  const addressErrors = {
    name: form.name.trim().length < 2 ? 'Give it a name' : '',
    address: form.address.trim().length < 10 ? 'Building, street and area (at least 10 characters)' : '',
    pincode: !pinValid ? 'Enter a 6-digit PIN code' : check.data && !check.data.serviceable && check.data.pincode === form.pincode ? 'No courier collects from this PIN code' : '',
    city: form.city.trim().length < 2 ? 'Enter the city' : '',
    state: !form.state ? 'Choose the state' : '',
    gst: form.gst && !GSTIN.test(form.gst) ? 'A GSTIN is 15 characters' : '',
  }
  const addressReady = !Object.values(addressErrors).some(Boolean) && serviceable
  const contactErrors = {
    contactName: form.contactName.trim().length < 2 ? 'Enter a name' : '',
    contactPhone: !/^[6-9]\d{9}$/.test(form.contactPhone) ? 'A 10-digit mobile number' : '',
    contactEmail: form.contactEmail && !EMAIL.test(form.contactEmail) ? 'Enter a valid email' : '',
  }
  const contactReady = !Object.values(contactErrors).some(Boolean)

  const create = useAction(
    (verificationId: string) =>
      api<{ warehouse_id: string }>('/admin/nimbuspost/warehouses', {
        method: 'POST',
        body: {
          name: form.name.trim(),
          address: form.address.trim(),
          addressLine2: form.addressLine2.trim() || undefined,
          pincode: form.pincode,
          city: form.city.trim(),
          state: form.state,
          contactName: form.contactName.trim(),
          contactPhone: form.contactPhone,
          contactEmail: form.contactEmail.trim() || undefined,
          gst: form.gst.trim() || undefined,
          verificationId,
        },
      }),
    { success: 'Pickup address added and selected', invalidate: ['settings'], onDone: (result) => onCreated(result.warehouse_id, form.pincode) },
  )
  const sendOtp = useAction(() => api<{ otp_sent: boolean; resend_in_sec: number }>('/admin/nimbuspost/warehouses/otp/send', { method: 'POST', body: { phone: form.contactPhone, purpose: 'pickup' } }), {
    onDone: (result) => {
      setStep('otp')
      setWait(result.resend_in_sec || 30)
    },
  })
  const verifyOtp = useAction(() => api<{ verified: boolean; verification_id: string }>('/admin/nimbuspost/warehouses/otp/verify', { method: 'POST', body: { phone: form.contactPhone, otp, purpose: 'pickup' } }), {
    onDone: (result) => create.mutate(result.verification_id),
  })

  const steps = ['Address', 'Contact', 'Verify'] as const
  const stepIndex = step === 'address' ? 0 : step === 'contact' ? 1 : 2

  return (
    <Modal title="Add a pickup address" onClose={onClose}>
      <ol className="mb-4 flex items-center gap-2 text-xs font-bold" aria-label={`Step ${stepIndex + 1} of 3`}>
        {steps.map((label, index) => (
          <li key={label} className="flex min-w-0 flex-1 items-center gap-2">
            <span className={`grid size-6 shrink-0 place-items-center rounded-full ${index < stepIndex ? 'bg-success text-white' : index === stepIndex ? 'bg-brand text-white' : 'bg-canvas text-muted ring-1 ring-line'}`}>{index < stepIndex ? '✓' : index + 1}</span>
            <span className={index === stepIndex ? 'text-ink' : 'text-muted'}>{label}</span>
            {index < steps.length - 1 && <span aria-hidden="true" className="h-0.5 flex-1 rounded-full bg-line" />}
          </li>
        ))}
      </ol>

      {step === 'address' && (
        <div className="space-y-3">
          <p className="text-xs text-muted">The exact place your orders are packed. Couriers come here to collect, and returns come back here.</p>
          <Field label="Name for this address" error={form.name ? addressErrors.name : ''}><Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Main warehouse" /></Field>
          <Field label="Address" error={form.address ? addressErrors.address : ''} hint="Building or shop number, street and area"><Input value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Ground floor, Kashyap Sadan, Sampatchak" /></Field>
          <Field label="Landmark / address line 2 (optional)"><Input value={form.addressLine2} onChange={(e) => set('addressLine2', e.target.value)} placeholder="Near Shemford School" /></Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="PIN code" error={form.pincode ? addressErrors.pincode : ''}>
              <Input value={form.pincode} inputMode="numeric" maxLength={6} onChange={(e) => set('pincode', e.target.value.replace(/\D/g, ''))} placeholder="804453" />
            </Field>
            <Field label="City" error={form.city ? addressErrors.city : ''}><Input value={form.city} onChange={(e) => set('city', e.target.value)} /></Field>
          </div>
          <Field label="State">
            <Select value={form.state} onChange={(e) => set('state', e.target.value)}>
              <option value="">Choose a state</option>
              {STATES.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </Select>
          </Field>
          <Field label="GSTIN for this address (optional)" error={addressErrors.gst} hint="Printed on shipping labels and invoices">
            <Input value={form.gst} maxLength={15} onChange={(e) => set('gst', e.target.value.toUpperCase().replace(/\s/g, ''))} className="font-mono" />
          </Field>
          {pinValid && (
            <p className={`rounded-xl px-3 py-2 text-xs font-semibold ${check.isFetching ? 'bg-canvas text-muted' : check.error ? 'bg-rose-50 text-rose-700' : serviceable ? 'bg-emerald-50 text-success' : 'bg-rose-50 text-rose-700'}`}>
              {check.isFetching
                ? `Checking courier pickup at ${form.pincode}…`
                : check.error
                  ? errorMessage(check.error)
                  : serviceable
                    ? `Couriers collect from ${form.pincode}: ${check.data?.couriers.join(', ')}.`
                    : `No courier collects from ${form.pincode}. Use the address of a serviceable area.`}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button variant="accent" disabled={!addressReady} onClick={() => setStep('contact')}>Next: pickup contact</Button>
          </div>
        </div>
      )}

      {step === 'contact' && (
        <div className="space-y-3">
          <p className="text-xs text-muted">The person couriers call when they arrive. NimbusPost texts a code to this mobile to confirm it.</p>
          <Field label="Contact name" error={form.contactName ? contactErrors.contactName : ''}><Input value={form.contactName} onChange={(e) => set('contactName', e.target.value)} /></Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Mobile number" error={form.contactPhone ? contactErrors.contactPhone : ''}>
              <Input value={form.contactPhone} inputMode="numeric" maxLength={10} onChange={(e) => set('contactPhone', e.target.value.replace(/\D/g, ''))} placeholder="9876543210" />
            </Field>
            <Field label="Email (optional)" error={contactErrors.contactEmail}><Input type="email" value={form.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} /></Field>
          </div>
          <div className="rounded-xl bg-canvas px-3 py-2 text-xs text-ink-soft">
            <b>{form.name}</b> · {form.address}{form.addressLine2 ? `, ${form.addressLine2}` : ''}, {form.city}, {form.state} {form.pincode}
          </div>
          <div className="flex justify-between gap-2 pt-1">
            <Button variant="outline" onClick={() => setStep('address')}>Back</Button>
            <Button variant="accent" disabled={!contactReady} loading={sendOtp.isPending} onClick={() => sendOtp.mutate(undefined)}>Send code</Button>
          </div>
        </div>
      )}

      {step === 'otp' && (
        <div className="space-y-3">
          <p className="text-sm text-muted">Enter the code texted to {form.contactPhone}.</p>
          <Input value={otp} inputMode="numeric" maxLength={8} autoFocus onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} placeholder="123456" className="max-w-40 text-center font-mono text-lg tracking-widest" />
          <div className="flex items-center justify-between pt-1">
            <button type="button" disabled={wait > 0 || sendOtp.isPending} onClick={() => sendOtp.mutate(undefined)} className="text-sm font-bold text-brand disabled:text-muted">
              {wait > 0 ? `Resend in ${wait}s` : 'Resend code'}
            </button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep('contact')}>Back</Button>
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

  const courierRates = f.shippingMode === 'courier'
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
          <div role="radiogroup" aria-label="How customers are charged for delivery">
            <span className="text-[13px] font-bold text-ink-soft">How customers are charged for delivery</span>
            <div className="mt-1.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {([
                ['flat', 'Fixed price', 'You set one delivery price for every order, any PIN code or weight.', 'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6'],
                ['courier', 'Automatic', 'Each customer pays the real courier rate for their PIN code and cart weight, from NimbusPost.', 'M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z'],
              ] as const).map(([mode, title, text, icon]) => {
                const active = f.shippingMode === mode
                return (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => set('shippingMode', mode)}
                    className={`relative flex gap-3 rounded-xl border-2 p-4 text-left transition ${active ? 'border-brand bg-brand-soft' : 'border-line hover:border-brand/40'}`}
                  >
                    <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${active ? 'bg-brand text-white' : 'bg-canvas text-brand'}`} aria-hidden="true">
                      <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d={icon} /></svg>
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold">{title}</span>
                      <span className="mt-0.5 block text-xs leading-5 text-muted">{text}</span>
                    </span>
                    {active && <span className="absolute top-2.5 right-2.5 grid size-5 place-items-center rounded-full bg-brand text-[10px] font-bold text-white">✓</span>}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label={courierRates ? 'Fallback price (₹)' : 'Delivery price (₹)'} error={errors.shippingFee} hint={courierRates ? 'Charged only when NimbusPost cannot give a rate' : 'Charged on orders below the free-delivery amount'}>
              <Input type="number" min={0} inputMode="numeric" value={f.shippingFee} onChange={(e) => set('shippingFee', e.target.value)} />
            </Field>
            <Field label="Free delivery from (₹)" error={errors.freeShippingThreshold} hint="Orders at or above this ship free. 0 makes every order free.">
              <Input type="number" min={0} inputMode="numeric" value={f.freeShippingThreshold} onChange={(e) => set('freeShippingThreshold', e.target.value)} />
            </Field>
          </div>
          {courierRates && (!nimbuspostEnabled || !/^\d{6}$/.test(f.pickupPincode)) && (
            <p className="mt-3 rounded-xl bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-800">
              {nimbuspostEnabled ? 'Add your pickup PIN code below' : 'Connect NimbusPost on the server and add your pickup PIN code below'} so the real rate can be worked out. Until then customers pay the fallback price.
            </p>
          )}
          {free !== null && fee !== null && (
            <p className="mt-3 rounded-xl bg-canvas px-3 py-2 text-xs text-ink-soft">
              {free === 0 ? (
                'Every order ships free.'
              ) : courierRates ? (
                <>Orders under <b>{inr(free)}</b> pay the real courier rate for their PIN code and weight, shown in the cart and checkout. <b>{inr(free)}</b> and above ship free.</>
              ) : fee === 0 ? (
                'Every order ships free.'
              ) : (
                <>Orders under <b>{inr(free)}</b> pay <b>{inr(fee)}</b> for delivery. <b>{inr(free)}</b> and above ship free.</>
              )}
            </p>
          )}
          <div className="mt-5 border-t border-line pt-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-bold">Pickup and courier</p>
              <Badge tone={nimbuspostEnabled ? 'green' : 'gray'}>{nimbuspostEnabled ? 'NimbusPost connected' : 'NimbusPost not connected'}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted">
              {nimbuspostEnabled
                ? 'Couriers collect from your pickup address. Its PIN code is also where delivery checks and rates start from.'
                : 'Add NIMBUSPOST_API_KEY and NIMBUSPOST_API_SECRET on the server to check live courier coverage. Until then, only the block list below applies.'}
            </p>
            {nimbuspostEnabled && f.nimbuspostWarehouseId ? (
              <p className="mt-3 inline-flex items-center gap-2 rounded-lg bg-canvas px-3 py-1.5 text-xs">
                <span className="text-muted">Pickup PIN code</span> <b className="font-mono">{f.pickupPincode || '—'}</b> <span className="text-muted">· from the chosen pickup address</span>
              </p>
            ) : (
              <Field label="Pickup PIN code" error={errors.pickupPincode} hint={nimbuspostEnabled ? 'Set automatically once you choose a pickup address below' : 'Where your orders are packed'} className="mt-3 max-w-56">
                <Input value={f.pickupPincode} inputMode="numeric" maxLength={6} onChange={(e) => set('pickupPincode', e.target.value.replace(/\D/g, ''))} placeholder="804453" aria-invalid={!!errors.pickupPincode} />
              </Field>
            )}
            {nimbuspostEnabled && (
              <div className="mt-3 space-y-3">
                <WarehousePicker
                  value={f.nimbuspostWarehouseId}
                  onChange={(id, pincode) => {
                    set('nimbuspostWarehouseId', id)
                    if (/^\d{6}$/.test(pincode)) set('pickupPincode', pincode)
                  }}
                  gstin={f.gstin}
                  businessName={f.businessName || f.storeName}
                />
                <label className="flex items-center justify-between gap-3 rounded-xl border border-line p-3">
                  <span>
                    <span className="block text-sm font-bold">Create the courier order automatically</span>
                    <span className="block text-xs text-muted">As soon as a COD order is placed or an online order is paid. You still choose and book the courier.</span>
                  </span>
                  <Switch checked={f.autoCreateShipments} onChange={(value) => set('autoCreateShipments', value)} label="Create the courier order automatically" />
                </label>
                <label className="flex items-center justify-between gap-3 rounded-xl border border-line p-3">
                  <span>
                    <span className="block text-sm font-bold">Update order status from tracking</span>
                    <span className="block text-xs text-muted">Shipped, Out for delivery, Delivered and Returned follow the courier, and the shopper gets each email. You can still change status by hand.</span>
                  </span>
                  <Switch checked={f.autoStatusFromCourier} onChange={(value) => set('autoStatusFromCourier', value)} label="Update order status from tracking" />
                </label>
                <LiveTracking />
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
            <p>
              {free === 0
                ? 'Free delivery on every order'
                : courierRates
                  ? `Free delivery above ${inr(free ?? 0)}, otherwise the courier rate for their PIN code`
                  : free !== null && fee !== null && fee > 0
                    ? `Free delivery above ${inr(free)}, otherwise ${inr(fee)}`
                    : 'Free delivery on every order'}
            </p>
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
