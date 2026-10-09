import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.tsx'
import { useCart } from '../../context/CartContext.tsx'
import { useActiveCoupons, useStoreSettings } from '../../lib/catalog.ts'
import { formatPrice } from '../../lib/money.ts'
import { LockIcon, TagIcon } from '../icons.tsx'
import { FreeShippingBar } from '../ui/Primitives.tsx'
import { ProductMedia } from '../product/ProductMedia.tsx'

export function OrderSummary({
  showCheckout = false,
  showItems = false,
  children,
}: {
  showCheckout?: boolean
  showItems?: boolean
  children?: React.ReactNode
}) {
  const { user } = useAuth()
  const { lines, subtotal, discount, shipping, total, coupon, savings, pricing, applyCoupon, clearCoupon } = useCart()
  const settings = useStoreSettings()
  const available = useActiveCoupons().data ?? []
  const [applying, setApplying] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)

  return (
    <aside className="card h-fit p-5 sm:p-6 lg:sticky lg:top-32">
      <h2 className="text-lg font-extrabold">Order summary</h2>

      {showItems && (
        <ul className="mt-4 max-h-60 space-y-3 overflow-y-auto pr-1">
          {lines.map((line) => (
            <li key={line.key} className="flex items-center gap-3">
              <span className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-canvas ring-1 ring-line">
                <ProductMedia name={line.name} image={line.image} art={line.art} className="size-full" />
                <span className="absolute -top-0 -right-0 grid min-w-5 place-items-center rounded-bl-lg bg-ink px-1 text-[10px] font-bold text-white">
                  {line.quantity}
                </span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{line.name}</span>
                <span className="text-xs text-muted">{line.size}</span>
              </span>
              <span className="text-sm font-bold">{formatPrice(line.lineTotal)}</span>
            </li>
          ))}
        </ul>
      )}

      {!showItems && subtotal > 0 && (
        <div className="mt-4 rounded-2xl bg-canvas p-4">
          <FreeShippingBar subtotal={subtotal} goal={settings.freeShippingThreshold} />
        </div>
      )}

      <form
        className="mt-5"
        onSubmit={async (event) => {
          event.preventDefault()
          if (!code.trim()) return
          setApplying(true)
          setError(await applyCoupon(code))
          setApplying(false)
          setCode('')
        }}
      >
        <label className="text-xs font-bold text-muted">Have a coupon?</label>
        <div className="mt-1.5 flex gap-2">
          <div className="relative min-w-0 flex-1">
            <TagIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="Enter code"
              className="field h-11! pl-10! tracking-wider"
            />
          </div>
          <button type="submit" disabled={applying} className="btn btn-soft btn-sm !px-5">
            Apply
          </button>
        </div>
      </form>
      {error && <p className="mt-2 text-xs font-semibold text-rose-600">{error}</p>}
      {coupon ? (
        <div className="motion-panel mt-3 flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2 text-xs">
          <span className="font-bold text-success">
            ✓ {coupon.code} applied
          </span>
          <button type="button" onClick={clearCoupon} className="font-bold text-rose-600">
            Remove
          </button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {available.map((item) => (
            <button
              key={item.code}
              type="button"
              onClick={async () => setError(await applyCoupon(item.code))}
              className="rounded-full border border-dashed border-accent/50 bg-orange-50 px-3 py-1 text-[11px] font-extrabold tracking-wide text-accent-dark transition hover:bg-orange-100"
              title={item.label}
            >
              {item.code}
            </button>
          ))}
        </div>
      )}

      <dl className="mt-5 space-y-3 border-t border-dashed border-line pt-5 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted">Subtotal</dt>
          <dd className="font-semibold">{pricing && !subtotal ? '…' : formatPrice(subtotal)}</dd>
        </div>
        {discount > 0 && (
          <div className="flex justify-between text-success">
            <dt>Discount ({coupon?.code})</dt>
            <dd className="font-semibold">−{formatPrice(discount)}</dd>
          </div>
        )}
        <div className="flex justify-between">
          <dt className="text-muted">Delivery</dt>
          <dd className={shipping === 0 ? 'font-bold text-success' : 'font-semibold'}>
            {shipping === 0 ? 'FREE' : formatPrice(shipping)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between border-t border-line pt-4 text-lg font-extrabold">
          <dt>Total</dt>
          <dd>{formatPrice(total)}</dd>
        </div>
      </dl>
      {savings > 0 && (
        <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-center text-xs font-bold text-success">
          🎉 You are saving {formatPrice(savings)} on this order
        </p>
      )}

      {showCheckout && (
        <Link
          to={user ? '/checkout' : '/login'}
          state={user ? undefined : { from: '/checkout' }}
          className={`btn btn-lg mt-5 w-full ${lines.length === 0 ? 'pointer-events-none bg-slate-300 text-white' : 'btn-accent'}`}
        >
          <LockIcon className="size-4" /> {user ? 'Secure checkout' : 'Login to checkout'}
        </Link>
      )}
      {children}
    </aside>
  )
}
