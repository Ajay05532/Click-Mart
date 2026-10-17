import { Link } from 'react-router-dom'
import { Container } from '../components/layout/Container.tsx'
import { PageHero } from '../components/ui/PageHero.tsx'
import { useStoreContact, useStoreSettings } from '../lib/catalog.ts'
import { formatPrice } from '../lib/money.ts'
import { useSeo } from '../lib/seo.ts'

const UPDATED = '15 October 2026'

type Section = { id: string; title: string; body: string[] }

function PolicyLayout({
  title,
  intro,
  sections,
  contactNote,
}: {
  title: string
  intro: string
  sections: Section[]
  contactNote: string
}) {
  const contact = useStoreContact()
  return (
    <div className="bg-canvas">
      <PageHero title={title} intro={intro}>
        <p className="mt-4 text-xs font-semibold tracking-wide text-white/65 uppercase">Last updated {UPDATED}</p>
      </PageHero>

      <Container className="grid grid-cols-1 items-start gap-6 py-10 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav aria-label="On this page" className="card sticky top-24 hidden p-4 lg:block">
          <p className="text-[11px] font-extrabold tracking-[0.14em] text-muted uppercase">On this page</p>
          <ol className="mt-3 space-y-2">
            {sections.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`} className="text-sm font-semibold text-ink-soft transition hover:text-brand">
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <article className="card overflow-hidden">
          {sections.map((section, index) => (
            <section key={section.id} id={section.id} className={`scroll-mt-28 px-5 py-6 sm:px-8 ${index > 0 ? 'border-t border-line' : ''}`}>
              <h2 className="text-lg font-extrabold tracking-tight">{section.title}</h2>
              <div className="mt-3 space-y-3 text-sm leading-7 text-ink-soft">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}

          <div className="border-t border-line bg-canvas/60 px-5 py-6 sm:px-8">
            <h2 className="text-sm font-extrabold tracking-wide text-muted uppercase">Questions</h2>
            <p className="mt-2 text-sm leading-7 text-ink-soft">{contactNote}</p>
            <ul className="mt-3 space-y-1 text-sm font-semibold">
              <li>
                <a href={`mailto:${contact.email}`} className="text-brand hover:underline">
                  {contact.email}
                </a>
              </li>
              <li>
                <a href={`tel:${contact.phoneTel}`} className="text-brand hover:underline">
                  {contact.phone}
                </a>
              </li>
              <li className="font-normal text-muted">{contact.address}</li>
            </ul>
            <p className="mt-4 text-sm">
              Prefer a ticket? Open the{' '}
              <Link to="/help" className="font-bold text-brand">
                Help centre
              </Link>
              .
            </p>
          </div>
        </article>
      </Container>
    </div>
  )
}

export function PrivacyPage() {
  useSeo({
    title: 'Privacy Policy',
    description: 'How ClickMart collects, uses and protects account, order, payment and support data for customers in India.',
  })

  const sections: Section[] = [
    {
      id: 'who',
      title: 'Who we are',
      body: [
        'ClickMart is an online dry-fruits store based in Patna, Bihar. This policy explains what we collect when you browse the shop, create an account, place an order or contact support.',
        'We run the storefront, the admin tools and the API ourselves. Payment card entry is handled by our payment partner, Razorpay, when you pay online.',
      ],
    },
    {
      id: 'account',
      title: 'Your account',
      body: [
        'When you register we keep your name, email address, password hash and, if you add it, your phone number and profile photo. Passwords are hashed before they are stored. We never store or show the plain password.',
        'Signed-in sessions use httpOnly cookies for a short-lived access token and a longer refresh token. Signing out, or changing your password, ends that session on our side.',
      ],
    },
    {
      id: 'orders',
      title: 'Orders and delivery',
      body: [
        'An order stores the items you bought, prices at the time of purchase, delivery address, phone, email, payment method and the status timeline. That record lives on our servers so you can track it in My orders and so our team can pack and ship it.',
        'If you set a delivery PIN in the header we save that location for guests in this browser, and for signed-in customers on the account. Saved addresses (name, mobile, street, PIN, city and state) are kept so checkout is faster next time.',
      ],
    },
    {
      id: 'payments',
      title: 'Payments',
      body: [
        'Online payments go through Razorpay. We never receive or store your full card number or CVV. Those details are typed only in Razorpay’s window.',
        'For your account we may keep a payment label such as the card brand and last four digits, a UPI ID you chose to save, the payment amount, status and refund history. Cash on delivery orders record that method instead of a card.',
      ],
    },
    {
      id: 'cart',
      title: 'Cart, wishlist and this device',
      body: [
        'Guests keep the cart, wishlist, coupon code and delivery PIN in this browser until they clear site data or finish checkout. When you sign in, the cart and wishlist are merged into your account and then kept on the server.',
        'Notification and language choices in Settings stay on this device only. They are not synced to the account.',
      ],
    },
    {
      id: 'support',
      title: 'Help and reviews',
      body: [
        'Support requests store the subject, message, topic, linked order (if any) and photos you attach. Guest messages use the email you give; after you sign in with that email, those tickets appear under My requests.',
        'Product reviews you submit, including optional photos, are stored for moderation and may be shown on the product page once approved.',
      ],
    },
    {
      id: 'location',
      title: 'Location',
      body: [
        'If you use “Use my current location”, the browser asks for permission and we look up the address through our own map helpers. We use that only to fill delivery fields or the header PIN. We do not sell location data.',
      ],
    },
    {
      id: 'use',
      title: 'How we use the data',
      body: [
        'We use it to run your account, price and fulfil orders, send order and support emails, prevent fraud, improve the shop and meet legal duties such as invoices and tax records.',
        'We do not sell customer lists. Staff with access see only what they need for packing, support or store settings.',
      ],
    },
    {
      id: 'rights',
      title: 'Your choices',
      body: [
        'You can update your profile, addresses and saved payment labels in Account settings. You can clear guest cart and location data from your browser settings.',
        'To ask for a copy of your account data, or to close the account, email us from the address on the account. We keep order records as long as tax and accounting rules require.',
      ],
    },
  ]

  return (
    <PolicyLayout
      title="Privacy Policy"
      intro="What we keep when you browse, sign in, place an order or ask for help — and what never reaches our servers."
      sections={sections}
      contactNote="Write to us if something in this policy is unclear, or if you need help with your account data."
    />
  )
}

export function TermsPage() {
  const settings = useStoreSettings()
  useSeo({
    title: 'Terms & Conditions',
    description: 'How ClickMart orders, shipping, payments, cancellations and returns work, in plain language.',
  })

  const free = formatPrice(settings.freeShippingThreshold)
  const sections: Section[] = [
    {
      id: 'shop',
      title: 'The shop',
      body: [
        'ClickMart sells dry fruits and related products online for delivery in India. Prices are in Indian rupees and include the pack size shown on the product. An offer or coupon is applied again on our servers at checkout, so the price you pay is the one we calculate there.',
      ],
    },
    {
      id: 'orders',
      title: 'Orders',
      body: [
        'You need an account to check out. Placing an order is an offer to buy those packs at the priced total. We confirm it when payment succeeds, or when a cash-on-delivery order is accepted.',
        'Stock is reserved when the order is created. If payment fails or the payment window expires, the order is cancelled and the stock is released.',
      ],
    },
    {
      id: 'shipping',
      title: 'Delivery',
      body: [
        `Orders at or above ${free} ship free unless a free-shipping coupon already covers delivery. Below that, the delivery fee shown at checkout applies.`,
        'Most orders arrive in about four working days. The expected date is on your order page, and courier details appear once the order ships.',
      ],
    },
    {
      id: 'cancel',
      title: 'Cancellation',
      body: [
        'You can cancel an order from the order page while it is still placed or confirmed. Once it is packed for delivery, cancellation is no longer available.',
        'A paid online order that you cancel is refunded to the original payment method. Banks usually take 5 to 7 working days to show the refund.',
      ],
    },
    {
      id: 'returns',
      title: 'Returns and quality',
      body: [
        'If something arrives damaged, wrong or not fresh, tell us within 48 hours of delivery through Help with a photo. We will arrange a replacement or refund where it is fair.',
        'Opened snacks that were delivered correctly are not returnable. Unopened pouches with an intact seal can be discussed for return within 7 days of delivery.',
      ],
    },
    {
      id: 'use',
      title: 'Using the site',
      body: [
        'Do not misuse coupons, create fake accounts or interfere with the shop or payment flow. We may block an account that breaks these rules or attempts fraud.',
        'Product photos and descriptions are for guidance. Natural products can vary slightly in colour and size between packs.',
      ],
    },
  ]

  return (
    <PolicyLayout
      title="Terms & Conditions"
      intro="The plain-language rules for ordering, delivery, payment, cancellation and returns."
      sections={sections}
      contactNote="Questions about an order or these terms? Reach us here, or open a request in the Help centre."
    />
  )
}
