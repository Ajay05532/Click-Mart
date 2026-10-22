import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { AuthLink, AuthShell, FormError, FormField, IconField, PasswordInput } from '../components/auth/AuthShell.tsx'
import { ChevronIcon, LockIcon, MailIcon, PhoneIcon, UserIcon } from '../components/icons.tsx'
import { useAuth } from '../context/AuthContext.tsx'
import { useNotice } from '../context/NoticeContext.tsx'
import { loginReason } from '../lib/loginReason.ts'
import { ApiError, errorMessage } from '../lib/api.ts'
import { useDocumentTitle } from '../lib/useDocumentTitle.ts'

type Mode = 'login' | 'register'

/** Only follow in-app paths, never an address someone put in the URL. */
const safeNext = (value: unknown) => (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/')

export function AuthPage() {
  const { user, loading, login, register } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const [mode, setMode] = useState<Mode>(params.get('mode') === 'register' ? 'register' : 'login')
  useDocumentTitle(mode === 'login' ? 'Log in' : 'Create account', { noindex: true })
  const next = safeNext((location.state as { from?: string } | null)?.from ?? params.get('next'))
  const reason = loginReason(next)
  const notify = useNotice()
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!loading && user) return <Navigate to={next} replace />

  const set = (key: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: '' }))
    setFormError('')
  }

  const validate = () => {
    const found: Record<string, string> = {}
    if (mode === 'register' && form.name.trim().length < 2) found.name = 'Enter your full name'
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) found.email = 'Enter a valid email address'
    if (mode === 'register' && form.phone && !/^[6-9]\d{9}$/.test(form.phone)) found.phone = 'Enter a valid 10-digit mobile number'
    if (mode === 'login' && form.password.length < 1) found.password = 'Enter your password'
    setErrors(found)
    return Object.keys(found).length === 0
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!validate()) return
    setBusy(true)
    setFormError('')
    try {
      if (mode === 'login') {
        const signedIn = await login(form.email.trim(), form.password)
        const first = signedIn.name.trim().split(/\s+/)[0]
        notify({ title: first ? `Welcome back, ${first}!` : 'Welcome back!', text: next === '/checkout' ? 'Your cart is ready. Finish your order below.' : 'You are logged in.' })
        navigate(next, { replace: true })
      } else {
        await register({ name: form.name.trim(), email: form.email.trim(), ...(form.phone ? { phone: form.phone } : {}) })
        navigate(`/verify-email?email=${encodeURIComponent(form.email.trim())}&next=${encodeURIComponent(next)}`, { replace: true })
      }
    } catch (error) {
      if (error instanceof ApiError && (error.details as { requiresVerification?: boolean } | undefined)?.requiresVerification) {
        navigate(`/verify-email?email=${encodeURIComponent(form.email.trim())}&next=${encodeURIComponent(next)}`, { replace: true })
        return
      }
      setFormError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title={mode === 'login' ? 'Welcome back' : 'Create your account'}
      subtitle={mode === 'login' ? 'Log in to check out, see your orders, and manage your account.' : 'It takes less than a minute. You need an account to check out.'}
    >
      <form onSubmit={submit} noValidate className="space-y-5">
        {reason && (
          <div role="status" className="motion-panel flex gap-3 rounded-2xl border border-brand/15 bg-brand-soft/70 p-4">
            <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-brand shadow-sm">
              <LockIcon className="size-[18px]" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-brand">{reason.title}</p>
              <p className="mt-0.5 text-[13px] leading-5 text-ink-soft">
                {reason.text}
                {mode === 'login' ? ' New here? Choose Create account.' : ''}
              </p>
            </div>
          </div>
        )}
        <div className="relative grid grid-cols-2 rounded-2xl bg-canvas p-1 text-sm font-bold ring-1 ring-line" role="tablist">
          <span
            aria-hidden="true"
            className={`absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-xl bg-white shadow-[0_4px_14px_-6px_rgb(18_58_134/0.35)] transition-transform duration-300 ease-out ${mode === 'register' ? 'translate-x-full' : ''}`}
          />
          {(['login', 'register'] as const).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={mode === item}
              onClick={() => { setMode(item); setErrors({}); setFormError('') }}
              className={`relative rounded-xl py-2.5 transition-colors ${mode === item ? 'text-brand' : 'text-muted hover:text-ink'}`}
            >
              {item === 'login' ? 'Log in' : 'Create account'}
            </button>
          ))}
        </div>

        {mode === 'register' && (
          <FormField label="Full name" error={errors.name}>
            <IconField icon={<UserIcon className="size-[18px]" />}>
              <input value={form.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" className="field pl-11" aria-invalid={!!errors.name} placeholder="Your name" />
            </IconField>
          </FormField>
        )}
        <FormField label="Email" error={errors.email}>
          <IconField icon={<MailIcon className="size-[18px]" />}>
            <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" inputMode="email" className="field pl-11" aria-invalid={!!errors.email} placeholder="you@example.com" autoFocus />
          </IconField>
        </FormField>
        {mode === 'register' && (
          <FormField label="Mobile number (optional)" error={errors.phone} hint="Used for delivery updates">
            <IconField icon={<PhoneIcon className="size-[18px]" />}>
              <input value={form.phone} onChange={(e) => set('phone', e.target.value.replace(/\D/g, '').slice(0, 10))} inputMode="numeric" autoComplete="tel-national" className="field pl-11" aria-invalid={!!errors.phone} placeholder="98765 43210" />
            </IconField>
          </FormField>
        )}
        {mode === 'login' ? (
          <>
            <FormField label="Password" error={errors.password}>
              <IconField icon={<LockIcon className="size-[18px]" />}>
                <PasswordInput value={form.password} onChange={(e) => set('password', e.target.value)} autoComplete="current-password" aria-invalid={!!errors.password} placeholder="Your password" />
              </IconField>
            </FormField>
            <div className="-mt-2 text-right text-sm">
              <Link to="/forgot-password" className="font-bold text-brand hover:underline">
                Forgot password?
              </Link>
            </div>
          </>
        ) : (
          <p className="flex items-start gap-2 rounded-xl bg-canvas px-3.5 py-3 text-[13px] leading-5 text-ink-soft">
            <MailIcon className="mt-0.5 size-4 shrink-0 text-brand" />
            We will email you a 6-digit code. After you confirm it, you will create your password.
          </p>
        )}

        <FormError message={formError} />
        <button type="submit" disabled={busy} className="btn btn-accent btn-lg group w-full">
          {busy ? <span className="motion-spin size-4 rounded-full border-2 border-white border-t-transparent" /> : null}
          {busy ? (mode === 'login' ? 'Logging in…' : 'Sending code…') : mode === 'login' ? 'Log in' : 'Continue'}
          {!busy && <ChevronIcon className="size-4 transition-transform group-hover:translate-x-0.5" />}
        </button>
        {mode === 'register' && (
          <p className="text-center text-xs text-muted">
            By creating an account you agree to our <AuthLink to="/terms">Terms</AuthLink> and <AuthLink to="/privacy">Privacy Policy</AuthLink>.
          </p>
        )}
      </form>
    </AuthShell>
  )
}
