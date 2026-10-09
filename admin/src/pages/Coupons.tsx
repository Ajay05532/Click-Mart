import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api.ts'
import { AdminOnly } from '../Layout.tsx'
import { dateOnly, fromLocalInput, inr, toLocalInput } from '../format.ts'
import { useAction } from '../hooks.ts'
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, PageHeader, PageLoader, Select, Switch, Table, Td, useUi } from '../ui.tsx'

type Coupon = { id: string; code: string; label: string; type: 'PERCENT' | 'FLAT' | 'FREE_SHIPPING'; value: number; minOrder: number; maxDiscount: number | null; startsAt: string | null; endsAt: string | null; usageLimit: number | null; perUserLimit: number | null; usedCount: number; isActive: boolean }

const describe = (c: Coupon) => (c.type === 'PERCENT' ? `${c.value}% off${c.maxDiscount ? ` (max ${inr(c.maxDiscount)})` : ''}` : c.type === 'FLAT' ? `${inr(c.value)} off` : 'Free shipping')

export function CouponsPage() {
  const { confirm } = useUi()
  const query = useQuery({ queryKey: ['coupons'], queryFn: () => api<{ items: Coupon[] }>('/admin/coupons').then((r) => r.items) })
  const [editing, setEditing] = useState<Coupon | 'new' | null>(null)
  const toggle = useAction((c: Coupon) => api(`/admin/coupons/${c.id}`, { method: 'PATCH', body: { isActive: !c.isActive } }), { invalidate: ['coupons'] })
  const remove = useAction((id: string) => api<{ message?: string }>(`/admin/coupons/${id}`, { method: 'DELETE' }), { success: (r) => r.message ?? 'Coupon deleted', invalidate: ['coupons'] })
  return (
    <AdminOnly>
      <PageHeader title="Coupons" subtitle="Codes customers type at checkout." actions={<Button variant="accent" onClick={() => setEditing('new')}>+ New coupon</Button>} />
      <Card>
        {query.isLoading ? <PageLoader /> : query.error ? <ErrorState error={query.error} /> : query.data!.length === 0 ? <EmptyState title="No coupons" action={<Button variant="accent" onClick={() => setEditing('new')}>+ New coupon</Button>} /> : (
          <Table head={['Code', 'Discount', 'Rules', 'Used', 'Valid', 'Active', '']}>
            {query.data!.map((c) => {
              const ended = c.endsAt && new Date(c.endsAt) < new Date()
              return (
                <tr key={c.id} className="hover:bg-canvas/60">
                  <Td><span className="rounded-lg border border-dashed border-accent/60 bg-orange-50 px-2 py-1 font-mono text-xs font-extrabold tracking-wider text-accent-dark">{c.code}</span><p className="mt-1 text-xs text-muted">{c.label}</p></Td>
                  <Td className="font-bold">{describe(c)}</Td>
                  <Td className="text-xs text-muted">{c.minOrder ? `Min ${inr(c.minOrder)}` : 'No minimum'}{c.perUserLimit ? ` · ${c.perUserLimit}/person` : ''}</Td>
                  <Td>{c.usedCount}{c.usageLimit ? <span className="text-muted"> / {c.usageLimit}</span> : ''}</Td>
                  <Td className="text-xs text-muted">{c.startsAt ? dateOnly(c.startsAt) : 'Now'} → {c.endsAt ? dateOnly(c.endsAt) : 'No end'} {ended && <Badge tone="red">Expired</Badge>}</Td>
                  <Td><Switch checked={c.isActive} onChange={() => toggle.mutate(c)} label={`Toggle ${c.code}`} /></Td>
                  <Td className="text-right"><Button size="sm" variant="ghost" onClick={() => setEditing(c)}>Edit</Button><Button size="sm" variant="ghost" className="!text-rose-600" onClick={async () => { if (await confirm({ title: `Delete ${c.code}?`, text: 'Used coupons are deactivated instead of deleted.', confirmLabel: 'Delete', danger: true })) remove.mutate(c.id) }}>Delete</Button></Td>
                </tr>
              )
            })}
          </Table>
        )}
      </Card>
      {editing && <CouponModal coupon={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </AdminOnly>
  )
}

function CouponModal({ coupon, onClose }: { coupon: Coupon | null; onClose: () => void }) {
  const [f, setF] = useState({ code: coupon?.code ?? '', label: coupon?.label ?? '', type: coupon?.type ?? 'PERCENT', value: String(coupon?.value ?? ''), minOrder: String(coupon?.minOrder ?? 0), maxDiscount: coupon?.maxDiscount ? String(coupon.maxDiscount) : '', usageLimit: coupon?.usageLimit ? String(coupon.usageLimit) : '', perUserLimit: coupon?.perUserLimit ? String(coupon.perUserLimit) : '', startsAt: toLocalInput(coupon?.startsAt), endsAt: toLocalInput(coupon?.endsAt), isActive: coupon?.isActive ?? true })
  const free = f.type === 'FREE_SHIPPING'
  const invalid = !/^[A-Za-z0-9_-]{3,20}$/.test(f.code) || f.label.trim().length < 2 || (!free && !(Number(f.value) >= 1)) || (f.type === 'PERCENT' && Number(f.value) > 100) || (!!f.startsAt && !!f.endsAt && f.endsAt <= f.startsAt)
  const save = useAction(() => {
    const body = { code: f.code.toUpperCase(), label: f.label.trim(), type: f.type, value: free ? 0 : Number(f.value), minOrder: Number(f.minOrder) || 0, maxDiscount: f.type === 'PERCENT' && f.maxDiscount ? Number(f.maxDiscount) : null, usageLimit: f.usageLimit ? Number(f.usageLimit) : null, perUserLimit: f.perUserLimit ? Number(f.perUserLimit) : null, startsAt: fromLocalInput(f.startsAt), endsAt: fromLocalInput(f.endsAt), isActive: f.isActive }
    return coupon ? api(`/admin/coupons/${coupon.id}`, { method: 'PATCH', body }) : api('/admin/coupons', { body })
  }, { success: 'Coupon saved', invalidate: ['coupons'], onDone: onClose })
  return (
    <Modal wide title={coupon ? `Edit ${coupon.code}` : 'New coupon'} onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="accent" disabled={invalid} loading={save.isPending} onClick={() => save.mutate(undefined)}>Save coupon</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Code *" hint="3–20 letters or numbers"><Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} className="font-mono tracking-wider" autoFocus /></Field>
        <Field label="Description *"><Input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="15% off all dry fruits" /></Field>
        <Field label="Type"><Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as Coupon['type'] })}><option value="PERCENT">Percent off</option><option value="FLAT">Flat ₹ off</option><option value="FREE_SHIPPING">Free shipping</option></Select></Field>
        {!free && <Field label={f.type === 'PERCENT' ? 'Percent' : 'Amount ₹'}><Input type="number" min={1} value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} /></Field>}
        <Field label="Minimum order ₹"><Input type="number" min={0} value={f.minOrder} onChange={(e) => setF({ ...f, minOrder: e.target.value })} /></Field>
        {f.type === 'PERCENT' && <Field label="Max discount ₹" hint="Optional cap"><Input type="number" min={1} value={f.maxDiscount} onChange={(e) => setF({ ...f, maxDiscount: e.target.value })} /></Field>}
        <Field label="Total uses allowed" hint="Blank = unlimited"><Input type="number" min={1} value={f.usageLimit} onChange={(e) => setF({ ...f, usageLimit: e.target.value })} /></Field>
        <Field label="Uses per customer" hint="Blank = unlimited"><Input type="number" min={1} value={f.perUserLimit} onChange={(e) => setF({ ...f, perUserLimit: e.target.value })} /></Field>
        <Field label="Starts"><Input type="datetime-local" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} /></Field>
        <Field label="Ends"><Input type="datetime-local" value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} /></Field>
        <label className="flex items-center justify-between text-sm font-bold sm:col-span-2">Active <Switch checked={f.isActive} onChange={(isActive) => setF({ ...f, isActive })} label="Active" /></label>
      </div>
    </Modal>
  )
}
