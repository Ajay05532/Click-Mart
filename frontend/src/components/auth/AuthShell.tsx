import { useState, type InputHTMLAttributes, type KeyboardEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useStoreSettings } from '../../lib/catalog.ts'
import { formatPrice } from '../../lib/money.ts'
import { CashIcon, LockIcon, ShieldIcon, TruckIcon } from '../icons.tsx'

/** Wraps a field with a leading icon, used across the login/register/password forms. */
export function IconField({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="group relative">
      <span className="pointer-events-none absolute top-6 left-3.5 z-10 -translate-y-1/2 text-muted/70 transition-colors group-focus-within:text-brand">{icon}</span>
      {children}
    </div>
  )
}

const PHOTOS = [
  { src: '/images/almonds.jpg', alt: 'Almonds' },
  { src: '/images/cashews.jpg', alt: 'Cashews' },
  { src: '/images/walnuts.jpg', alt: 'Walnuts' },
  { src: '/images/raisins.jpg', alt: 'Raisins' },
]

function Perks() {
  const settings = useStoreSettings()
  const perks = [
    { icon: TruckIcon, text: settings.shippingFee === 0 ? 'Free delivery on every order' : `Free delivery over ${formatPrice(settings.freeShippingThreshold)}` },
    ...(settings.codEnabled ? [{ icon: CashIcon, text: 'Cash on delivery available' }] : []),
    { icon: ShieldIcon, text: 'Secure payments by Razorpay' },
  ]
  return (
    <ul className="space-y-3">
      {perks.map(({ icon: Icon, text }) => (
        <li key={text} className="flex items-center gap-3 text-sm font-semibold text-white/90">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/10 ring-1 ring-white/15">
            <Icon className="size-[18px] text-orange-300" />
          </span>
          {text}
        </li>
      ))}
    </ul>
  )
}

/** Card layout shared by login, register, verification and password reset pages. */
export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="relative flex-1 overflow-hidden bg-gradient-to-b from-cream via-white to-canvas">
      <div aria-hidden="true" className="pointer-events-none absolute -top-40 -left-32 size-[28rem] rounded-full bg-brand/10 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-24 -bottom-40 size-[26rem] rounded-full bg-accent/15 blur-3xl" />

      <div className="relative mx-auto flex w-full max-w-5xl items-center px-4 py-8 sm:px-6 sm:py-14">
        <div className="grid w-full grid-cols-1 overflow-hidden rounded-[28px] border border-line/80 bg-white shadow-[0_30px_80px_-30px_rgb(18_58_134/0.35)] lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <aside className="relative hidden min-w-0 overflow-hidden bg-gradient-to-br from-brand via-brand-dark to-[#081f4d] p-10 text-white lg:flex lg:flex-col">
            <div aria-hidden="true" className="absolute -top-24 -right-24 size-72 rounded-full bg-accent/25 blur-3xl" />
            <p className="relative text-xs font-extrabold tracking-[0.2em] text-orange-300 uppercase">ClickMart</p>
            <h2 className="relative mt-3 text-[2rem] leading-[1.15] font-extrabold tracking-tight">
              Pure, natural goodness,
              <br />
              <span className="text-orange-300">delivered to your door.</span>
            </h2>
            <div className="relative mt-8 grid grid-cols-2 gap-3">
              {PHOTOS.map((photo, index) => (
                <div key={photo.src} className={`overflow-hidden rounded-2xl ring-1 ring-white/15 ${index % 2 ? 'translate-y-5' : ''}`}>
                  <img src={photo.src} alt={photo.alt} className="aspect-[4/3] size-full object-cover transition duration-500 hover:scale-105" />
                </div>
              ))}
            </div>
            <div className="relative mt-auto pt-12">
              <Perks />
            </div>
          </aside>

          <div className="min-w-0">
            <div className="flex gap-2 overflow-hidden bg-gradient-to-r from-brand to-brand-dark p-3 lg:hidden" aria-hidden="true">
              {PHOTOS.map((photo) => (
                <img key={photo.src} src={photo.src} alt="" className="h-16 min-w-0 flex-1 rounded-xl object-cover ring-1 ring-white/20" />
              ))}
            </div>
            <div className="px-5 py-8 sm:px-10 sm:py-11">
              <h1 className="text-[1.75rem] leading-tight font-extrabold tracking-tight sm:text-3xl">{title}</h1>
              <p className="mt-2 text-sm leading-6 text-muted">{subtitle}</p>
              <div className="mt-7">{children}</div>
              {footer && <div className="mt-7 border-t border-line pt-5 text-center text-sm text-muted">{footer}</div>}
              <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-muted">
                <LockIcon className="size-3.5" />
                Your details are encrypted and never shared.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Tracks Caps Lock while typing a password, for the "Caps Lock is on" hint. */
function useCapsLock() {
  const [on, setOn] = useState(false)
  const read = (event: KeyboardEvent<HTMLInputElement>) => setOn(event.getModifierState('CapsLock'))
  return { on, read }
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
  const caps = useCapsLock()
  return (
    <>
      <div className="relative">
        <input
          {...props}
          type={shown ? 'text' : 'password'}
          className="field pr-12 pl-11"
          onKeyUp={(event) => {
            caps.read(event)
            props.onKeyUp?.(event)
          }}
          onKeyDown={(event) => {
            caps.read(event)
            props.onKeyDown?.(event)
          }}
        />
        <button
          type="button"
          onClick={() => setShown((value) => !value)}
          aria-label={shown ? 'Hide password' : 'Show password'}
          aria-pressed={shown}
          className="absolute top-1/2 right-2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-muted transition hover:bg-brand-soft hover:text-brand"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-[18px]" aria-hidden="true">
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
            <circle cx="12" cy="12" r="3" />
            {shown && <path d="m3 3 18 18" />}
          </svg>
        </button>
      </div>
      {caps.on && <span className="mt-1.5 block text-xs font-semibold text-accent-dark">Caps Lock is on</span>}
    </>
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
