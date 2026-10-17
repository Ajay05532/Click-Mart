import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api, assetUrl } from '../api.ts'
import { dateOnly, fromLocalInput, toLocalInput } from '../format.ts'
import { useAction } from '../hooks.ts'
import { Badge, Button, Card, EmptyState, ErrorState, Field, ImageUpload, Input, Modal, PageHeader, PageLoader, Select, Switch, useUi } from '../ui.tsx'

type Banner = { id: string; title: string; subtitle: string; image: string | null; link: string; placement: 'HERO' | 'PROMO'; sortOrder: number; startsAt: string | null; endsAt: string | null; isActive: boolean }

export function BannersPage() {
  const { confirm } = useUi()
  const query = useQuery({ queryKey: ['banners'], queryFn: () => api<{ items: Banner[] }>('/admin/banners').then((r) => r.items) })
  const [editing, setEditing] = useState<Banner | 'new' | null>(null)
  const toggle = useAction((b: Banner) => api(`/admin/banners/${b.id}`, { method: 'PATCH', body: { isActive: !b.isActive } }), { invalidate: ['banners'] })
  const remove = useAction((id: string) => api(`/admin/banners/${id}`, { method: 'DELETE' }), { success: 'Banner deleted', invalidate: ['banners'] })
  return (
    <>
      <PageHeader title="Banners" subtitle="Promotions shown on the storefront home page." actions={<Button variant="accent" onClick={() => setEditing('new')}>+ New banner</Button>} />
      {query.isLoading ? <PageLoader /> : query.error ? <Card><ErrorState error={query.error} /></Card> : query.data!.length === 0 ? <Card><EmptyState title="No banners yet" action={<Button variant="accent" onClick={() => setEditing('new')}>+ New banner</Button>} /></Card> : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {query.data!.map((b) => (
            <Card key={b.id} className="overflow-hidden">
              <div className="relative aspect-[16/6] bg-ink">
                {b.image && <img src={assetUrl(b.image)} alt="" className="absolute inset-0 size-full object-cover opacity-80" />}
                <div className="absolute inset-0 bg-gradient-to-r from-ink/80 to-transparent p-5 text-white"><p className="text-lg font-extrabold">{b.title}</p><p className="text-sm text-white/75">{b.subtitle}</p></div>
              </div>
              <div className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1"><div className="flex gap-1.5"><Badge tone="blue">{b.placement === 'HERO' ? 'Hero' : 'Promo'}</Badge><Badge tone={b.isActive ? 'green' : 'gray'}>{b.isActive ? 'Live' : 'Paused'}</Badge></div><p className="mt-1 truncate text-xs text-muted">→ {b.link}{b.endsAt ? ` · until ${dateOnly(b.endsAt)}` : ''}</p></div>
                <Switch checked={b.isActive} onChange={() => toggle.mutate(b)} label={`Toggle ${b.title}`} />
                <Button size="sm" variant="outline" onClick={() => setEditing(b)}>Edit</Button>
                <Button size="sm" variant="ghost" className="!text-rose-600" onClick={async () => { if (await confirm({ title: `Delete “${b.title}”?`, confirmLabel: 'Delete', danger: true })) remove.mutate(b.id) }}>Delete</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {editing && <BannerModal banner={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function BannerModal({ banner, onClose }: { banner: Banner | null; onClose: () => void }) {
  const [f, setF] = useState({ title: banner?.title ?? '', subtitle: banner?.subtitle ?? '', image: banner?.image ?? null as string | null, link: banner?.link ?? '/shop', placement: banner?.placement ?? 'HERO', sortOrder: String(banner?.sortOrder ?? 0), startsAt: toLocalInput(banner?.startsAt), endsAt: toLocalInput(banner?.endsAt), isActive: banner?.isActive ?? true })
  const save = useAction(() => {
    const body = { title: f.title.trim(), subtitle: f.subtitle.trim(), image: f.image, link: f.link.trim() || '/shop', placement: f.placement, sortOrder: Number(f.sortOrder) || 0, startsAt: fromLocalInput(f.startsAt), endsAt: fromLocalInput(f.endsAt), isActive: f.isActive }
    return banner ? api(`/admin/banners/${banner.id}`, { method: 'PATCH', body }) : api('/admin/banners', { body })
  }, { success: 'Banner saved', invalidate: ['banners'], onDone: onClose })
  return (
    <Modal wide title={banner ? 'Edit banner' : 'New banner'} onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="accent" disabled={f.title.trim().length < 2} loading={save.isPending} onClick={() => save.mutate(undefined)}>Save banner</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Headline *" className="sm:col-span-2"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} autoFocus /></Field>
        <Field label="Sub-headline" className="sm:col-span-2"><Input value={f.subtitle} onChange={(e) => setF({ ...f, subtitle: e.target.value })} /></Field>
        <div className="sm:col-span-2"><ImageUpload label="Image" purpose="banner" value={f.image} onChange={(image) => setF({ ...f, image })} /></div>
        <Field label="Button link" hint="e.g. /shop or /sale"><Input value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} /></Field>
        <Field label="Placement"><Select value={f.placement} onChange={(e) => setF({ ...f, placement: e.target.value as Banner['placement'] })}><option value="HERO">Hero (top of home)</option><option value="PROMO">Promo strip</option></Select></Field>
        <Field label="Starts"><Input type="datetime-local" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} /></Field>
        <Field label="Ends"><Input type="datetime-local" value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} /></Field>
        <Field label="Order" hint="Lower shows first"><Input type="number" value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: e.target.value })} /></Field>
        <label className="flex items-center justify-between self-end text-sm font-bold">Live <Switch checked={f.isActive} onChange={(isActive) => setF({ ...f, isActive })} label="Live" /></label>
      </div>
    </Modal>
  )
}
