import { useState } from 'react'
import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './auth.tsx'
import { PageLoader } from './ui.tsx'
import { useQuery } from '@tanstack/react-query'
import { api } from './api.ts'

type IconName = 'grid' | 'receipt' | 'box' | 'bars' | 'folder' | 'tag' | 'percent' | 'ticket' | 'image' | 'star' | 'users' | 'shield' | 'gear' | 'list' | 'chat' | 'help'

type Item = { to: string; label: string; icon: IconName; adminOnly?: boolean; end?: boolean }
const groups: { title: string; items: Item[] }[] = [
  { title: 'Overview', items: [{ to: '/', label: 'Dashboard', icon: 'grid', end: true }] },
  {
    title: 'Sell',
    items: [
      { to: '/orders', label: 'Orders', icon: 'receipt' },
      { to: '/products', label: 'Products', icon: 'box' },
      { to: '/inventory', label: 'Inventory', icon: 'bars' },
      { to: '/categories', label: 'Categories', icon: 'folder' },
      { to: '/brands', label: 'Brands', icon: 'tag' },
    ],
  },
  {
    title: 'Marketing',
    items: [
      { to: '/offers', label: 'Offers', icon: 'percent' },
      { to: '/coupons', label: 'Coupons', icon: 'ticket', adminOnly: true },
      { to: '/banners', label: 'Banners', icon: 'image' },
      { to: '/reviews', label: 'Reviews', icon: 'star' },
    ],
  },
  {
    title: 'Support',
    items: [
      { to: '/support', label: 'Tickets', icon: 'chat' },
      { to: '/help-content', label: 'Help content', icon: 'help' },
    ],
  },
  {
    title: 'People',
    items: [
      { to: '/customers', label: 'Customers', icon: 'users' },
      { to: '/staff', label: 'Team', icon: 'shield', adminOnly: true },
    ],
  },
  {
    title: 'Store',
    items: [
      { to: '/settings', label: 'Settings', icon: 'gear', adminOnly: true },
      { to: '/audit', label: 'Activity log', icon: 'list', adminOnly: true },
    ],
  },
]

const iconPaths: Record<IconName, string> = {
  grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  receipt: 'M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21zM9 8h6M9 12h6',
  box: 'M3 8l9-5 9 5-9 5-9-5zM3 8v8l9 5 9-5V8M12 13v8',
  bars: 'M4 19V10M10 19V5M16 19v-7M22 19H2',
  folder: 'M3 7h6l2 2h10v10H3z',
  tag: 'M3 12V4h8l10 10-8 8zM7.5 7.5h.01',
  percent: 'M19 5L5 19M7.5 8.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM16.5 18.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  ticket: 'M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z',
  image: 'M4 5h16v14H4zM4 15l4-4 3 3 3-4 6 5',
  star: 'M12 3l2.6 5.4L20 9.2l-4 3.9.9 5.6L12 16.2 7.1 18.7 8 13.1 4 9.2l5.4-.8z',
  users: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 19a6 6 0 0 1 12 0M16 11a2.5 2.5 0 1 0 0-5M17 19a5 5 0 0 0-2.2-4.1',
  shield: 'M12 3l8 3v6c0 5-3.4 7.6-8 9-4.6-1.4-8-4-8-9V6z',
  gear: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 13a7.7 7.7 0 0 0 .1-2l2-1.2-2-3.4-2.2.6a8 8 0 0 0-1.7-1L15.2 3h-4.4L10.4 6a8 8 0 0 0-1.7 1L6.5 6.4l-2 3.4L6.5 11a7.7 7.7 0 0 0 .1 2l-2 1.2 2 3.4 2.2-.6a8 8 0 0 0 1.7 1l.4 3h4.4l.4-3a8 8 0 0 0 1.7-1l2.2.6 2-3.4z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.2-4.4A8 8 0 1 1 21 12zM8.5 11h7M8.5 14h4',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.6 9.6a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.2 1-1.2 1.8M12 17h.01',
}

function NavIcon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={iconPaths[name]} />
    </svg>
  )
}

