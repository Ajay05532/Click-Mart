import { Suspense, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { NoticeStack } from '../../context/NoticeContext.tsx'
import { Footer } from './Footer.tsx'
import { Header } from './Header.tsx'

export function StoreLayout() {
  const { pathname } = useLocation()

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
      <NoticeStack />
    </div>
  )
}
