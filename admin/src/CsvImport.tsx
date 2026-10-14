import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { api } from './api.ts'
import { downloadText, readTable, type CsvTable } from './csv.ts'
import { Badge, Button, Modal, Spinner, errorMessage } from './ui.tsx'

type Kind = 'products' | 'stock'
type Problem = { line?: number; name?: string; sku?: string; message: string }
type Result = {
  dryRun: boolean
  summary: Record<string, number>
  products?: { name: string; line: number; action: string; variants: { size: string; action: string }[] }[]
  items?: { line: number; sku: string; product: string; size: string; before: number; after: number }[]
  errors: Problem[]
  failures?: Problem[]
}

const MAX_ROWS = 800

const setups = {
  products: {
    title: 'Import products from a CSV',
    endpoint: '/admin/imports/products',
    required: ['name', 'size', 'price'],
    known: ['name', 'category', 'subcategory', 'brand', 'blurb', 'description', 'hsn', 'gst', 'origin', 'ingredients', 'shelf_life_days', 'bestseller', 'active', 'images', 'size', 'variant_active', 'sku', 'price', 'mrp', 'stock', 'weight_grams', 'barcode', 'low_stock_at'],
    template: [
      ['name', 'category', 'subcategory', 'brand', 'description', 'hsn', 'gst', 'size', 'sku', 'price', 'mrp', 'stock'],
      ['Example Almonds', 'Your category name', '', '', 'Short description', '0802', '5', '250 g', '', '299', '349', '40'],
      ['Example Almonds', '', '', '', '', '', '', '500 g', '', '579', '649', '25'],
    ],
    help: (
      <>
        One row per pack size. Rows with the same <b>name</b> become one product, and later rows can leave the product columns empty. Existing products are matched by name: their prices, stock and details are updated, and new sizes are added. <b>category</b> and <b>brand</b> must already exist. Prices are whole rupees.
      </>
    ),
    invalidate: ['products', 'inventory', 'categories', 'summary'],
  },
  stock: {
    title: 'Bulk stock update from a CSV',
    endpoint: '/admin/imports/stock',
    required: ['sku'],
    known: ['sku', 'stock', 'adjust', 'reason', 'note'],
    template: [
      ['sku', 'stock', 'adjust', 'reason', 'note'],
      ['EXAMPLE-ALMONDS-250-G', '120', '', 'RESTOCK', 'Count after delivery'],
      ['EXAMPLE-ALMONDS-500-G', '', '-3', 'ADJUSTMENT', 'Damaged in packing'],
    ],
    help: (
      <>
        One row per pack size, found by its <b>sku</b>. Fill <b>stock</b> to set the new total, or <b>adjust</b> to add (5) or remove (-3), never both. <b>reason</b> can be RESTOCK, ADJUSTMENT or RETURN. Every change is logged with your name.
      </>
    ),
    invalidate: ['inventory', 'products', 'summary'],
  },
} as const

const actionTone = { create: 'green', update: 'blue', unchanged: 'gray', skipped: 'red' } as const

