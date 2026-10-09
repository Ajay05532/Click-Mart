import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth.tsx'
import { Button, Field, Input, errorMessage } from '../ui.tsx'

export function LoginPage() {
  const { user, loading, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!loading && user) return <Navigate to={(location.state as { from?: string } | null)?.from ?? '/'} replace />

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await login(email.trim(), password)
      navigate((location.state as { from?: string } | null)?.from ?? '/', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-ink p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -top-24 -right-24 size-96 rounded-full bg-accent/30 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-accent text-xl font-extrabold">C</span>
          <span className="text-lg font-extrabold">ClickMart Admin</span>
        </div>
        <div className="relative">
          <h2 className="max-w-md text-4xl leading-tight font-extrabold tracking-tight">Run your store from one place.</h2>
          <ul className="mt-6 space-y-3 text-white/70">
            {['Products, pack sizes and live stock', 'Orders, shipping updates and refunds', 'Offers, coupons and banners', 'Sales insights at a glance'].map((item) => (
              <li key={item} className="flex gap-3"><span className="text-accent">✓</span>{item}</li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/40">Authorised staff only. Activity is logged.</p>
      </div>
      <div className="grid place-items-center bg-canvas p-6">
        <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-line/80 bg-white p-6 shadow-card sm:p-8">
          <h1 className="text-2xl font-extrabold tracking-tight">Sign in</h1>
          <p className="mt-1 text-sm text-muted">Use your staff or administrator account.</p>
          <div className="mt-8 space-y-4">
            <Field label="Email"><Input type="email" required autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@clickmart.com" autoFocus /></Field>
            <Field label="Password"><Input type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></Field>
            <div className="-mt-1 text-right"><Link to="/forgot-password" className="text-xs font-bold text-brand hover:underline">Forgot password?</Link></div>
          </div>
          {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p>}
          <Button type="submit" variant="accent" className="mt-6 w-full" loading={busy}>Sign in</Button>
        </form>
      </div>
    </div>
  )
}
