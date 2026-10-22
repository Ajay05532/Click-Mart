import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, openHtml } from '../api.ts'
import { useAuth } from '../auth.tsx'
import { useAction } from '../hooks.ts'
import { dateTime, inr, label } from '../format.ts'
import type { Order, OrderStatus, Paged } from '../types.ts'
import { Badge, Button, Card, Drawer, EmptyState, ErrorState, Field, Input, Modal, PageHeader, PageLoader, Pagination, SearchBox, Table, Tabs, Td, Textarea, Thumb, errorMessage, useUi, type Tone } from '../ui.tsx'

type DeliveryRate = {
  deliverable: boolean
  reason: string | null
  weightGrams: number
  couriers: { courierId: string; courierName: string; courierType: string; tatDays: number | null; ratePaise: number }[]
  cheapest: { courierId: string; courierName: string; courierType: string; tatDays: number | null; ratePaise: number } | null
}

const statusTone: Record<OrderStatus, Tone> = { PLACED: 'gray', CONFIRMED: 'blue', PACKED: 'blue', SHIPPED: 'orange', OUT_FOR_DELIVERY: 'orange', DELIVERED: 'green', CANCELLED: 'red', RETURNED: 'red' }
export const OrderStatusBadge = ({ status }: { status: OrderStatus }) => <Badge tone={statusTone[status]}>{label(status)}</Badge>
const payTone = { PENDING: 'orange', PAID: 'green', FAILED: 'red', REFUNDED: 'gray' } as const

const tabs: { id: string; label: string }[] = [
  { id: '', label: 'All' },
  { id: 'PLACED', label: 'New' },
  { id: 'CONFIRMED', label: 'To pack' },
  { id: 'PACKED', label: 'To ship' },
  { id: 'SHIPPED', label: 'Shipped' },
  { id: 'OUT_FOR_DELIVERY', label: 'Out for delivery' },
  { id: 'DELIVERED', label: 'Delivered' },
  { id: 'CANCELLED', label: 'Cancelled' },
  { id: 'RETURNED', label: 'Returned' },
]

