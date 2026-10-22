import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthLink, AuthShell, FormError, FormField, PasswordInput, PasswordStrength } from '../components/auth/AuthShell.tsx'
import { CodeInput } from '../components/auth/CodeInput.tsx'
import { api, errorMessage } from '../lib/api.ts'
import { useDocumentTitle } from '../lib/useDocumentTitle.ts'

type Step = 'email' | 'code' | 'password' | 'done'
const RESEND_SECONDS = 30

const steps: { id: Exclude<Step, 'done'>; label: string }[] = [
  { id: 'email', label: 'Email' },
  { id: 'code', label: 'Code' },
  { id: 'password', label: 'New password' },
]

export function ForgotPasswordPage() {
  useDocumentTitle('Forgot password', { noindex: true })
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [token, setToken] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [minutes, setMinutes] = useState(10)
  const [wait, setWait] = useState(0)

  useEffect(() => {
    if (wait <= 0) return
    const timer = window.setTimeout(() => setWait((value) => value - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [wait])

  const sendCode = async () => {
    setBusy(true)
    setError('')
    try {
      const result = await api<{ expiresInMinutes?: number }>('/auth/forgot-password', { body: { email: email.trim() } })
      if (result.expiresInMinutes) setMinutes(result.expiresInMinutes)
      setCode('')
      setStep('code')
      setWait(RESEND_SECONDS)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const submitEmail = (event: FormEvent) => {
    event.preventDefault()
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter the email you signed up with')
    void sendCode()
  }

  const verify = async (value = code) => {
    if (!/^\d{6}$/.test(value)) return setError('Enter all 6 digits')
    setBusy(true)
    setError('')
    try {
      const result = await api<{ resetToken: string }>('/auth/verify-reset-code', { body: { email: email.trim(), code: value } })
      setToken(result.resetToken)
      setStep('password')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const submitPassword = async (event: FormEvent) => {
    event.preventDefault()
    if (password.length < 8) return setError('Use at least 8 characters')
    if (password !== confirm) return setError('The two passwords do not match')
    setBusy(true)
    setError('')
    try {
      await api('/auth/reset-password', { body: { token, password } })
      setStep('done')
      window.setTimeout(() => navigate('/login', { replace: true }), 2500)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const titles: Record<Step, [string, string]> = {
    email: ['Forgot your password?', 'Enter your email and we will send you a 6-digit code to confirm it is you.'],
    code: ['Check your email', `We sent a 6-digit code to ${email.trim()}. It expires in ${minutes} minutes.`],
    password: ['Choose a new password', 'Code confirmed. Pick something you have not used before.'],
    done: ['Password updated', 'You can log in with your new password now.'],
  }
  const current = steps.findIndex((item) => item.id === step)

  return (
    <AuthShell title={titles[step][0]} subtitle={titles[step][1]} footer={<AuthLink to="/login">← Back to log in</AuthLink>}>
      {step !== 'done' && (
        <ol className="mb-6 flex items-center gap-2" aria-label="Steps">
          {steps.map((item, index) => (
            <li key={item.id} className="flex flex-1 items-center gap-2">
              <span className={`grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-extrabold ${index < current ? 'bg-success text-white' : index === current ? 'bg-brand text-white' : 'bg-canvas text-muted ring-1 ring-line'}`}>
                {index < current ? '✓' : index + 1}
              </span>
              <span className={`truncate text-xs font-bold ${index === current ? 'text-ink' : 'text-muted'}`}>{item.label}</span>
              {index < steps.length - 1 && <span className={`h-px flex-1 ${index < current ? 'bg-success' : 'bg-line'}`} />}
            </li>
          ))}
        </ol>
      )}

      {step === 'email' && (
        <form onSubmit={submitEmail} noValidate className="space-y-5">
          <FormField label="Email">
            <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError('') }} autoComplete="email" className="field" aria-invalid={!!error} placeholder="you@example.com" autoFocus />
          </FormField>
          <FormError message={error} />
          <button type="submit" disabled={busy} className="btn btn-accent btn-lg w-full">
            {busy ? 'Sending…' : 'Send code'}
          </button>
        </form>
      )}

      {step === 'code' && (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void verify()
          }}
          noValidate
          className="space-y-5"
        >
          <CodeInput
            value={code}
            disabled={busy}
            invalid={!!error}
            onChange={(value) => {
              setCode(value)
              setError('')
              if (value.length === 6) void verify(value)
            }}
          />
          <FormError message={error} />
          <button type="submit" disabled={busy || code.length !== 6} className="btn btn-accent btn-lg w-full">
            {busy ? 'Checking…' : 'Confirm code'}
          </button>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <button type="button" onClick={() => { setStep('email'); setError('') }} className="font-bold text-muted hover:text-ink">
              Use another email
            </button>
            {wait > 0 ? (
              <span className="text-muted tabular-nums">Resend code in {wait}s</span>
            ) : (
              <button type="button" disabled={busy} onClick={() => void sendCode()} className="font-bold text-brand hover:underline">
                Resend code
              </button>
            )}
          </div>
          <p className="rounded-xl bg-canvas px-3 py-2.5 text-xs leading-5 text-muted">Not in your inbox? Check spam or promotions. The code only arrives if this email has a ClickMart account.</p>
        </form>
      )}

      {step === 'password' && (
        <form onSubmit={submitPassword} noValidate className="space-y-5">
          <FormField label="New password">
            <PasswordInput value={password} onChange={(e) => { setPassword(e.target.value); setError('') }} autoComplete="new-password" placeholder="At least 8 characters" autoFocus />
            <PasswordStrength password={password} />
          </FormField>
          <FormField label="Confirm new password">
            <PasswordInput value={confirm} onChange={(e) => { setConfirm(e.target.value); setError('') }} autoComplete="new-password" placeholder="Type it again" />
          </FormField>
          <FormError message={error} />
          <button type="submit" disabled={busy} className="btn btn-accent btn-lg w-full">
            {busy ? 'Saving…' : 'Update password'}
          </button>
        </form>
      )}

      {step === 'done' && (
        <div className="motion-panel rounded-2xl bg-emerald-50 p-6 text-center">
          <p className="text-3xl">✅</p>
          <p className="mt-2 font-extrabold text-success">Password updated</p>
          <p className="mt-1 text-sm text-ink-soft">We signed you out on other devices. Taking you to log in…</p>
          <Link to="/login" className="btn btn-brand btn-sm mt-4">
            Log in now
          </Link>
        </div>
      )}
    </AuthShell>
  )
}
