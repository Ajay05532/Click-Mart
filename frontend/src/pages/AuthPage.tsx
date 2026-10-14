import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { AuthLink, AuthShell, FormError, FormField, PasswordInput, PasswordStrength } from '../components/auth/AuthShell.tsx'
import { useAuth } from '../context/AuthContext.tsx'
import { errorMessage } from '../lib/api.ts'
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
    if (mode === 'register' ? form.password.length < 8 : form.password.length < 1) found.password = mode === 'register' ? 'Use at least 8 characters' : 'Enter your password'
    setErrors(found)
    return Object.keys(found).length === 0
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!validate()) return
    setBusy(true)
    setFormError('')
    try {
      if (mode === 'login') await login(form.email.trim(), form.password)
      else await register({ name: form.name.trim(), email: form.email.trim(), password: form.password, ...(form.phone ? { phone: form.phone } : {}) })
      navigate(next, { replace: true })
    } catch (error) {
      setFormError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title={mode === 'login' ? 'Welcome back' : 'Create your account'}
      subtitle={mode === 'login' ? (next === '/checkout' ? 'Log in to place this order. Your cart is saved.' : 'Log in to check out, see your orders, and manage your account.') : 'It takes less than a minute. You need an account to check out.'}
      footer={
        mode === 'login' ? (
          <>
            New to ClickMart?{' '}
            <button type="button" onClick={() => { setMode('register'); setErrors({}); setFormError('') }} className="font-bold text-brand hover:underline">
              Create an account
            </button>
          </>
        ) : (
          <>
            Already have an account?{' '}
            <button type="button" onClick={() => { setMode('login'); setErrors({}); setFormError('') }} className="font-bold text-brand hover:underline">
              Log in
            </button>
          </>
        )
      }
    >
      <form onSubmit={submit} noValidate className="space-y-5">
        <div className="grid grid-cols-2 rounded-full bg-canvas p-1 text-sm font-bold" role="tablist">
          {(['login', 'register'] as const).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={mode === item}
              onClick={() => { setMode(item); setErrors({}); setFormError('') }}
              className={`rounded-full py-2.5 transition ${mode === item ? 'bg-white text-brand shadow-sm' : 'text-muted'}`}
            >
              {item === 'login' ? 'Log in' : 'Register'}
            </button>
          ))}
        </div>

        {mode === 'register' && (
          <FormField label="Full name" error={errors.name}>
            <input value={form.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" className="field" aria-invalid={!!errors.name} placeholder="Your name" />
          </FormField>
        )}
        <FormField label="Email" error={errors.email}>
          <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" inputMode="email" className="field" aria-invalid={!!errors.email} placeholder="you@example.com" />
        </FormField>
        {mode === 'register' && (
          <FormField label="Mobile number (optional)" error={errors.phone} hint="Used for delivery updates">
            <input value={form.phone} onChange={(e) => set('phone', e.target.value.replace(/\D/g, '').slice(0, 10))} inputMode="numeric" autoComplete="tel-national" className="field" aria-invalid={!!errors.phone} placeholder="98765 43210" />
          </FormField>
        )}
        <FormField label="Password" error={errors.password}>
          <PasswordInput value={form.password} onChange={(e) => set('password', e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} aria-invalid={!!errors.password} placeholder={mode === 'login' ? 'Your password' : 'At least 8 characters'} />
          {mode === 'register' && <PasswordStrength password={form.password} />}
        </FormField>
        {mode === 'login' && (
          <div className="-mt-2 text-right text-sm">
            <Link to="/forgot-password" className="font-bold text-brand hover:underline">
              Forgot password?
            </Link>
          </div>
        )}

        <FormError message={formError} />
        <button type="submit" disabled={busy} className="btn btn-accent btn-lg w-full">
          {busy ? <span className="motion-spin size-4 rounded-full border-2 border-white border-t-transparent" /> : null}
          {mode === 'login' ? 'Log in' : 'Create account'}
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
