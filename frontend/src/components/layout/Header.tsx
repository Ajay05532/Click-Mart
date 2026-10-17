import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.tsx'
import { useCart } from '../../context/CartContext.tsx'
import { useDeliveryLocation } from '../../context/LocationContext.tsx'
import { useWishlist } from '../../context/WishlistContext.tsx'
import { featuredPack, productPath, useCategories, useProducts, useProductsByIds, useStoreContact } from '../../lib/catalog.ts'
import { formatPrice } from '../../lib/money.ts'
import { useUnreadTickets } from '../../lib/support.ts'
import { ProductMedia } from '../product/ProductMedia.tsx'
import {
  BellIcon,
  BoxIcon,
  CartIcon,
  CloseIcon,
  HeartIcon,
  HelpIcon,
  LogoutIcon,
  MenuIcon,
  PhoneIcon,
  PinIcon,
  SearchIcon,
  TicketIcon,
  UserIcon,
} from '../icons.tsx'
import { ChevronIcon } from '../icons.tsx'
import type { Category, Product } from '../../types.ts'
import { Logo } from './Logo.tsx'

// Desktop bar: shopping-first, like most e-commerce stores. Info pages live in the footer and mobile menu.
const links = [
  { to: '/', label: 'Home', end: true },
  { to: '/shop', label: 'Shop' },
  { to: '/sale', label: 'Offers' },
  { to: '/recipes', label: 'Recipes' },
  { to: '/wellness', label: 'Health & Wellness' },
  { to: '/about', label: 'About Us' },
  { to: '/help', label: 'Help centre' },
  { to: '/contact', label: 'Contact' },
]

type Panel = 'search' | 'cart' | 'account' | 'shop' | 'wishlist' | null

const accountLinks = [
  { to: '/settings?tab=profile', label: 'My Profile', icon: UserIcon },
  { to: '/orders', label: 'Orders', icon: BoxIcon },
  { to: '/sale', label: 'Coupons', icon: TicketIcon },
  { to: '/settings?tab=address', label: 'Saved Addresses', icon: PinIcon },
  { to: '/wishlist', label: 'Wishlist', icon: HeartIcon },
  { to: '/settings?tab=preferences', label: 'Notifications', icon: BellIcon },
  { to: '/help/tickets', label: 'Help & Support', icon: HelpIcon },
]

