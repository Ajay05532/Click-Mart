import { Link } from 'react-router-dom'
import { useCategories } from '../../lib/catalog.ts'
import { storeAddress, storeEmail, storePhone, storePhoneTel } from '../../lib/store.ts'
import { MailIcon, PhoneIcon, PinIcon } from '../icons.tsx'
import { Container } from './Container.tsx'
import { Logo } from './Logo.tsx'

const year = new Date().getFullYear()

const explore = [
  { to: '/about', label: 'About us' },
  { to: '/wellness', label: 'Health & wellness' },
  { to: '/recipes', label: 'Recipes' },
  { to: '/contact', label: 'Contact' },
]

const help = [
  { to: '/login', label: 'Account' },
  { to: '/settings?tab=orders', label: 'My orders' },
  { to: '/wishlist', label: 'Wishlist' },
  { to: '/settings', label: 'Settings' },
  { to: '/track', label: 'Track order' },
  { to: '/cart', label: 'Cart' },
  { to: '/privacy', label: 'Privacy policy' },
  { to: '/terms', label: 'Terms & conditions' },
]

const payments = ['UPI', 'Cards', 'Netbanking', 'COD']

export function Footer() {
  const categories = useCategories().data ?? []

  return (
    <footer>
      <section className="bg-brand-dark text-white">
        <Container className="grid gap-8 py-10 md:grid-cols-12">
          <div className="md:col-span-4">
            <Logo light />
            <p className="mt-5 max-w-xs text-sm leading-6 text-white/70">
              Premium dry fruits, nuts and seeds, packed in Patna and sent across India.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-white/75">
              <li>
                <a href={`tel:${storePhoneTel}`} className="inline-flex items-center gap-2 hover:text-white">
                  <PhoneIcon className="size-4 text-accent" />
                  {storePhone}
                </a>
              </li>
              <li>
                <a href={`mailto:${storeEmail}`} className="inline-flex items-center gap-2 hover:text-white">
                  <MailIcon className="size-4 text-accent" />
                  {storeEmail}
                </a>
              </li>
              <li className="flex items-start gap-2">
                <PinIcon className="mt-0.5 size-4 shrink-0 text-accent" />
                <span>{storeAddress}</span>
              </li>
            </ul>
          </div>

          <nav className="grid gap-8 sm:grid-cols-3 md:col-span-8" aria-label="Footer">
            <div>
              <h2 className="text-xs font-semibold tracking-[0.16em] text-white/45 uppercase">Shop</h2>
              <ul className="mt-4 space-y-2.5 text-sm">
                {categories.map((category) => (
                  <li key={category.id}>
                    <Link
                      to={`/shop?category=${category.id}`}
                      className="text-white/75 transition hover:text-white"
                    >
                      {category.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="text-xs font-semibold tracking-[0.16em] text-white/45 uppercase">Explore</h2>
              <ul className="mt-4 space-y-2.5 text-sm">
                {explore.map((link) => (
                  <li key={link.to}>
                    <Link to={link.to} className="text-white/75 transition hover:text-white">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="text-xs font-semibold tracking-[0.16em] text-white/45 uppercase">Help</h2>
              <ul className="mt-4 space-y-2.5 text-sm">
                {help.map((link) => (
                  <li key={link.to}>
                    <Link to={link.to} className="text-white/75 transition hover:text-white">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </nav>
        </Container>

        <div className="border-t border-white/10">
          <Container className="flex flex-col gap-4 py-5 text-xs text-white/60 sm:flex-row sm:items-center sm:justify-between">
            <p>© {year} ClickMart. All rights reserved.</p>
            <ul className="flex flex-wrap items-center gap-2">
              {payments.map((method) => (
                <li key={method} className="rounded-full border border-white/15 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-white/80">
                  {method}
                </li>
              ))}
            </ul>
            <a href={import.meta.env.VITE_ADMIN_URL ?? 'http://localhost:5175'} className="hover:text-white">
              Seller dashboard
            </a>
          </Container>
        </div>
      </section>
    </footer>
  )
}
