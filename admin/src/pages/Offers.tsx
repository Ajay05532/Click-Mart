import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api.ts'
import { dateOnly, fromLocalInput, inr, toLocalInput } from '../format.ts'
import { useAction, useCategories } from '../hooks.ts'
import type { Paged, Product } from '../types.ts'
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, PageHeader, PageLoader, Select, Switch, Table, Td, useUi } from '../ui.tsx'

type Offer = { id: string; name: string; badge: string | null; type: 'PERCENT' | 'FLAT'; value: number; startsAt: string | null; endsAt: string | null; isActive: boolean; categoryIds: string[]; productIds: string[] }

function state(offer: Offer) {
  const now = Date.now()
  if (!offer.isActive) return { tone: 'gray' as const, text: 'Paused' }
  if (offer.endsAt && new Date(offer.endsAt).getTime() < now) return { tone: 'red' as const, text: 'Ended' }
  if (offer.startsAt && new Date(offer.startsAt).getTime() > now) return { tone: 'blue' as const, text: 'Scheduled' }
  return { tone: 'green' as const, text: 'Live' }
}

export function OffersPage() {
  const { confirm } = useUi()
  const query = useQuery({ queryKey: ['offers'], queryFn: () => api<{ items: Offer[] }>('/admin/offers').then((r) => r.items) })
  const [editing, setEditing] = useState<Offer | 'new' | null>(null)
  const categories = useCategories()
  const remove = useAction((id: string) => api(`/admin/offers/${id}`, { method: 'DELETE' }), { success: 'Offer deleted', invalidate: ['offers'] })
  const toggle = useAction((offer: Offer) => api(`/admin/offers/${offer.id}`, { method: 'PATCH', body: { isActive: !offer.isActive } }), { invalidate: ['offers'] })
  const catName = (id: string) => categories.data?.find((c) => c.id === id)?.name ?? id

  return (
    <>
      <PageHeader title="Offers" subtitle="Automatic sale prices. They show on the shop and the On Sale page, no code needed." actions={<Button variant="accent" onClick={() => setEditing('new')}>+ New offer</Button>} />
      <Card>
        {query.isLoading ? <PageLoader /> : query.error ? <ErrorState error={query.error} /> : query.data!.length === 0 ? <EmptyState title="No offers yet" text="Create a sale for a category or specific products." action={<Button variant="accent" onClick={() => setEditing('new')}>+ New offer</Button>} /> : (
          <Table head={['Offer', 'Discount', 'Applies to', 'Dates', 'Status', '']}>
            {query.data!.map((offer) => {
              const s = state(offer)
              return (
                <tr key={offer.id} className="hover:bg-canvas/60">
                  <Td><p className="font-bold">{offer.name}</p>{offer.badge && <p className="text-xs text-muted">Badge: {offer.badge}</p>}</Td>
                  <Td className="font-extrabold">{offer.type === 'PERCENT' ? `${offer.value}% off` : `${inr(offer.value)} off`}</Td>
                  <Td className="max-w-56 text-xs text-muted">{offer.categoryIds.length + offer.productIds.length === 0 ? 'Everything' : [...offer.categoryIds.map(catName), ...(offer.productIds.length ? [`${offer.productIds.length} products`] : [])].join(', ')}</Td>
                  <Td className="text-xs text-muted">{offer.startsAt ? dateOnly(offer.startsAt) : 'Now'} → {offer.endsAt ? dateOnly(offer.endsAt) : 'No end'}</Td>
                  <Td><Badge tone={s.tone}>{s.text}</Badge></Td>
                  <Td className="text-right"><Switch checked={offer.isActive} onChange={() => toggle.mutate(offer)} label={`Toggle ${offer.name}`} /> <Button size="sm" variant="ghost" onClick={() => setEditing(offer)}>Edit</Button><Button size="sm" variant="ghost" className="!text-rose-600" onClick={async () => { if (await confirm({ title: `Delete ${offer.name}?`, confirmLabel: 'Delete', danger: true })) remove.mutate(offer.id) }}>Delete</Button></Td>
                </tr>
              )
            })}
          </Table>
        )}
      </Card>
      {editing && <OfferModal offer={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function OfferModal({ offer, onClose }: { offer: Offer | null; onClose: () => void }) {
  const categories = useCategories()
  const products = useQuery({ queryKey: ['products', 'all-names'], queryFn: () => api<Paged<Product>>('/admin/products', { query: { pageSize: 100 } }).then((r) => r.items) })
  const [form, setForm] = useState({ name: offer?.name ?? '', badge: offer?.badge ?? '', type: offer?.type ?? 'PERCENT', value: String(offer?.value ?? ''), startsAt: toLocalInput(offer?.startsAt), endsAt: toLocalInput(offer?.endsAt), categoryIds: offer?.categoryIds ?? [], productIds: offer?.productIds ?? [], isActive: offer?.isActive ?? true })
  const toggle = (key: 'categoryIds' | 'productIds', id: string) => setForm((f) => ({ ...f, [key]: f[key].includes(id) ? f[key].filter((x) => x !== id) : [...f[key], id] }))
  const value = Number(form.value)
  const invalid = form.name.trim().length < 2 || !(value >= 1) || (form.type === 'PERCENT' && value > 90) || (!!form.startsAt && !!form.endsAt && form.endsAt <= form.startsAt)
  const save = useAction(() => {
    const body = { name: form.name.trim(), badge: form.badge.trim() || null, type: form.type, value, startsAt: fromLocalInput(form.startsAt), endsAt: fromLocalInput(form.endsAt), categoryIds: form.categoryIds, productIds: form.productIds, isActive: form.isActive }
    return offer ? api(`/admin/offers/${offer.id}`, { method: 'PATCH', body }) : api('/admin/offers', { body })
  }, { success: 'Offer saved', invalidate: ['offers'], onDone: onClose })

  return (
    <Modal wide title={offer ? 'Edit offer' : 'New offer'} onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="accent" disabled={invalid} loading={save.isPending} onClick={() => save.mutate(undefined)}>Save offer</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Offer name *" className="sm:col-span-2"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Diwali almond sale" autoFocus /></Field>
        <Field label="Type"><Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as 'PERCENT' | 'FLAT' })}><option value="PERCENT">Percent off</option><option value="FLAT">Flat ₹ off</option></Select></Field>
        <Field label={form.type === 'PERCENT' ? 'Percent (1–90)' : 'Amount ₹'}><Input type="number" min={1} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /></Field>
        <Field label="Starts" hint="Blank = starts immediately"><Input type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} /></Field>
        <Field label="Ends" hint="Blank = no end date" error={form.startsAt && form.endsAt && form.endsAt <= form.startsAt ? 'Must be after the start' : undefined}><Input type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} /></Field>
        <Field label="Badge text (optional)" className="sm:col-span-2"><Input value={form.badge} onChange={(e) => setForm({ ...form, badge: e.target.value })} maxLength={30} placeholder="Festive deal" /></Field>
        <div className="sm:col-span-2">
          <p className="text-xs font-bold text-ink-soft">Applies to <span className="font-normal text-muted">(leave all unchecked for everything)</span></p>
          <p className="mt-2 text-[11px] font-bold tracking-wider text-muted uppercase">Categories</p>
          <div className="mt-1.5 flex flex-wrap gap-2">{(categories.data ?? []).filter((c) => !c.parentId).map((c) => <Chip key={c.id} on={form.categoryIds.includes(c.id)} onClick={() => toggle('categoryIds', c.id)}>{c.name}</Chip>)}</div>
          <p className="mt-3 text-[11px] font-bold tracking-wider text-muted uppercase">Products</p>
          <div className="mt-1.5 flex max-h-32 flex-wrap gap-2 overflow-y-auto">{(products.data ?? []).map((p) => <Chip key={p.id} on={form.productIds.includes(p.id)} onClick={() => toggle('productIds', p.id)}>{p.name}</Chip>)}</div>
        </div>
        <label className="flex items-center justify-between text-sm font-bold sm:col-span-2">Active <Switch checked={form.isActive} onChange={(isActive) => setForm({ ...form, isActive })} label="Active" /></label>
      </div>
    </Modal>
  )
}

export const Chip = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button type="button" aria-pressed={on} onClick={onClick} className={`rounded-full px-3 py-1 text-xs font-bold transition ${on ? 'bg-brand text-white' : 'bg-canvas text-ink-soft ring-1 ring-line hover:ring-brand'}`}>{children}</button>
)
