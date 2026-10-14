import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api.ts'
import { useAction } from '../hooks.ts'
import type { CannedReply, Faq } from '../types.ts'
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, PageHeader, PageLoader, Select, Switch, Table, Tabs, Td, Textarea, useUi } from '../ui.tsx'

const faqCategories: [Faq['category'], string][] = [
  ['ORDERS', 'Orders'],
  ['DELIVERY', 'Delivery'],
  ['PAYMENTS', 'Payments'],
  ['RETURNS', 'Returns and refunds'],
  ['PRODUCTS', 'Products'],
  ['ACCOUNT', 'Account'],
]
const categoryName = Object.fromEntries(faqCategories) as Record<Faq['category'], string>

export function SupportContentPage() {
  const [tab, setTab] = useState<'faqs' | 'canned'>('faqs')
  return (
    <>
      <PageHeader title="Help content" subtitle="Answers customers can read in the Help centre, and replies your team can reuse." />
      <div className="mb-4">
        <Tabs value={tab} onChange={setTab} items={[{ id: 'faqs', label: 'Help articles' }, { id: 'canned', label: 'Saved replies' }]} />
      </div>
      {tab === 'faqs' ? <Articles /> : <SavedReplies />}
    </>
  )
}

function Articles() {
  const { confirm } = useUi()
  const query = useQuery({ queryKey: ['support-faqs'], queryFn: () => api<{ items: Faq[] }>('/admin/support/faqs').then((r) => r.items) })
  const [editing, setEditing] = useState<Faq | 'new' | null>(null)
  const toggle = useAction((args: { id: string; isPublished: boolean }) => api(`/admin/support/faqs/${args.id}`, { method: 'PATCH', body: { isPublished: args.isPublished } }), { invalidate: ['support-faqs'] })
  const remove = useAction((id: string) => api(`/admin/support/faqs/${id}`, { method: 'DELETE' }), { success: 'Article deleted', invalidate: ['support-faqs'] })
  const published = (query.data ?? []).filter((faq) => faq.isPublished).length

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">
          {published === 0 ? 'Nothing is published yet, so customers see a built-in set of common answers. Publish your first article and only your own articles are shown.' : `${published} published. Customers see these in the Help centre, grouped by topic.`}
        </p>
        <Button variant="accent" onClick={() => setEditing('new')}>New article</Button>
      </div>
      <Card>
        {query.isLoading ? <PageLoader /> : query.error ? <ErrorState error={query.error} retry={() => void query.refetch()} /> : query.data!.length === 0 ? (
          <EmptyState title="No articles yet" text="Write the answers to questions you hear most: delivery time, refunds, payment problems." action={<Button variant="accent" onClick={() => setEditing('new')}>Write the first one</Button>} />
        ) : (
          <Table head={['Question', 'Topic', 'Order', 'Helpful', 'Live', '']}>
            {query.data!.map((faq) => (
              <tr key={faq.id} className="hover:bg-canvas/60">
                <Td className="max-w-md"><p className="truncate font-semibold">{faq.question}</p><p className="truncate text-xs text-muted">{faq.answer}</p></Td>
                <Td><Badge tone="blue">{categoryName[faq.category]}</Badge></Td>
                <Td className="text-muted">{faq.sortOrder}</Td>
                <Td className="text-xs text-muted"><span className="font-bold text-emerald-700">👍 {faq.helpfulYes}</span> <span className="ml-2 font-bold text-rose-600">👎 {faq.helpfulNo}</span></Td>
                <Td><Switch checked={faq.isPublished} label={`Publish ${faq.question}`} onChange={(value) => toggle.mutate({ id: faq.id, isPublished: value })} /></Td>
                <Td className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(faq)}>Edit</Button>
                  <Button variant="ghost" size="sm" className="!text-rose-600" onClick={async () => { if (await confirm({ title: 'Delete this article?', confirmLabel: 'Delete', danger: true })) remove.mutate(faq.id) }}>Delete</Button>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {editing && <ArticleModal faq={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function ArticleModal({ faq, onClose }: { faq: Faq | null; onClose: () => void }) {
  const [form, setForm] = useState({ category: faq?.category ?? 'ORDERS', question: faq?.question ?? '', answer: faq?.answer ?? '', sortOrder: String(faq?.sortOrder ?? 0), isPublished: faq?.isPublished ?? true })
  const save = useAction(
    () => {
      const body = { ...form, sortOrder: Number(form.sortOrder) || 0 }
      return faq ? api(`/admin/support/faqs/${faq.id}`, { method: 'PATCH', body }) : api('/admin/support/faqs', { body })
    },
    { success: faq ? 'Article saved' : 'Article created', invalidate: ['support-faqs'], onDone: onClose },
  )
  const valid = form.question.trim().length >= 5 && form.answer.trim().length >= 5
  return (
    <Modal wide title={faq ? 'Edit article' : 'New article'} onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="accent" disabled={!valid} loading={save.isPending} onClick={() => save.mutate(undefined)}>Save</Button></>}>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Topic">
            <Select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as Faq['category'] })}>
              {faqCategories.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </Select>
          </Field>
          <Field label="Order in the list" hint="Smaller numbers come first.">
            <Input type="number" min={0} max={9999} value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: event.target.value })} />
          </Field>
        </div>
        <Field label="Question"><Input value={form.question} maxLength={200} onChange={(event) => setForm({ ...form, question: event.target.value })} placeholder="How long does delivery take?" /></Field>
        <Field label="Answer" hint="Plain text. Line breaks are kept. Use exact numbers, such as days and amounts."><Textarea rows={7} className="h-auto py-3" maxLength={4000} value={form.answer} onChange={(event) => setForm({ ...form, answer: event.target.value })} /></Field>
        <label className="flex items-center gap-3 text-sm font-semibold"><Switch checked={form.isPublished} label="Published" onChange={(value) => setForm({ ...form, isPublished: value })} /> Show in the Help centre</label>
      </div>
    </Modal>
  )
}

function SavedReplies() {
  const { confirm } = useUi()
  const query = useQuery({ queryKey: ['support-canned'], queryFn: () => api<{ items: CannedReply[] }>('/admin/support/canned').then((r) => r.items) })
  const [editing, setEditing] = useState<CannedReply | 'new' | null>(null)
  const remove = useAction((id: string) => api(`/admin/support/canned/${id}`, { method: 'DELETE' }), { success: 'Reply deleted', invalidate: ['support-canned'] })
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">Insert these from the reply box on any ticket. <code className="rounded bg-canvas px-1.5 py-0.5 text-xs">{'{{name}}'}</code> becomes the customer's first name and <code className="rounded bg-canvas px-1.5 py-0.5 text-xs">{'{{order}}'}</code> their order number.</p>
        <Button variant="accent" onClick={() => setEditing('new')}>New reply</Button>
      </div>
      {query.isLoading ? <PageLoader /> : query.error ? <Card><ErrorState error={query.error} retry={() => void query.refetch()} /></Card> : query.data!.length === 0 ? (
        <Card><EmptyState title="No saved replies" text="Save the answers you type again and again, like refund timelines or how to send a photo." action={<Button variant="accent" onClick={() => setEditing('new')}>Write the first one</Button>} /></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {query.data!.map((reply) => (
            <Card key={reply.id} className="flex flex-col p-5">
              <p className="font-extrabold">{reply.title}</p>
              <p className="mt-2 line-clamp-4 flex-1 text-sm leading-6 whitespace-pre-line text-ink-soft">{reply.body}</p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(reply)}>Edit</Button>
                <Button size="sm" variant="ghost" className="!text-rose-600" onClick={async () => { if (await confirm({ title: 'Delete this reply?', confirmLabel: 'Delete', danger: true })) remove.mutate(reply.id) }}>Delete</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {editing && <ReplyModal reply={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function ReplyModal({ reply, onClose }: { reply: CannedReply | null; onClose: () => void }) {
  const [form, setForm] = useState({ title: reply?.title ?? '', body: reply?.body ?? '' })
  const save = useAction(() => (reply ? api(`/admin/support/canned/${reply.id}`, { method: 'PATCH', body: form }) : api('/admin/support/canned', { body: form })), { success: 'Reply saved', invalidate: ['support-canned'], onDone: onClose })
  return (
    <Modal wide title={reply ? 'Edit saved reply' : 'New saved reply'} onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="accent" disabled={form.title.trim().length < 2 || form.body.trim().length < 2} loading={save.isPending} onClick={() => save.mutate(undefined)}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="Name"><Input value={form.title} maxLength={60} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Refund timeline" /></Field>
        <Field label="Message"><Textarea rows={8} className="h-auto py-3" maxLength={2000} value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} placeholder={'Hi {{name}}, thanks for your patience…'} /></Field>
      </div>
    </Modal>
  )
}
