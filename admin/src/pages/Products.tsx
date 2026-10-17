import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api.ts'
import { useAuth } from '../auth.tsx'
import { inr } from '../format.ts'
import { CsvImport } from '../CsvImport.tsx'
import { ExportButton } from '../ExportButton.tsx'
import { ProductLinks } from '../ProductLinks.tsx'
import { SeoFields } from '../SeoFields.tsx'
import { autoProductText } from '../seoText.ts'
import { useAction, useCategories } from '../hooks.ts'
import type { Paged, Product } from '../types.ts'
import { Badge, Button, Card, Drawer, EmptyState, ErrorState, Field, ImageUpload, Input, PageHeader, PageLoader, Pagination, SearchBox, Select, Switch, Table, Td, Textarea, Thumb, errorMessage, useUi } from '../ui.tsx'

export function ProductsPage() {
  const { isAdmin } = useAuth()
  const { confirm } = useUi()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const category = params.get('category') ?? ''
  const status = params.get('status') ?? ''
  const page = Number(params.get('page') ?? 1)
  const [editing, setEditing] = useState<Product | 'new' | null>(null)
  const [importing, setImporting] = useState(false)
  const [links, setLinks] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const categories = useCategories()
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    if (!('page' in patch)) next.delete('page')
    setParams(next, { replace: true })
  }

  const list = useQuery({ queryKey: ['products', q, category, status, page], queryFn: () => api<Paged<Product>>('/admin/products', { query: { q, category, status, page } }), placeholderData: (prev) => prev })
  const bulk = useAction((args: { action: string; percent?: number }) => api<{ updated: number }>('/admin/products/bulk', { body: { ids: selected, ...args } }), {
    success: (result) => `${result.updated} products updated`,
    invalidate: ['products', 'inventory'],
    onDone: () => setSelected([]),
  })
  const remove = useAction((id: string) => api<{ archived?: boolean; message?: string }>(`/admin/products/${id}`, { method: 'DELETE' }), {
    success: (result) => result.message ?? 'Product deleted',
    invalidate: ['products'],
  })

  const items = list.data?.items ?? []
  const allSelected = items.length > 0 && items.every((item) => selected.includes(item.id))
  const topCategories = useMemo(() => (categories.data ?? []).filter((item) => !item.parentId), [categories.data])

  return (
    <>
      <PageHeader title="Products" subtitle="Your catalogue, prices and pack sizes." actions={<><ExportButton report="catalog">Export</ExportButton><Button variant="outline" onClick={() => setImporting(true)}>Import CSV</Button><Button variant="outline" onClick={() => setLinks(true)}>Product links</Button><Button variant="accent" onClick={() => setEditing('new')}>+ Add product</Button></>} />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <SearchBox value={q} onChange={(value) => set({ q: value || null })} placeholder="Search products" />
          <Select value={category} onChange={(event) => set({ category: event.target.value || null })} className="!w-44" aria-label="Category">
            <option value="">All categories</option>
            {topCategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </Select>
          <Select value={status} onChange={(event) => set({ status: event.target.value || null })} className="!w-40" aria-label="Status">
            <option value="">Any status</option><option value="active">Active</option><option value="inactive">Hidden</option><option value="lowstock">Low stock</option><option value="out">Out of stock</option>
          </Select>
          {selected.length > 0 && (
            <div className="anim-fade ml-auto flex flex-wrap items-center gap-2 rounded-xl bg-brand-soft px-3 py-1.5">
              <span className="text-xs font-bold text-brand">{selected.length} selected</span>
              <Button size="sm" variant="outline" onClick={() => bulk.mutate({ action: 'activate' })}>Show</Button>
              <Button size="sm" variant="outline" onClick={() => bulk.mutate({ action: 'deactivate' })}>Hide</Button>
              <Button size="sm" variant="outline" onClick={() => bulk.mutate({ action: 'bestseller' })}>Bestseller</Button>
              <Button size="sm" variant="outline" onClick={() => { const value = window.prompt('Change all prices by what percent? (e.g. 10 or -5)'); const percent = Number(value); if (value && Number.isFinite(percent) && percent !== 0) bulk.mutate({ action: 'priceChange', percent }) }}>Price %</Button>
            </div>
          )}
        </div>
        {list.isLoading ? <PageLoader /> : list.error ? <ErrorState error={list.error} retry={() => void list.refetch()} /> : items.length === 0 ? (
          <EmptyState title="No products found" text="Try a different filter, or add your first product." action={<Button variant="accent" onClick={() => setEditing('new')}>+ Add product</Button>} />
        ) : (
          <>
            <Table head={[<input key="all" type="checkbox" aria-label="Select all" checked={allSelected} onChange={() => setSelected(allSelected ? [] : items.map((item) => item.id))} />, 'Product', 'Category', 'Packs & price', 'Stock', 'Status', '']}>
              {items.map((product) => (
                <tr key={product.id} className="hover:bg-canvas/60">
                  <Td><input type="checkbox" aria-label={`Select ${product.name}`} checked={selected.includes(product.id)} onChange={() => setSelected((current) => (current.includes(product.id) ? current.filter((id) => id !== product.id) : [...current, product.id]))} /></Td>
                  <Td>
                    <button type="button" onClick={() => setEditing(product)} className="flex items-center gap-3 text-left">
                      <Thumb src={product.images?.[0]} name={product.name} size="size-11" />
                      <span><span className="block font-bold hover:text-brand">{product.name}</span><span className="text-xs text-muted">{product.sold} sold</span></span>
                    </button>
                  </Td>
                  <Td className="text-muted capitalize">{product.category?.name ?? product.categoryId}</Td>
                  <Td>
                    <p className="text-xs text-muted">{product.variants?.length ?? 0} sizes</p>
                    <p className="font-semibold">{packPrice(product.variants)}</p>
                  </Td>
                  <Td>{product.stock === 0 ? <Badge tone="red">Out of stock</Badge> : product.lowStock ? <Badge tone="orange">{product.stock} · low</Badge> : <span className="font-semibold">{product.stock}</span>}</Td>
                  <Td><div className="flex flex-wrap gap-1">{product.isActive ? <Badge tone="green">Active</Badge> : <Badge>Hidden</Badge>}{product.isBestseller && <Badge tone="blue">Bestseller</Badge>}</div></Td>
                  <Td className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(product)}>Edit</Button>
                    {isAdmin && <Button size="sm" variant="ghost" className="!text-rose-600" onClick={async () => { if (await confirm({ title: `Delete ${product.name}?`, text: 'Products that have been ordered are hidden instead of deleted.', confirmLabel: 'Delete', danger: true })) remove.mutate(product.id) }}>Delete</Button>}
                  </Td>
                </tr>
              ))}
            </Table>
            <Pagination page={list.data!.page} pages={list.data!.pages} total={list.data!.total} onChange={(next) => set({ page: String(next) })} />
          </>
        )}
      </Card>
      {links && <ProductLinks onClose={() => setLinks(false)} />}
      {importing && <CsvImport kind="products" onClose={() => setImporting(false)} />}
      {editing && <ProductForm product={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function packPrice(variants: Product['variants'] | undefined) {
  const prices = (variants ?? []).map((variant) => variant.price).filter((price) => Number.isFinite(price))
  if (prices.length === 0) return '—'
  const low = Math.min(...prices)
  const high = Math.max(...prices)
  return high === low ? inr(low) : <>{inr(low)}<span className="text-muted"> – {inr(high)}</span></>
}

type VariantRow = { id?: string; size: string; price: string; mrp: string; stock: string; lowStockAt: string; isActive: boolean; original?: { price: number; mrp: number; isActive: boolean; lowStockAt: number } }
const SIZES = ['100g', '250g', '500g', '1kg']

function ProductForm({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const { toast } = useUi()
  const queryClient = useQueryClient()
  const categories = useCategories()
  const brands = useQuery({ queryKey: ['brands'], queryFn: () => api<{ items: { id: string; name: string }[] }>('/admin/brands').then((result) => result.items) })
  const [newBrand, setNewBrand] = useState('')
  const [form, setForm] = useState({
    name: product?.name ?? '',
    slug: product?.slug ?? '',
    categoryId: product?.categoryId ?? '',
    subcategoryId: product?.subcategoryId ?? '',
    brandId: product?.brandId ?? '',
    hsnCode: product?.hsnCode ?? '',
    gstPercent: String(product?.gstPercent ?? 5),
    countryOfOrigin: product?.countryOfOrigin ?? 'India',
    ingredients: product?.ingredients ?? '',
    shelfLifeDays: product?.shelfLifeDays ? String(product.shelfLifeDays) : '',
    blurb: product?.blurb ?? '',
    description: product?.description ?? '',
    highlights: (product?.highlights ?? []).join('\n'),
    isActive: product?.isActive ?? true,
    isBestseller: product?.isBestseller ?? false,
    featuredSize: product?.featuredSize ?? '',
    metaTitle: product?.metaTitle ?? '',
    metaDescription: product?.metaDescription ?? '',
  })
  const [images, setImages] = useState<string[]>(product?.images ?? [])
  const [nutrition, setNutrition] = useState(product?.nutrition ?? [])
  const [rows, setRows] = useState<VariantRow[]>(
    product
      ? (product.variants ?? []).map((v) => ({ id: v.id, size: v.size, price: String(v.price), mrp: String(v.mrp), stock: String(v.stock), lowStockAt: String(v.lowStockAt), isActive: v.isActive, original: { price: v.price, mrp: v.mrp, isActive: v.isActive, lowStockAt: v.lowStockAt } }))
      : [{ size: '250g', price: '', mrp: '', stock: '0', lowStockAt: '10', isActive: true }],
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const client = useAction(async () => undefined, { invalidate: ['products', 'inventory', 'summary'] })
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [key]: value }))
  const subs = (categories.data ?? []).filter((item) => item.parentId === form.categoryId)
  const topCategories = (categories.data ?? []).filter((item) => !item.parentId)

  const validate = () => {
    const next: Record<string, string> = {}
    if (form.name.trim().length < 2) next.name = 'Enter a product name'
    if (!form.categoryId) next.categoryId = 'Choose a category'
    const sizes = rows.map((row) => row.size.trim().toLowerCase())
    if (rows.length === 0) next.variants = 'Add at least one pack size'
    if (new Set(sizes).size !== sizes.length) next.variants = 'Each pack size can only appear once'
    rows.forEach((row, index) => {
      if (!row.size.trim()) next[`size${index}`] = 'Required'
      if (!(Number(row.price) >= 1)) next[`price${index}`] = 'Enter a price'
      if (!(Number(row.mrp) >= Number(row.price))) next[`mrp${index}`] = 'MRP must be ≥ price'
      if (!Number.isInteger(Number(row.stock)) || Number(row.stock) < 0) next[`stock${index}`] = 'Whole number'
    })
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const save = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      const base = {
        name: form.name.trim(),
        slug: form.slug.trim() || undefined,
        categoryId: form.categoryId,
        subcategoryId: form.subcategoryId || null,
        blurb: form.blurb.trim(),
        description: form.description.trim(),
        highlights: form.highlights.split('\n').map((line) => line.trim()).filter(Boolean),
        nutrition: nutrition.filter((row) => row.label.trim() && row.value.trim()),
        images,
        brandId: form.brandId || null,
        hsnCode: form.hsnCode.trim() || null,
        gstPercent: Number(form.gstPercent),
        countryOfOrigin: form.countryOfOrigin.trim() || 'India',
        ingredients: form.ingredients.trim(),
        shelfLifeDays: form.shelfLifeDays ? Number(form.shelfLifeDays) : null,
        isActive: form.isActive,
        isBestseller: form.isBestseller,
        featuredSize: form.featuredSize || rows[0]?.size || null,
        // Only sent when changed, so products still save before the SEO migration is pasted.
        ...(form.metaTitle.trim() !== (product?.metaTitle ?? '') ? { metaTitle: form.metaTitle.trim() } : {}),
        ...(form.metaDescription.trim() !== (product?.metaDescription ?? '') ? { metaDescription: form.metaDescription.trim() } : {}),
      }
      if (!product) {
        await api('/admin/products', { body: { ...base, variants: rows.map((row) => ({ size: row.size.trim(), price: Number(row.price), mrp: Number(row.mrp), stock: Number(row.stock), lowStockAt: Number(row.lowStockAt) || 10, isActive: row.isActive })) } })
        toast('Product created')
      } else {
        await api(`/admin/products/${product.id}`, { method: 'PATCH', body: base })
        for (const row of rows) {
          if (!row.id) {
            await api(`/admin/products/${product.id}/variants`, { body: { size: row.size.trim(), price: Number(row.price), mrp: Number(row.mrp), stock: Number(row.stock), lowStockAt: Number(row.lowStockAt) || 10, isActive: row.isActive } })
          } else if (row.original && (row.original.price !== Number(row.price) || row.original.mrp !== Number(row.mrp) || row.original.isActive !== row.isActive || row.original.lowStockAt !== Number(row.lowStockAt))) {
            await api(`/admin/variants/${row.id}`, { method: 'PATCH', body: { price: Number(row.price), mrp: Number(row.mrp), isActive: row.isActive, lowStockAt: Number(row.lowStockAt) } })
          }
        }
        toast('Product saved')
      }
      client.mutate(undefined)
      onClose()
    } catch (error) {
      toast(errorMessage(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  const updateRow = (index: number, patch: Partial<VariantRow>) => setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)))

  return (
    <Drawer
      title={product ? `Edit ${product.name}` : 'Add product'}
      onClose={onClose}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="accent" loading={saving} onClick={() => void save()}>{product ? 'Save changes' : 'Create product'}</Button></>}
    >
      <div className="space-y-8">
        <section className="grid gap-4 sm:grid-cols-2">
          <Field label="Name *" error={errors.name} className="sm:col-span-2"><Input value={form.name} onChange={(e) => set('name', e.target.value)} aria-invalid={!!errors.name} placeholder="Premium Almonds" /></Field>
          <Field label="Category *" error={errors.categoryId}>
            <Select value={form.categoryId} onChange={(e) => { set('categoryId', e.target.value); set('subcategoryId', '') }} aria-invalid={!!errors.categoryId}>
              <option value="">Select…</option>{topCategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </Select>
          </Field>
          <Field label="Subcategory">
            <Select value={form.subcategoryId} onChange={(e) => set('subcategoryId', e.target.value)} disabled={subs.length === 0}>
              <option value="">None</option>{subs.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </Select>
          </Field>
          <Field label="Brand" hint="Or type a new name and add it">
            <Select value={form.brandId} onChange={(e) => set('brandId', e.target.value)}>
              <option value="">No brand</option>{(brands.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </Select>
            <div className="mt-2 flex gap-2">
              <Input value={newBrand} onChange={(e) => setNewBrand(e.target.value)} placeholder="New brand name" aria-label="New brand name" />
              <Button type="button" variant="outline" disabled={newBrand.trim().length < 2} onClick={() => void (async () => {
                try {
                  const result = await api<{ brand: { id: string } }>('/admin/brands', { body: { name: newBrand.trim() } })
                  set('brandId', result.brand.id)
                  setNewBrand('')
                  await queryClient.invalidateQueries({ queryKey: ['brands'] })
                  toast('Brand added')
                } catch (error) {
                  toast(errorMessage(error), 'error')
                }
              })()}>Add</Button>
            </div>
          </Field>
          <Field label="Country of origin"><Input value={form.countryOfOrigin} onChange={(e) => set('countryOfOrigin', e.target.value)} /></Field>
          <Field label="HSN code" hint="Printed on the tax invoice"><Input value={form.hsnCode} onChange={(e) => set('hsnCode', e.target.value)} maxLength={8} placeholder="0802" /></Field>
          <Field label="GST %">
            <Select value={form.gstPercent} onChange={(e) => set('gstPercent', e.target.value)}>
              {['0', '5', '12', '18', '28'].map((rate) => <option key={rate} value={rate}>{rate}%</option>)}
            </Select>
          </Field>
          <Field label="Shelf life (days)"><Input type="number" min={1} value={form.shelfLifeDays} onChange={(e) => set('shelfLifeDays', e.target.value)} placeholder="180" /></Field>
          <Field label="Ingredients" className="sm:col-span-2"><Textarea rows={2} value={form.ingredients} onChange={(e) => set('ingredients', e.target.value)} placeholder="Almonds" /></Field>
          <Field label="Short description" className="sm:col-span-2"><Input value={form.blurb} onChange={(e) => set('blurb', e.target.value)} maxLength={400} placeholder="One line shown on the product page" /></Field>
          <Field label="Full description" className="sm:col-span-2"><Textarea rows={4} value={form.description} onChange={(e) => set('description', e.target.value)} /></Field>
          <Field label="Highlights" hint="One per line" className="sm:col-span-2"><Textarea rows={3} value={form.highlights} onChange={(e) => set('highlights', e.target.value)} placeholder={'No added sugar\nResealable pouch'} /></Field>
        </section>

        <section>
          <div className="flex items-center justify-between"><h3 className="font-extrabold">Pack sizes & stock</h3><Button size="sm" variant="soft" onClick={() => setRows((current) => [...current, { size: SIZES.find((size) => !current.some((row) => row.size === size)) ?? '', price: '', mrp: '', stock: '0', lowStockAt: '10', isActive: true }])}>+ Add size</Button></div>
          {errors.variants && <p className="mt-1 text-xs font-semibold text-rose-600">{errors.variants}</p>}
          <div className="mt-3 space-y-3">
            {rows.map((row, index) => (
              <div key={row.id ?? index} className="rounded-xl border border-line p-3">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <Field label="Size" error={errors[`size${index}`]}><Input value={row.size} onChange={(e) => updateRow(index, { size: e.target.value })} disabled={!!row.id} placeholder="250g" /></Field>
                  <Field label="Price ₹" error={errors[`price${index}`]}><Input type="number" min={1} value={row.price} onChange={(e) => updateRow(index, { price: e.target.value })} /></Field>
                  <Field label="MRP ₹" error={errors[`mrp${index}`]}><Input type="number" min={1} value={row.mrp} onChange={(e) => updateRow(index, { mrp: e.target.value })} /></Field>
                  <Field label={row.id ? 'Stock' : 'Opening stock'} error={errors[`stock${index}`]} hint={row.id ? 'Change in Inventory' : undefined}><Input type="number" min={0} value={row.stock} disabled={!!row.id} onChange={(e) => updateRow(index, { stock: e.target.value })} /></Field>
                  <Field label="Low at"><Input type="number" min={0} value={row.lowStockAt} onChange={(e) => updateRow(index, { lowStockAt: e.target.value })} /></Field>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs font-semibold text-ink-soft"><Switch checked={row.isActive} onChange={(value) => updateRow(index, { isActive: value })} label="Available" /> Available to buy</label>
                  {!row.id && rows.length > 1 && <Button size="sm" variant="ghost" className="!text-rose-600" onClick={() => setRows((current) => current.filter((_, i) => i !== index))}>Remove</Button>}
                </div>
              </div>
            ))}
          </div>
          {rows.length > 1 && (
            <Field label="Default pack shown in listings" className="mt-3 max-w-xs">
              <Select value={form.featuredSize} onChange={(e) => set('featuredSize', e.target.value)}>
                <option value="">First size</option>{rows.filter((row) => row.size.trim()).map((row) => <option key={row.size} value={row.size}>{row.size}</option>)}
              </Select>
            </Field>
          )}
        </section>

        <section>
          <h3 className="font-extrabold">Photos</h3>
          <p className="text-xs text-muted">The first photo is the main image. JPG, PNG or WebP up to 5 MB.</p>
          <div className="mt-3 space-y-3">
            {images.map((image, index) => <ImageUpload key={index} purpose="product" label={index === 0 ? 'Main photo' : `Photo ${index + 1}`} value={image} onChange={(url) => setImages((current) => (url ? current.map((item, i) => (i === index ? url : item)) : current.filter((_, i) => i !== index)))} />)}
            {images.length < 6 && <ImageUpload purpose="product" label={images.length === 0 ? 'Main photo' : 'Add another photo'} value={null} onChange={(url) => url && setImages((current) => [...current, url])} />}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between"><h3 className="font-extrabold">Nutrition facts <span className="text-xs font-normal text-muted">(per 100g)</span></h3><Button size="sm" variant="soft" onClick={() => setNutrition((current) => [...current, { label: '', value: '' }])}>+ Row</Button></div>
          <div className="mt-3 space-y-2">
            {nutrition.map((row, index) => (
              <div key={index} className="flex gap-2">
                <Input value={row.label} onChange={(e) => setNutrition((current) => current.map((item, i) => (i === index ? { ...item, label: e.target.value } : item)))} placeholder="Protein" />
                <Input value={row.value} onChange={(e) => setNutrition((current) => current.map((item, i) => (i === index ? { ...item, value: e.target.value } : item)))} placeholder="21 g" />
                <Button variant="ghost" aria-label="Remove row" onClick={() => setNutrition((current) => current.filter((_, i) => i !== index))}>✕</Button>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="font-extrabold">Search engine listing</h3>
          <p className="text-xs text-muted">How this product appears on Google. Leave both empty to use the automatic text.</p>
          <div className="mt-3">
            <SeoFields
              title={form.metaTitle}
              description={form.metaDescription}
              onTitle={(value) => set('metaTitle', value)}
              onDescription={(value) => set('metaDescription', value)}
              auto={autoProductText({ name: form.name, blurb: form.blurb, description: form.description, sizes: rows.map((row) => row.size.trim()), prices: rows.map((row) => Number(row.price)).filter((price) => price > 0) })}
              path={`/product/${form.slug.trim() || product?.slug || form.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'new-product'}`}
            />
          </div>
        </section>

        <section className="grid gap-4 rounded-xl bg-canvas p-4 sm:grid-cols-2">
          <label className="flex items-center justify-between gap-3 text-sm font-bold">Visible in the shop <Switch checked={form.isActive} onChange={(value) => set('isActive', value)} label="Visible" /></label>
          <label className="flex items-center justify-between gap-3 text-sm font-bold">Mark as bestseller <Switch checked={form.isBestseller} onChange={(value) => set('isBestseller', value)} label="Bestseller" /></label>
          <Field label="URL name" hint="Leave blank to generate from the name" className="sm:col-span-2"><Input value={form.slug} onChange={(e) => set('slug', e.target.value)} placeholder="premium-almonds" /></Field>
        </section>
      </div>
    </Drawer>
  )
}
