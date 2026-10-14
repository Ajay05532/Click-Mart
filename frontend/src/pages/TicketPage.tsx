import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Container } from '../components/layout/Container.tsx'
import { CheckIcon, ChevronIcon, SendIcon } from '../components/icons.tsx'
import { HelpNav } from '../components/support/HelpNav.tsx'
import { PhotoPicker } from '../components/support/PhotoPicker.tsx'
import { Badge } from '../components/ui/Primitives.tsx'
import { api, ApiError, errorMessage } from '../lib/api.ts'
import { formatPrice } from '../lib/money.ts'
import { statusLabel, type OrderStatus } from '../lib/orders.ts'
import { formatWhen, isActiveTicket, statusInfo, timeAgo, uploadAttachments, useTicket, type TicketMessage } from '../lib/support.ts'
import { useDocumentTitle } from '../lib/useDocumentTitle.ts'

export function TicketPage() {
  const { code = '' } = useParams()
  useDocumentTitle(code ? `Request ${code}` : 'Request', { noindex: true })
  const client = useQueryClient()
  const query = useTicket(code)
  const ticket = query.data?.ticket
  const messages = query.data?.messages ?? []
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [rating, setRating] = useState(0)
  const [ratingNote, setRatingNote] = useState('')
  const [rated, setRated] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)
  const count = messages.length

  useEffect(() => {
    if (count) bottom.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [count])

  // Opening a request marks it read, so refresh the header dot and list.
  useEffect(() => {
    if (ticket) void client.invalidateQueries({ queryKey: ['tickets-unread'] })
  }, [ticket?.id, client]) // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['ticket', code] })
    void client.invalidateQueries({ queryKey: ['tickets'] })
    void client.invalidateQueries({ queryKey: ['tickets-unread'] })
  }

  const send = async (event: FormEvent) => {
    event.preventDefault()
    if (!text.trim() || sending) return
    setSending(true)
    setError('')
    try {
      const attachments = await uploadAttachments(files)
      await api(`/support/tickets/${encodeURIComponent(code)}/messages`, { body: { message: text, attachments } })
      setText('')
      setFiles([])
      refresh()
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setSending(false)
    }
  }

  const resolve = async () => {
    setError('')
    try {
      await api(`/support/tickets/${encodeURIComponent(code)}/resolve`, { method: 'POST' })
      setConfirming(false)
      refresh()
    } catch (failure) {
      setError(errorMessage(failure))
    }
  }

  const sendRating = async () => {
    if (!rating) return
    try {
      await api(`/support/tickets/${encodeURIComponent(code)}/rating`, { body: { rating, comment: ratingNote || undefined } })
      setRated(true)
      refresh()
    } catch (failure) {
      setError(errorMessage(failure))
    }
  }

  if (query.isLoading) {
    return (
      <div className="bg-canvas">
        <HelpNav />
        <Container className="py-10">
          <div className="card mx-auto h-96 max-w-4xl animate-pulse" aria-busy="true" />
        </Container>
      </div>
    )
  }

  if (query.isError || !ticket) {
    const missing = query.error instanceof ApiError && query.error.status === 404
    return (
      <div className="bg-canvas">
        <HelpNav />
        <Container className="py-16">
          <div className="card mx-auto max-w-md px-6 py-12 text-center">
            <p className="text-lg font-extrabold">{missing ? 'We could not find that request' : 'We could not load this request'}</p>
            <p className="mt-2 text-sm text-muted">{missing ? 'It may belong to a different account.' : 'Please check your connection and try again.'}</p>
            <div className="mt-6 flex justify-center gap-3">
              {!missing && (
                <button type="button" onClick={() => void query.refetch()} className="btn btn-brand btn-sm">
                  Try again
                </button>
              )}
              <Link to="/help/tickets" className="btn btn-outline btn-sm">
                My requests
              </Link>
            </div>
          </div>
        </Container>
      </div>
    )
  }

  const info = statusInfo[ticket.status]
  const active = isActiveTicket(ticket.status)
  const closed = ticket.status === 'CLOSED'
  const canRate = (ticket.status === 'RESOLVED' || closed) && !ticket.rating && !rated

  return (
    <div className="bg-canvas">
      <HelpNav />
      <Container className="py-6 sm:py-8">
        <div className="mx-auto max-w-5xl">
          <Link to="/help/tickets" className="inline-flex items-center gap-1 text-sm font-bold text-muted hover:text-brand">
            <ChevronIcon dir="left" className="size-4" /> My requests
          </Link>

          <header className="mt-3 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{ticket.subject}</h1>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                <span className="font-mono font-bold text-ink-soft">{ticket.code}</span>
                <span>{ticket.categoryLabel}</span>
                <span>Opened {formatWhen(ticket.createdAt)}</span>
              </p>
            </div>
            <Badge tone={info.tone}>{info.label}</Badge>
          </header>

          <div className={`mt-4 rounded-2xl px-4 py-3 text-sm font-semibold ${ticket.status === 'WAITING_CUSTOMER' ? 'bg-orange-50 text-accent-dark' : ticket.status === 'RESOLVED' ? 'bg-emerald-50 text-success' : 'bg-brand-soft text-brand'}`} role="status">
            {info.note}
          </div>

          <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
            <section className="card overflow-hidden" aria-label="Conversation">
              <ol className="max-h-[34rem] min-h-48 space-y-5 overflow-y-auto bg-canvas/50 p-4 sm:p-6">
                {messages.map((message) => (
                  <Bubble key={message.id} message={message} />
                ))}
                <div ref={bottom} />
              </ol>

              {canRate && (
                <div className="border-t border-line bg-white px-5 py-5 sm:px-6">
                  <p className="font-extrabold">How did we do?</p>
                  <div className="mt-2 flex items-center gap-1" role="radiogroup" aria-label="Rate our support">
                    {[1, 2, 3, 4, 5].map((value) => (
                      <button key={value} type="button" role="radio" aria-checked={rating === value} aria-label={`${value} out of 5`} onClick={() => setRating(value)} className="p-0.5 text-3xl leading-none transition hover:scale-110">
                        <span className={value <= rating ? 'text-star' : 'text-line'}>★</span>
                      </button>
                    ))}
                  </div>
                  {rating > 0 && (
                    <div className="motion-fade mt-3 flex flex-col gap-3 sm:flex-row">
                      <input value={ratingNote} onChange={(event) => setRatingNote(event.target.value)} maxLength={500} placeholder="Anything we could do better? (optional)" className="field flex-1" />
                      <button type="button" onClick={() => void sendRating()} className="btn btn-brand">
                        Submit
                      </button>
                    </div>
                  )}
                </div>
              )}
              {(ticket.rating || rated) && (
                <p className="flex items-center gap-2 border-t border-line bg-white px-5 py-4 text-sm font-semibold text-success sm:px-6">
                  <CheckIcon className="size-4" /> Thanks for rating this conversation.
                </p>
              )}

              {closed ? (
                <div className="border-t border-line bg-white px-5 py-5 text-sm sm:px-6">
                  <p className="font-bold">This request is closed.</p>
                  <p className="mt-1 text-muted">Need more help? Start a new request and mention {ticket.code}.</p>
                  <Link to="/help/new" className="btn btn-accent btn-sm mt-3">
                    New request
                  </Link>
                </div>
              ) : (
                <form onSubmit={(event) => void send(event)} className="border-t border-line bg-white p-4 sm:p-5">
                  <label htmlFor="reply" className="sr-only">
                    Your reply
                  </label>
                  <textarea
                    id="reply"
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    onKeyDown={(event) => {
                      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') void send(event)
                    }}
                    rows={3}
                    maxLength={5000}
                    placeholder={ticket.status === 'RESOLVED' ? 'Reply to re-open this request…' : 'Write your reply…'}
                    className="field h-auto py-3"
                  />
                  <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
                    <PhotoPicker files={files} onChange={setFiles} disabled={sending} compact />
                    <button type="submit" disabled={sending || !text.trim()} className="btn btn-accent">
                      <SendIcon className="size-4" /> {sending ? 'Sending…' : 'Send'}
                    </button>
                  </div>
                  {error && (
                    <p role="alert" className="mt-3 text-sm font-semibold text-rose-600">
                      {error}
                    </p>
                  )}
                </form>
              )}
            </section>

            <aside className="space-y-4">
              {ticket.order && (
                <section className="card p-5">
                  <h2 className="text-sm font-extrabold tracking-wide text-muted uppercase">About this order</h2>
                  <Link to={`/order/${ticket.order.code}`} className="mt-3 block rounded-xl p-3 ring-1 ring-line transition hover:bg-canvas hover:ring-brand">
                    <span className="block font-extrabold text-brand">{ticket.order.code}</span>
                    <span className="mt-0.5 block text-sm text-ink-soft">
                      {statusLabel[ticket.order.status as OrderStatus] ?? ticket.order.status} · {formatPrice(ticket.order.total)}
                    </span>
                  </Link>
                </section>
              )}

              <section className="card p-5 text-sm">
                <h2 className="text-sm font-extrabold tracking-wide text-muted uppercase">Details</h2>
                <dl className="mt-3 space-y-2.5">
                  <Row label="Reference" value={ticket.code} mono />
                  <Row label="Topic" value={ticket.categoryLabel} />
                  <Row label="Last update" value={timeAgo(ticket.lastMessageAt)} />
                </dl>
                {active && !confirming && (
                  <button type="button" onClick={() => setConfirming(true)} className="btn btn-outline btn-sm mt-4 w-full">
                    <CheckIcon className="size-4" /> This is solved
                  </button>
                )}
                {active && confirming && (
                  <div className="motion-fade mt-4 rounded-xl bg-canvas p-3">
                    <p className="font-bold">Mark this as resolved?</p>
                    <p className="mt-0.5 text-xs text-muted">You can reply later to re-open it.</p>
                    <div className="mt-3 flex gap-2">
                      <button type="button" onClick={() => void resolve()} className="btn btn-brand btn-sm flex-1">
                        Yes
                      </button>
                      <button type="button" onClick={() => setConfirming(false)} className="btn btn-outline btn-sm flex-1">
                        Not yet
                      </button>
                    </div>
                  </div>
                )}
              </section>
            </aside>
          </div>
        </div>
      </Container>
    </div>
  )
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={`text-right font-bold ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  )
}

function Bubble({ message }: { message: TicketMessage }) {
  if (message.authorRole === 'SYSTEM') {
    return (
      <li className="flex justify-center">
        <span className="rounded-full bg-white px-4 py-1.5 text-center text-xs font-semibold text-muted ring-1 ring-line">{message.body}</span>
      </li>
    )
  }
  const mine = message.authorRole === 'CUSTOMER'
  return (
    <li className={`flex gap-3 ${mine ? 'flex-row-reverse' : ''}`}>
      <span className={`grid size-9 shrink-0 place-items-center rounded-full text-xs font-extrabold ${mine ? 'bg-ink-soft text-white' : 'bg-accent text-white'}`} aria-hidden="true">
        {mine ? 'You' : 'C'}
      </span>
      <div className={`max-w-[85%] ${mine ? 'items-end text-right' : ''}`}>
        <p className="text-xs font-bold text-muted">
          {mine ? 'You' : `${message.authorName.split(' ')[0]} · ClickMart Support`} <span className="font-medium">· {formatWhen(message.createdAt)}</span>
        </p>
        <div className={`mt-1 inline-block rounded-2xl px-4 py-3 text-left text-sm leading-6 whitespace-pre-line shadow-sm ${mine ? 'rounded-tr-md bg-brand text-white' : 'rounded-tl-md bg-white text-ink ring-1 ring-line'}`}>{message.body}</div>
        {message.attachments.length > 0 && (
          <div className={`mt-2 flex flex-wrap gap-2 ${mine ? 'justify-end' : ''}`}>
            {message.attachments.map((src) => (
              <a key={src} href={src} target="_blank" rel="noreferrer" aria-label="Open photo">
                <img src={src} alt="Attachment" className="size-20 rounded-xl object-cover ring-1 ring-line transition hover:opacity-90" />
              </a>
            ))}
          </div>
        )}
      </div>
    </li>
  )
}
