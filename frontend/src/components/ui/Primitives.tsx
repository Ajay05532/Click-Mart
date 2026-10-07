import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CheckIcon } from '../icons.tsx'

export function SectionHeading({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string
  title: string
  action?: { to: string; label: string }
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2 className="mt-1.5 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{title}</h2>
      </div>
      {action && (
        <Link
          to={action.to}
          className="group inline-flex shrink-0 items-center gap-1 text-sm font-bold text-brand"
        >
          {action.label}
          <span className="transition group-hover:translate-x-1">→</span>
        </Link>
      )}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon: ReactNode
  title: string
  text: string
  action?: { to: string; label: string }
}) {
  return (
    <div className="card mx-auto max-w-lg px-6 py-14 text-center">
      <div className="mx-auto grid size-20 place-items-center rounded-full bg-brand-soft text-brand">{icon}</div>
      <h2 className="mt-5 text-xl font-extrabold">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted">{text}</p>
      {action && (
        <Link to={action.to} className="btn btn-accent btn-lg mt-6">
          {action.label}
        </Link>
      )}
    </div>
  )
}

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex items-center" aria-label="Progress">
      {steps.map((label, index) => {
        const done = index < current
        const active = index === current
        return (
          <li key={label} className="flex flex-1 items-center last:flex-none">
            <div className="flex items-center gap-2.5">
              <span
                className={`grid size-8 place-items-center rounded-full text-xs font-extrabold transition-colors duration-300 ${
                  done
                    ? 'bg-success text-white'
                    : active
                      ? 'bg-brand text-white shadow-[0_0_0_5px_rgb(18_58_134/0.12)]'
                      : 'bg-canvas text-muted ring-1 ring-line'
                }`}
              >
                {done ? '✓' : index + 1}
              </span>
              <span
                className={`hidden text-sm font-bold sm:block ${active ? 'text-ink' : done ? 'text-ink-soft' : 'text-muted'}`}
              >
                {label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <span className={`mx-3 h-0.5 flex-1 rounded-full transition-colors duration-500 ${done ? 'bg-success' : 'bg-line'}`} />
            )}
          </li>
        )
      })}
    </ol>
  )
}

export function FreeShippingBar({ subtotal, goal }: { subtotal: number; goal: number }) {
  const left = Math.max(0, goal - subtotal)
  const pct = Math.min(100, (subtotal / goal) * 100)
  return (
    <div>
      <p className="text-sm font-semibold">
        {left > 0 ? (
          <>
            Add <span className="text-accent">₹{left}</span> more for <span className="text-success">free shipping</span>
          </>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-success">
            <CheckIcon className="size-4" /> You have unlocked free shipping
          </span>
        )}
      </p>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-line">
        <div
          className={`h-full rounded-full transition-all duration-700 ${left > 0 ? 'bg-gradient-to-r from-accent to-amber-400' : 'bg-success'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export function Badge({ children, tone = 'brand' }: { children: ReactNode; tone?: 'brand' | 'success' | 'accent' | 'dark' }) {
  const tones = {
    brand: 'bg-brand-soft text-brand',
    success: 'bg-emerald-50 text-success',
    accent: 'bg-orange-50 text-accent-dark',
    dark: 'bg-ink text-white',
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-extrabold ${tones[tone]}`}>
      {children}
    </span>
  )
}
