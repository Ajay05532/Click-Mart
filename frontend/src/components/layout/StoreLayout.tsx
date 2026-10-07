import { useEffect } from 'react'
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

  return (
    <div className="flex min-h-svh flex-col bg-white">
      <Header />
      <main key={pathname} className="motion-page flex-1">
        <Outlet />
      </main>
      <Footer />
      {toast && (
        <div key={toastTick} className="motion-toast fixed right-4 bottom-4 z-50 max-w-xs rounded-2xl bg-ink px-5 py-4 text-sm text-white shadow-pop">
          <p className="flex items-center gap-2 font-semibold"><span className="grid size-5 place-items-center rounded-full bg-success text-[11px]">✓</span>{toast}</p>
          <Link to="/cart" className="mt-1.5 inline-block font-bold text-orange-300 hover:text-orange-200">
            View cart
          </Link>
        </div>
      )}
    </div>
  )
}
