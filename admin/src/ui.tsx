import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { ApiError, api, assetUrl } from './api.ts'

/* ---------- Buttons ---------- */
type Variant = 'primary' | 'accent' | 'outline' | 'ghost' | 'danger' | 'soft'
const variants: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-dark shadow-sm',
  accent: 'bg-accent text-white hover:bg-accent-dark shadow-sm',
  outline: 'bg-white text-ink ring-1 ring-line hover:ring-brand hover:text-brand',
  ghost: 'text-ink-soft hover:bg-canvas',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 shadow-sm',
  soft: 'bg-brand-soft text-brand hover:bg-[#d9e5fa]',
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className = '',
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; loading?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-bold whitespace-nowrap transition active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 ${
        size === 'sm' ? 'h-8 px-3 text-xs' : 'h-10 px-4 text-sm'
      } ${variants[variant]} ${className}`}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  )
}

export function Spinner({ className = 'size-5' }: { className?: string }) {
  return <span className={`anim-spin inline-block rounded-full border-2 border-current border-t-transparent opacity-70 ${className}`} role="status" aria-label="Loading" />
}

export function PageLoader() {
  return (
    <div className="grid min-h-60 place-items-center text-brand">
      <Spinner className="size-8" />
    </div>
  )
}

/* ---------- Form fields ---------- */
export function Field({ label, error, hint, children, className = '' }: { label: string; error?: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs font-bold text-ink-soft">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && !error && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}
      {error && <span role="alert" className="mt-1 block text-[11px] font-semibold text-rose-600">{error}</span>}
    </label>
  )
}

export const Input = ({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) => <input {...props} className={`field ${className}`} />
export const Textarea = ({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} className={`field ${className}`} />
export const Select = ({ className = '', children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...props} className={`field cursor-pointer ${className}`}>
    {children}
  </select>
)

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? 'bg-brand' : 'bg-slate-300'}`}
    >
      <span className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </button>
  )
}

export function SearchBox({ value, onChange, placeholder = 'Search' }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  useEffect(() => {
    if (draft === value) return
    const timer = window.setTimeout(() => onChange(draft), 300)
    return () => window.clearTimeout(timer)
  }, [draft, value, onChange])
  return <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={placeholder} aria-label={placeholder} className="field w-full sm:max-w-xs" type="search" />
}

/* ---------- Display ---------- */
const tones = {
  gray: 'bg-slate-100 text-slate-600',
  blue: 'bg-brand-soft text-brand',
  green: 'bg-emerald-50 text-emerald-700',
  orange: 'bg-orange-50 text-orange-700',
  red: 'bg-rose-50 text-rose-700',
  dark: 'bg-ink text-white',
}
export type Tone = keyof typeof tones
export const Badge = ({ tone = 'gray', children }: { tone?: Tone; children: ReactNode }) => (
  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap ${tones[tone]}`}>{children}</span>
)

export const Card = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <section className={`rounded-2xl border border-line/80 bg-white shadow-card ${className}`}>{children}</section>
)

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[1.7rem] leading-tight font-extrabold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="px-6 py-16 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-brand-soft text-lg text-brand" aria-hidden="true">○</span>
      <p className="mt-3 font-extrabold">{title}</p>
      {text && <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="font-extrabold text-rose-600">Could not load this</p>
      <p className="mt-1 text-sm text-muted">{error instanceof Error ? error.message : 'Unknown error'}</p>
      {retry && <Button variant="outline" size="sm" className="mt-4" onClick={retry}>Try again</Button>}
    </div>
  )
}

export function Table({ head, children, className = '' }: { head: ReactNode[]; children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-line bg-canvas/80 text-[11px] font-bold tracking-wider text-muted uppercase">
            {head.map((item, index) => (
              <th key={index} className="px-4 py-3 font-bold first:pl-5 last:pr-5">{item}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  )
}
export const Td = ({ children, className = '' }: { children?: ReactNode; className?: string }) => <td className={`px-4 py-3 align-middle first:pl-5 last:pr-5 ${className}`}>{children}</td>

export function Pagination({ page, pages, onChange, total }: { page: number; pages: number; onChange: (page: number) => void; total?: number }) {
  if (pages <= 1 && !total) return null
  return (
    <div className="flex items-center justify-between border-t border-line px-5 py-3 text-xs text-muted">
      <span>{total !== undefined ? `${total} result${total === 1 ? '' : 's'}` : ''}</span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</Button>
        <span className="font-semibold text-ink">{page} / {pages}</span>
        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>Next</Button>
      </div>
    </div>
  )
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (value: T) => void; items: { id: T; label: string; count?: number }[] }) {
  return (
    <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-2xl bg-white p-1 shadow-card ring-1 ring-line">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          aria-pressed={value === item.id}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${value === item.id ? 'bg-ink text-white' : 'text-ink-soft hover:bg-canvas'}`}
        >
          {item.label}
          {item.count !== undefined && <span className={`rounded-full px-1.5 text-[10px] ${value === item.id ? 'bg-white/20' : 'bg-canvas'}`}>{item.count}</span>}
        </button>
      ))}
    </div>
  )
}

