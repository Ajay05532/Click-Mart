import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api.ts'
import { useAuth } from '../auth.tsx'
import { useAction } from '../hooks.ts'
import { dateTime, inr, label, minutesText, timeAgo } from '../format.ts'
import type { CannedReply, Order, SupportMessage, SupportTicket, TicketPriority, TicketStatus } from '../types.ts'
import { Badge, Button, Card, ErrorState, PageLoader, Select, Textarea, errorMessage } from '../ui.tsx'
import { dueLabel, fillReply, priorityTone, statusText, statusTone } from '../supportMeta.ts'

type Detail = { ticket: SupportTicket; messages: SupportMessage[]; order: Order | null; history: { id: string; code: string; subject: string; status: TicketStatus; createdAt: string }[] }

const statuses: TicketStatus[] = ['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED']
const priorities: TicketPriority[] = ['URGENT', 'HIGH', 'NORMAL', 'LOW']
/** Uploads reply photos and returns their public URLs. */
async function uploadPhotos(list: File[]) {
  const form = new FormData()
  for (const file of list) form.append('images', file)
  return (await api<{ urls: string[] }>('/support/attachments', { form })).urls
}

const KEYS = ['support-ticket', 'support-tickets', 'support-stats', 'summary']

export function SupportTicketPage() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const query = useQuery({ queryKey: ['support-ticket', id], queryFn: () => api<Detail>(`/admin/support/tickets/${id}`), refetchInterval: 15_000 })
  const agents = useQuery({ queryKey: ['support-agents'], queryFn: () => api<{ items: { id: string; name: string; role: string }[] }>('/admin/support/agents').then((r) => r.items), staleTime: 5 * 60_000 })
  const canned = useQuery({ queryKey: ['support-canned'], queryFn: () => api<{ items: CannedReply[] }>('/admin/support/canned').then((r) => r.items), staleTime: 60_000 })

  const [mode, setMode] = useState<'reply' | 'note'>('reply')
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const picker = useRef<HTMLInputElement>(null)
  const bottom = useRef<HTMLDivElement>(null)
  const count = query.data?.messages.length ?? 0
  useEffect(() => {
    if (count) bottom.current?.scrollIntoView({ block: 'nearest' })
  }, [count])

  const patch = useAction((body: Partial<{ status: TicketStatus; priority: TicketPriority; assigneeId: string | null }>) => api(`/admin/support/tickets/${id}`, { method: 'PATCH', body }), { success: 'Ticket updated', invalidate: KEYS })
  const send = useAction(
    async (args: { resolve: boolean }) => {
      let urls: string[] = []
      if (files.length) {
        setUploading(true)
        try {
          urls = await uploadPhotos(files)
        } finally {
          setUploading(false)
        }
      }
      return api(`/admin/support/tickets/${id}/messages`, { body: { body: text, internal: mode === 'note', resolve: args.resolve, attachments: urls } })
    },
    {
      success: () => (mode === 'note' ? 'Note added' : 'Reply sent'),
      invalidate: KEYS,
      onDone: () => {
        setText('')
        setFiles([])
      },
    },
  )

  if (query.isLoading) return <PageLoader />
  if (query.error || !query.data) return <Card><ErrorState error={query.error} retry={() => void query.refetch()} /></Card>
  const { ticket, messages, order, history } = query.data
  const closed = ticket.status === 'CLOSED'
  const first = ticket.customer.name.split(' ')[0]
  const due = dueLabel(ticket)

  const insertReply = (replyId: string) => {
    const reply = canned.data?.find((item) => item.id === replyId)
    if (!reply) return
    const body = fillReply(reply.body, {
      name: first,
      agent: user?.name.split(' ')[0] ?? 'ClickMart Support',
      ticket: ticket.code,
      order: order?.code ?? ticket.order?.code ?? 'your order',
      total: order ? inr(order.total) : '',
      status: order ? label(order.status).toLowerCase() : '',
      tracking: order?.trackingNumber ?? 'not available yet',
    })
    setText((current) => (current ? `${current}\n\n${body}` : body))
    setMode('reply')
  }

  return (
    <>
      <div className="mb-5">
        <Link to="/support" className="text-sm font-bold text-muted hover:text-brand">← All tickets</Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[1.5rem] leading-tight font-extrabold tracking-tight">{ticket.subject}</h1>
            <p className="mt-1 text-sm text-muted">
              <span className="font-mono font-bold text-brand">{ticket.code}</span> · {ticket.categoryLabel} · opened {dateTime(ticket.createdAt)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={priorityTone[ticket.priority]}>{label(ticket.priority)} priority</Badge>
            <Badge tone={statusTone[ticket.status]}>{statusText[ticket.status]}</Badge>
          </div>
        </div>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card className="overflow-hidden">
          <ol className="max-h-[36rem] min-h-56 space-y-4 overflow-y-auto bg-canvas/60 p-5">
            {messages.map((message) => (
              <Message key={message.id} message={message} />
            ))}
            <div ref={bottom} />
          </ol>

          <div className="border-t border-line bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-1 rounded-xl bg-canvas p-1" role="tablist">
                {(['reply', 'note'] as const).map((value) => (
                  <button key={value} type="button" role="tab" aria-selected={mode === value} onClick={() => setMode(value)} className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${mode === value ? (value === 'note' ? 'bg-amber-100 text-amber-800 shadow-sm' : 'bg-white text-ink shadow-sm') : 'text-muted hover:text-ink'}`}>
                    {value === 'reply' ? 'Reply to customer' : 'Internal note'}
                  </button>
                ))}
              </div>
              {canned.data && canned.data.length > 0 && mode === 'reply' && (
                <Select aria-label="Insert a saved reply" value="" onChange={(event) => insertReply(event.target.value)} className="!h-9 !w-auto !text-xs">
                  <option value="">Insert saved reply…</option>
                  {canned.data.map((reply) => (
                    <option key={reply.id} value={reply.id}>
                      {reply.title}
                    </option>
                  ))}
                </Select>
              )}
            </div>
            {closed && mode === 'reply' && <p className="mb-3 rounded-xl bg-canvas px-3 py-2 text-xs text-muted">This ticket is closed, so the customer cannot answer it. Re-open it first if you want a conversation.</p>}
            <Textarea
              rows={5}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={mode === 'note' ? 'Only your team can see this note…' : `Write to ${first}…`}
              className={`h-auto py-3 ${mode === 'note' ? '!border-amber-300 !bg-amber-50/60' : ''}`}
              maxLength={5000}
            />
            {files.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {files.map((file, index) => (
                  <span key={`${file.name}-${index}`} className="inline-flex items-center gap-1.5 rounded-lg bg-canvas px-2.5 py-1 text-xs font-semibold">
                    {file.name}
                    <button type="button" aria-label={`Remove ${file.name}`} onClick={() => setFiles(files.filter((_, i) => i !== index))} className="text-muted hover:text-rose-600">✕</button>
                  </span>
                ))}
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                {mode === 'reply' && (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => picker.current?.click()} disabled={files.length >= 3}>📎 Attach photo</Button>
                    <input ref={picker} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => { const next = Array.from(event.target.files ?? []); if (next.length) setFiles([...files, ...next].slice(0, 3)); event.target.value = '' }} />
                  </>
                )}
              </div>
              <div className="flex gap-2">
                {mode === 'reply' && !closed && (
                  <Button variant="outline" disabled={!text.trim()} loading={(send.isPending || uploading) && send.variables?.resolve} onClick={() => send.mutate({ resolve: true })}>Send &amp; resolve</Button>
                )}
                <Button variant={mode === 'note' ? 'soft' : 'accent'} disabled={!text.trim()} loading={(send.isPending || uploading) && !send.variables?.resolve} onClick={() => send.mutate({ resolve: false })}>
                  {mode === 'note' ? 'Add note' : 'Send reply'}
                </Button>
              </div>
            </div>
            {send.isError && <p role="alert" className="mt-2 text-xs font-semibold text-rose-600">{errorMessage(send.error)}</p>}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="space-y-4 p-5">
            <div>
              <p className="mb-1.5 text-xs font-bold text-ink-soft">Status</p>
              <Select aria-label="Status" value={ticket.status} disabled={patch.isPending} onChange={(event) => patch.mutate({ status: event.target.value as TicketStatus })}>
                {statuses.map((value) => (
                  <option key={value} value={value}>
                    {statusText[value]}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-bold text-ink-soft">Priority</p>
              <Select aria-label="Priority" value={ticket.priority} disabled={patch.isPending} onChange={(event) => patch.mutate({ priority: event.target.value as TicketPriority })}>
                {priorities.map((value) => (
                  <option key={value} value={value}>
                    {label(value)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-xs font-bold text-ink-soft">Owner</p>
                {user && ticket.assignee?.id !== user.id && (
                  <button type="button" className="text-xs font-bold text-brand hover:underline" onClick={() => patch.mutate({ assigneeId: user.id })}>
                    Assign to me
                  </button>
                )}
              </div>
              <Select aria-label="Owner" value={ticket.assignee?.id ?? ''} disabled={patch.isPending} onChange={(event) => patch.mutate({ assigneeId: event.target.value || null })}>
                <option value="">Unassigned</option>
                {(agents.data ?? []).map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                    {agent.id === user?.id ? ' (you)' : ''}
                  </option>
                ))}
              </Select>
            </div>
            <dl className="space-y-2 border-t border-line pt-4 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">First reply</dt>
                <dd className="font-bold">{ticket.firstResponseAt ? minutesText(Math.round((new Date(ticket.firstResponseAt).getTime() - new Date(ticket.createdAt).getTime()) / 60000)) : due ? <span className={ticket.overdue ? 'text-rose-600' : ''}>{due}</span> : 'Not yet'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Last activity</dt>
                <dd className="font-bold">{timeAgo(ticket.lastMessageAt)}</dd>
              </div>
              {ticket.rating && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Customer rating</dt>
                  <dd className="font-bold text-amber-500">{'★'.repeat(ticket.rating)}<span className="text-slate-300">{'★'.repeat(5 - ticket.rating)}</span></dd>
                </div>
              )}
            </dl>
            {ticket.ratingComment && <p className="rounded-xl bg-canvas px-3 py-2 text-xs text-ink-soft">“{ticket.ratingComment}”</p>}
          </Card>

          <Card className="p-5">
            <h2 className="text-xs font-bold tracking-wider text-muted uppercase">Customer</h2>
            <p className="mt-2 font-extrabold">{ticket.customer.name}</p>
            <p className="mt-0.5 text-sm"><a href={`mailto:${ticket.customer.email}`} className="text-brand hover:underline">{ticket.customer.email}</a></p>
            {ticket.customer.phone && <p className="mt-0.5 text-sm"><a href={`tel:${ticket.customer.phone}`} className="text-ink-soft hover:underline">{ticket.customer.phone}</a></p>}
            <p className="mt-2 text-xs text-muted">{ticket.customer.id ? 'Signed-in customer' : 'Guest. Replies go to their email only.'}</p>
            {history.length > 0 && (
              <div className="mt-4 border-t border-line pt-3">
                <p className="text-[11px] font-bold tracking-wider text-muted uppercase">Earlier tickets</p>
                <ul className="mt-2 space-y-1.5">
                  {history.map((item) => (
                    <li key={item.id}>
                      <Link to={`/support/${item.id}`} className="flex items-center justify-between gap-2 text-xs hover:text-brand">
                        <span className="min-w-0 truncate"><span className="font-mono font-bold">{item.code}</span> {item.subject}</span>
                        <Badge tone={statusTone[item.status]}>{statusText[item.status]}</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          {order && (
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold tracking-wider text-muted uppercase">Order</h2>
                <Link to={`/orders?open=${order.id}`} className="text-xs font-bold text-brand hover:underline">Open order →</Link>
              </div>
              <p className="mt-2 font-extrabold text-brand">{order.code}</p>
              <p className="mt-0.5 text-xs text-muted">
                {label(order.status)} · {order.paymentMethod} {label(order.paymentStatus)} · placed {dateTime(order.placedAt)}
              </p>
              <ul className="mt-3 space-y-1.5 text-sm">
                {order.items.map((item) => (
                  <li key={item.id} className="flex justify-between gap-3">
                    <span className="min-w-0 truncate">{item.name} <span className="text-muted">· {item.size} × {item.quantity}</span></span>
                    <span className="font-semibold tabular-nums">{inr(item.unitPrice * item.quantity)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 flex justify-between border-t border-line pt-3 text-sm font-extrabold">
                <span>Total</span>
                <span className="tabular-nums">{inr(order.total)}</span>
              </p>
              {(order.carrier || order.trackingNumber) && <p className="mt-2 text-xs text-muted">{order.carrier ?? 'Courier'}{order.trackingNumber ? ` · ${order.trackingNumber}` : ''}</p>}
              <p className="mt-2 text-xs text-muted">{order.address.city}, {order.address.state} {order.address.pin}</p>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}

function Message({ message }: { message: SupportMessage }) {
  if (message.authorRole === 'SYSTEM') {
    return (
      <li className="flex justify-center">
        <span className={`rounded-full px-3.5 py-1 text-center text-[11px] font-semibold ring-1 ${message.isInternal ? 'bg-white text-muted ring-line' : 'bg-brand-soft text-brand ring-transparent'}`}>
          {message.body}
          {message.isInternal ? '' : ' (shown to customer)'} · {timeAgo(message.createdAt)}
        </span>
      </li>
    )
  }
  const staff = message.authorRole === 'STAFF'
  return (
    <li className={`flex ${staff ? 'justify-end' : ''}`}>
      <div className={`max-w-[88%] ${staff ? 'text-right' : ''}`}>
        <p className="text-[11px] font-bold text-muted">
          {message.authorName} {message.isInternal && <Badge tone="orange">Internal note</Badge>} <span className="font-medium">· {dateTime(message.createdAt)}</span>
        </p>
        <div className={`mt-1 inline-block rounded-2xl px-4 py-2.5 text-left text-sm leading-6 whitespace-pre-line ${message.isInternal ? 'border border-amber-300 bg-amber-50 text-amber-950' : staff ? 'bg-brand text-white' : 'bg-white ring-1 ring-line'}`}>{message.body}</div>
        {message.attachments.length > 0 && (
          <div className={`mt-2 flex flex-wrap gap-2 ${staff ? 'justify-end' : ''}`}>
            {message.attachments.map((src) => (
              <a key={src} href={src} target="_blank" rel="noreferrer">
                <img src={src} alt="Attachment" className="size-20 rounded-xl object-cover ring-1 ring-line hover:opacity-90" />
              </a>
            ))}
          </div>
        )}
      </div>
    </li>
  )
}
