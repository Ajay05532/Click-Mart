import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api.ts'
import { dateOnly } from '../format.ts'
import { useAction } from '../hooks.ts'
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, PageLoader, Tabs, useUi } from '../ui.tsx'

type Review = { id: string; name: string; city: string; rating: number; comment: string; images?: string[]; verified: boolean; status: 'PENDING' | 'APPROVED' | 'REJECTED'; createdAt: string; product: { name: string; slug: string } }

export function ReviewsPage() {
  const { confirm } = useUi()
  const [status, setStatus] = useState<'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING')
  const query = useQuery({ queryKey: ['reviews', status], queryFn: () => api<{ items: Review[] }>('/admin/reviews', { query: { status } }).then((r) => r.items) })
  const moderate = useAction((args: { id: string; status: Review['status'] }) => api(`/admin/reviews/${args.id}`, { method: 'PATCH', body: { status: args.status } }), { success: 'Review updated', invalidate: ['reviews', 'products'] })
  const remove = useAction((id: string) => api(`/admin/reviews/${id}`, { method: 'DELETE' }), { success: 'Review deleted', invalidate: ['reviews', 'products'] })
  return (
    <>
      <PageHeader title="Reviews" subtitle="Approve what customers say before it appears on a product page." />
      <div className="mb-4"><Tabs value={status} onChange={setStatus} items={[{ id: 'PENDING', label: 'Needs review' }, { id: 'APPROVED', label: 'Published' }, { id: 'REJECTED', label: 'Rejected' }]} /></div>
      {query.isLoading ? <PageLoader /> : query.error ? <Card><ErrorState error={query.error} /></Card> : query.data!.length === 0 ? <Card><EmptyState title="Nothing here" text={status === 'PENDING' ? 'You are all caught up.' : 'No reviews in this list.'} /></Card> : (
        <div className="space-y-3">
          {query.data!.map((r) => (
            <Card key={r.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-amber-500" aria-label={`${r.rating} stars`}>{'★'.repeat(r.rating)}<span className="text-slate-300">{'★'.repeat(5 - r.rating)}</span></p>
                  <p className="mt-1 text-sm font-bold">{r.name} <span className="font-normal text-muted">· {r.city} · {dateOnly(r.createdAt)}</span> {r.verified && <Badge tone="green">Verified buyer</Badge>}</p>
                  <p className="text-xs text-muted">on {r.product.name}</p>
                </div>
                <div className="flex gap-2">
                  {r.status !== 'APPROVED' && <Button size="sm" variant="primary" onClick={() => moderate.mutate({ id: r.id, status: 'APPROVED' })}>Approve</Button>}
                  {r.status !== 'REJECTED' && <Button size="sm" variant="outline" onClick={() => moderate.mutate({ id: r.id, status: 'REJECTED' })}>Reject</Button>}
                  <Button size="sm" variant="ghost" className="!text-rose-600" onClick={async () => { if (await confirm({ title: 'Delete this review?', confirmLabel: 'Delete', danger: true })) remove.mutate(r.id) }}>Delete</Button>
                </div>
              </div>
              <p className="mt-3 text-sm leading-6 text-ink-soft">{r.comment}</p>
              {!!r.images?.length && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {r.images.map((src) => <a key={src} href={src} target="_blank" rel="noreferrer"><img src={src} alt="" className="size-16 rounded-lg object-cover ring-1 ring-line" /></a>)}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
