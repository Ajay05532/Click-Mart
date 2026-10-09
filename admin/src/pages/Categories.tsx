import { useState } from 'react'
import { api } from '../api.ts'
import { useAction, useCategories } from '../hooks.ts'
import type { Category } from '../types.ts'
import { Badge, Button, Card, EmptyState, ErrorState, Field, ImageUpload, Input, Modal, PageHeader, PageLoader, Select, Switch, Thumb, useUi } from '../ui.tsx'

export function CategoriesPage() {
  const { confirm } = useUi()
  const query = useCategories()
  const [editing, setEditing] = useState<Category | { parentId: string | null } | null>(null)
  const reorder = useAction((ids: string[]) => api('/admin/categories/reorder', { body: { ids } }), { invalidate: ['categories'] })
  const remove = useAction((id: string) => api(`/admin/categories/${id}`, { method: 'DELETE' }), { success: 'Category deleted', invalidate: ['categories'] })
  const all = query.data ?? []
  const tops = all.filter((item) => !item.parentId)

  const move = (index: number, dir: -1 | 1) => {
    const ids = tops.map((item) => item.id)
    const target = index + dir
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target]!, ids[index]!]
    reorder.mutate(ids)
  }
  const del = async (item: Category) => { if (await confirm({ title: `Delete ${item.name}?`, text: 'Only empty categories can be deleted.', confirmLabel: 'Delete', danger: true })) remove.mutate(item.id) }

  return (
    <>
      <PageHeader title="Categories" subtitle="How your shop is organised. Use the arrows to reorder." actions={<Button variant="accent" onClick={() => setEditing({ parentId: null })}>+ Add category</Button>} />
      {query.isLoading ? <PageLoader /> : query.error ? <Card><ErrorState error={query.error} /></Card> : tops.length === 0 ? <Card><EmptyState title="No categories yet" action={<Button variant="accent" onClick={() => setEditing({ parentId: null })}>+ Add category</Button>} /></Card> : (
        <div className="space-y-3">
          {tops.map((category, index) => {
            const subs = all.filter((item) => item.parentId === category.id)
            return (
              <Card key={category.id} className="p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex flex-col"><button type="button" aria-label="Move up" disabled={index === 0} onClick={() => move(index, -1)} className="text-xs leading-none text-muted hover:text-ink disabled:opacity-25">▲</button><button type="button" aria-label="Move down" disabled={index === tops.length - 1} onClick={() => move(index, 1)} className="text-xs leading-none text-muted hover:text-ink disabled:opacity-25">▼</button></div>
                  <Thumb src={category.image} name={category.name} size="size-12" />
                  <div className="min-w-0 flex-1"><p className="font-extrabold">{category.name} {!category.isActive && <Badge>Hidden</Badge>}</p><p className="truncate text-xs text-muted">{category.tagline || 'No tagline'} · {category._count?.products ?? 0} products</p></div>
                  <Button size="sm" variant="soft" onClick={() => setEditing({ parentId: category.id })}>+ Subcategory</Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(category)}>Edit</Button>
                  <Button size="sm" variant="ghost" className="!text-rose-600" onClick={() => void del(category)}>Delete</Button>
                </div>
                {subs.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
                    {subs.map((sub) => (
                      <li key={sub.id} className="flex items-center gap-1 rounded-full bg-canvas py-1 pr-1 pl-3 text-xs font-bold">
                        {sub.name} <span className="font-normal text-muted">({sub._count?.subProducts ?? 0})</span>
                        <button type="button" onClick={() => setEditing(sub)} className="rounded-full px-1.5 py-0.5 text-brand hover:bg-white" aria-label={`Edit ${sub.name}`}>✎</button>
                        <button type="button" onClick={() => void del(sub)} className="rounded-full px-1.5 py-0.5 text-rose-600 hover:bg-white" aria-label={`Delete ${sub.name}`}>✕</button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )
          })}
        </div>
      )}
      {editing && <CategoryModal target={editing} tops={tops} onClose={() => setEditing(null)} />}
    </>
  )
}

function CategoryModal({ target, tops, onClose }: { target: Category | { parentId: string | null }; tops: Category[]; onClose: () => void }) {
  const existing = 'id' in target ? target : null
  const [form, setForm] = useState({ name: existing?.name ?? '', tagline: existing?.tagline ?? '', image: existing?.image ?? null as string | null, parentId: target.parentId ?? '', isActive: existing?.isActive ?? true })
  const save = useAction(
    () => {
      const body = { name: form.name.trim(), tagline: form.tagline.trim(), image: form.image, parentId: form.parentId || null, isActive: form.isActive }
      return existing ? api(`/admin/categories/${existing.id}`, { method: 'PATCH', body }) : api('/admin/categories', { body })
    },
    { success: existing ? 'Category saved' : 'Category added', invalidate: ['categories'], onDone: onClose },
  )
  return (
    <Modal title={existing ? 'Edit category' : form.parentId ? 'Add subcategory' : 'Add category'} onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="accent" disabled={form.name.trim().length < 2} loading={save.isPending} onClick={() => save.mutate(undefined)}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="Name *"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></Field>
        <Field label="Parent category" hint="Leave empty for a top-level category"><Select value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })} disabled={!!existing && tops.some((item) => item.parentId === existing.id)}><option value="">None (top level)</option>{tops.filter((item) => item.id !== existing?.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
        {!form.parentId && <Field label="Tagline"><Input value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} placeholder="Crunchy, handpicked kernels" /></Field>}
        {!form.parentId && <ImageUpload label="Image" purpose="category" value={form.image} onChange={(image) => setForm({ ...form, image })} />}
        <label className="flex items-center justify-between text-sm font-bold">Visible in the shop <Switch checked={form.isActive} onChange={(isActive) => setForm({ ...form, isActive })} label="Visible" /></label>
      </div>
    </Modal>
  )
}
