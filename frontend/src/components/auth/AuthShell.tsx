import { useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '../layout/Logo.tsx'

/** Two-column layout shared by login, register and password reset pages. */
export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-[calc(100svh-8rem)] lg:grid-cols-[1fr_1.05fr]">
      <div className="relative hidden overflow-hidden bg-ink lg:block">
        <img src="/images/almonds.jpg" alt="" className="absolute inset-0 size-full object-cover opacity-55" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-transparent" />
        <div className="relative flex h-full flex-col justify-end p-12 text-white">
          <p className="eyebrow !text-orange-300">ClickMart</p>
          <h2 className="mt-3 max-w-sm text-4xl leading-tight font-extrabold tracking-tight">Fresh dry fruits, one tap away.</h2>
          <ul className="mt-6 space-y-2.5 text-white/80">
            {['Track every order live', 'Save your favourites', 'Faster checkout with saved details'].map((item) => (
              <li key={item} className="flex items-center gap-3">
                <span className="grid size-5 place-items-center rounded-full bg-accent text-[11px] font-bold">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="grid place-items-center bg-gradient-to-b from-cream to-white px-4 py-12 sm:px-8">
        <div className="w-full max-w-md">
          <Logo className="h-14 w-auto" />
          <h1 className="mt-6 text-3xl font-extrabold tracking-tight">{title}</h1>
          <p className="mt-1.5 text-sm text-muted">{subtitle}</p>
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
        </div>
      </div>
    </div>
  )
}

export function FormField({ label, error, hint, children }: { label: string; error?: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-[13px] font-bold text-ink-soft">{label}</span>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <span role="alert" className="mt-1.5 block text-xs font-semibold text-rose-600">
          {error}
        </span>
      ) : (
        hint && <span className="mt-1.5 block text-xs text-muted">{hint}</span>
      )}
    </label>
  )
}

export function PasswordInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const [shown, setShown] = useState(false)
  return (
    <div className="relative">
      <input {...props} type={shown ? 'text' : 'password'} className="field pr-16" />
      <button
        type="button"
        onClick={() => setShown((value) => !value)}
        aria-label={shown ? 'Hide password' : 'Show password'}
        className="absolute top-1/2 right-3 -translate-y-1/2 rounded-md px-1.5 py-1 text-xs font-bold text-brand hover:bg-brand-soft"
      >
        {shown ? 'Hide' : 'Show'}
      </button>
    </div>
  )
}

/** Simple length/variety meter. The server only enforces 8+ characters. */
export function PasswordStrength({ password }: { password: string }) {
  if (!password) return null
  const score = [password.length >= 8, password.length >= 12, /[A-Z]/.test(password) && /[a-z]/.test(password), /\d/.test(password), /[^A-Za-z0-9]/.test(password)].filter(Boolean).length
  const level = password.length < 8 ? 0 : score <= 2 ? 1 : score === 3 ? 2 : 3
  const labels = ['Too short', 'Weak', 'Good', 'Strong']
  const colors = ['bg-rose-500', 'bg-orange-400', 'bg-amber-400', 'bg-success']
  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex gap-1">
        {[0, 1, 2].map((index) => (
          <span key={index} className={`h-1.5 flex-1 rounded-full transition-colors ${index < level ? colors[level] : 'bg-line'}`} />
        ))}
      </div>
      <p className="mt-1 text-xs text-muted">{labels[level]}</p>
    </div>
  )
}

export function FormError({ message }: { message: string }) {
  if (!message) return null
  return (
    <p role="alert" className="motion-panel rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
      {message}
    </p>
  )
}

export const AuthLink = ({ to, children }: { to: string; children: ReactNode }) => (
  <Link to={to} className="font-bold text-brand hover:underline">
    {children}
  </Link>
)
