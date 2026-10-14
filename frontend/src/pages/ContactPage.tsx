import { Link } from 'react-router-dom'
import { Container } from '../components/layout/Container.tsx'
import { ChatIcon, ClockIcon, MailIcon, PhoneIcon, PinIcon } from '../components/icons.tsx'
import { RequestForm } from '../components/support/RequestForm.tsx'
import { PageHero } from '../components/ui/PageHero.tsx'
import { storeAddress, storeEmail, storePhone, storePhoneTel } from '../lib/store.ts'
import { useDocumentTitle } from '../lib/useDocumentTitle.ts'

const channels = [
  { icon: PhoneIcon, title: 'Call us', value: storePhone, href: `tel:${storePhoneTel}`, note: 'Mon to Sat, 9:00 to 18:00 IST' },
  { icon: MailIcon, title: 'Email us', value: storeEmail, href: `mailto:${storeEmail}`, note: 'We reply within one working day' },
  { icon: PinIcon, title: 'Visit us', value: storeAddress, note: 'Our packing kitchen and office' },
]

export function ContactPage() {
  useDocumentTitle('Contact us')
  return (
    <div className="bg-canvas">
      <PageHero title="Contact us" intro="Questions about an order, a pouch or a bulk box. Reach us the way that suits you." />
      <Container className="py-8 sm:py-12">
        <ul className="grid gap-4 md:grid-cols-3">
          {channels.map((channel) => {
            const body = (
              <>
                <span className="grid size-12 place-items-center rounded-2xl bg-brand-soft text-brand">
                  <channel.icon className="size-5" />
                </span>
                <span className="mt-4 block text-xs font-extrabold tracking-wider text-muted uppercase">{channel.title}</span>
                <span className="mt-1 block font-extrabold break-words">{channel.value}</span>
                <span className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                  <ClockIcon className="size-3.5 shrink-0" /> {channel.note}
                </span>
              </>
            )
            return (
              <li key={channel.title}>
                {channel.href ? (
                  <a href={channel.href} className="card block h-full p-6 transition hover:-translate-y-0.5 hover:border-brand hover:shadow-lift">
                    {body}
                  </a>
                ) : (
                  <div className="card h-full p-6">{body}</div>
                )}
              </li>
            )
          })}
        </ul>

        <div className="mt-10 mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Write to us</p>
            <h2 className="mt-1.5 text-2xl font-extrabold tracking-tight">Send a message</h2>
          </div>
          <Link to="/help" className="inline-flex items-center gap-2 text-sm font-bold text-brand hover:underline">
            <ChatIcon className="size-4" /> Looking for quick answers? Visit the Help centre
          </Link>
        </div>
        <RequestForm hideContact />
      </Container>
    </div>
  )
}
