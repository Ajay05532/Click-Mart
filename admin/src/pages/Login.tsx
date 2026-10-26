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

const ShieldIcon = ({ className = 'size-4 shrink-0' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true"><path d="M12 3 5 6v6c0 4.2 2.8 7.2 7 8.5 4.2-1.3 7-4.3 7-8.5V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></svg>
)
const STORE_URL = (import.meta.env.VITE_STOREFRONT_URL as string | undefined) || (import.meta.env.DEV ? 'http://localhost:5173' : '')

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
    <div className="relative flex min-h-svh items-center justify-center overflow-hidden bg-canvas px-4 py-8 sm:px-6 sm:py-12">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgb(18_58_134/0.07)_1px,transparent_0)] [background-size:22px_22px]" />
      <div aria-hidden="true" className="pointer-events-none absolute -top-40 -left-40 size-[30rem] rounded-full bg-brand/15 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-32 -bottom-40 size-[28rem] rounded-full bg-accent/20 blur-3xl" />

      <div className="relative grid w-full max-w-5xl grid-cols-1 overflow-hidden rounded-[28px] border border-line/80 bg-white shadow-[0_30px_80px_-30px_rgb(18_58_134/0.35)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <aside className="relative hidden min-w-0 flex-col overflow-hidden bg-gradient-to-br from-brand via-brand-dark to-[#081f4d] p-10 text-white lg:flex">
          <div aria-hidden="true" className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-accent/30 blur-3xl" />
          <div className="relative flex items-center gap-3">
            <span className="grid h-12 place-items-center rounded-xl bg-white px-2.5 shadow-lg shadow-black/20">
              <img src="/logo.png" alt="ClickMart" className="h-9 w-auto" />
            </span>
            <span>
              <span className="block text-base font-extrabold tracking-tight">ClickMart</span>
              <span className="block text-[11px] font-bold tracking-[0.18em] text-orange-300 uppercase">Seller dashboard</span>
            </span>
          </div>

          <h2 className="relative mt-10 text-[2rem] leading-[1.15] font-extrabold tracking-tight">
            Run your store
            <br />
            <span className="text-orange-300">from one place.</span>
          </h2>
          <p className="relative mt-3 max-w-sm text-sm leading-6 text-white/65">Orders, stock, offers, support and reports, for you and your team.</p>

          <ol className="relative mt-8 flex flex-wrap items-center gap-1.5 text-[11px] font-bold" aria-label="Order flow">
            {['Placed', 'Packed', 'Shipped', 'Delivered'].map((step, index, all) => (
              <li key={step} className="flex items-center gap-1.5">
                <span className={`rounded-full px-2.5 py-1 ring-1 ${index === all.length - 1 ? 'bg-emerald-400/20 text-emerald-200 ring-emerald-300/30' : 'bg-white/10 text-white/85 ring-white/15'}`}>{step}</span>
                {index < all.length - 1 && <span aria-hidden="true" className="text-white/35">→</span>}
              </li>
            ))}
          </ol>

          <ul className="relative mt-6 grid grid-cols-2 gap-2.5">
            {FEATURES.map((item) => (
              <li key={item.title} className="rounded-2xl border border-white/10 bg-white/[0.06] p-3.5 backdrop-blur-sm">
                <span className="grid size-8 place-items-center rounded-lg bg-white/10 text-orange-300">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-[18px]" aria-hidden="true">{item.path}</svg>
                </span>
                <span className="mt-2.5 block text-[13px] font-bold">{item.title}</span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-white/55">{item.text}</span>
              </li>
            ))}
          </ul>

          <p className="relative mt-auto flex items-center gap-2 pt-10 text-xs text-white/50">
            <ShieldIcon /> Authorised staff only. Every action is logged.
          </p>
        </aside>

        <main className="min-w-0 px-5 py-9 sm:px-12 sm:py-12">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <img src="/logo.png" alt="ClickMart" className="h-10 w-auto" />
            <span className="text-[11px] font-bold tracking-[0.18em] text-accent-dark uppercase">Seller dashboard</span>
          </div>
          <form onSubmit={submit} noValidate>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-[11px] font-extrabold tracking-wide text-brand">
            <LockIcon /> Staff and admin sign-in
          </span>
          <h1 className="mt-4 text-[1.75rem] leading-tight font-extrabold tracking-tight sm:text-3xl">Welcome back</h1>
          <p className="mt-2 text-sm text-muted">Sign in to manage orders, products and your team.</p>

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

          <Button type="submit" variant="accent" className="mt-7 h-12 w-full text-[15px] shadow-[0_10px_24px_-10px_rgb(244_123_32/0.8)]" loading={busy}>{busy ? 'Signing in…' : 'Sign in to dashboard'}</Button>
          </form>

          <div className="mt-7 space-y-3 border-t border-line pt-6 text-xs text-muted">
            <p className="flex items-start gap-2">
              <ShieldIcon className="mt-px size-4 shrink-0 text-brand" />
              Need access? Ask the store owner to add you under Team.
            </p>
            {STORE_URL && (
              <a href={STORE_URL} className="inline-flex items-center gap-1 font-bold text-brand hover:underline">
                ← Back to the store
              </a>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
