import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, errorMessage } from '../../lib/api.ts'
import { isEnded, type ApiOrder } from '../../lib/orders.ts'
import { statusInfo, timeAgo, useMyTickets, type TopicId } from '../../lib/support.ts'
import { Badge } from '../ui/Primitives.tsx'
import { HelpIcon } from '../icons.tsx'

const reasons = ['I ordered by mistake', 'I found a better price', 'Delivery is taking too long', 'I want to change the items or address', 'Something else']

/** Order-specific help: cancel while it is early, shortcuts to the right topic, and past requests. */
export function OrderHelp({ order }: { order: ApiOrder }) {
  const client = useQueryClient()
  const existing = useMyTickets('all', order.code).data?.items ?? []
  const [cancelling, setCancelling] = useState(false)
  const [reason, setReason] = useState(reasons[0])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const canCancel = order.status === 'PLACED' || order.status === 'CONFIRMED'
  const locked =
    order.status === 'PACKED'
      ? 'This order is packed for delivery, so it can no longer be cancelled.'
      : order.status === 'SHIPPED'
        ? 'This order has shipped, so it can no longer be cancelled.'
        : order.status === 'OUT_FOR_DELIVERY'
          ? 'This order is out for delivery, so it can no longer be cancelled.'
          : ''
  const delivered = order.status === 'DELIVERED'
  const ended = isEnded(order.status)

  const issues: { topic: TopicId; label: string }[] = ended
    ? [{ topic: 'PAYMENT', label: 'Refund status' }]
    : delivered
      ? [
          { topic: 'PRODUCT_QUALITY', label: 'Damaged or not fresh' },
          { topic: 'WRONG_OR_MISSING', label: 'Wrong or missing item' },
          { topic: 'REFUND_RETURN', label: 'Return or replace' },
        ]
      : [
          { topic: 'ORDER_STATUS', label: 'Where is my order?' },
          { topic: 'DELIVERY', label: 'Delivery problem' },
          { topic: 'PAYMENT', label: 'Payment problem' },
        ]

  const cancel = async () => {
    setBusy(true)
    setError('')
    try {
      await api(`/orders/${encodeURIComponent(order.code)}/cancel`, { body: { reason } })
      void client.invalidateQueries({ queryKey: ['order'] })
      void client.invalidateQueries({ queryKey: ['orders'] })
      setCancelling(false)
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-5 grid grid-cols-1 items-start gap-5 print:hidden lg:grid-cols-2">
      {(canCancel || locked) && (
        <section className="card p-5" aria-labelledby="order-cancel-title">
          <h2 id="order-cancel-title" className="text-xs font-extrabold tracking-[0.14em] text-muted uppercase">Cancel order</h2>

          {canCancel && !cancelling && (
            <>
              <p className="mt-3 font-extrabold">Changed your mind?</p>
              <p className="mt-1 text-sm leading-6 text-muted">
                You can cancel until we pack this for delivery.
                {order.paymentMethod !== 'COD' && order.paymentStatus === 'PAID' ? ' A paid order is refunded to the original payment method.' : ''}
              </p>
              <button type="button" onClick={() => setCancelling(true)} className="btn btn-outline mt-4">
                Cancel this order
              </button>
            </>
          )}

          {canCancel && cancelling && (
            <fieldset className="motion-fade mt-3">
              <legend className="sr-only">Why are you cancelling?</legend>
              <p className="font-extrabold">Why are you cancelling?</p>
              <div className="mt-3 space-y-2">
                {reasons.map((item) => (
                  <label key={item} className="flex cursor-pointer items-start gap-2.5 text-sm leading-5">
                    <input type="radio" name="cancel-reason" checked={reason === item} onChange={() => setReason(item)} className="mt-0.5 size-4 accent-[var(--color-brand)]" />
                    {item}
                  </label>
                ))}
              </div>
              {error && (
                <p role="alert" className="mt-3 text-sm font-semibold text-rose-600">
                  {error}
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" disabled={busy} onClick={() => void cancel()} className="btn btn-brand btn-sm">
                  {busy ? 'Cancelling…' : 'Yes, cancel it'}
                </button>
                <button type="button" disabled={busy} onClick={() => setCancelling(false)} className="btn btn-outline btn-sm">
                  Keep order
                </button>
              </div>
            </fieldset>
          )}

          {locked && (
            <>
              <p className="mt-3 font-extrabold">Packed for delivery</p>
              <p className="mt-1 text-sm leading-6 text-muted">{locked}</p>
            </>
          )}
        </section>
      )}

      <section className={`card p-5 ${canCancel || locked ? '' : 'lg:col-span-2'}`} aria-labelledby="order-help-title">
        <h2 id="order-help-title" className="flex items-center gap-2 text-xs font-extrabold tracking-[0.14em] text-muted uppercase">
          <HelpIcon className="size-4 text-brand" /> Need help?
        </h2>
        <p className="mt-3 font-extrabold">{ended ? 'Questions about this order?' : delivered ? 'Something not right?' : 'What is the problem?'}</p>
        {delivered && <p className="mt-1 text-sm leading-6 text-muted">For quality problems, tell us within 48 hours of delivery and add a photo.</p>}
        <ul className="mt-3 flex flex-wrap gap-2">
          {issues.map((issue) => (
            <li key={issue.topic}>
              <Link to={`/help/new?topic=${issue.topic}&order=${order.code}`} className="inline-block rounded-full px-3.5 py-2 text-xs font-bold ring-1 ring-line transition hover:bg-brand-soft hover:text-brand hover:ring-brand">
                {issue.label}
              </Link>
            </li>
          ))}
          <li>
            <Link to={`/help/new?topic=OTHER&order=${order.code}`} className="inline-block rounded-full px-3.5 py-2 text-xs font-bold text-muted ring-1 ring-line transition hover:text-ink">
              Something else
            </Link>
          </li>
        </ul>

        {existing.length > 0 && (
          <div className="mt-5 border-t border-line pt-4">
            <p className="text-xs font-extrabold tracking-wide text-muted uppercase">Your requests for this order</p>
            <ul className="mt-2 space-y-2">
              {existing.slice(0, 3).map((ticket) => (
                <li key={ticket.id}>
                  <Link to={`/help/tickets/${ticket.code}`} className="block rounded-xl p-3 ring-1 ring-line transition hover:bg-canvas hover:ring-brand">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-bold">{ticket.subject}</span>
                      {ticket.unread && <span className="size-2.5 shrink-0 rounded-full bg-accent" aria-label="New reply" />}
                    </span>
                    <span className="mt-1.5 flex items-center justify-between gap-2 text-xs text-muted">
                      <Badge tone={statusInfo[ticket.status].tone}>{statusInfo[ticket.status].label}</Badge>
                      <span>{timeAgo(ticket.lastMessageAt)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  )
}
