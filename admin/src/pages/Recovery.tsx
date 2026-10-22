import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api.ts'
import { Button, Field, Input, errorMessage } from '../ui.tsx'

function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="grid min-h-svh place-items-center bg-canvas p-6">
      <div className="w-full max-w-sm rounded-2xl border border-line/80 bg-white p-6 shadow-card sm:p-8">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-accent text-xl font-extrabold text-white">C</span>
          <span className="font-extrabold">ClickMart Admin</span>
        </div>
        <h1 className="mt-8 text-2xl font-extrabold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted">{subtitle}</p>
        <div className="mt-6">{children}</div>
        <p className="mt-6 text-center text-sm"><Link to="/login" className="font-bold text-brand hover:underline">← Back to sign in</Link></p>
      </div>
    </div>
  )
}

export function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<'email' | 'code' | 'password' | 'done'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [token, setToken] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [wait, setWait] = useState(0)

  useEffect(() => {
    if (wait <= 0) return
    const timer = window.setTimeout(() => setWait((value) => value - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [wait])

  const run = async (work: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await work()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  const sendCode = () =>
    run(async () => {
      await api('/auth/forgot-password', { body: { email: email.trim() } })
      setCode('')
      setStep('code')
      setWait(30)
    })
  const verify = (value: string) =>
    run(async () => {
      const result = await api<{ resetToken: string }>('/auth/verify-reset-code', { body: { email: email.trim(), code: value } })
      setToken(result.resetToken)
      setStep('password')
    })
  const save = (event: FormEvent) => {
    event.preventDefault()
    if (password.length < 8) return setError('Use at least 8 characters')
    if (password !== confirm) return setError('The two passwords do not match')
    void run(async () => {
      await api('/auth/reset-password', { body: { token, password } })
      setStep('done')
      window.setTimeout(() => navigate('/login', { replace: true }), 2000)
    })
  }

  const subtitle = {
    email: 'We will email you a 6-digit code to confirm it is you.',
    code: `Enter the 6-digit code we sent to ${email.trim()}. It expires in 10 minutes.`,
    password: 'Code confirmed. Choose a new password.',
    done: 'Your password is updated.',
  }[step]
  const alert = error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p>

  return (
    <Shell title="Reset your password" subtitle={subtitle}>
      {step === 'email' && (
        <form onSubmit={(event) => { event.preventDefault(); void sendCode() }} className="space-y-4">
          <Field label="Email"><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus /></Field>
          {alert}
          <Button type="submit" variant="accent" className="w-full" loading={busy}>Send code</Button>
        </form>
      )}
      {step === 'code' && (
        <form onSubmit={(event) => { event.preventDefault(); void verify(code) }} className="space-y-4">
          <Field label="6-digit code">
            <Input
              value={code}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              autoFocus
              placeholder="••••••"
              className="!h-14 text-center font-mono !text-2xl font-extrabold tracking-[0.5em]"
              onChange={(e) => {
                const next = e.target.value.replace(/\D/g, '').slice(0, 6)
                setCode(next)
                setError('')
                if (next.length === 6) void verify(next)
              }}
            />
          </Field>
          {alert}
          <Button type="submit" variant="accent" className="w-full" loading={busy} disabled={code.length !== 6}>Confirm code</Button>
          <div className="flex items-center justify-between text-xs">
            <button type="button" onClick={() => { setStep('email'); setError('') }} className="font-bold text-muted hover:text-ink">Use another email</button>
            {wait > 0 ? <span className="text-muted tabular-nums">Resend in {wait}s</span> : <button type="button" disabled={busy} onClick={() => void sendCode()} className="font-bold text-brand hover:underline">Resend code</button>}
          </div>
        </form>
      )}
      {step === 'password' && (
        <form onSubmit={save} className="space-y-4">
          <Field label="New password" hint="At least 8 characters"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" autoFocus /></Field>
          <Field label="Confirm new password"><Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" /></Field>
          {alert}
          <Button type="submit" variant="accent" className="w-full" loading={busy}>Update password</Button>
        </form>
      )}
      {step === 'done' && <p className="anim-rise rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">Password updated. Taking you to sign in…</p>}
    </Shell>
  )
}

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (password.length < 8) return setError('Use at least 8 characters')
    if (password !== confirm) return setError('The two passwords do not match')
    setBusy(true)
    setError('')
    try {
      await api('/auth/reset-password', { body: { token, password } })
      setDone(true)
      window.setTimeout(() => navigate('/login', { replace: true }), 2000)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  if (!token) return <Shell title="Link not valid" subtitle="This reset link is missing its code."><Link to="/forgot-password" className="font-bold text-brand hover:underline">Request a new link</Link></Shell>
  return (
    <Shell title="Choose a new password" subtitle="You will be signed out on every device.">
      {done ? (
        <p className="anim-rise rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">Password updated. Taking you to sign in…</p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="New password" hint="At least 8 characters"><Input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setError('') }} autoComplete="new-password" autoFocus /></Field>
          <Field label="Confirm new password"><Input type="password" value={confirm} onChange={(e) => { setConfirm(e.target.value); setError('') }} autoComplete="new-password" /></Field>
          {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p>}
          <Button type="submit" variant="accent" className="w-full" loading={busy}>Update password</Button>
        </form>
      )}
    </Shell>
  )
}
