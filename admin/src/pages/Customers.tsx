import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api.ts'
import { useAuth } from '../auth.tsx'
import { dateOnly, dateTime, inr } from '../format.ts'
import { useAction } from '../hooks.ts'
import type { Order, Paged } from '../types.ts'
import { Badge, Button, Card, Drawer, EmptyState, ErrorState, PageHeader, PageLoader, Pagination, SearchBox, Table, Td, useUi } from '../ui.tsx'
import { OrderStatusBadge } from './Orders.tsx'

type Customer = { id: string; name: string; email: string; phone: string | null; isBlocked: boolean; createdAt: string; orders: number; spent: number }
type Detail = { id: string; name: string; email: string; phone: string | null; isBlocked: boolean; createdAt: string; addresses: { id: string; line: string; city: string; state: string; pin: string }[]; orders: Order[] }

export function CustomersPage() {
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState<string | null>(null)
  const list = useQuery({ queryKey: ['customers', q, page], queryFn: () => api<Paged<Customer>>('/admin/customers', { query: { q, page } }), placeholderData: (prev) => prev })
  return (
    <>
      <PageHeader title="Customers" subtitle="People who have signed up to buy." actions={<SearchBox value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder="Search name or email" />} />
      <Card>
        {list.isLoading ? <PageLoader /> : list.error ? <ErrorState error={list.error} /> : list.data!.items.length === 0 ? <EmptyState title="No customers found" /> : (
          <>
            <Table head={['Customer', 'Joined', 'Orders', 'Total spent', 'Status']}>
              {list.data!.items.map((c) => (
                <tr key={c.id} onClick={() => setOpen(c.id)} className="cursor-pointer hover:bg-canvas/60">
                  <Td><p className="font-bold">{c.name}</p><p className="text-xs text-muted">{c.email}</p></Td>
                  <Td className="text-muted">{dateOnly(c.createdAt)}</Td>
                  <Td className="font-semibold">{c.orders}</Td>
                  <Td className="font-semibold">{inr(c.spent)}</Td>
                  <Td>{c.isBlocked ? <Badge tone="red">Blocked</Badge> : <Badge tone="green">Active</Badge>}</Td>
                </tr>
              ))}
            </Table>
            <Pagination page={list.data!.page} pages={list.data!.pages} total={list.data!.total} onChange={setPage} />
          </>
        )}
      </Card>
      {open && <CustomerDrawer id={open} onClose={() => setOpen(null)} />}
    </>
  )
}

function CustomerDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { isAdmin } = useAuth()
  const { confirm } = useUi()
  const query = useQuery({ queryKey: ['customer', id], queryFn: () => api<{ customer: Detail }>(`/admin/customers/${id}`).then((r) => r.customer) })
  const block = useAction((blocked: boolean) => api(`/admin/customers/${id}`, { method: 'PATCH', body: { isBlocked: blocked } }), { success: 'Customer updated', invalidate: ['customer', 'customers'] })
  const c = query.data
  const spent = c?.orders.filter((o) => o.status !== 'CANCELLED' && o.status !== 'RETURNED').reduce((sum, o) => sum + o.total, 0) ?? 0
  return (
    <Drawer title={c?.name ?? 'Customer'} onClose={onClose}>
      {query.isLoading ? <PageLoader /> : !c ? <ErrorState error={query.error} /> : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-canvas p-4"><p className="text-[11px] font-bold tracking-wider text-muted uppercase">Orders</p><p className="mt-1 text-xl font-extrabold">{c.orders.length}</p></div>
            <div className="rounded-xl bg-canvas p-4"><p className="text-[11px] font-bold tracking-wider text-muted uppercase">Spent</p><p className="mt-1 text-xl font-extrabold">{inr(spent)}</p></div>
            <div className="rounded-xl bg-canvas p-4"><p className="text-[11px] font-bold tracking-wider text-muted uppercase">Joined</p><p className="mt-1 text-xl font-extrabold">{dateOnly(c.createdAt)}</p></div>
          </div>
          <div className="text-sm"><p>{c.email}</p>{c.phone && <p className="text-muted">+91 {c.phone}</p>}</div>
          {c.addresses.length > 0 && <div><h3 className="text-xs font-bold tracking-wider text-muted uppercase">Saved addresses</h3><ul className="mt-2 space-y-1 text-sm text-ink-soft">{c.addresses.map((a) => <li key={a.id}>{a.line}, {a.city}, {a.state} {a.pin}</li>)}</ul></div>}
          <div>
            <h3 className="text-xs font-bold tracking-wider text-muted uppercase">Order history</h3>
            <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
              {c.orders.map((o) => <li key={o.id} className="flex items-center justify-between gap-3 p-3 text-sm"><span><span className="font-bold text-brand">{o.code}</span> <span className="text-xs text-muted">{dateTime(o.placedAt)}</span></span><span className="flex items-center gap-3"><OrderStatusBadge status={o.status} /><span className="font-bold">{inr(o.total)}</span></span></li>)}
              {c.orders.length === 0 && <li className="p-4 text-sm text-muted">No orders yet.</li>}
            </ul>
          </div>
          {isAdmin && (
            <Button variant={c.isBlocked ? 'primary' : 'danger'} loading={block.isPending} onClick={async () => { if (c.isBlocked || await confirm({ title: `Block ${c.name}?`, text: 'They will be signed out and unable to log in.', confirmLabel: 'Block', danger: true })) block.mutate(!c.isBlocked) }}>{c.isBlocked ? 'Unblock customer' : 'Block customer'}</Button>
          )}
        </div>
      )}
    </Drawer>
  )
}
