import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api.ts'
import { useAuth } from '../auth.tsx'
import { AdminOnly } from '../Layout.tsx'
import { dateTime, label } from '../format.ts'
import { useAction } from '../hooks.ts'
import { Badge, Button, Card, ErrorState, Field, Input, Modal, PageHeader, PageLoader, Select, Switch, Table, Td, Textarea, useUi } from '../ui.tsx'

/* ---------------- Team ---------------- */
type Member = { id: string; name: string; email: string; role: 'ADMIN' | 'STAFF'; isBlocked: boolean; createdAt: string }

export function StaffPage() {
  const { user } = useAuth()
  const { confirm } = useUi()
  const [adding, setAdding] = useState(false)
  const query = useQuery({ queryKey: ['staff'], queryFn: () => api<{ items: Member[] }>('/admin/staff').then((r) => r.items) })
  const update = useAction((args: { id: string; role?: string; isBlocked?: boolean }) => api(`/admin/staff/${args.id}`, { method: 'PATCH', body: { role: args.role, isBlocked: args.isBlocked } }), { success: 'Team updated', invalidate: ['staff'] })
  return (
    <AdminOnly>
      <PageHeader title="Team" subtitle="Staff can manage orders and products. Only administrators see money, settings and the team." actions={<Button variant="accent" onClick={() => setAdding(true)}>+ Add team member</Button>} />
      <Card>
        {query.isLoading ? <PageLoader /> : query.error ? <ErrorState error={query.error} /> : (
          <Table head={['Name', 'Role', 'Added', 'Access', '']}>
            {query.data!.map((m) => (
              <tr key={m.id}>
                <Td><p className="font-bold">{m.name} {m.id === user?.id && <Badge tone="blue">You</Badge>}</p><p className="text-xs text-muted">{m.email}</p></Td>
                <Td>{m.id === user?.id ? <Badge tone="dark">{label(m.role)}</Badge> : <Select value={m.role} onChange={(e) => update.mutate({ id: m.id, role: e.target.value })} className="!h-8 !w-32 !text-xs" aria-label={`Role for ${m.name}`}><option value="STAFF">Staff</option><option value="ADMIN">Admin</option><option value="CUSTOMER">Remove access</option></Select>}</Td>
                <Td className="text-muted">{dateTime(m.createdAt)}</Td>
                <Td>{m.isBlocked ? <Badge tone="red">Blocked</Badge> : <Badge tone="green">Active</Badge>}</Td>
                <Td className="text-right">{m.id !== user?.id && <Button size="sm" variant="ghost" onClick={async () => { if (m.isBlocked || await confirm({ title: `Block ${m.name}?`, text: 'They will be signed out immediately.', confirmLabel: 'Block', danger: true })) update.mutate({ id: m.id, isBlocked: !m.isBlocked }) }}>{m.isBlocked ? 'Unblock' : 'Block'}</Button>}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {adding && <AddMember onClose={() => setAdding(false)} />}
    </AdminOnly>
  )
}

function AddMember({ onClose }: { onClose: () => void }) {
  const [f, setF] = useState({ name: '', email: '', password: '', role: 'STAFF' })
  const save = useAction(() => api('/admin/staff', { body: f }), { success: 'Team member added', invalidate: ['staff'], onDone: onClose })
  const invalid = f.name.trim().length < 2 || !/^\S+@\S+\.\S+$/.test(f.email) || f.password.length < 8
  return (
    <Modal title="Add team member" onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="accent" disabled={invalid} loading={save.isPending} onClick={() => save.mutate(undefined)}>Add member</Button></>}>
      <div className="space-y-4">
        <Field label="Full name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
        <Field label="Email"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Temporary password" hint="At least 8 characters. Ask them to change it after signing in."><Input type="text" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" /></Field>
        <Field label="Role"><Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="STAFF">Staff: orders, products, stock, reviews</option><option value="ADMIN">Admin: everything</option></Select></Field>
      </div>
    </Modal>
  )
}

/* ---------------- Settings ---------------- */
type Settings = { storeName: string; supportEmail: string; supportPhone: string; address: string; freeShippingThreshold: number; shippingFee: number; codEnabled: boolean; codMaxOrder: number; lowStockDefault: number }

export function SettingsPage() {
  const query = useQuery({ queryKey: ['settings'], queryFn: () => api<{ settings: Settings }>('/admin/settings').then((r) => r.settings) })
  return (
    <AdminOnly>
      <PageHeader title="Settings" subtitle="Store details, shipping and payments." />
      {query.isLoading ? <PageLoader /> : query.error || !query.data ? <Card><ErrorState error={query.error} /></Card> : <SettingsForm initial={query.data} />}
    </AdminOnly>
  )
}

function SettingsForm({ initial }: { initial: Settings }) {
  const [f, setF] = useState({ ...initial, freeShippingThreshold: String(initial.freeShippingThreshold), shippingFee: String(initial.shippingFee), codMaxOrder: String(initial.codMaxOrder), lowStockDefault: String(initial.lowStockDefault) })
  const save = useAction(() => api('/admin/settings', { method: 'PUT', body: { ...f, freeShippingThreshold: Number(f.freeShippingThreshold), shippingFee: Number(f.shippingFee), codMaxOrder: Number(f.codMaxOrder), lowStockDefault: Number(f.lowStockDefault) } }), { success: 'Settings saved', invalidate: ['settings'] })
  const dirty = JSON.stringify(f) !== JSON.stringify({ ...initial, freeShippingThreshold: String(initial.freeShippingThreshold), shippingFee: String(initial.shippingFee), codMaxOrder: String(initial.codMaxOrder), lowStockDefault: String(initial.lowStockDefault) })
  const n = (key: 'freeShippingThreshold' | 'shippingFee' | 'codMaxOrder' | 'lowStockDefault') => <Input type="number" min={0} value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} />
  return (
    <div className="grid max-w-3xl gap-6">
      <Card className="p-6">
        <h2 className="font-extrabold">Store details</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Store name"><Input value={f.storeName} onChange={(e) => setF({ ...f, storeName: e.target.value })} /></Field>
          <Field label="Support email"><Input type="email" value={f.supportEmail} onChange={(e) => setF({ ...f, supportEmail: e.target.value })} /></Field>
          <Field label="Support phone"><Input value={f.supportPhone} onChange={(e) => setF({ ...f, supportPhone: e.target.value })} /></Field>
          <Field label="Address" className="sm:col-span-2"><Textarea rows={2} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
        </div>
      </Card>
      <Card className="p-6">
        <h2 className="font-extrabold">Shipping</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Free shipping above ₹" hint="Orders at or above this amount ship free">{n('freeShippingThreshold')}</Field>
          <Field label="Shipping fee ₹" hint="Charged below that amount">{n('shippingFee')}</Field>
        </div>
      </Card>
      <Card className="p-6">
        <h2 className="font-extrabold">Payments & stock</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="flex items-center justify-between rounded-xl bg-canvas p-4 text-sm font-bold sm:col-span-2">Accept cash on delivery <Switch checked={f.codEnabled} onChange={(codEnabled) => setF({ ...f, codEnabled })} label="Cash on delivery" /></label>
          <Field label="Max COD order ₹">{n('codMaxOrder')}</Field>
          <Field label="Default low-stock alert" hint="Used when a pack size has no alert level">{n('lowStockDefault')}</Field>
        </div>
      </Card>
      <div className="flex justify-end"><Button variant="accent" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate(undefined)}>Save settings</Button></div>
    </div>
  )
}

/* ---------------- Activity log ---------------- */
type Log = { id: string; action: string; entity: string; entityId: string | null; diff: unknown; createdAt: string; actor: { name: string; email: string } | null }

export function AuditPage() {
  const [page, setPage] = useState(1)
  const query = useQuery({ queryKey: ['audit', page], queryFn: () => api<{ items: Log[] }>('/admin/audit', { query: { page } }).then((r) => r.items), placeholderData: (p) => p })
  return (
    <AdminOnly>
      <PageHeader title="Activity log" subtitle="Who changed what, and when." />
      <Card>
        {query.isLoading ? <PageLoader /> : query.error ? <ErrorState error={query.error} /> : (
          <>
            <Table head={['When', 'Who', 'Action', 'Record']}>
              {query.data!.map((log) => (
                <tr key={log.id}>
                  <Td className="text-xs text-muted">{dateTime(log.createdAt)}</Td>
                  <Td className="font-semibold">{log.actor?.name ?? 'System'}</Td>
                  <Td><Badge tone="blue">{log.action}</Badge></Td>
                  <Td className="font-mono text-xs text-muted">{log.entity}{log.entityId ? ` · ${log.entityId.slice(0, 8)}` : ''}</Td>
                </tr>
              ))}
            </Table>
            <div className="flex justify-end gap-2 border-t border-line p-3"><Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Newer</Button><Button size="sm" variant="outline" disabled={query.data!.length < 50} onClick={() => setPage(page + 1)}>Older</Button></div>
          </>
        )}
      </Card>
    </AdminOnly>
  )
}