export function Header() {
  const contact = useStoreContact()
  const cart = useCart()
  const wishlist = useWishlist()
  const { user, logout } = useAuth()
  const unreadTickets = useUnreadTickets().data ?? 0
  const navigate = useNavigate()
  const location = useLocation()
  const rootRef = useRef<HTMLElement>(null)
  const [term, setTerm] = useState('')
  const [panel, setPanel] = useState<Panel>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { location: delivery, openPicker } = useDeliveryLocation()
  const [hideOffer, setHideOffer] = useState(() => sessionStorage.getItem('clickmart-offer') === 'hide')
  const [route, setRoute] = useState(location.pathname)
  const categories = useCategories().data ?? []
  const lone = categories.length === 1 ? categories[0] : undefined
  const [menuCategory, setMenuCategory] = useState('')
  const [menuGrade, setMenuGrade] = useState('all')
  const [debounced, setDebounced] = useState('')
  const [menuFilter, setMenuFilter] = useState('')

  if (route !== location.pathname) {
    setRoute(location.pathname)
    setPanel(null)
    setMobileOpen(false)
  }

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setPanel(null)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const query = term.trim().toLowerCase()
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query), 250)
    return () => window.clearTimeout(timer)
  }, [query])
  // Live suggestions come from the server (what is on sale, in stock, spelled how the shop spells it).
  const found = useProducts({ q: debounced, pageSize: 6 }, panel === 'search' && debounced.length > 0)
  const popular = useProducts({ bestseller: true, pageSize: 6 }, panel === 'search' && debounced.length === 0)
  const suggestions = ((debounced ? found.data?.items : popular.data?.items) ?? []).slice(0, 6)
  const savedProducts = useProductsByIds(panel === 'wishlist' ? wishlist.ids : []).data ?? []
  const shelf = useProducts(
    { category: lone?.id, sub: menuGrade === 'all' ? undefined : menuGrade, sort: 'popular', pageSize: 24 },
    Boolean(lone) && (panel === 'shop' || mobileOpen),
  )

  const toggle = (next: Panel) => setPanel((current) => (current === next ? null : next))

  const search = (event: FormEvent) => {
    event.preventDefault()
    setPanel(null)
    setMobileOpen(false)
    const value = term.trim()
    navigate(value ? `/shop?q=${encodeURIComponent(value)}` : '/shop')
  }

  return (
    <header ref={rootRef} className="sticky top-0 z-40">
      {!hideOffer && (
        <div className="bg-ink text-white">
          <div className="mx-auto flex h-9 max-w-7xl items-center justify-between gap-3 px-4 text-xs sm:px-6">
            <p className="mx-auto truncate text-center sm:pl-24">
              Get 15% off your first order with code <span className="font-bold text-orange-300">DRY15</span>.{' '}
              <Link to="/shop" className="font-bold underline underline-offset-2">
                Shop now
              </Link>
            </p>
            <div className="flex shrink-0 items-center gap-3">
              <a href={`tel:${contact.phoneTel}`} className="hidden items-center gap-1 sm:inline-flex">
                <PhoneIcon className="size-3.5" />
                {contact.phone}
              </a>
              <Link to="/help" className="hidden sm:inline">
                Help
              </Link>
              <button
                type="button"
                aria-label="Dismiss offer"
                onClick={() => {
                  sessionStorage.setItem('clickmart-offer', 'hide')
                  setHideOffer(true)
                }}
              >
                <CloseIcon className="size-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="border-b border-line bg-white/90 shadow-[0_8px_30px_-18px_rgb(21_32_51/0.25)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2 sm:px-6">
          <Logo />
        <nav className="hidden shrink-0 items-center gap-0.5 lg:flex" aria-label="Primary">
          <div
            className="relative"
            onMouseEnter={() => {
              const current = new URLSearchParams(location.search).get('category')
              const match = categories.find((category) => category.id === current)
              if (match) setMenuCategory(match.id)
              setPanel('shop')
            }}
            onMouseLeave={() => setPanel((current) => (current === 'shop' ? null : current))}
          >
            <Link
              to="/shop"
              onClick={() => setPanel(null)}
              aria-expanded={panel === 'shop'}
              aria-haspopup="true"
              className={`inline-flex items-center gap-1 rounded-full px-3.5 py-2 text-sm font-semibold transition ${
                panel === 'shop' || location.pathname === '/shop' ? 'bg-canvas text-ink' : 'text-ink/80 hover:bg-canvas hover:text-ink'
              }`}
            >
              Shop
              <ChevronIcon dir="down" className={`size-4 transition ${panel === 'shop' ? 'rotate-180' : ''}`} />
            </Link>
            {panel === 'shop' && lone && (
              <div className="absolute top-full left-0 z-30 pt-2">
                <ProductShelf
                  category={lone}
                  grade={menuGrade}
                  onGrade={setMenuGrade}
                  products={shelf.data?.items ?? []}
                  total={shelf.data?.total ?? 0}
                  loading={shelf.isPending}
                  onNavigate={() => setPanel(null)}
                />
              </div>
            )}
            {panel === 'shop' && !lone && categories.length > 1 && (
              <div className="absolute top-full left-0 z-30 pt-2">
              <div className="motion-panel flex w-[min(40rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-white text-ink shadow-pop">
                <div className="flex max-h-[26rem] w-56 shrink-0 flex-col bg-canvas p-2">
                  <input
                    value={menuFilter}
                    onChange={(event) => setMenuFilter(event.target.value)}
                    placeholder="Find a category"
                    aria-label="Find a category"
                    className="mb-2 h-9 w-full rounded-lg border border-line bg-white px-3 text-xs outline-none focus:border-brand"
                  />
                  <div className="min-h-0 flex-1 overflow-y-auto">
                  {categories.filter((category) => category.name.toLowerCase().includes(menuFilter.trim().toLowerCase())).map((category) => {
                    const active = category.id === (menuCategory || categories[0]?.id)
                    return (
                      <Link
                        key={category.id}
                        to={`/shop?category=${category.id}`}
                        onMouseEnter={() => setMenuCategory(category.id)}
                        onFocus={() => setMenuCategory(category.id)}
                        onClick={() => setPanel(null)}
                        className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
                          active ? 'bg-white font-semibold text-brand shadow-sm' : 'text-ink hover:bg-white'
                        }`}
                      >
                        <span className="size-8 overflow-hidden rounded-full bg-white">
                          <ProductMedia name="" image={category.image} art={category.art} className="size-full" />
                        </span>
                        {category.name}
                      </Link>
                    )
                  })}
                  </div>
                </div>
                <CategoryPane
                  category={categories.find((category) => category.id === menuCategory) ?? categories[0]!}
                  onNavigate={() => setPanel(null)}
                />
              </div>
              </div>
            )}
          </div>
          <Link to="/sale" className="rounded-full px-3.5 py-2 text-sm font-semibold text-ink/80 transition hover:bg-canvas hover:text-ink">
            On Sale
          </Link>
          <Link to="/shop" className="rounded-full px-3.5 py-2 text-sm font-semibold text-ink/80 transition hover:bg-canvas hover:text-ink">
            Best Sellers
          </Link>
        </nav>
          <form onSubmit={search} className="relative hidden min-w-0 flex-1 lg:block">
            <label className="relative block">
              <span className="sr-only">Search products</span>
              <SearchIcon className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted" />
              <input
                value={term}
                onChange={(event) => {
                  setTerm(event.target.value)
                  setPanel('search')
                }}
                onFocus={() => setPanel('search')}
                placeholder="Search for dry fruits, nuts, seeds..."
                className="h-11 w-full rounded-full border border-line bg-canvas pr-28 pl-11 text-sm text-ink transition outline-none placeholder:text-muted focus:border-brand focus:bg-white focus:shadow-[0_0_0_4px_rgb(18_58_134/0.1)]"
              />
              <button
                type="submit"
                className="absolute top-1 right-1 bottom-1 rounded-full bg-accent px-5 text-sm font-bold text-white transition hover:bg-accent-dark"
              >
                Search
              </button>
            </label>
            {panel === 'search' && (
              <div className="motion-panel absolute top-[calc(100%+8px)] right-0 left-0 overflow-hidden rounded-2xl border border-line bg-white shadow-pop">
                <p className="px-4 pt-3 text-xs font-semibold tracking-wide text-muted uppercase">
                  {query ? 'Matching products' : 'Popular right now'}
                </p>
                {suggestions.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-muted">No matches. Try almonds, cashews, or seeds.</p>
                ) : (
                  <ul>
                    {suggestions.map((product) => {
                      const pack = featuredPack(product)
                      return (
                        <li key={product.id}>
                          <Link
                            to={`/product/${product.slug}`}
                            className="flex items-center gap-3 px-4 py-2.5 hover:bg-canvas"
                            onClick={() => setPanel(null)}
                          >
                            <span className="size-12 overflow-hidden rounded-lg bg-canvas">
                              <ProductMedia name={product.name} image={product.image} art={product.art} className="size-full" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold">{product.name}</span>
                              <span className="text-xs text-muted">{pack.size}</span>
                            </span>
                            <span className="text-sm font-bold">{formatPrice(pack.price)}</span>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                )}
                <Link
                  to={query ? `/shop?q=${encodeURIComponent(term.trim())}` : '/shop'}
                  onClick={() => setPanel(null)}
                  className="block border-t border-line px-4 py-3 text-center text-sm font-semibold text-brand"
                >
                  View all results
                </Link>
              </div>
            )}
          </form>

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={() => {
                setPanel(null)
                openPicker()
              }}
              className="hidden max-w-48 items-center gap-2 rounded-xl px-2 py-1.5 text-left hover:bg-canvas xl:flex"
              title={delivery?.label ?? 'Choose your delivery location'}
            >
              <PinIcon className="size-5 shrink-0 text-brand" />
              <span className="min-w-0 leading-tight">
                <span className="block text-[11px] text-muted">Deliver to</span>
                <span className="block truncate text-sm font-semibold">{delivery ? `${delivery.city ? `${delivery.city} ` : ''}${delivery.pin}` : 'Set PIN'}</span>
              </span>
            </button>

            <div
              className="relative"
              onPointerEnter={(event) => {
                if (event.pointerType === 'mouse') setPanel('account')
              }}
              onPointerLeave={(event) => {
                if (event.pointerType === 'mouse') setPanel((current) => (current === 'account' ? null : current))
              }}
            >
              <button
                type="button"
                aria-expanded={panel === 'account'}
                aria-haspopup="menu"
                onClick={(event) => {
                  if (event.detail !== 0 && window.matchMedia('(hover: hover)').matches) setPanel('account')
                  else toggle('account')
                }}
                className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-canvas"
              >
                <UserIcon className="size-5" />
                <span className="hidden text-left leading-tight sm:block">
                  <span className="block text-[11px] text-muted">{user ? 'Hello' : 'Account'}</span>
                  <span className="block text-sm font-semibold">{user ? user.name.split(' ')[0] : 'Login'}</span>
                </span>
              </button>
              {panel === 'account' && (
                <div className="absolute top-full right-0 z-30 pt-2">
                  <div role="menu" className="motion-panel w-64 overflow-hidden rounded-2xl border border-line bg-white py-2 text-sm text-ink shadow-pop">
                    <div className="flex items-center justify-between gap-3 px-4 pt-1 pb-2">
                      <p className="font-bold">Your Account</p>
                      {user && (
                        <span className="max-w-24 truncate rounded-md bg-canvas px-2 py-0.5 text-xs font-semibold text-muted">
                          {user.name.split(' ')[0]}
                        </span>
                      )}
                    </div>
                    {!user && (
                      <Link to="/login" role="menuitem" onClick={() => setPanel(null)} className="mx-3 mb-1 block rounded-lg bg-accent px-3 py-2.5 text-center font-bold text-white">
                        Login / Register
                      </Link>
                    )}
                    {accountLinks.map((item) => (
                      <Link
                        key={item.label}
                        to={item.to === '/help/tickets' && !user ? '/help' : item.to}
                        role="menuitem"
                        onClick={() => setPanel(null)}
                        className="flex items-center gap-3 px-4 py-2.5 font-medium hover:bg-canvas"
                      >
                        <item.icon className="size-5 shrink-0 text-ink/80" />
                        {item.label}
                        {item.to === '/help/tickets' && user && unreadTickets > 0 && (
                          <span className="ml-auto grid min-w-5 place-items-center rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-extrabold text-white">{unreadTickets}</span>
                        )}
                      </Link>
                    ))}
                    {user && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          logout()
                          setPanel(null)
                        }}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left font-medium hover:bg-canvas"
                      >
                        <LogoutIcon className="size-5 shrink-0" />
                        Logout
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => toggle('wishlist')}
                className="relative rounded-xl p-2 hover:bg-canvas"
                aria-label={`Wishlist, ${wishlist.ids.length} saved`}
              >
                <HeartIcon className="size-5" filled={wishlist.ids.length > 0} />
                {wishlist.ids.length > 0 && (
                  <span key={wishlist.ids.length} className="motion-pop absolute top-0 right-0 grid size-4 place-items-center rounded-full bg-rose-500 text-[10px] font-bold text-white">
                    {wishlist.ids.length}
                  </span>
                )}
              </button>
              {panel === 'wishlist' && (
                <div className="motion-panel absolute top-full right-0 z-10 mt-2 w-80 rounded-2xl border border-line bg-white text-ink shadow-pop">
                  <div className="flex items-center justify-between border-b border-line px-4 py-3">
                    <p className="font-semibold">Wishlist</p>
                    <Link to="/wishlist" onClick={() => setPanel(null)} className="text-xs font-bold text-brand">View all →</Link>
                  </div>
                  {savedProducts.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-muted">Save products with the heart on any card.</p>
                  ) : (
                    <ul className="max-h-80 overflow-auto">
                      {savedProducts.map((product) => (
                        <li key={product.id} className="flex items-center gap-3 px-4 py-2.5">
                          <Link to={`/product/${product.slug}`} onClick={() => setPanel(null)} className="size-12 overflow-hidden rounded-lg bg-canvas">
                            <ProductMedia name={product.name} image={product.image} art={product.art} className="size-full" />
                          </Link>
                          <div className="min-w-0 flex-1">
                            <Link to={`/product/${product.slug}`} onClick={() => setPanel(null)} className="block truncate text-sm font-semibold">
                              {product.name}
                            </Link>
                            <p className="text-xs text-muted">{formatPrice(featuredPack(product).price)}</p>
                          </div>
                          <button type="button" onClick={() => wishlist.toggle(product.id)} className="text-xs font-medium text-rose-600">
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => toggle('cart')}
                className="relative flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-canvas"
                aria-label={`Cart, ${cart.count} items`}
              >
                <CartIcon className="size-6" />
                {cart.count > 0 && (
                  <span key={cart.count} className="motion-pop absolute -top-0.5 left-5 grid size-5 place-items-center rounded-full bg-accent text-[11px] font-bold text-white">
                    {cart.count}
                  </span>
                )}
              </button>
              {panel === 'cart' && (
                <div className="motion-panel absolute top-full right-0 z-10 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-white text-ink shadow-pop">
                  <p className="border-b border-line px-4 py-3 font-semibold">Cart ({cart.count})</p>
                  {cart.count === 0 ? (
                    <p className="px-4 py-6 text-sm text-muted">Your cart is empty.</p>
                  ) : cart.lines.length === 0 ? (
                    <div className="px-4 py-6 text-sm">
                      {cart.quoteError ? (
                        <>
                          <p className="text-rose-600">{cart.quoteError}</p>
                          <button type="button" onClick={cart.reloadQuote} className="mt-2 font-semibold text-brand">
                            Try again
                          </button>
                        </>
                      ) : (
                        <p className="text-muted">Loading your cart…</p>
                      )}
                    </div>
                  ) : (
                    <ul className="max-h-72 overflow-auto">
                      {cart.lines.map((line) => (
                        <li key={line.key} className="flex gap-3 px-4 py-3">
                          <Link to={`/product/${line.slug}`} onClick={() => setPanel(null)} className="size-14 shrink-0 overflow-hidden rounded-lg bg-canvas">
                            <ProductMedia name={line.name} image={line.image} art={line.art} className="size-full" />
                          </Link>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{line.name}</p>
                            <p className="text-xs text-muted">
                              {line.size} · Qty {line.quantity}
                            </p>
                            <p className="text-sm font-bold">{formatPrice(line.lineTotal)}</p>
                          </div>
                          <button type="button" onClick={() => cart.removeItem(line.variantId)} className="text-xs text-rose-600">
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="border-t border-line p-4">
                    <div className="mb-3 flex justify-between text-sm">
                      <span className="text-muted">Subtotal</span>
                      <span className="font-bold">{cart.pricing && cart.subtotal === 0 ? '…' : formatPrice(cart.subtotal)}</span>
                    </div>
                    <Link to="/cart" onClick={() => setPanel(null)} className="btn btn-outline w-full">
                      View cart
                    </Link>
                    <Link
                      to={user ? '/checkout' : '/login'}
                      state={user ? undefined : { from: '/checkout' }}
                      onClick={() => setPanel(null)}
                      className={`btn mt-2 w-full ${
                        cart.count === 0 ? 'pointer-events-none bg-slate-300 text-white' : 'btn-accent'
                      }`}
                    >
                      {user ? 'Checkout' : 'Login to checkout'}
                    </Link>
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              className="rounded-xl p-2 hover:bg-canvas lg:hidden"
              onClick={() => setMobileOpen((value) => !value)}
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            >
              {mobileOpen ? <CloseIcon className="size-6" /> : <MenuIcon className="size-6" />}
            </button>
          </div>
        </div>

        <form onSubmit={search} className="px-4 pb-3 lg:hidden">
          <label className="relative block">
            <span className="sr-only">Search products</span>
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Search dry fruits..."
              className="h-10 w-full rounded-full border border-line bg-canvas pr-4 pl-10 text-sm outline-none"
            />
          </label>
        </form>


        {mobileOpen && (
          <div className="space-y-2 border-t border-line px-4 py-4 text-sm lg:hidden">
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false)
                openPicker()
              }}
              className="flex w-full items-center gap-2 rounded-lg border border-line px-3 py-2.5 text-left"
            >
              <PinIcon className="size-5 shrink-0 text-brand" />
              <span className="min-w-0 truncate">
                {delivery ? <><span className="text-muted">Deliver to </span><b>{delivery.city ? `${delivery.city} ` : ''}{delivery.pin}</b></> : <b>Set delivery PIN</b>}
              </span>
            </button>
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }: { isActive: boolean }) =>
                  `block rounded-lg px-2 py-2 ${isActive ? 'bg-brand font-semibold text-white' : 'hover:bg-canvas'}`
                }
              >
                {link.label}
              </NavLink>
            ))}
            {lone ? (
              <div className="pt-2">
                <div className="flex items-center justify-between px-2">
                  <p className="text-xs font-semibold tracking-wide text-muted uppercase">{lone.name}</p>
                  <Link to={`/shop?category=${lone.id}`} onClick={() => setMobileOpen(false)} className="text-xs font-bold text-brand">
                    View all
                  </Link>
                </div>
                <GradeChips category={lone} grade={menuGrade} onGrade={setMenuGrade} className="mt-2" />
                {shelf.isPending ? (
                  <p className="px-2 py-4 text-sm text-muted">Loading products…</p>
                ) : (
                  <ul className="mt-2 max-h-72 space-y-0.5 overflow-y-auto">
                    {(shelf.data?.items ?? []).map((product) => (
                      <ShelfRow key={product.id} product={product} onNavigate={() => setMobileOpen(false)} />
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <>
                <p className="px-2 pt-2 text-xs font-semibold tracking-wide text-muted uppercase">Categories</p>
                {categories.map((category) => (
                  <div key={category.id}>
                    <Link to={`/shop?category=${category.id}`} onClick={() => setMobileOpen(false)} className="block rounded-lg px-2 py-2 font-semibold hover:bg-canvas">
                      {category.name}
                    </Link>
                    <div className="flex flex-wrap gap-1 px-2 pb-2">
                      {category.subcategories.map((sub) => (
                        <Link
                          key={sub.id}
                          to={`/shop?category=${category.id}&sub=${sub.id}`}
                          onClick={() => setMobileOpen(false)}
                          className="rounded-full bg-canvas px-2 py-1 text-xs text-ink"
                        >
                          {sub.name}
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
            {user ? (
              <button type="button" onClick={logout} className="block px-2 py-2 text-left">
                Logout {user.name.split(' ')[0]}
              </button>
            ) : (
              <Link to="/login" className="block px-2 py-2 font-semibold text-brand">
                Login / Register
              </Link>
            )}
          </div>
        )}
      </div>
    </header>
  )
}

function GradeChips({
  category,
  grade,
  onGrade,
  className = '',
}: {
  category: Category
  grade: string
  onGrade: (grade: string) => void
  className?: string
}) {
  const grades = category.subcategories.filter((sub) => (sub.productCount ?? 0) > 0)
  if (grades.length === 0) return null
  const chips = [{ id: 'all', name: 'All' }, ...grades]
  return (
    <div className={`no-scrollbar flex gap-1.5 overflow-x-auto ${className}`}>
      {chips.map((chip) => {
        const active = grade === chip.id
        return (
          <button
            key={chip.id}
            type="button"
            onClick={() => onGrade(chip.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition ${
              active ? 'bg-ink text-white' : 'bg-canvas text-ink hover:bg-brand-soft hover:text-brand'
            }`}
          >
            {chip.name}
          </button>
        )
      })}
    </div>
  )
}

function ShelfRow({ product, onNavigate }: { product: Product; onNavigate: () => void }) {
  const pack = featuredPack(product)
  return (
    <li>
      <Link
        to={productPath(product, pack.size)}
        onClick={onNavigate}
        className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition hover:bg-canvas"
      >
        <span className="size-12 shrink-0 overflow-hidden rounded-xl bg-canvas ring-1 ring-line">
          <ProductMedia name={product.name} image={product.image} art={product.art} className="size-full" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-extrabold">{product.name}</span>
          <span className="text-xs text-muted">{pack.size}</span>
        </span>
        <span className="shrink-0 text-sm font-extrabold">{formatPrice(pack.price)}</span>
      </Link>
    </li>
  )
}

function ProductShelf({
  category,
  grade,
  onGrade,
  products,
  total,
  loading,
  onNavigate,
}: {
  category: Category
  grade: string
  onGrade: (grade: string) => void
  products: Product[]
  total: number
  loading: boolean
  onNavigate: () => void
}) {
  return (
    <div className="motion-panel w-[min(34rem,calc(100vw-2rem))] rounded-2xl border border-line bg-white p-4 text-ink shadow-pop">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-extrabold">{category.name}</p>
          <p className="mt-0.5 text-xs text-muted">{category.tagline}</p>
        </div>
        <Link to={`/shop?category=${category.id}`} onClick={onNavigate} className="shrink-0 text-xs font-bold text-brand">
          View all
        </Link>
      </div>
      <GradeChips category={category} grade={grade} onGrade={onGrade} className="mt-3" />
      <ul className="mt-3 max-h-80 space-y-0.5 overflow-y-auto">
        {loading ? (
          <li className="px-2 py-6 text-center text-sm text-muted">Loading products…</li>
        ) : products.length === 0 ? (
          <li className="px-2 py-6 text-center text-sm text-muted">Nothing in this grade yet.</li>
        ) : (
          products.map((product) => <ShelfRow key={product.id} product={product} onNavigate={onNavigate} />)
        )}
      </ul>
      {total > products.length && (
        <Link
          to={`/shop?category=${category.id}${grade === 'all' ? '' : `&sub=${grade}`}`}
          onClick={onNavigate}
          className="mt-2 block rounded-xl bg-canvas px-3 py-2.5 text-center text-xs font-bold text-brand"
        >
          See all {total}
        </Link>
      )}
    </div>
  )
}

function CategoryPane({
  category,
  onNavigate,
}: {
  category: Category
  onNavigate: () => void
}) {
  const products = useProducts({ category: category.id, sort: 'popular', pageSize: 5 })
  const items = products.data?.items ?? []
  const total = products.data?.total ?? 0
  const subs = category.subcategories.filter((sub) => (sub.productCount ?? 0) > 0)
  return (
    <div className="flex min-w-0 flex-1 flex-col p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-extrabold">{category.name}</p>
          {category.tagline && <p className="mt-0.5 text-xs text-muted">{category.tagline}</p>}
        </div>
        <Link
          to={`/shop?category=${category.id}`}
          onClick={onNavigate}
          className="shrink-0 text-xs font-bold text-brand"
        >
          Shop all
        </Link>
      </div>
      {subs.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {subs.map((sub) => {
          const count = sub.productCount ?? 0
          return (
            <Link
              key={sub.id}
              to={`/shop?category=${category.id}&sub=${sub.id}`}
              onClick={onNavigate}
              className="rounded-xl border border-line px-3 py-2.5 hover:border-brand hover:bg-brand-soft"
            >
              <span className="block text-sm font-medium">{sub.name}</span>
              <span className="mt-0.5 block text-[11px] text-muted">
                {count} {count === 1 ? 'pouch' : 'pouches'}
              </span>
            </Link>
          )
          })}
        </div>
      )}
      <p className="mt-4 px-2 text-[11px] font-extrabold tracking-wider text-muted uppercase">Popular in {category.name}</p>
      <ul className="mt-1 max-h-72 space-y-0.5 overflow-y-auto">
        {products.isPending ? (
          Array.from({ length: 3 }, (_, index) => (
            <li key={index} className="flex items-center gap-3 px-2 py-1.5">
              <span className="size-12 shrink-0 animate-pulse rounded-xl bg-canvas" />
              <span className="h-3 flex-1 animate-pulse rounded bg-canvas" />
            </li>
          ))
        ) : items.length === 0 ? (
          <li className="px-2 py-6 text-center text-sm text-muted">No products in this category yet.</li>
        ) : (
          items.map((product) => <ShelfRow key={product.id} product={product} onNavigate={onNavigate} />)
        )}
      </ul>
      {total > items.length && (
        <Link
          to={`/shop?category=${category.id}`}
          onClick={onNavigate}
          className="mt-2 block rounded-xl bg-canvas px-3 py-2.5 text-center text-xs font-bold text-brand"
        >
          See all {total} in {category.name}
        </Link>
      )}
    </div>
  )
}
