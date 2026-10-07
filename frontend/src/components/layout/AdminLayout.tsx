import { useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  BoxIcon,
  ChartIcon,
  ClipboardIcon,
  GridIcon,
  ImageIcon,
  SettingsIcon,
  StarIcon,
  TagIcon,
  TicketIcon,
  UsersIcon,
} from '../icons.tsx'
import { Logo } from './Logo.tsx'

const links = [
  { to: '/admin', label: 'Dashboard', icon: GridIcon, end: true },
  { to: '/admin/products', label: 'Products', icon: BoxIcon },
  { to: '/admin/categories', label: 'Categories', icon: TagIcon },
  { to: '/admin/orders', label: 'Orders', icon: ClipboardIcon },
  { to: '/admin/customers', label: 'Customers', icon: UsersIcon },
  { to: '/admin/coupons', label: 'Coupons', icon: TicketIcon },
  { to: '/admin/reviews', label: 'Reviews', icon: StarIcon },
  { to: '/admin/banners', label: 'Banners', icon: ImageIcon },
  { to: '/admin/analytics', label: 'Analytics', icon: ChartIcon },
  { to: '/admin/settings', label: 'Settings', icon: SettingsIcon },
]

const titles: Record<string, { title: string; subtitle: string }> = {
  '/admin': { title: 'Dashboard', subtitle: 'Welcome back, Admin' },
  '/admin/products': { title: 'Products', subtitle: 'Catalog, prices and stock' },
  '/admin/categories': { title: 'Categories', subtitle: 'How the shop is grouped' },
  '/admin/orders': { title: 'Orders', subtitle: 'Recent customer orders' },
  '/admin/customers': { title: 'Customers', subtitle: 'People who buy from ClickMart' },
  '/admin/coupons': { title: 'Coupons', subtitle: 'Codes accepted at checkout' },
  '/admin/reviews': { title: 'Reviews', subtitle: 'What customers wrote' },
  '/admin/banners': { title: 'Banners', subtitle: 'Homepage promotions' },
  '/admin/analytics': { title: 'Analytics', subtitle: 'Sales across the year' },
  '/admin/settings': { title: 'Settings', subtitle: 'Store details' },
}

export function AdminLayout() {
  const { pathname } = useLocation()
  const current = titles[pathname] ?? { title: 'Admin', subtitle: '' }

  useEffect(() => {
    document.title = `${current.title} · ClickMart Admin`
  }, [current.title])

  return (
    <div className="min-h-svh bg-canvas md:flex">
      <aside className="hidden w-64 shrink-0 flex-col bg-brand text-white md:flex">
        <div className="px-5 py-5">
          <Logo light to="/admin" />
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }: { isActive: boolean }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${
                  isActive ? 'bg-white/15 font-semibold' : 'text-white/80 hover:bg-white/10'
                }`
              }
            >
              <link.icon className="size-4" />
              {link.label}
            </NavLink>
          ))}
        </nav>
        <p className="px-5 py-5 text-xs text-white/70">admin@clickmart.com</p>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-white px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-xl font-bold">{current.title}</h1>
            <p className="text-sm text-muted">{current.subtitle}</p>
          </div>
          <div className="flex items-center gap-3">
            {pathname === '/admin' && (
              <span className="hidden rounded-lg border border-line px-3 py-1.5 text-sm text-muted sm:inline">
                1 Sep 2026 – 5 Oct 2026
              </span>
            )}
            <span className="inline-flex items-center gap-2 text-sm font-medium">
              <span className="size-2 rounded-full bg-success" />
              Admin
            </span>
          </div>
        </header>
        <nav className="flex gap-2 overflow-x-auto border-b border-line bg-white px-3 py-2 md:hidden">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }: { isActive: boolean }) =>
                `shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
                  isActive ? 'bg-brand text-white' : 'bg-canvas text-ink'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 sm:p-6">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
