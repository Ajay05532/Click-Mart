import { useState } from 'react'
import { Link } from 'react-router-dom'
import { categories } from '../../data/products.ts'
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
  const [email, setEmail] = useState('')
  const [done, setDone] = useState(false)

  return (
    <footer>
      <section className="bg-cream">
        <Container className="py-8">
          <div className="flex flex-col gap-4 rounded-3xl border border-line bg-white px-6 py-7 shadow-card sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
            <div className="max-w-xl">
              <p className="text-xs font-semibold tracking-[0.16em] text-accent uppercase">Harvest notes</p>
              <h2 className="mt-1 text-xl font-extrabold tracking-tight text-brand">
                New packs, recipes, and the occasional offer
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                A short note when a harvest is worth opening. No daily mail.
              </p>
            </div>
            {done ? (
              <p className="rounded-2xl bg-brand-soft px-5 py-4 text-sm font-semibold text-brand lg:max-w-sm">
                You are on the list. We will write when the next pouch is ready.
              </p>
            ) : (
              <form
                className="flex w-full max-w-md flex-col gap-2 sm:flex-row"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (email.includes('@')) setDone(true)
                }}
              >
                <label className="sr-only" htmlFor="footer-email">
                  Email address
                </label>
                <input
                  id="footer-email"
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Email address"
                  className="h-12 min-w-0 flex-1 rounded-full border border-line bg-canvas px-5 text-sm text-ink outline-none placeholder:text-muted focus:border-brand focus:bg-white"
                />
                <button
                  type="submit"
                  className="btn btn-accent h-12"
                >
                  Subscribe
                </button>
              </form>
            )}
          </div>
        </Container>
      </section>

      <section className="bg-brand-dark text-white">
        <Container className="grid gap-8 py-10 md:grid-cols-12">
          <div className="md:col-span-4">
            <Logo light />
            <p className="mt-5 max-w-xs text-sm leading-6 text-white/70">
              Premium dry fruits, nuts and seeds, packed in Bengaluru and sent across India.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-white/75">
              <li>
                <a href="tel:+918045678900" className="inline-flex items-center gap-2 hover:text-white">
                  <PhoneIcon className="size-4 text-accent" />
                  +91 80 4567 8900
                </a>
              </li>
              <li>
                <a href="mailto:hello@clickmart.com" className="inline-flex items-center gap-2 hover:text-white">
                  <MailIcon className="size-4 text-accent" />
                  hello@clickmart.com
                </a>
              </li>
              <li className="flex items-start gap-2">
                <PinIcon className="mt-0.5 size-4 shrink-0 text-accent" />
                <span>42, Residency Road, Bengaluru 560025</span>
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
            <Link to="/admin" className="hover:text-white">
              Seller dashboard
            </Link>
          </Container>
        </div>
      </section>
    </footer>
  )
}
