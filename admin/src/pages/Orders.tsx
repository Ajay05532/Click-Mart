import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, openHtml } from '../api.ts'
import { useAuth } from '../auth.tsx'
import { useAction } from '../hooks.ts'
import { dateTime, inr, label } from '../format.ts'
import type { Order, OrderStatus, Paged } from '../types.ts'
import { Badge, Button, Card, Drawer, EmptyState, ErrorState, Field, Input, Modal, PageHeader, PageLoader, Pagination, SearchBox, Select, Table, Tabs, Td, Textarea, Thumb, errorMessage, useUi, type Tone } from '../ui.tsx'

type DeliveryRate = {
  deliverable: boolean
  reason: string | null
  weightGrams: number
  couriers: { courierId: string; courierName: string; courierType: string; tatDays: number | null; ratePaise: number }[]
  cheapest: { courierId: string; courierName: string; courierType: string; tatDays: number | null; ratePaise: number } | null
}

type NimbusPostOrder = {
  booked: boolean
  orderId?: string
  orderNumber?: string
  status?: string
  ewayBillNumber?: string | null
  awb?: string | null
  courierName?: string | null
  latest?: { shipStatus: string; location: string; message: string; eventTime: string } | null
  scans?: { timestamp: string; status: string; location: string; remark: string }[]
  trackingUrl?: string | null
  returnPickup?: { orderId: string; status: string | null; awb: string | null; courierName: string | null; reason: string | null } | null
}

const RETURN_REASONS: [string, string][] = [
  ['damaged_item', 'Damaged item'],
  ['wrong_item', 'Wrong item'],
  ['quality_issue', 'Quality issue'],
  ['excess_quantity', 'Extra quantity sent'],
  ['buyer_changed_mind', 'Customer changed their mind'],
  ['late_delivery', 'Late delivery'],
  ['counterfeit_item', 'Counterfeit item'],
  ['other', 'Other'],
]

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
          <NimbusPostBookingCard orderId={id} orderStatus={order.status} />

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

