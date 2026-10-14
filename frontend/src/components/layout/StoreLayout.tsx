import { Suspense, useEffect } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useCart } from '../../context/CartContext.tsx'
import { Footer } from './Footer.tsx'
import { Header } from './Header.tsx'

export function StoreLayout() {
  const { pathname } = useLocation()
  const { toast, toastTick } = useCart()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  const hideFooter = pathname === '/login'
  return (
    <div className="flex min-h-svh flex-col bg-white">
      <Header />
      <main key={pathname} className="motion-page flex flex-1 flex-col">
        <Suspense fallback={<div className="grid flex-1 place-items-center py-24" role="status" aria-label="Loading"><span className="motion-spin block size-10 rounded-full border-4 border-brand-soft border-t-brand" /></div>}>
          <Outlet />
        </Suspense>
      </main>
      {!hideFooter && <Footer />}
      {toast && (
        <div key={toastTick} role="status" className="motion-toast fixed top-20 right-4 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-line bg-white p-4 text-ink shadow-pop">
          <p className="flex items-center gap-2 text-sm font-extrabold">
            <span className="grid size-6 place-items-center rounded-full bg-success text-xs text-white">✓</span>
            {toast.text}
          </p>
          {toast.count != null && (
            <p className="mt-1 pl-8 text-sm text-muted">
              Cart now has <span className="font-extrabold text-ink">{toast.count}</span> {toast.count === 1 ? 'item' : 'items'}
            </p>
          )}
          <Link to="/cart" className="btn btn-accent btn-sm mt-3 w-full">
            View cart
          </Link>
        </div>
      )}
    </div>
  )
}
