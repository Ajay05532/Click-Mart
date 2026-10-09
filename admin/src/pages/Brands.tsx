import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api.ts'
import { useAction } from '../hooks.ts'
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, PageHeader, PageLoader, Switch, Table, Td, useUi } from '../ui.tsx'

type Brand = { id: string; name: string; slug: string; isActive: boolean }

export function BrandsPage() {
  const { confirm } = useUi()
  const query = useQuery({ queryKey: ['brands', 'all'], queryFn: () => api<{ items: Brand[] }>('/admin/brands', { query: { all: '1' } }).then((result) => result.items) })
  const [editing, setEditing] = useState<Brand | 'new' | null>(null)
  const toggle = useAction((brand: Brand) => api(`/admin/brands/${brand.id}`, { method: 'PATCH', body: { isActive: !brand.isActive } }), { invalidate: ['brands'] })
  const remove = useAction((id: string) => api(`/admin/brands/${id}`, { method: 'DELETE' }), { success: 'Brand deleted', invalidate: ['brands'] })

  return (
    <>
      <PageHeader title="Brands" subtitle="The names printed on your products, such as ClickMart." actions={<Button variant="accent" onClick={() => setEditing('new')}>+ Add brand</Button>} />
      <Card>
        {query.isLoading ? <PageLoader /> : query.error ? <ErrorState error={query.error} /> : (query.data ?? []).length === 0 ? (
          <EmptyState title="No brands yet" text="Add a brand, then choose it when you create a product." action={<Button variant="accent" onClick={() => setEditing('new')}>+ Add brand</Button>} />
        ) : (
          <Table head={['Brand', 'Status', '']}>
            {query.data!.map((brand) => (
              <tr key={brand.id} className="hover:bg-canvas/60">
                <Td><p className="font-bold">{brand.name}</p><p className="text-xs text-muted">{brand.slug}</p></Td>
                <Td><Badge tone={brand.isActive ? 'green' : 'gray'}>{brand.isActive ? 'Visible' : 'Hidden'}</Badge></Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-2">
                    <Switch checked={brand.isActive} onChange={() => toggle.mutate(brand)} label={`Toggle ${brand.name}`} />
                    <Button size="sm" variant="outline" onClick={() => setEditing(brand)}>Edit</Button>
                    <Button size="sm" variant="ghost" className="!text-rose-600" onClick={async () => { if (await confirm({ title: `Delete ${brand.name}?`, text: 'Products keep their details. They just lose this brand.', confirmLabel: 'Delete', danger: true })) remove.mutate(brand.id) }}>Delete</Button>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {editing && <BrandModal brand={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function BrandModal({ brand, onClose }: { brand: Brand | null; onClose: () => void }) {
  const [name, setName] = useState(brand?.name ?? '')
  const save = useAction(
    () => (brand ? api(`/admin/brands/${brand.id}`, { method: 'PATCH', body: { name: name.trim() } }) : api('/admin/brands', { body: { name: name.trim() } })),
    { success: brand ? 'Brand saved' : 'Brand added', invalidate: ['brands'], onDone: onClose },
  )
  return (
    <Modal title={brand ? 'Edit brand' : 'Add brand'} onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="accent" disabled={name.trim().length < 2} loading={save.isPending} onClick={() => save.mutate(undefined)}>Save</Button></>}>
      <Field label="Name *"><Input value={name} onChange={(event) => setName(event.target.value)} autoFocus placeholder="ClickMart" /></Field>
    </Modal>
  )
}
