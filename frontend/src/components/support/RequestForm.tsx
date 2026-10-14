import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.tsx'
import { api, errorMessage } from '../../lib/api.ts'
import { formatPrice } from '../../lib/money.ts'
import { formatDay, statusLabel, useMyOrders } from '../../lib/orders.ts'
import { topics, uploadAttachments, type Ticket, type TopicId } from '../../lib/support.ts'
import { storeEmail, storePhone, storePhoneTel } from '../../lib/store.ts'
import { CheckIcon, ClockIcon, MailIcon, PhoneIcon } from '../icons.tsx'
import { Stepper } from '../ui/Primitives.tsx'
import { PhotoPicker } from './PhotoPicker.tsx'
import { topicIcons } from './topicIcons.tsx'

const fast: TopicId[] = ['PAYMENT', 'REFUND_RETURN', 'PRODUCT_QUALITY', 'WRONG_OR_MISSING']

type Done = { code: string; signedIn: boolean; email: string }

/**
 * Two steps: pick a topic, then describe it. Signed-in customers get order linking and photos
 * and can follow replies in My requests; guests send a plain message and hear back by email.
 */
export function RequestForm({ initialTopic, initialOrder, hideContact = false }: { initialTopic?: TopicId; initialOrder?: string; hideContact?: boolean }) {
  const { user } = useAuth()
  const client = useQueryClient()
  const orders = useMyOrders()
  const [topic, setTopic] = useState<TopicId | null>(initialTopic ?? null)
  const [subject, setSubject] = useState(topics.find((item) => item.id === initialTopic)?.subject ?? '')
  const [orderCode, setOrderCode] = useState(initialOrder ?? '')
  const [message, setMessage] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [guest, setGuest] = useState({ name: '', email: '', phone: '' })
  const [trap, setTrap] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<Done | null>(null)

  const chosen = topics.find((item) => item.id === topic)
  const pick = (id: TopicId) => {
    const previous = topics.find((item) => item.id === topic)
    setTopic(id)
    // Keep what the customer typed, only replace the suggested subject.
    if (!subject || subject === previous?.subject) setSubject(topics.find((item) => item.id === id)?.subject ?? '')
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!topic || busy) return
    setError('')
    setBusy(true)
    try {
      if (user) {
        const attachments = await uploadAttachments(files)
        const result = await api<{ ticket: Ticket }>('/support/tickets', {
          body: { category: topic, subject, message, orderCode: orderCode || undefined, attachments },
        })
        void client.invalidateQueries({ queryKey: ['tickets'] })
        void client.invalidateQueries({ queryKey: ['tickets-unread'] })
        setDone({ code: result.ticket.code, signedIn: true, email: user.email })
      } else {
        const result = await api<{ ticket: { code: string } }>('/support/contact', {
          body: { name: guest.name, email: guest.email, phone: guest.phone || undefined, category: topic, subject, message, orderCode: orderCode || undefined, website: trap },
        })
        setDone({ code: result.ticket.code, signedIn: false, email: guest.email })
      }
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="card mx-auto max-w-2xl overflow-hidden text-center">
        <div className="bg-gradient-to-br from-brand-dark to-brand px-6 py-10 text-white">
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-white/15 ring-8 ring-white/10">
            <CheckIcon className="size-8" />
          </span>
          <h2 className="mt-5 text-2xl font-extrabold tracking-tight">We have your request</h2>
          <p className="mt-2 text-white/80">
            Reference <span className="font-mono font-extrabold text-white">{done.code}</span>
          </p>
        </div>
        <div className="space-y-5 px-6 py-8">
          <p className="mx-auto max-w-md text-sm leading-6 text-ink-soft">
            We sent a confirmation to <strong>{done.email}</strong>. {topic && fast.includes(topic) ? 'Since this involves your money or your order, we put it at the front of the queue.' : 'A real person from our team will read it and reply.'}
          </p>
          <ul className="mx-auto grid max-w-md gap-3 text-left text-sm">
            <li className="flex gap-3">
              <ClockIcon className="mt-0.5 size-5 shrink-0 text-brand" />
              <span>
                <strong>Usually within {topic && fast.includes(topic) ? '8' : '24'} hours.</strong> Monday to Saturday, 9:00 to 18:00 IST.
              </span>
            </li>
            <li className="flex gap-3">
              <MailIcon className="mt-0.5 size-5 shrink-0 text-brand" />
              <span>{done.signedIn ? 'You also get an email each time we reply.' : 'Our reply comes to your email. Check spam if you do not see it.'}</span>
            </li>
          </ul>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            {done.signedIn && (
              <Link to={`/help/tickets/${done.code}`} className="btn btn-brand">
                View my request
              </Link>
            )}
            <Link to="/help" className="btn btn-outline">
              Back to Help centre
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mx-auto mb-8 max-w-md">
        <Stepper steps={['Choose a topic', 'Tell us more']} current={topic ? 1 : 0} />
      </div>

      {!topic ? (
        <section aria-labelledby="topic-title">
          <h2 id="topic-title" className="text-center text-2xl font-extrabold tracking-tight">
            What do you need help with?
          </h2>
          <p className="mt-2 text-center text-sm text-muted">Pick the closest match. It sends your request to the right person.</p>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {topics.map((item) => {
              const Icon = topicIcons[item.id]
              return (
                <li key={item.id}>
                  <button type="button" onClick={() => pick(item.id)} className="card group flex h-full w-full items-start gap-4 p-5 text-left transition hover:-translate-y-0.5 hover:border-brand hover:shadow-lift">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand transition group-hover:bg-brand group-hover:text-white">
                      <Icon className="size-5" />
                    </span>
                    <span>
                      <span className="block font-extrabold">{item.label}</span>
                      <span className="mt-0.5 block text-sm leading-5 text-muted">{item.text}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <form onSubmit={(event) => void submit(event)} className="card space-y-5 p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {chosen && (
                  <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand">
                    {(() => {
                      const Icon = topicIcons[chosen.id]
                      return <Icon className="size-5" />
                    })()}
                  </span>
                )}
                <div>
                  <p className="text-[11px] font-extrabold tracking-wider text-muted uppercase">Topic</p>
                  <p className="font-extrabold">{chosen?.label}</p>
                </div>
              </div>
              <button type="button" onClick={() => setTopic(null)} className="text-sm font-bold text-brand hover:underline">
                Change
              </button>
            </div>

            {!user && (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-bold">
                  Your name
                  <input required minLength={2} maxLength={80} autoComplete="name" value={guest.name} onChange={(event) => setGuest({ ...guest, name: event.target.value })} className="field mt-1.5 font-normal" />
                </label>
                <label className="text-sm font-bold">
                  Email
                  <input required type="email" autoComplete="email" value={guest.email} onChange={(event) => setGuest({ ...guest, email: event.target.value })} className="field mt-1.5 font-normal" />
                </label>
                <label className="text-sm font-bold sm:col-span-2">
                  Mobile number <span className="font-normal text-muted">(optional)</span>
                  <input inputMode="numeric" pattern="[6-9][0-9]{9}" maxLength={10} autoComplete="tel-national" value={guest.phone} onChange={(event) => setGuest({ ...guest, phone: event.target.value.replace(/\D/g, '') })} className="field mt-1.5 font-normal" placeholder="10-digit number" />
                </label>
                <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                  <label>
                    Website
                    <input tabIndex={-1} autoComplete="off" value={trap} onChange={(event) => setTrap(event.target.value)} />
                  </label>
                </div>
              </div>
            )}

            {user ? (
              <label className="block text-sm font-bold">
                Which order is this about? <span className="font-normal text-muted">{chosen?.needsOrder ? '' : '(optional)'}</span>
                <select value={orderCode} onChange={(event) => setOrderCode(event.target.value)} className="field mt-1.5 font-normal" required={false}>
                  <option value="">{chosen?.needsOrder ? 'Select an order' : 'Not about a specific order'}</option>
                  {orderCode && !(orders.data ?? []).some((order) => order.code === orderCode) && <option value={orderCode}>{orderCode}</option>}
                  {(orders.data ?? []).map((order) => (
                    <option key={order.id} value={order.code}>
                      {order.code} · {formatDay(order.placedAt)} · {formatPrice(order.total)} · {statusLabel[order.status]}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="block text-sm font-bold">
                Order number <span className="font-normal text-muted">(optional)</span>
                <input value={orderCode} onChange={(event) => setOrderCode(event.target.value)} maxLength={20} placeholder="For example ORD-1044" className="field mt-1.5 font-normal" />
              </label>
            )}

            <label className="block text-sm font-bold">
              Subject
              <input required minLength={3} maxLength={150} value={subject} onChange={(event) => setSubject(event.target.value)} className="field mt-1.5 font-normal" placeholder="A few words that sum it up" />
            </label>

            <label className="block text-sm font-bold">
              What happened?
              <textarea
                required
                maxLength={5000}
                rows={6}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                className="field mt-1.5 h-auto py-3 font-normal"
                placeholder="Tell us what happened and what you would like us to do. The more detail, the faster we can sort it."
              />
              <span className="mt-1 block text-right text-xs font-normal text-muted tabular-nums">{message.length} / 5000</span>
            </label>

            {user ? (
              <div>
                <p className="mb-2 text-sm font-bold">Photos <span className="font-normal text-muted">(optional)</span></p>
                <PhotoPicker files={files} onChange={setFiles} disabled={busy} />
              </div>
            ) : (
              <p className="rounded-xl bg-brand-soft px-4 py-3 text-sm text-brand">
                Want to add photos and follow replies here?{' '}
                <Link to="/login" state={{ from: '/help/new' }} className="font-extrabold underline underline-offset-2">
                  Sign in
                </Link>{' '}
                first.
              </p>
            )}

            {error && (
              <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                {error}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
              <p className="text-xs text-muted">{user ? `We will reply to ${user.email}.` : 'We will reply to the email you entered.'}</p>
              <button type="submit" disabled={busy || (!!chosen?.needsOrder && !!user && !orderCode && (orders.data?.length ?? 0) > 0)} className="btn btn-accent btn-lg">
                {busy ? 'Sending…' : 'Send request'}
              </button>
            </div>
          </form>

          <aside className="space-y-4">
            <section className="card p-5">
              <h3 className="font-extrabold">Tips for a quick fix</h3>
              <ul className="mt-3 space-y-2.5 text-sm leading-5 text-ink-soft">
                <li className="flex gap-2">
                  <CheckIcon className="mt-0.5 size-4 shrink-0 text-success" /> Mention the order number and the item.
                </li>
                <li className="flex gap-2">
                  <CheckIcon className="mt-0.5 size-4 shrink-0 text-success" /> For damaged or wrong items, add a photo of the pouch and label.
                </li>
                <li className="flex gap-2">
                  <CheckIcon className="mt-0.5 size-4 shrink-0 text-success" /> For payment issues, add the payment date and reference.
                </li>
              </ul>
            </section>
            {!hideContact && (
            <section className="card p-5">
              <h3 className="font-extrabold">Prefer to talk?</h3>
              <ul className="mt-3 space-y-3 text-sm">
                <li>
                  <a href={`tel:${storePhoneTel}`} className="flex items-center gap-3 font-semibold hover:text-brand">
                    <span className="grid size-9 place-items-center rounded-full bg-brand-soft text-brand">
                      <PhoneIcon className="size-4" />
                    </span>
                    {storePhone}
                  </a>
                </li>
                <li>
                  <a href={`mailto:${storeEmail}`} className="flex min-w-0 items-center gap-3 font-semibold hover:text-brand">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
                      <MailIcon className="size-4" />
                    </span>
                    <span className="truncate">{storeEmail}</span>
                  </a>
                </li>
              </ul>
              <p className="mt-3 text-xs text-muted">Monday to Saturday, 9:00 to 18:00 IST.</p>
            </section>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}