export function OrdersPage() {
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? ''
  const q = params.get('q') ?? ''
  const page = Number(params.get('page') ?? 1)
  const open = params.get('open')
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    if (!('page' in patch) && !('open' in patch)) next.delete('page')
    setParams(next, { replace: true })
  }

  const list = useQuery({ queryKey: ['orders', status, q, page], queryFn: () => api<Paged<Order> & { statusCounts: Record<string, number> }>('/admin/orders', { query: { status, q, page } }), placeholderData: (prev) => prev })
  const counts = list.data?.statusCounts ?? {}
  const { toast } = useUi()
  // The selection belongs to the page it was made on: changing the filter, search or page clears it.
  const selectionKey = `${status}|${q}|${page}`
  const [selection, setSelection] = useState<{ key: string; ids: string[] }>({ key: selectionKey, ids: [] })
  const picked = selection.key === selectionKey ? selection.ids : []
  const pickIds = (ids: string[]) => setSelection({ key: selectionKey, ids })
  const pageOrders = list.data?.items ?? []
  const chosen = pageOrders.filter((order) => picked.includes(order.id))
  const allOn = (target: OrderStatus) => chosen.length > 0 && chosen.every((order) => order.status === target)
  const print = (kind: 'packing-slips' | 'pick-list' | 'labels') => openHtml(`/admin/print/${kind}?ids=${picked.join(',')}`).catch((error) => toast(errorMessage(error), 'error'))
  const bulkStatus = useAction((to: 'CONFIRMED' | 'PACKED') => api<{ results: { id: string; ok: boolean; message?: string }[] }>('/admin/orders/bulk-status', { body: { ids: picked, status: to } }), {
    success: (result) => {
      const failed = result.results.filter((item) => !item.ok)
      return failed.length ? `${result.results.length - failed.length} updated, ${failed.length} could not be changed: ${failed[0].message}` : `${result.results.length} order${result.results.length === 1 ? '' : 's'} updated`
    },
    invalidate: ['orders', 'summary'],
    onDone: () => pickIds([]),
  })
  const all = Object.values(counts).reduce((sum, n) => sum + n, 0)

  return (
    <>
      <PageHeader title="Orders" subtitle="Pack, ship and track every order." actions={<SearchBox value={q} onChange={(value) => set({ q: value || null })} placeholder="Search name, phone or order no." />} />
      <div className="mb-4">
        <Tabs value={status} onChange={(value) => set({ status: value || null })} items={tabs.map((tab) => ({ ...tab, count: tab.id ? counts[tab.id] ?? 0 : all }))} />
      </div>
      <Card>
        {list.isLoading ? <PageLoader /> : list.error ? <ErrorState error={list.error} retry={() => void list.refetch()} /> : list.data!.items.length === 0 ? (
          <EmptyState title="No orders here" text="Orders matching this filter will show up here." />
        ) : (
          <>
            {picked.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-b border-line bg-brand-soft/60 px-5 py-3">
                <span className="mr-1 text-sm font-extrabold">{picked.length} selected</span>
                <Button size="sm" variant="outline" onClick={() => void print('packing-slips')}>Packing slips</Button>
                <Button size="sm" variant="outline" onClick={() => void print('pick-list')}>Pick list</Button>
                <Button size="sm" variant="outline" onClick={() => void print('labels')}>Address labels</Button>
                {allOn('PLACED') && <Button size="sm" variant="primary" loading={bulkStatus.isPending} onClick={() => bulkStatus.mutate('CONFIRMED')}>Confirm {picked.length}</Button>}
                {allOn('CONFIRMED') && <Button size="sm" variant="primary" loading={bulkStatus.isPending} onClick={() => bulkStatus.mutate('PACKED')}>Mark {picked.length} as packed</Button>}
                {!allOn('PLACED') && !allOn('CONFIRMED') && <span className="text-xs text-muted">Select orders with the same status to confirm or pack them together.</span>}
                <Button size="sm" variant="ghost" className="ml-auto" onClick={() => pickIds([])}>Clear</Button>
              </div>
            )}
            <Table head={[<input key="all" type="checkbox" aria-label="Select every order on this page" className="size-4 cursor-pointer accent-[var(--color-brand)]" checked={pageOrders.length > 0 && chosen.length === pageOrders.length} onChange={(event) => pickIds(event.target.checked ? pageOrders.map((order) => order.id) : [])} />, 'Order', 'Customer', 'Items', 'Total', 'Payment', 'Status', 'Placed']}>
              {list.data!.items.map((order) => (
                <tr key={order.id} onClick={() => set({ open: order.id })} className={`cursor-pointer hover:bg-canvas/60 ${picked.includes(order.id) ? 'bg-brand-soft/40' : ''}`}>
                  <Td className="w-10"><input type="checkbox" aria-label={`Select order ${order.code}`} className="size-4 cursor-pointer accent-[var(--color-brand)]" checked={picked.includes(order.id)} onClick={(event) => event.stopPropagation()} onChange={(event) => pickIds(event.target.checked ? [...picked, order.id] : picked.filter((id) => id !== order.id))} /></Td>
                  <Td className="font-bold text-brand">{order.code}</Td>
                  <Td><p className="font-semibold">{order.customer.name}</p><p className="text-xs text-muted">{order.address.city}</p></Td>
                  <Td className="text-muted">{order.items.reduce((sum, item) => sum + item.quantity, 0)}</Td>
                  <Td className="font-semibold">{inr(order.total)}</Td>
                  <Td><div className="flex items-center gap-1.5"><span className="text-xs text-muted">{order.paymentMethod}</span><Badge tone={payTone[order.paymentStatus]}>{label(order.paymentStatus)}</Badge></div></Td>
                  <Td><OrderStatusBadge status={order.status} /></Td>
                  <Td className="text-muted">{dateTime(order.placedAt)}</Td>
                </tr>
              ))}
            </Table>
            <Pagination page={list.data!.page} pages={list.data!.pages} total={list.data!.total} onChange={(next) => set({ page: String(next) })} />
          </>
        )}
      </Card>
      {open && <OrderDrawer id={open} onClose={() => set({ open: null })} />}
    </>
  )
}

const nextSteps: Record<OrderStatus, { to: OrderStatus; label: string; primary?: boolean }[]> = {
  PLACED: [{ to: 'CONFIRMED', label: 'Confirm order', primary: true }, { to: 'CANCELLED', label: 'Cancel' }],
  CONFIRMED: [{ to: 'PACKED', label: 'Mark as packed', primary: true }, { to: 'CANCELLED', label: 'Cancel' }],
  PACKED: [{ to: 'SHIPPED', label: 'Mark as shipped', primary: true }],
  SHIPPED: [{ to: 'OUT_FOR_DELIVERY', label: 'Out for delivery', primary: true }, { to: 'DELIVERED', label: 'Mark delivered' }, { to: 'RETURNED', label: 'Returned' }],
  OUT_FOR_DELIVERY: [{ to: 'DELIVERED', label: 'Mark delivered', primary: true }, { to: 'RETURNED', label: 'Returned' }],
  DELIVERED: [{ to: 'RETURNED', label: 'Mark returned' }],
  CANCELLED: [],
  RETURNED: [],
}

function OrderDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { isAdmin } = useAuth()
  const { confirm, toast } = useUi()
  const query = useQuery({ queryKey: ['order', id], queryFn: () => api<{ order: Order }>(`/admin/orders/${id}`).then((r) => r.order) })
  const [step, setStep] = useState<{ to: OrderStatus; label: string } | null>(null)
  const refund = useAction(() => api(`/admin/orders/${id}/refund`, { method: 'POST' }), { success: 'Refund recorded', invalidate: ['order', 'orders'] })
  const order = query.data

  return (
    <Drawer title={order ? `Order ${order.code}` : 'Order'} onClose={onClose}>
      {query.isLoading ? <PageLoader /> : query.error || !order ? <ErrorState error={query.error} /> : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <OrderStatusBadge status={order.status} />
            <Badge tone={payTone[order.paymentStatus]}>{order.payments?.[order.payments.length - 1]?.detail ?? order.paymentMethod} · {label(order.paymentStatus)}</Badge>
            <span className="text-xs text-muted">Placed {dateTime(order.placedAt)}</span>
          </div>

          <div className="flex flex-wrap gap-2">
            {nextSteps[order.status].map((action) => (
              <Button key={action.to} variant={action.primary ? 'accent' : action.to === 'CANCELLED' || action.to === 'RETURNED' ? 'outline' : 'soft'} size="sm" onClick={() => setStep(action)}>{action.label}</Button>
            ))}
            {isAdmin && order.paymentStatus === 'PAID' && (order.status === 'CANCELLED' || order.status === 'RETURNED') && (
              <Button variant="danger" size="sm" loading={refund.isPending} onClick={async () => { if (await confirm({ title: 'Refund this order?', text: `${inr(order.total)} will be returned to the customer's payment method.`, confirmLabel: 'Refund', danger: true })) refund.mutate(undefined) }}>Refund {inr(order.total)}</Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => openHtml(`/admin/orders/${id}/invoice`).catch((error) => toast(errorMessage(error), 'error'))}>Print invoice</Button>
            <Button variant="ghost" size="sm" onClick={() => openHtml(`/admin/print/packing-slips?ids=${id}`).catch((error) => toast(errorMessage(error), 'error'))}>Packing slip</Button>
            <Button variant="ghost" size="sm" onClick={() => openHtml(`/admin/print/labels?ids=${id}`).catch((error) => toast(errorMessage(error), 'error'))}>Label</Button>
          </div>

          <section>
            <h3 className="text-xs font-bold tracking-wider text-muted uppercase">Items</h3>
            <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
              {order.items.map((item) => (
                <li key={item.id} className="flex items-center gap-3 p-3">
                  <Thumb src={item.image} name={item.name} size="size-12" />
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{item.name}</p><p className="text-xs text-muted">{item.size} · {inr(item.unitPrice)} × {item.quantity}</p></div>
                  <p className="text-sm font-bold">{inr(item.unitPrice * item.quantity)}</p>
                </li>
              ))}
            </ul>
            <dl className="mt-3 space-y-1.5 text-sm">
              <Row k="Subtotal" v={inr(order.subtotal)} />
              {order.offerDiscount > 0 && <Row k="Offers" v={`−${inr(order.offerDiscount)}`} green />}
              {order.discount > 0 && <Row k={`Coupon ${order.couponCode ?? ''}`} v={`−${inr(order.discount)}`} green />}
              <Row k="Shipping" v={order.shipping === 0 ? 'Free' : inr(order.shipping)} />
              <div className="flex justify-between border-t border-line pt-2 text-base font-extrabold"><dt>Total</dt><dd>{inr(order.total)}</dd></div>
            </dl>
          </section>

          <div className="grid gap-4 sm:grid-cols-2">
            <section className="rounded-xl bg-canvas p-4 text-sm">
              <h3 className="text-xs font-bold tracking-wider text-muted uppercase">Customer</h3>
              <p className="mt-2 font-bold">{order.customer.name}</p>
              <p className="text-muted">{order.customer.email}</p>
              <p className="text-muted">+91 {order.customer.phone}</p>
            </section>
            <section className="rounded-xl bg-canvas p-4 text-sm">
              <h3 className="text-xs font-bold tracking-wider text-muted uppercase">Ship to</h3>
              <p className="mt-2 leading-6">{order.address.line}, {order.address.city}, {order.address.state} {order.address.pin}</p>
              {order.trackingNumber && <p className="mt-2 text-xs"><span className="text-muted">{order.carrier ?? 'Courier'}:</span> <span className="font-bold">{order.trackingNumber}</span></p>}
            </section>
          </div>

          <DeliveryRateCard orderId={id} />

          <section>
            <h3 className="text-xs font-bold tracking-wider text-muted uppercase">Timeline</h3>
            <ol className="mt-3 space-y-4 border-l-2 border-line pl-5">
              {[...order.events].reverse().map((event, index) => (
                <li key={index} className="relative">
                  <span className={`absolute top-1 -left-[27px] size-3 rounded-full ring-4 ring-white ${index === 0 ? 'bg-accent' : 'bg-slate-300'}`} />
                  <p className="text-sm font-bold">{label(event.status)}</p>
                  {event.note && <p className="text-xs text-muted">{event.note}</p>}
                  <p className="text-[11px] text-muted">{dateTime(event.at)}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
      {step && order && <StatusModal order={order} step={step} onClose={() => setStep(null)} />}
    </Drawer>
  )
}

/** The real courier price for this order's actual weight and route, from NimbusPost. Loads once the drawer opens; cached server-side for an hour per route. */
function DeliveryRateCard({ orderId }: { orderId: string }) {
  const query = useQuery({
    queryKey: ['order-delivery-rate', orderId],
    queryFn: () => api<DeliveryRate>(`/admin/orders/${orderId}/delivery-rate`),
    staleTime: 10 * 60_000,
    retry: false,
  })
  return (
    <section className="rounded-xl border border-line p-4 text-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-bold tracking-wider text-muted uppercase">Delivery charge (NimbusPost)</h3>
        {query.data?.cheapest && <Badge tone="green">Cheapest {inr(Math.round(query.data.cheapest.ratePaise / 100))}</Badge>}
      </div>
      {query.isLoading ? (
        <p className="mt-2 text-xs text-muted">Checking couriers for this route…</p>
      ) : query.error ? (
        <p className="mt-2 text-xs text-accent-dark">{errorMessage(query.error)}</p>
      ) : !query.data?.deliverable ? (
        <p className="mt-2 text-xs text-accent-dark">No courier currently serves this route{query.data?.reason ? ` (${query.data.reason})` : ''}.</p>
      ) : (
        <div className="mt-2 space-y-1.5">
          <p className="text-xs text-muted">For {query.data.weightGrams} g, charged as this order is paying ({query.data.couriers.length} courier{query.data.couriers.length === 1 ? '' : 's'} available)</p>
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
            {query.data.couriers.slice(0, 5).map((courier, index) => (
              <li key={courier.courierId} className={`flex items-center justify-between gap-3 px-3 py-2 ${index === 0 ? 'bg-emerald-50' : ''}`}>
                <span>
                  <span className="font-bold">{courier.courierName}</span>
                  {courier.tatDays != null && <span className="text-xs text-muted"> · {courier.tatDays} day{courier.tatDays === 1 ? '' : 's'}</span>}
                </span>
                <span className="font-bold">{inr(Math.round(courier.ratePaise / 100))}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

const Row = ({ k, v, green }: { k: string; v: string; green?: boolean }) => (
  <div className={`flex justify-between ${green ? 'text-success' : ''}`}><dt className={green ? '' : 'text-muted'}>{k}</dt><dd className="font-semibold">{v}</dd></div>
)

function StatusModal({ order, step, onClose }: { order: Order; step: { to: OrderStatus; label: string }; onClose: () => void }) {
  const shipping = step.to === 'SHIPPED'
  const [note, setNote] = useState('')
  const [carrier, setCarrier] = useState(order.carrier ?? '')
  const [tracking, setTracking] = useState(order.trackingNumber ?? '')
  const save = useAction(
    () => api(`/admin/orders/${order.id}/status`, { method: 'PATCH', body: { status: step.to, note: note || undefined, carrier: carrier || undefined, trackingNumber: tracking || undefined } }),
    { success: `Order marked ${label(step.to).toLowerCase()}`, invalidate: ['order', 'orders', 'summary', 'inventory', 'analytics'], onDone: onClose },
  )
  const destructive = step.to === 'CANCELLED' || step.to === 'RETURNED'
  return (
    <Modal
      title={step.label}
      onClose={onClose}
      footer={<><Button variant="outline" onClick={onClose}>Back</Button><Button variant={destructive ? 'danger' : 'accent'} loading={save.isPending} disabled={shipping && !tracking.trim()} onClick={() => save.mutate(undefined)}>{step.label}</Button></>}
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">
          {destructive ? 'Stock for this order goes back on the shelf. ' : 'The customer is emailed and their tracking page updates. '}
          {step.to === 'CANCELLED' && order.paymentStatus === 'PAID' && order.paymentMethod !== 'COD' && 'The payment is refunded automatically.'}
        </p>
        {shipping && (
          <>
            <Field label="Courier"><Input value={carrier} onChange={(event) => setCarrier(event.target.value)} placeholder="Delhivery, Blue Dart..." /></Field>
            <Field label="Tracking number *"><Input value={tracking} onChange={(event) => setTracking(event.target.value)} placeholder="AWB / consignment no." /></Field>
          </>
        )}
        <Field label="Note for the timeline (optional)"><Textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} /></Field>
      </div>
    </Modal>
  )
}
