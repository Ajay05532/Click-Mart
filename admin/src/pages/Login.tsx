import { useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ApiError } from '../api.ts'
import { useAuth } from '../auth.tsx'
import { Button } from '../ui.tsx'

type Problem = { field: 'email' | 'password' | 'form'; message: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const icon = 'size-5 shrink-0'
const MailIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={icon} aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 8 8 5.5L20 8" /></svg>
)
const LockIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={icon} aria-hidden="true"><rect x="4" y="10.5" width="16" height="10" rx="3" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></svg>
)
const EyeIcon = ({ off }: { off: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={icon} aria-hidden="true">
    <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
    {off && <path d="m4 4 16 16" />}
  </svg>
)
const AlertIcon = ({ className = 'size-4' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`${className} shrink-0`} aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5h.01" /></svg>
)

const FEATURES: { title: string; text: string; path: ReactNode }[] = [
  { title: 'Orders and delivery', text: 'Confirm, pack, ship and refund from one queue.', path: <path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5v-9ZM3 7.5l9 4.5 9-4.5M12 12v9" /> },
  { title: 'Catalogue and stock', text: 'Pack sizes, prices and live inventory.', path: <path d="M4 6h16M4 12h16M4 18h10" /> },
  { title: 'Offers and coupons', text: 'Run sales and codes without touching code.', path: <path d="M20 12 12 20 4 12V4h8l8 8ZM8.5 8.5h.01" /> },
  { title: 'Sales at a glance', text: 'Revenue, top products and what needs attention.', path: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /> },
]

function classify(err: unknown): Problem {
  if (err instanceof ApiError) {
    if (err.status === 429) return { field: 'form', message: 'Too many failed attempts. Please wait a few minutes and try again.' }
    if (err.status === 401) {
      if (/staff account/i.test(err.message)) return { field: 'email', message: err.message }
      if (/password/i.test(err.message)) return { field: 'password', message: err.message }
      if (/disabled/i.test(err.message)) return { field: 'form', message: 'This account has been disabled. Ask an administrator to restore access.' }
    }
    if (err.status >= 500) return { field: 'form', message: 'The server had a problem. Please try again in a moment.' }
    return { field: 'form', message: err.message }
  }
  // fetch() rejects with a TypeError when the API cannot be reached at all.
  return { field: 'form', message: 'Cannot reach the server. Check your internet connection and try again. If the API was idle it can take up to a minute to wake up.' }
}

export function LoginPage() {
  const { user, loading, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [busy, setBusy] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  const next = (location.state as { from?: string } | null)?.from ?? '/'
  if (!loading && user) return <Navigate to={next} replace />

  const fail = (found: Problem) => {
    setProblem(found)
    if (found.field === 'email') emailRef.current?.focus()
    if (found.field === 'password') {
      passwordRef.current?.focus()
      passwordRef.current?.select()
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    const trimmed = email.trim()
    if (!trimmed) return fail({ field: 'email', message: 'Enter your email address' })
    if (!EMAIL_RE.test(trimmed)) return fail({ field: 'email', message: 'Enter a valid email address, like name@example.com' })
    if (!password) return fail({ field: 'password', message: 'Enter your password' })
    setBusy(true)
    setProblem(null)
    try {
      await login(trimmed, password)
      navigate(next, { replace: true })
    } catch (err) {
      fail(classify(err))
    } finally {
      setBusy(false)
    }
  }

  const trackCaps = (event: KeyboardEvent<HTMLInputElement>) => setCapsLock(event.getModifierState('CapsLock'))
  const emailError = problem?.field === 'email' ? problem.message : ''
  const passwordError = problem?.field === 'password' ? problem.message : ''

  const shell = (hasError: boolean) =>
    `flex items-center gap-3 rounded-xl border-[1.5px] bg-white px-3.5 transition focus-within:ring-4 ${
      hasError
        ? 'border-rose-400 text-rose-500 focus-within:border-rose-500 focus-within:ring-rose-100'
        : 'border-line text-muted focus-within:border-brand focus-within:text-brand focus-within:ring-brand/10'
    }`
  const bare = 'h-12 min-w-0 flex-1 bg-transparent text-[15px] font-medium text-ink outline-none focus-visible:outline-none! placeholder:font-normal placeholder:text-muted/60'

  return (
    <div className="grid min-h-svh grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <aside className="relative hidden overflow-hidden bg-ink p-12 text-white lg:flex lg:flex-col lg:justify-between lg:gap-10 xl:p-16">
        <div className="pointer-events-none absolute -top-32 -right-24 size-[28rem] rounded-full bg-accent/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -left-32 size-[26rem] rounded-full bg-brand/60 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-accent text-xl font-extrabold shadow-lg shadow-accent/30">C</span>
          <span className="text-lg font-extrabold tracking-tight">ClickMart Admin</span>
        </div>
        <div className="relative">
          <h2 className="max-w-md text-4xl leading-[1.1] font-extrabold tracking-tight">Run your store from one place.</h2>
          <p className="mt-4 max-w-md text-white/60">Everything your team needs to keep orders moving and shelves stocked.</p>
          <ul className="mt-8 grid max-w-xl grid-cols-1 gap-3 min-[1500px]:grid-cols-2">
            {FEATURES.map((item) => (
              <li key={item.title} className="flex items-start gap-3.5 rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-sm">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/10 text-accent">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true">{item.path}</svg>
                </span>
                <span>
                  <span className="block text-sm font-bold">{item.title}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-white/55">{item.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/40">Authorised staff only. Activity is logged.</p>
      </aside>

      <main className="flex min-h-svh flex-col items-center justify-center bg-canvas px-4 py-10 sm:px-6">
        <div className="mb-8 flex items-center gap-3 lg:hidden">
          <span className="grid size-10 place-items-center rounded-xl bg-accent text-lg font-extrabold text-white">C</span>
          <span className="text-lg font-extrabold tracking-tight">ClickMart Admin</span>
        </div>
        <form onSubmit={submit} noValidate className="w-full max-w-md rounded-3xl border border-line/80 bg-white p-6 shadow-card sm:p-10">
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-[1.75rem]">Welcome back</h1>
          <p className="mt-1.5 text-sm text-muted">Sign in with your staff or administrator account.</p>

          {problem?.field === 'form' && (
            <div role="alert" className="mt-6 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm font-semibold text-rose-700">
              <AlertIcon className="mt-0.5 size-4" />
              <span>{problem.message}</span>
            </div>
          )}

          <div className="mt-7 space-y-5">
            <div>
              <label htmlFor="login-email" className="text-xs font-bold text-ink-soft">Email address</label>
              <div className={`mt-1.5 ${shell(!!emailError)}`}>
                <MailIcon />
                <input
                  ref={emailRef}
                  id="login-email"
                  type="email"
                  inputMode="email"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  autoFocus
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value)
                    if (problem?.field === 'email' || problem?.field === 'form') setProblem(null)
                  }}
                  placeholder="you@theclickmart.com"
                  aria-invalid={!!emailError}
                  aria-describedby={emailError ? 'login-email-error' : undefined}
                  className={bare}
                />
              </div>
              {emailError && (
                <p id="login-email-error" role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-rose-600"><AlertIcon />{emailError}</p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="login-password" className="text-xs font-bold text-ink-soft">Password</label>
                <Link to="/forgot-password" className="text-xs font-bold text-brand hover:underline">Forgot password?</Link>
              </div>
              <div className={`mt-1.5 ${shell(!!passwordError)}`}>
                <LockIcon />
                <input
                  ref={passwordRef}
                  id="login-password"
                  type={show ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value)
                    if (problem?.field === 'password' || problem?.field === 'form') setProblem(null)
                  }}
                  onKeyDown={trackCaps}
                  onKeyUp={trackCaps}
                  onBlur={() => setCapsLock(false)}
                  placeholder="Enter your password"
                  aria-invalid={!!passwordError}
                  aria-describedby={passwordError ? 'login-password-error' : undefined}
                  className={bare}
                />
                <button
                  type="button"
                  onClick={() => setShow((value) => !value)}
                  aria-label={show ? 'Hide password' : 'Show password'}
                  aria-pressed={show}
                  className="-mr-1.5 grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg text-muted transition hover:bg-canvas hover:text-ink"
                >
                  <EyeIcon off={show} />
                </button>
              </div>
              {passwordError && (
                <p id="login-password-error" role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-rose-600"><AlertIcon />{passwordError}</p>
              )}
              {capsLock && !passwordError && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-amber-600"><AlertIcon />Caps Lock is on</p>
              )}
            </div>
          </div>

          <Button type="submit" variant="accent" className="mt-7 h-12 w-full text-[15px]" loading={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
          <p className="mt-6 text-center text-xs text-muted">Secure sign-in. Your sessions are protected and every action is logged.</p>
        </form>
      </main>
    </div>
  )
}
