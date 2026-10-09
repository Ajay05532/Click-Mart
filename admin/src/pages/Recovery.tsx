import { useState, type FormEvent, type ReactNode } from 'react'
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
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api('/auth/forgot-password', { body: { email: email.trim() } })
      setSent(true)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Shell title="Reset your password" subtitle="We will email you a link that works once and expires in 30 minutes.">
      {sent ? (
        <p className="anim-rise rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">If that email belongs to an account, a reset link is on its way.</p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Email"><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus /></Field>
          {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p>}
          <Button type="submit" variant="accent" className="w-full" loading={busy}>Send reset link</Button>
        </form>
      )}
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