/** Books, tracks and cancels this order's real NimbusPost order — separate from the delivery-rate quote above. */
function NimbusPostBookingCard({ orderId, orderStatus }: { orderId: string; orderStatus: OrderStatus }) {
  const { confirm } = useUi()
  const [addingEway, setAddingEway] = useState(false)
  const [arrangingReturn, setArrangingReturn] = useState(false)
  const cancelReturn = useAction(() => api(`/admin/orders/${orderId}/nimbuspost/return/cancel`, { method: 'POST', body: {} }), {
    success: 'Return pickup cancelled',
    invalidate: ['order-nimbuspost'],
  })
  const [pickingCourier, setPickingCourier] = useState(false)
  const [pickupDate, setPickupDate] = useState('')
  const query = useQuery({ queryKey: ['order-nimbuspost', orderId], queryFn: () => api<NimbusPostOrder>(`/admin/orders/${orderId}/nimbuspost`) })
  const create = useAction(() => api<{ order_id: string }>(`/admin/orders/${orderId}/nimbuspost/create`, { method: 'POST' }), { success: 'Order created with NimbusPost', invalidate: ['order-nimbuspost'] })
  const book = useAction((courierId?: string) => api<{ awb: string }>(`/admin/orders/${orderId}/nimbuspost/book`, { method: 'POST', body: { courierId } }), {
    success: (r) => `Courier booked · AWB ${r.awb}`,
    invalidate: ['order-nimbuspost'],
    onDone: () => setPickingCourier(false),
  })
  const pickup = useAction(() => api(`/admin/orders/${orderId}/nimbuspost/pickup`, { method: 'POST', body: { pickupDate: pickupDate || undefined } }), { success: 'Pickup scheduled', invalidate: ['order-nimbuspost'] })
  const cancel = useAction((reason: string) => api(`/admin/orders/${orderId}/nimbuspost/cancel`, { method: 'POST', body: { reason: reason || undefined } }), {
    success: 'NimbusPost booking cancelled',
    invalidate: ['order-nimbuspost'],
  })
  const label = useAction(() => api<{ url: string }>(`/admin/orders/${orderId}/nimbuspost/label`), {
    onDone: (r) => window.open(r.url, '_blank', 'noopener'),
  })
  const np = query.data
  const cancelled = np?.status === 'cancelled'

  return (
    <section className="rounded-xl border border-line p-4 text-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-bold tracking-wider text-muted uppercase">NimbusPost order</h3>
        {np?.booked && np.status && <Badge tone={cancelled ? 'red' : np.status === 'delivered' ? 'green' : 'blue'}>{np.status.replace(/_/g, ' ')}</Badge>}
      </div>
      {query.isLoading ? (
        <p className="mt-2 text-xs text-muted">Checking…</p>
      ) : query.error ? (
        <p className="mt-2 text-xs text-accent-dark">{errorMessage(query.error)}</p>
      ) : !np?.booked ? (
        <div className="mt-2">
          <p className="text-xs text-muted">Not created yet. This saves a real order on your NimbusPost account (you can still cancel it after); a courier is booked as a separate step.</p>
          <Button size="sm" variant="accent" className="mt-2" loading={create.isPending} onClick={() => create.mutate(undefined)}>Create NimbusPost order</Button>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-muted">Order {np.orderNumber} · NimbusPost id <span className="font-mono">{np.orderId}</span></p>
          {np.awb ? (
            <p className="text-xs"><span className="text-muted">AWB:</span> <span className="font-bold">{np.awb}</span>{np.courierName ? ` · ${np.courierName}` : ''}</p>
          ) : (
            !cancelled && <p className="text-xs text-accent-dark">No courier booked yet — nothing will be picked up until one is.</p>
          )}
          {np.ewayBillNumber && <p className="text-xs"><span className="text-muted">E-way bill:</span> <span className="font-mono font-bold">{np.ewayBillNumber}</span></p>}
          {np.latest && (
            <p className="text-xs"><span className="text-muted">Latest scan:</span> {np.latest.message || np.latest.shipStatus}{np.latest.location ? ` · ${np.latest.location}` : ''} <span className="text-muted">({dateTime(np.latest.eventTime)})</span></p>
          )}
          {!cancelled && (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={() => void query.refetch()}>Refresh status</Button>
              {!np.awb ? (
                <>
                  <Button size="sm" variant="accent" loading={book.isPending} onClick={() => book.mutate(undefined)}>Book cheapest courier</Button>
                  <Button size="sm" variant="outline" onClick={() => setPickingCourier(true)}>Choose a courier</Button>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-1.5">
                    <Input type="date" value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} className="h-8 w-36 text-xs" />
                    <Button size="sm" variant="outline" loading={pickup.isPending} onClick={() => pickup.mutate(undefined)}>Schedule pickup</Button>
                  </div>
                  <Button size="sm" variant="outline" loading={label.isPending} onClick={() => label.mutate(undefined)}>Print label</Button>
                </>
              )}
              <Button size="sm" variant="outline" onClick={() => setAddingEway(true)}>{np.ewayBillNumber ? 'Update e-way bill' : 'Add e-way bill'}</Button>
              <Button
                size="sm"
                variant="danger"
                loading={cancel.isPending}
                onClick={async () => {
                  const ok = await confirm({
                    title: np.awb ? 'Cancel this shipment?' : 'Cancel this NimbusPost order?',
                    text: 'This cancels the real booking on your NimbusPost account.',
                    confirmLabel: 'Cancel',
                    danger: true,
                  })
                  if (ok) cancel.mutate('')
                }}
              >
                {np.awb ? 'Cancel shipment' : 'Cancel order'}
              </Button>
            </div>
          )}
          {np.returnPickup ? (
            <div className="mt-2 rounded-lg bg-orange-50 p-3 text-xs">
              <p className="flex flex-wrap items-center gap-2 font-bold text-orange-900">
                Return pickup
                <Badge tone={np.returnPickup.status === 'delivered' ? 'green' : 'orange'}>{(np.returnPickup.status ?? 'created').replace(/_/g, ' ')}</Badge>
              </p>
              <p className="mt-1 text-orange-900/80">
                {RETURN_REASONS.find(([value]) => value === np.returnPickup?.reason)?.[1] ?? 'Return'}
                {np.returnPickup.awb ? ` · AWB ${np.returnPickup.awb}` : ' · courier not booked yet'}
                {np.returnPickup.courierName ? ` · ${np.returnPickup.courierName}` : ''}
              </p>
              {np.returnPickup.status !== 'delivered' && (
                <Button
                  size="sm"
                  variant="danger"
                  className="mt-2"
                  loading={cancelReturn.isPending}
                  onClick={async () => {
                    if (await confirm({ title: 'Cancel this return pickup?', text: 'The courier will not collect the parcel from the customer.', confirmLabel: 'Cancel pickup', danger: true })) cancelReturn.mutate(undefined)
                  }}
                >
                  Cancel return pickup
                </Button>
              )}
            </div>
          ) : (
            orderStatus === 'DELIVERED' &&
            np.awb && (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-canvas p-3 text-xs">
                <span className="text-muted">Customer wants to send it back? The courier collects it from their address and brings it to your warehouse.</span>
                <Button size="sm" variant="outline" onClick={() => setArrangingReturn(true)}>Arrange return pickup</Button>
              </div>
            )
          )}
          {np.scans && np.scans.length > 0 && (
            <ol className="mt-2 space-y-1 border-t border-line pt-2 text-xs">
              {np.scans.slice(0, 6).map((scan, index) => (
                <li key={index} className="flex justify-between gap-2 text-muted">
                  <span>{scan.remark || scan.status}{scan.location ? ` · ${scan.location}` : ''}</span>
                  <span className="shrink-0">{dateTime(scan.timestamp)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
      {addingEway && <EwayBillModal orderId={orderId} current={np?.ewayBillNumber ?? ''} onClose={() => setAddingEway(false)} />}
      {arrangingReturn && <ReturnPickupModal orderId={orderId} onClose={() => setArrangingReturn(false)} />}
      {pickingCourier && <ChooseCourierModal orderId={orderId} onClose={() => setPickingCourier(false)} onPick={(courierId) => book.mutate(courierId)} busy={book.isPending} />}
    </section>
  )
}

/** A NimbusPost reverse order: the courier collects from the customer and delivers to our warehouse. When it
 * arrives, the tracking webhook marks the order Returned (stock goes back). Refunds stay a separate choice. */
function ReturnPickupModal({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const [reason, setReason] = useState('damaged_item')
  const [note, setNote] = useState('')
  const [book, setBook] = useState(true)
  const save = useAction(() => api<{ returnAwb: string | null; booked: boolean }>(`/admin/orders/${orderId}/nimbuspost/return`, { method: 'POST', body: { reason, note: note.trim() || undefined, book } }), {
    success: (r) => (r.booked && r.returnAwb ? `Return pickup booked · AWB ${r.returnAwb}` : 'Return pickup created. Book a courier from NimbusPost.'),
    invalidate: ['order-nimbuspost'],
    onDone: onClose,
  })
  return (
    <Modal
      title="Arrange return pickup"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="accent" loading={save.isPending} onClick={() => save.mutate(undefined)}>Arrange pickup</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Why is it coming back?">
          <Select value={reason} onChange={(e) => setReason(e.target.value)}>
            {RETURN_REASONS.map(([value, text]) => (
              <option key={value} value={value}>{text}</option>
            ))}
          </Select>
        </Field>
        <Field label="Note for the courier (optional)"><Input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Pouch torn, 1 of 2 packs" /></Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={book} onChange={(e) => setBook(e.target.checked)} /> Book the cheapest courier now
        </label>
        <p className="rounded-lg bg-canvas px-3 py-2 text-xs text-muted">
          The pickup is charged to your NimbusPost wallet. When the parcel reaches your warehouse the order is marked Returned and its stock goes back. Refund the customer from this drawer when you have checked the items.
        </p>
      </div>
    </Modal>
  )
}

function EwayBillModal({ orderId, current, onClose }: { orderId: string; current: string; onClose: () => void }) {
  const [number, setNumber] = useState(current)
  const [url, setUrl] = useState('')
  const save = useAction(
    () => api(`/admin/orders/${orderId}/nimbuspost/eway-bill`, { method: 'PATCH', body: { ewayBillNumber: number, documentUrl: url || undefined } }),
    { success: 'E-way bill saved', invalidate: ['order-nimbuspost'], onDone: onClose },
  )
  const valid = /^\d{12}$/.test(number)
  return (
    <Modal title="E-way bill" onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="accent" disabled={!valid} loading={save.isPending} onClick={() => save.mutate(undefined)}>Save</Button></>}>
      <div className="space-y-3">
        <Field label="E-way bill number (12 digits)"><Input value={number} inputMode="numeric" maxLength={12} onChange={(e) => setNumber(e.target.value.replace(/\D/g, ''))} placeholder="331001234567" /></Field>
        <Field label="Document link (optional)" hint="A public https link to the PDF/image, under 5 MB"><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." /></Field>
      </div>
    </Modal>
  )
}

/** Reuses the same rate check as DeliveryRateCard, but to pick a specific courier to book rather than just quote. */
function ChooseCourierModal({ orderId, onClose, onPick, busy }: { orderId: string; onClose: () => void; onPick: (courierId: string) => void; busy: boolean }) {
  const query = useQuery({ queryKey: ['order-delivery-rate', orderId], queryFn: () => api<DeliveryRate>(`/admin/orders/${orderId}/delivery-rate`) })
  return (
    <Modal title="Choose a courier" onClose={onClose}>
      {query.isLoading ? (
        <p className="text-sm text-muted">Checking couriers…</p>
      ) : query.error ? (
        <p className="text-sm text-accent-dark">{errorMessage(query.error)}</p>
      ) : !query.data?.deliverable ? (
        <p className="text-sm text-accent-dark">No courier currently serves this route.</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
          {query.data.couriers.map((courier) => (
            <li key={courier.courierId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span>
                <span className="font-bold">{courier.courierName}</span>
                {courier.tatDays != null && <span className="text-xs text-muted"> · {courier.tatDays} day{courier.tatDays === 1 ? '' : 's'}</span>}
                <span className="text-xs text-muted"> · {inr(Math.round(courier.ratePaise / 100))}</span>
              </span>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => onPick(courier.courierId)}>Book</Button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
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
