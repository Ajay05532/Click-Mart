import { Link } from 'react-router-dom'

export function Logo({
  light = false,
  to = '/',
  className,
}: {
  light?: boolean
  to?: string
  className?: string
}) {
  return (
    <Link
      to={to}
      aria-label="ClickMart"
      className={light ? 'inline-flex shrink-0 rounded-xl bg-white px-2.5 py-1.5' : 'inline-flex shrink-0'}
    >
      <img src="/logo.png" alt="" className={className ?? (light ? 'h-10 w-auto' : 'h-11 w-auto')} />
    </Link>
  )
}