/* ---------- Overlays ---------- */
function useEscape(onClose: () => void) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', handler)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = prev
    }
  }, [onClose])
}

export function Modal({ title, onClose, children, footer, wide = false }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const titleId = useId()
  useEscape(onClose)
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="anim-fade absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className={`anim-rise relative flex max-h-[90vh] w-full flex-col rounded-2xl bg-white shadow-pop ${wide ? 'max-w-2xl' : 'max-w-md'}`}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id={titleId} className="font-extrabold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-canvas">✕</button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

export function Drawer({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const titleId = useId()
  useEscape(onClose)
  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="anim-fade absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={onClose} />
      <aside role="dialog" aria-modal="true" aria-labelledby={titleId} className="anim-slide absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col bg-white shadow-pop">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 id={titleId} className="text-lg font-extrabold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-canvas">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line bg-white px-6 py-3">{footer}</div>}
      </aside>
    </div>,
    document.body,
  )
}

/* ---------- Toasts and confirm dialogs ---------- */
type Toast = { id: number; kind: 'success' | 'error'; message: string }
type Ctx = { toast: (message: string, kind?: Toast['kind']) => void; confirm: (options: { title: string; text?: string; confirmLabel?: string; danger?: boolean }) => Promise<boolean> }
const UiContext = createContext<Ctx | null>(null)

export function UiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [dialog, setDialog] = useState<{ title: string; text?: string; confirmLabel?: string; danger?: boolean; resolve: (value: boolean) => void } | null>(null)
  const counter = useRef(0)

  const toast = useCallback((message: string, kind: Toast['kind'] = 'success') => {
    const id = ++counter.current
    setToasts((current) => [...current, { id, kind, message }])
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 3500)
  }, [])
  const confirm = useCallback<Ctx['confirm']>((options) => new Promise((resolve) => setDialog({ ...options, resolve })), [])
  const value = useMemo(() => ({ toast, confirm }), [toast, confirm])

  const close = (answer: boolean) => {
    dialog?.resolve(answer)
    setDialog(null)
  }

  return (
    <UiContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-[70] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite">
        {toasts.map((item) => (
          <div key={item.id} className={`anim-rise pointer-events-auto flex items-start gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-pop ${item.kind === 'error' ? 'bg-rose-600' : 'bg-ink'}`}>
            <span>{item.kind === 'error' ? '⚠' : '✓'}</span>
            <span>{item.message}</span>
          </div>
        ))}
      </div>
      {dialog && (
        <Modal
          title={dialog.title}
          onClose={() => close(false)}
          footer={
            <>
              <Button variant="outline" onClick={() => close(false)}>Cancel</Button>
              <Button variant={dialog.danger ? 'danger' : 'primary'} onClick={() => close(true)}>{dialog.confirmLabel ?? 'Confirm'}</Button>
            </>
          }
        >
          <p className="text-sm text-muted">{dialog.text}</p>
        </Modal>
      )}
    </UiContext.Provider>
  )
}

export function useUi() {
  const context = useContext(UiContext)
  if (!context) throw new Error('useUi must be used inside UiProvider')
  return context
}

export const errorMessage = (error: unknown) => (error instanceof ApiError || error instanceof Error ? error.message : 'Something went wrong')

/* ---------- Image upload ---------- */
export function ImageUpload({ value, onChange, label = 'Image', purpose = 'product' }: { value: string | null | undefined; onChange: (url: string | null) => void; label?: string; purpose?: 'product' | 'category' | 'banner' }) {
  const { toast } = useUi()
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const upload = async (file: File) => {
    setBusy(true)
    try {
      const form = new FormData()
      form.append('image', file)
      form.append('purpose', purpose)
      const result = await api<{ url: string }>('/admin/uploads', { form })
      onChange(result.url)
    } catch (error) {
      toast(errorMessage(error), 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div>
      <span className="text-xs font-bold text-ink-soft">{label}</span>
      <div className="mt-1.5 flex items-center gap-3">
        <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-canvas ring-1 ring-line">
          {value ? <img src={assetUrl(value)} alt="" className="size-full object-cover" /> : <span className="text-xl text-muted">🖼</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" loading={busy} onClick={() => input.current?.click()}>{value ? 'Replace' : 'Upload'}</Button>
          {value && <Button variant="ghost" size="sm" onClick={() => onChange(null)}>Remove</Button>}
        </div>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = '' }} />
      </div>
    </div>
  )
}

export function Thumb({ src, name, size = 'size-10' }: { src?: string | null; name: string; size?: string }) {
  const [broken, setBroken] = useState(false)
  return src && !broken ? (
    <img src={assetUrl(src)} alt="" onError={() => setBroken(true)} className={`${size} shrink-0 rounded-lg object-cover ring-1 ring-line`} />
  ) : (
    <span className={`${size} grid shrink-0 place-items-center rounded-lg bg-brand-soft text-sm font-extrabold text-brand`}>{name.slice(0, 1).toUpperCase()}</span>
  )
}
