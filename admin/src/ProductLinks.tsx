import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from './api.ts'
import { downloadText } from './csv.ts'
import { ExportButton } from './ExportButton.tsx'
import { Badge, Button, ErrorState, Modal, PageLoader, Switch, useUi } from './ui.tsx'

type Item = { name: string; category: string; status: 'Live' | 'Hidden'; link: string; from: number | ''; sizes: string }

/** Every product's storefront address in one place: copy them, save them as a text file, or get the CSV. */
export function ProductLinks({ onClose }: { onClose: () => void }) {
  const { toast } = useUi()
  const [hidden, setHidden] = useState(false)
  const query = useQuery({ queryKey: ['product-links', hidden], queryFn: () => api<{ items: Item[]; store: string }>('/admin/products/links', { query: { includeHidden: hidden ? '1' : '' } }), placeholderData: (previous) => previous })
  const items = query.data?.items ?? []
  const text = items.map((item) => item.link).join('\n')

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      toast(`${items.length} link${items.length === 1 ? '' : 's'} copied`)
    } catch {
      toast('Your browser would not allow copying. Use Download instead.', 'error')
    }
  }

  return (
    <Modal wide title="Product links" onClose={onClose} footer={<Button variant="outline" onClick={onClose}>Close</Button>}>
      <div className="space-y-4">
        <p className="text-sm leading-6 text-ink-soft">
          The web address of each product on <b>{query.data?.store ?? 'your shop'}</b>. Use them in ads, WhatsApp, marketplaces and social posts. The CSV also has the price, pack sizes and a link for each pack size.
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-3 text-sm font-semibold">
            <Switch checked={hidden} label="Include hidden products" onChange={setHidden} /> Include hidden products
          </label>
          <span className="text-sm text-muted">{query.isLoading ? 'Loading…' : `${items.length} link${items.length === 1 ? '' : 's'}`}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="accent" disabled={!items.length} onClick={() => void copy()}>Copy all links</Button>
          <Button variant="outline" disabled={!items.length} onClick={() => downloadText('clickmart-product-links.txt', items.map((item) => [item.link]))}>Download .txt</Button>
          <ExportButton report="product-links">Download CSV</ExportButton>
        </div>
        {query.isLoading ? (
          <PageLoader />
        ) : query.error ? (
          <ErrorState error={query.error} retry={() => void query.refetch()} />
        ) : items.length === 0 ? (
          <p className="rounded-xl bg-canvas px-4 py-6 text-center text-sm text-muted">No live products yet.</p>
        ) : (
          <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-xl ring-1 ring-line">
            {items.map((item) => (
              <li key={item.link} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{item.name} {item.status === 'Hidden' && <Badge tone="orange">Hidden</Badge>}</p>
                  <a href={item.link} target="_blank" rel="noreferrer" className="block truncate text-xs text-brand hover:underline">{item.link}</a>
                </div>
                <Button size="sm" variant="ghost" onClick={() => void navigator.clipboard.writeText(item.link).then(() => toast('Link copied'), () => toast('Could not copy', 'error'))}>Copy</Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}