export function CsvImport({ kind, onClose }: { kind: Kind; onClose: () => void }) {
  const setup = setups[kind]
  const client = useQueryClient()
  const picker = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [table, setTable] = useState<CsvTable | null>(null)
  const [fileError, setFileError] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [busy, setBusy] = useState<'check' | 'save' | null>(null)
  const [error, setError] = useState('')

  const choose = async (file: File | undefined) => {
    if (!file) return
    setResult(null)
    setError('')
    setFileError('')
    setFileName(file.name)
    try {
      const parsed = readTable(await file.text())
      const missing = setup.required.filter((name) => !parsed.headers.includes(name))
      if (!parsed.rows.length) setFileError('This file has no rows under the header.')
      else if (missing.length) setFileError(`The file is missing the column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`)
      else if (parsed.rows.length > MAX_ROWS) setFileError(`This file has ${parsed.rows.length} rows. Import up to ${MAX_ROWS} at a time.`)
      setTable(parsed)
    } catch {
      setTable(null)
      setFileError('We could not read that file. Save it as CSV (comma separated) and try again.')
    }
  }

  const send = async (dryRun: boolean) => {
    if (!table) return
    setBusy(dryRun ? 'check' : 'save')
    setError('')
    try {
      const data = await api<Result>(setup.endpoint, { body: { rows: table.rows, dryRun } })
      setResult(data)
      if (!dryRun) for (const key of setup.invalidate) void client.invalidateQueries({ queryKey: [key] })
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setBusy(null)
    }
  }

  const unknown = table ? table.headers.filter((name) => !(setup.known as readonly string[]).includes(name)) : []
  const s = result?.summary
  const writes = kind === 'products' ? (s?.productsToCreate ?? 0) + (s?.productsToUpdate ?? 0) : (s?.toChange ?? 0)
  const done = !!result && !result.dryRun
  const canSave = !!result?.dryRun && writes > 0

  return (
    <Modal
      wide
      title={setup.title}
      onClose={onClose}
      footer={
        done ? (
          <Button variant="accent" onClick={onClose}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            {canSave ? (
              <Button variant="accent" loading={busy === 'save'} onClick={() => void send(false)}>
                {kind === 'products' ? `Import ${s!.productsToCreate + s!.productsToUpdate} product${s!.productsToCreate + s!.productsToUpdate === 1 ? '' : 's'}` : `Apply ${s!.toChange} change${s!.toChange === 1 ? '' : 's'}`}
              </Button>
            ) : (
              <Button variant="accent" disabled={!table || !!fileError} loading={busy === 'check'} onClick={() => void send(true)}>
                Check the file
              </Button>
            )}
          </>
        )
      }
    >
      <div className="space-y-4">
        {!done && (
          <>
            <p className="text-sm leading-6 text-ink-soft">{setup.help}</p>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" size="sm" onClick={() => downloadText(`clickmart-${kind}-template.csv`, setup.template.map((row) => [...row]))}>
                Download a template
              </Button>
              <Button variant="soft" size="sm" onClick={() => picker.current?.click()}>
                {fileName ? 'Choose another file' : 'Choose CSV file'}
              </Button>
              <input ref={picker} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => { void choose(event.target.files?.[0]); event.target.value = '' }} />
              {fileName && <span className="text-sm font-semibold">{fileName}{table && !fileError ? <span className="font-normal text-muted"> · {table.rows.length} row{table.rows.length === 1 ? '' : 's'}</span> : null}</span>}
            </div>
            {fileError && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{fileError}</p>}
            {unknown.length > 0 && !fileError && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">These columns are not used and will be ignored: <b>{unknown.join(', ')}</b></p>}
          </>
        )}

        {busy === 'check' && <p className="flex items-center gap-2 text-sm text-muted"><Spinner className="size-4" /> Checking every row…</p>}
        {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p>}

        {result && s && (
          <div className="space-y-4">
            {done && (
              <div className={`rounded-2xl px-5 py-4 ${(s.failed ?? 0) > 0 ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-800'}`}>
                <p className="font-extrabold">{kind === 'products' ? `${s.saved} product${s.saved === 1 ? '' : 's'} saved` : `${s.saved} stock change${s.saved === 1 ? '' : 's'} saved`}{(s.failed ?? 0) > 0 ? `, ${s.failed} could not be saved` : ''}</p>
                {s.errors > 0 && <p className="mt-0.5 text-sm">{s.errors} row{s.errors === 1 ? ' was' : 's were'} skipped because of problems listed below.</p>}
              </div>
            )}

            {kind === 'products' ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Tile label="New products" value={s.productsToCreate} tone="green" />
                <Tile label="Products to update" value={s.productsToUpdate} tone="blue" />
                <Tile label="New pack sizes" value={s.variantsToCreate} />
                <Tile label="Pack sizes to update" value={s.variantsToUpdate} />
                {s.productsUnchanged > 0 && <Tile label="Already up to date" value={s.productsUnchanged} />}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <Tile label="Will change" value={s.toChange} tone="green" />
                <Tile label="Already correct" value={s.unchanged} />
                <Tile label="Problems" value={s.errors} tone={s.errors ? 'red' : undefined} />
              </div>
            )}

            {(result.failures?.length ?? 0) > 0 && (
              <Problems title="Could not be saved" problems={result.failures!} />
            )}
            {result.errors.length > 0 && <Problems title={`Problems found (${result.errors.length})${done ? '' : ': fix these in your file, or continue and these rows are skipped'}`} problems={result.errors} />}

            {result.dryRun && kind === 'products' && result.products && result.products.length > 0 && (
              <div className="max-h-60 overflow-y-auto rounded-xl ring-1 ring-line">
                <table className="w-full text-left text-sm">
                  <tbody className="divide-y divide-line">
                    {result.products.map((product) => (
                      <tr key={`${product.name}-${product.line}`}>
                        <td className="px-4 py-2 font-semibold">{product.name}</td>
                        <td className="px-4 py-2"><Badge tone={actionTone[product.action as keyof typeof actionTone] ?? 'gray'}>{product.action === 'create' ? 'New product' : product.action === 'update' ? 'Update' : product.action === 'unchanged' ? 'No changes' : 'Skipped'}</Badge></td>
                        <td className="px-4 py-2 text-xs text-muted">{product.variants.map((variant) => `${variant.size} (${variant.action})`).join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {result.dryRun && kind === 'stock' && result.items && result.items.length > 0 && (
              <div className="max-h-60 overflow-y-auto rounded-xl ring-1 ring-line">
                <table className="w-full text-left text-sm">
                  <thead className="bg-canvas/80 text-[11px] font-bold tracking-wider text-muted uppercase"><tr><th className="px-4 py-2">Product</th><th className="px-4 py-2">SKU</th><th className="px-4 py-2 text-right">Now</th><th className="px-4 py-2 text-right">After</th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {result.items.map((item) => (
                      <tr key={item.sku}>
                        <td className="px-4 py-2 font-semibold">{item.product} <span className="font-normal text-muted">{item.size}</span></td>
                        <td className="px-4 py-2 font-mono text-xs text-muted">{item.sku}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{item.before}</td>
                        <td className={`px-4 py-2 text-right font-bold tabular-nums ${item.after === item.before ? 'text-muted' : item.after > item.before ? 'text-emerald-700' : 'text-rose-600'}`}>{item.after}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {result.dryRun && writes === 0 && result.errors.length === 0 && <p className="rounded-xl bg-canvas px-4 py-3 text-sm text-muted">Nothing would change. Everything in this file already matches.</p>}
          </div>
        )}
      </div>
    </Modal>
  )
}

function Tile({ label, value, tone }: { label: string; value: number; tone?: 'green' | 'blue' | 'red' }) {
  const color = tone === 'green' ? 'text-emerald-700' : tone === 'blue' ? 'text-brand' : tone === 'red' ? 'text-rose-600' : ''
  return (
    <div className="rounded-xl bg-canvas px-4 py-3">
      <p className="text-[11px] font-bold tracking-wider text-muted uppercase">{label}</p>
      <p className={`mt-1 text-xl font-extrabold tabular-nums ${color}`}>{value}</p>
    </div>
  )
}

function Problems({ title, problems }: { title: string; problems: Problem[] }) {
  return (
    <div className="rounded-xl bg-rose-50 px-4 py-3">
      <p className="text-sm font-extrabold text-rose-700">{title}</p>
      <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-sm text-rose-800">
        {problems.slice(0, 50).map((problem, index) => (
          <li key={index}>
            {problem.line ? <b>Line {problem.line}: </b> : problem.name ? <b>{problem.name}: </b> : problem.sku ? <b>{problem.sku}: </b> : null}
            {problem.message}
          </li>
        ))}
        {problems.length > 50 && <li className="font-semibold">…and {problems.length - 50} more</li>}
      </ul>
    </div>
  )
}
