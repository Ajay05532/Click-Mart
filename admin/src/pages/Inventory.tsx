import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api.ts'
import { dateTime, label } from '../format.ts'
import { CsvImport } from '../CsvImport.tsx'
import { ExportButton } from '../ExportButton.tsx'
import { useAction } from '../hooks.ts'
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, PageHeader, PageLoader, Pagination, Select, SearchBox, Table, Tabs, Td, Textarea, Thumb } from '../ui.tsx'

type Row = { id: string; size: string; sku: string; stock: number; lowStockAt: number; isActive: boolean; product: { id: string; name: string; images: string[]; isActive: boolean } }
type Result = { items: Row[]; total: number; summary: { out: number; low: number; variants: number } }
type Move = { id: string; delta: number; reason: string; note: string | null; balance: number; createdAt: string; user: { name: string } | null }

export function InventoryPage() {
  const [params, setParams] = useSearchParams()
  const filter = (params.get('filter') ?? 'all') as 'all' | 'low' | 'out'
  const q = params.get('q') ?? ''
  const [page, setPage] = useState(1)
  const [adjust, setAdjust] = useState<Row | null>(null)
  const [history, setHistory] = useState<Row | null>(null)
  const [bulk, setBulk] = useState(false)
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(patch)) {
      if (value && value !== 'all') next.set(key, value)
      else next.delete(key)
    }
    setParams(next, { replace: true })
    setPage(1)
  }
  const list = useQuery({ queryKey: ['inventory', filter, q, page], queryFn: () => api<Result>('/admin/inventory', { query: { filter, q, page } }), placeholderData: (prev) => prev })
  const summary = list.data?.summary

  return (
    <>
      <PageHeader title="Inventory" subtitle="Live stock for every pack size. Every change is logged." actions={<><SearchBox value={q} onChange={(value) => set({ q: value || null })} placeholder="Search product" /><ExportButton report="stock">Export</ExportButton><Button variant="outline" onClick={() => setBulk(true)}>Bulk update</Button></>} />
      <div className="mb-4"><Tabs value={filter} onChange={(value) => set({ filter: value })} items={[{ id: 'all', label: 'All', count: summary?.variants }, { id: 'low', label: 'Low stock', count: summary?.low }, { id: 'out', label: 'Out of stock', count: summary?.out }]} /></div>
      <Card>
        {list.isLoading ? <PageLoader /> : list.error ? <ErrorState error={list.error} retry={() => void list.refetch()} /> : list.data!.items.length === 0 ? <EmptyState title="Nothing here" text="No pack sizes match this filter." /> : (
          <>
            <Table head={['Product', 'Size', 'SKU', 'Stock', 'Alert at', '']}>
              {list.data!.items.map((row) => (
                <tr key={row.id} className="hover:bg-canvas/60">
                  <Td><div className="flex items-center gap-3"><Thumb src={row.product.images[0]} name={row.product.name} /><span className="font-bold">{row.product.name}</span>{!row.product.isActive && <Badge>Hidden</Badge>}</div></Td>
                  <Td className="font-semibold">{row.size}</Td>
                  <Td className="font-mono text-xs text-muted">{row.sku}</Td>
                  <Td>{row.stock === 0 ? <Badge tone="red">Out of stock</Badge> : row.stock <= row.lowStockAt ? <Badge tone="orange">{row.stock} · low</Badge> : <span className="font-bold">{row.stock}</span>}</Td>
                  <Td className="text-muted">{row.lowStockAt}</Td>
                  <Td className="text-right"><Button size="sm" variant="soft" onClick={() => setAdjust(row)}>Update stock</Button> <Button size="sm" variant="ghost" onClick={() => setHistory(row)}>History</Button></Td>
                </tr>
              ))}
            </Table>
            <Pagination page={page} pages={Math.max(1, Math.ceil(list.data!.total / 50))} total={list.data!.total} onChange={setPage} />
          </>
        )}
      </Card>
      {bulk && <CsvImport kind="stock" onClose={() => setBulk(false)} />}
      {adjust && <AdjustModal row={adjust} onClose={() => setAdjust(null)} />}
      {history && <HistoryModal row={history} onClose={() => setHistory(null)} />}
    </>
  )
}

function AdjustModal({ row, onClose }: { row: Row; onClose: () => void }) {
  const [mode, setMode] = useState<'adjust' | 'set'>('adjust')
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState('RESTOCK')
  const [note, setNote] = useState('')
  const value = Number(quantity)
  const after = mode === 'set' ? value : row.stock + value
  const valid = quantity !== '' && Number.isInteger(value) && after >= 0 && after !== row.stock
  const save = useAction(() => api('/admin/variants/' + row.id + '/stock', { body: { mode, quantity: value, reason: mode === 'set' ? 'ADJUSTMENT' : reason, note: note || undefined } }), { success: 'Stock updated', invalidate: ['inventory', 'products', 'summary', 'analytics'], onDone: onClose })
  return (
    <Modal title={`${row.product.name} · ${row.size}`} onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="accent" disabled={!valid} loading={save.isPending} onClick={() => save.mutate(undefined)}>Save</Button></>}>
      <div className="space-y-4">
        <p className="text-sm text-muted">Current stock: <span className="font-extrabold text-ink">{row.stock}</span></p>
        <Tabs value={mode} onChange={setMode} items={[{ id: 'adjust', label: 'Add or remove' }, { id: 'set', label: 'Set exact count' }]} />
        <Field label={mode === 'set' ? 'New stock count' : 'Quantity (use − to remove)'} hint={valid ? `Stock will be ${after}` : undefined} error={quantity !== '' && after < 0 ? 'Stock cannot go below zero' : undefined}>
          <Input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} autoFocus placeholder={mode === 'set' ? '0' : '+24'} />
        </Field>
        {mode === 'adjust' && <Field label="Reason"><Select value={reason} onChange={(e) => setReason(e.target.value)}><option value="RESTOCK">Restock (new batch)</option><option value="ADJUSTMENT">Correction / damaged</option><option value="RETURN">Customer return</option></Select></Field>}
        <Field label="Note (optional)"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Supplier invoice #, batch number…" /></Field>
      </div>
    </Modal>
  )
}

function HistoryModal({ row, onClose }: { row: Row; onClose: () => void }) {
  const history = useQuery({ queryKey: ['inventory', 'history', row.id], queryFn: () => api<{ items: Move[] }>(`/admin/inventory/${row.id}/history`) })
  return (
    <Modal title={`Stock history · ${row.product.name} ${row.size}`} onClose={onClose} wide>
      {history.isLoading ? <PageLoader /> : history.error ? <ErrorState error={history.error} /> : (
        <Table head={['When', 'Change', 'Balance', 'Reason', 'By']}>
          {history.data!.items.map((move) => (
            <tr key={move.id}>
              <Td className="text-xs text-muted">{dateTime(move.createdAt)}</Td>
              <Td className={`font-extrabold ${move.delta > 0 ? 'text-success' : 'text-rose-600'}`}>{move.delta > 0 ? '+' : ''}{move.delta}</Td>
              <Td>{move.balance}</Td>
              <Td><span className="font-semibold">{label(move.reason)}</span>{move.note && <span className="block text-xs text-muted">{move.note}</span>}</Td>
              <Td className="text-xs text-muted">{move.user?.name ?? 'System'}</Td>
            </tr>
          ))}
        </Table>
      )}
    </Modal>
  )
}