export function Layout() {
  const { user, loading, isAdmin, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const [menuPath, setMenuPath] = useState(location.pathname)
  if (menuPath !== location.pathname) {
    setMenuPath(location.pathname)
    setOpen(false)
  }
  const current = groups.flatMap((group) => group.items).find((item) => (item.end ? location.pathname === item.to : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)))
  const summary = useQuery({ queryKey: ['summary'], queryFn: () => api<{ ordersNeedingAction: number; outOfStock: number; lowStock: number; supportNeedingReply: number }>('/admin/summary'), enabled: !!user, refetchInterval: 60000 })

  if (loading) return <div className="grid min-h-svh place-items-center text-brand"><PageLoader /></div>
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />

  const badge = (to: string) => (to === '/orders' ? summary.data?.ordersNeedingAction : to === '/inventory' ? (summary.data?.outOfStock ?? 0) + (summary.data?.lowStock ?? 0) : to === '/support' ? summary.data?.supportNeedingReply : 0)

  return (
    <div className="min-h-svh lg:grid lg:grid-cols-[260px_1fr]">
      {open && <div className="anim-fade fixed inset-0 z-30 bg-ink/50 lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-ink text-white transition-transform duration-200 lg:sticky lg:top-0 lg:h-svh lg:w-auto lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center gap-3 px-5 py-5">
          <span className="grid size-9 place-items-center rounded-xl bg-accent text-lg font-extrabold">C</span>
          <div>
            <p className="font-extrabold leading-tight">ClickMart</p>
            <p className="text-[11px] font-semibold tracking-widest text-white/50 uppercase">Admin</p>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Main">
          {groups.map((group) => {
            const items = group.items.filter((item) => !item.adminOnly || isAdmin)
            if (!items.length) return null
            return (
              <div key={group.title} className="mt-4 first:mt-0">
                <p className="px-3 pb-1.5 text-[10px] font-bold tracking-[0.18em] text-white/35 uppercase">{group.title}</p>
                {items.map((item) => {
                  const count = badge(item.to)
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      className={({ isActive }: { isActive: boolean }) =>
                        `mb-0.5 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${isActive ? 'bg-white text-ink shadow-sm' : 'text-white/70 hover:bg-white/10 hover:text-white'}`
                      }
                    >
                      <NavIcon name={item.icon} />
                      {item.label}
                      {count ? <span className="ml-auto rounded-full bg-accent px-2 py-0.5 text-[10px] font-extrabold text-white">{count}</span> : null}
                    </NavLink>
                  )
                })}
              </div>
            )
          })}
        </nav>
        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-3">
            <NavLink to="/account" title="My account" className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 -m-1 hover:bg-white/10">
              <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-white/15 text-sm font-extrabold">{user.avatarUrl ? <img src={user.avatarUrl} alt="" className="size-full object-cover" /> : user.name.slice(0, 1).toUpperCase()}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{user.name}</span>
                <span className="block text-[11px] text-white/50">{user.role === 'ADMIN' ? 'Administrator' : 'Staff'} · Account</span>
              </span>
            </NavLink>
            <button type="button" onClick={() => void logout()} className="rounded-lg px-2 py-1 text-xs font-bold text-white/70 hover:bg-white/10 hover:text-white">Sign out</button>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line/80 bg-white/80 px-4 py-3 backdrop-blur lg:px-8">
          <button type="button" aria-label="Open menu" onClick={() => setOpen(true)} className="grid size-9 place-items-center rounded-lg ring-1 ring-line lg:hidden">☰</button>
          <p className="min-w-0 truncate text-sm">
            <span className="text-muted">ClickMart</span>
            <span className="mx-2 text-line">/</span>
            <span className="font-extrabold">{current?.label ?? 'Account'}</span>
          </p>
          <p className="ml-auto hidden text-xs font-semibold text-muted sm:block">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}</p>
        </header>
        <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:px-8 lg:py-7">
          <div key={location.pathname} className="anim-in">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

export function AdminOnly({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAuth()
  if (!isAdmin) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-2xl border border-line bg-white p-10 text-center shadow-card">
        <p className="text-4xl">🔒</p>
        <h1 className="mt-3 text-xl font-extrabold">Administrators only</h1>
        <p className="mt-1 text-sm text-muted">Your role does not include this section. Ask an administrator if you need access.</p>
      </div>
    )
  }
  return <>{children}</>
}
