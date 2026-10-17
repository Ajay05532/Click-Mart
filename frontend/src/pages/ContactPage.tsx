import { Link } from 'react-router-dom'
import { Container } from '../components/layout/Container.tsx'
import { BoxIcon, CardIcon, ChatIcon, ClockIcon, MailIcon, PhoneIcon, PinIcon, RefreshIcon, TruckIcon } from '../components/icons.tsx'
import { RequestForm } from '../components/support/RequestForm.tsx'
import { PageHero } from '../components/ui/PageHero.tsx'
import { useStoreContact } from '../lib/catalog.ts'
import { useSeo } from '../lib/seo.ts'
import { localBusinessJsonLd } from '../lib/jsonld.ts'

const OPEN_HOUR = 9
const CLOSE_HOUR = 18
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Whether the team is working right now, in India time (Monday to Saturday, 9:00 to 18:00). */
function openNow() {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', weekday: 'long', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date())
  const day = DAYS.indexOf(parts.find((part) => part.type === 'weekday')?.value ?? '')
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0)
  const open = day >= 1 && day <= 6 && hour >= OPEN_HOUR && hour < CLOSE_HOUR
  if (open) return { open, text: `Open now · until ${CLOSE_HOUR - 12}:00 pm IST` }
  const nextDay = day === 6 && hour >= CLOSE_HOUR ? 'Monday' : day === 0 ? 'Monday' : hour < OPEN_HOUR ? 'today' : 'tomorrow'
  return { open, text: `Closed · opens ${nextDay} at ${OPEN_HOUR}:00 am IST` }
}

const quick = [
  { icon: TruckIcon, label: 'Where is my order?', to: '/orders' },
  { icon: BoxIcon, label: 'Cancel an order', to: '/orders' },
  { icon: RefreshIcon, label: 'Return or replace', to: '/help/new?topic=REFUND_RETURN' },
  { icon: CardIcon, label: 'Payment or refund', to: '/help/new?topic=PAYMENT' },
]

export function ContactPage() {
  useSeo({ title: 'Contact us', description: 'Call, email or write to ClickMart in Patna. Questions about an order, a pouch or a bulk box are answered Monday to Saturday, 9:00 to 18:00 IST.', jsonLd: localBusinessJsonLd() })
  const contact = useStoreContact()
  const status = openNow()
  const directions = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(contact.address)}`

  return (
    <div className="bg-canvas">
      <PageHero
        eyebrow="We are here to help"
        title="Contact us"
        intro="Questions about an order, a pouch or a bulk box. A real person on our Patna team reads every message."
        aside={
          <div className="card p-5 sm:p-6">
            <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-extrabold ${status.open ? 'bg-emerald-50 text-success' : 'bg-orange-50 text-accent-dark'}`}>
              <span className={`size-2 rounded-full ${status.open ? 'bg-success' : 'bg-accent'}`} />
              {status.text}
            </span>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Monday to Saturday</dt>
                <dd className="font-bold">9:00 am – 6:00 pm</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Sunday</dt>
                <dd className="font-bold">Closed</dd>
              </div>
            </dl>
            <div className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-4 text-center">
              <div className="rounded-xl bg-canvas px-2 py-2.5">
                <p className="text-sm font-extrabold">Live</p>
                <p className="text-[11px] text-muted">calls in working hours</p>
              </div>
              <div className="rounded-xl bg-canvas px-2 py-2.5">
                <p className="text-sm font-extrabold">1 working day</p>
                <p className="text-[11px] text-muted">email and messages</p>
              </div>
            </div>
          </div>
        }
      />

      <Container className="py-10 sm:py-12">
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <li>
            <a href={`tel:${contact.phoneTel}`} className="card group flex h-full flex-col p-6 transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-lift">
              <span className="grid size-12 place-items-center rounded-2xl bg-brand-soft text-brand">
                <PhoneIcon className="size-5" />
              </span>
              <span className="mt-4 text-xs font-extrabold tracking-wider text-muted uppercase">Call us</span>
              <span className="mt-1 font-extrabold">{contact.phone}</span>
              <span className="mt-1 text-sm text-muted">Fastest for an order that is on its way.</span>
              <span className="mt-auto pt-4 text-sm font-bold text-brand">Call now →</span>
            </a>
          </li>
          <li>
            <a href={`mailto:${contact.email}`} className="card group flex h-full min-w-0 flex-col p-6 transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-lift">
              <span className="grid size-12 place-items-center rounded-2xl bg-brand-soft text-brand">
                <MailIcon className="size-5" />
              </span>
              <span className="mt-4 text-xs font-extrabold tracking-wider text-muted uppercase">Email us</span>
              <span className="mt-1 font-extrabold break-all">{contact.email}</span>
              <span className="mt-1 text-sm text-muted">Bulk boxes, invoices and anything that needs a photo.</span>
              <span className="mt-auto pt-4 text-sm font-bold text-brand">Write an email →</span>
            </a>
          </li>
          <li>
            <a href={directions} target="_blank" rel="noopener noreferrer" className="card group flex h-full flex-col p-6 transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-lift">
              <span className="grid size-12 place-items-center rounded-2xl bg-brand-soft text-brand">
                <PinIcon className="size-5" />
              </span>
              <span className="mt-4 text-xs font-extrabold tracking-wider text-muted uppercase">Visit us</span>
              <span className="mt-1 leading-6 font-extrabold">{contact.address}</span>
              <span className="mt-1 text-sm text-muted">Our packing kitchen and office.</span>
              <span className="mt-auto pt-4 text-sm font-bold text-brand">Get directions →</span>
            </a>
          </li>
        </ul>

        <section className="mt-10 rounded-3xl border border-line bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-extrabold">Most questions are answered in a click</p>
              <p className="text-sm text-muted">Track, cancel or return an order yourself, any time.</p>
            </div>
            <Link to="/help" className="inline-flex items-center gap-2 text-sm font-bold text-brand hover:underline">
              <ChatIcon className="size-4" /> Visit the Help centre
            </Link>
          </div>
          <ul className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
            {quick.map((item) => (
              <li key={item.label}>
                <Link to={item.to} className="flex items-center gap-2.5 rounded-xl bg-canvas px-3 py-3 text-sm font-bold transition hover:bg-brand-soft hover:text-brand">
                  <item.icon className="size-4 shrink-0 text-brand" />
                  <span className="min-w-0">{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <div className="mt-12 mb-6">
          <p className="eyebrow">Write to us</p>
          <h2 className="mt-1.5 flex items-center gap-2 text-2xl font-extrabold tracking-tight">
            Send a message <ClockIcon className="size-5 text-muted" />
          </h2>
          <p className="mt-1 text-sm text-muted">Pick a topic and we route it to the right person. You get a reply by email, and signed-in customers can follow it in My requests.</p>
        </div>
        <RequestForm hideContact />
      </Container>
    </div>
  )
}
