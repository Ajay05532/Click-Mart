import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useCategories } from '../../lib/catalog.ts'
import { storeAddress, storeEmail, storePhone, storePhoneTel } from '../../lib/store.ts'
import { MailIcon, PhoneIcon, PinIcon } from '../icons.tsx'
import { Container } from './Container.tsx'
import { Logo } from './Logo.tsx'

const year = new Date().getFullYear()

function FooterColumn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="text-xs font-extrabold tracking-[0.16em] text-white/45 uppercase">{title}</h2>
      <ul className="mt-4 space-y-2.5 text-sm">{children}</ul>
    </div>
  )
}

function FooterLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="text-white/75 transition hover:text-white">
      {children}
    </Link>
  )
}

const explore = [
  { to: '/about', label: 'About us' },
  { to: '/wellness', label: 'Health & wellness' },
  { to: '/recipes', label: 'Recipes' },
  { to: '/contact', label: 'Contact' },
]

const help = [
  { to: '/help', label: 'Help centre' },
  { to: '/help/tickets', label: 'My requests' },
  { to: '/orders', label: 'My orders' },
  { to: '/wishlist', label: 'Wishlist' },
  { to: '/cart', label: 'Cart' },
  { to: '/settings', label: 'Account settings' },
]

const payments = ['UPI', 'Cards', 'Netbanking', 'COD']

export function Footer() {
  const categories = useCategories().data ?? []

  return (
    <footer className="mt-auto w-full max-w-[100vw] overflow-x-clip bg-brand-dark text-white">
      <div className="h-1 bg-accent" />
      <Container className="grid grid-cols-1 gap-10 py-12 md:grid-cols-12 md:gap-8">
        <div className="min-w-0 md:col-span-4">
          <Logo light />
          <p className="mt-4 max-w-xs text-sm leading-6 text-white/70">Premium dry fruits, nuts and seeds, packed in Patna and sent across India.</p>
          <ul className="mt-6 space-y-3 text-sm">
            <li>
              <a href={`tel:${storePhoneTel}`} className="inline-flex items-center gap-2.5 text-white/80 transition hover:text-white">
                <span className="grid size-8 place-items-center rounded-full bg-white/10 text-accent"><PhoneIcon className="size-3.5" /></span>
                {storePhone}
              </a>
            </li>
            <li>
              <a href={`mailto:${storeEmail}`} className="inline-flex items-center gap-2.5 text-white/80 transition hover:text-white">
                <span className="grid size-8 place-items-center rounded-full bg-white/10 text-accent"><MailIcon className="size-3.5" /></span>
                {storeEmail}
              </a>
            </li>
            <li className="flex items-start gap-2.5 text-white/70">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 text-accent"><PinIcon className="size-3.5" /></span>
              <span className="block min-w-0 flex-1 pt-1 leading-5">{storeAddress}</span>
            </li>
          </ul>
        </div>

        <nav className="grid min-w-0 grid-cols-2 gap-8 sm:grid-cols-3 md:col-span-8" aria-label="Footer">
          <FooterColumn title="Shop">
            <li>
              <FooterLink to="/shop">All products</FooterLink>
            </li>
            <li>
              <FooterLink to="/sale">On sale</FooterLink>
            </li>
            {categories.map((category) => (
              <li key={category.id}>
                <FooterLink to={`/shop?category=${category.id}`}>{category.name}</FooterLink>
              </li>
            ))}
          </FooterColumn>
          <FooterColumn title="Explore">
            {explore.map((link) => (
              <li key={link.to}>
                <FooterLink to={link.to}>{link.label}</FooterLink>
              </li>
            ))}
          </FooterColumn>
          <FooterColumn title="Help">
            {help.map((link) => (
              <li key={link.to}>
                <FooterLink to={link.to}>{link.label}</FooterLink>
              </li>
            ))}
          </FooterColumn>
        </nav>
      </Container>

      <div className="border-t border-white/10">
        <Container className="flex flex-col gap-4 py-5 text-xs text-white/55 sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} ClickMart. All rights reserved.</p>
          <ul className="flex flex-wrap items-center gap-2">
            {payments.map((method) => (
              <li key={method} className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold tracking-wide text-white/80">
                {method}
              </li>
            ))}
          </ul>
          <p className="flex flex-wrap gap-x-4 gap-y-1">
            <Link to="/privacy" className="hover:text-white">Privacy</Link>
            <Link to="/terms" className="hover:text-white">Terms</Link>
            <a href={import.meta.env.VITE_ADMIN_URL ?? 'http://localhost:5175'} className="hover:text-white">
              Seller dashboard
            </a>
          </p>
        </Container>
      </div>
    </footer>
  )
}
