import { useState, type FormEvent } from 'react'
import { Container } from '../components/layout/Container.tsx'
import { MailIcon, PhoneIcon, PinIcon } from '../components/icons.tsx'
import { PageHero } from '../components/ui/PageHero.tsx'
import { useDocumentTitle } from '../lib/useDocumentTitle.ts'

export function ContactPage() {
  useDocumentTitle('Contact')
  const [sent, setSent] = useState(false)

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSent(true)
  }

  return (
    <div className="bg-canvas">
      <PageHero title="Contact" intro="Questions about an order, a pouch or a bulk box — write to us." />
      <Container className="grid gap-6 py-10 lg:grid-cols-[0.8fr_1.2fr]">
        <aside className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="font-semibold">ClickMart desk</h2>
          <ul className="mt-4 space-y-3 text-sm text-muted">
            <li className="flex gap-2">
              <PhoneIcon className="size-4 text-brand" /> +91 80 4567 8900
            </li>
            <li className="flex gap-2">
              <MailIcon className="size-4 text-brand" /> hello@clickmart.com
            </li>
            <li className="flex gap-2">
              <PinIcon className="size-4 text-brand" /> 42, Residency Road, Bengaluru 560025
            </li>
          </ul>
          <p className="mt-4 text-sm text-muted">Monday to Saturday, 9:00 to 18:00 IST.</p>
        </aside>
        {sent ? (
          <p className="rounded-2xl bg-white p-8 shadow-sm">Thanks. We will reply by email.</p>
        ) : (
          <form onSubmit={submit} className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm">
                Name
                <input required className="mt-1 h-10 w-full rounded-lg border border-line px-3" />
              </label>
              <label className="text-sm">
                Email
                <input required type="email" className="mt-1 h-10 w-full rounded-lg border border-line px-3" />
              </label>
            </div>
            <label className="mt-4 block text-sm">
              Message
              <textarea required className="mt-1 h-32 w-full rounded-lg border border-line px-3 py-2" />
            </label>
            <button type="submit" className="mt-4 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white">
              Send message
            </button>
          </form>
        )}
      </Container>
    </div>
  )
}
