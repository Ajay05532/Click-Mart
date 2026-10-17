import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, downloadFile } from '../api.ts'
import { useAuth } from '../auth.tsx'
import { inr, num } from '../format.ts'
import { Button, Card, EmptyState, ErrorState, Field, Input, PageHeader, PageLoader, Spinner, Table, Td, useUi, errorMessage } from '../ui.tsx'

type ReportInfo = { id: string; title: string; description: string; range: boolean }
type Column = { key: string; label: string; type?: 'money' | 'number' }
type Preview = { columns: Column[]; rows: Record<string, string | number | null>[]; total: number; range: { from: string; to: string } | null }

const pad = (value: number) => String(value).padStart(2, '0')
const ymd = (date: Date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
const fromYmd = (value: string) => new Date(`${value}T00:00:00Z`)
const shift = (value: string, days: number) => ymd(new Date(fromYmd(value).getTime() + days * 86400_000))
/** Today's date in India, whatever the browser's time zone is. */
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

function presets(now: string) {
  const [year, month] = now.split('-').map(Number)
  const monthStart = `${year}-${pad(month)}-01`
  const lastMonthEnd = shift(monthStart, -1)
  const fyYear = month >= 4 ? year : year - 1
  return [
    { id: 'today', label: 'Today', from: now, to: now },
    { id: 'yesterday', label: 'Yesterday', from: shift(now, -1), to: shift(now, -1) },
    { id: '7', label: 'Last 7 days', from: shift(now, -6), to: now },
    { id: '30', label: 'Last 30 days', from: shift(now, -29), to: now },
    { id: 'month', label: 'This month', from: monthStart, to: now },
    { id: 'lastmonth', label: 'Last month', from: `${lastMonthEnd.slice(0, 7)}-01`, to: lastMonthEnd },
    { id: 'fy', label: `FY ${fyYear}-${String((fyYear + 1) % 100).padStart(2, '0')}`, from: `${fyYear}-04-01`, to: now },
    { id: 'lastfy', label: `FY ${fyYear - 1}-${String(fyYear % 100).padStart(2, '0')}`, from: `${fyYear - 1}-04-01`, to: `${fyYear}-03-31` },
  ]
}

function cell(column: Column, value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return <span className="text-muted">—</span>
  if (column.type === 'money' && typeof value === 'number') return <span className="tabular-nums">{Number.isInteger(value) ? inr(value) : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(value)}</span>
  if (column.type === 'number' && typeof value === 'number') return <span className="tabular-nums">{num(value)}</span>
  return String(value)
}

export function ReportsPage() {
  const { isAdmin } = useAuth()
  const { toast } = useUi()
  const [params, setParams] = useSearchParams()
  const now = today()
  const list = presets(now)
  const [range, setRange] = useState({ from: shift(now, -29), to: now })
  const [busy, setBusy] = useState(false)
  const reports = useQuery({ queryKey: ['reports'], queryFn: () => api<{ items: ReportInfo[] }>('/admin/reports').then((r) => r.items) })
  const selectedId = params.get('report') ?? reports.data?.[0]?.id ?? ''
  const report = reports.data?.find((item) => item.id === selectedId)
  const validRange = range.from && range.to && range.from <= range.to
  const preview = useQuery({
    queryKey: ['report-preview', selectedId, report?.range ? range.from : '', report?.range ? range.to : ''],
    queryFn: () => api<Preview>(`/admin/reports/${selectedId}/preview`, { query: report?.range ? range : {} }),
    enabled: !!report && (!report.range || !!validRange),
    placeholderData: (previous) => previous,
    retry: false,
  })

  const download = async () => {
    if (!report) return
    setBusy(true)
    try {
      const query = report.range ? `?from=${range.from}&to=${range.to}` : ''
      await downloadFile(`/admin/reports/${report.id}/download${query}`, `clickmart-${report.id}.csv`)
    } catch (error) {
      toast(errorMessage(error), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader title="Reports" subtitle="Download sales, tax and stock figures as CSV files that open in Excel or Google Sheets. Dates are in Indian time." />
      {reports.isLoading ? (
        <PageLoader />
      ) : reports.error ? (
        <Card>
          <ErrorState error={reports.error} retry={() => void reports.refetch()} />
        </Card>
      ) : reports.data!.length === 0 ? (
        <Card>
          <EmptyState title="No reports for your account" text="Ask an administrator to give you access to reports." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <nav aria-label="Reports" className="space-y-2">
            {reports.data!.map((item) => (
              <button key={item.id} type="button" aria-current={item.id === selectedId} onClick={() => setParams({ report: item.id }, { replace: true })} className={`block w-full rounded-2xl border p-4 text-left transition ${item.id === selectedId ? 'border-brand bg-white shadow-card ring-1 ring-brand' : 'border-line/80 bg-white hover:border-brand'}`}>
                <span className="block font-extrabold">{item.title}</span>
                <span className="mt-0.5 block text-xs leading-5 text-muted">{item.description}</span>
              </button>
            ))}
          </nav>

          {report && (
            <Card className="overflow-hidden">
              <div className="space-y-4 border-b border-line p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-lg font-extrabold">{report.title}</h2>
                    <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">{report.description}</p>
                  </div>
                  <Button variant="accent" loading={busy} disabled={!!report.range && !validRange} onClick={() => void download()}>
                    Download CSV
                  </Button>
                </div>
                {report.range && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick date ranges">
                      {list.map((preset) => (
                        <button key={preset.id} type="button" onClick={() => setRange({ from: preset.from, to: preset.to })} aria-pressed={range.from === preset.from && range.to === preset.to} className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${range.from === preset.from && range.to === preset.to ? 'bg-ink text-white' : 'bg-canvas text-ink-soft hover:bg-brand-soft hover:text-brand'}`}>
                          {preset.label}
                        </button>
                      ))}
                    </div>
                    <div className="grid max-w-md grid-cols-2 gap-3">
                      <Field label="From">
                        <Input type="date" max={now} value={range.from} onChange={(event) => setRange({ ...range, from: event.target.value })} />
                      </Field>
                      <Field label="To" error={range.from && range.to && range.from > range.to ? 'Must not be before the start' : undefined}>
                        <Input type="date" max={now} value={range.to} onChange={(event) => setRange({ ...range, to: event.target.value })} />
                      </Field>
                    </div>
                  </div>
                )}
              </div>

              {preview.isLoading ? (
                <PageLoader />
              ) : preview.error ? (
                <div className="px-6 py-12 text-center">
                  <p className="font-extrabold text-rose-600">Could not build this report</p>
                  <p className="mx-auto mt-1 max-w-md text-sm text-muted">{errorMessage(preview.error)}</p>
                  {/business state/i.test(errorMessage(preview.error)) && isAdmin && (
                    <Link to="/settings" className="mt-4 inline-block text-sm font-bold text-brand hover:underline">
                      Open Settings →
                    </Link>
                  )}
                </div>
              ) : preview.data ? (
                <div className={preview.isFetching ? 'opacity-60 transition' : 'transition'}>
                  <div className="flex items-center justify-between gap-3 px-5 py-3 text-xs text-muted">
                    <span>
                      {preview.data.total === 0 ? 'No rows for this period.' : `Showing ${preview.data.rows.length} of ${num(preview.data.total)} row${preview.data.total === 1 ? '' : 's'}. The download has them all.`}
                    </span>
                    {preview.isFetching && <Spinner className="size-4" />}
                  </div>
                  {preview.data.rows.length > 0 && (
                    <Table head={preview.data.columns.map((column) => column.label)} className="max-h-[32rem] overflow-y-auto">
                      {preview.data.rows.map((row, index) => (
                        <tr key={index} className={String(row[preview.data!.columns[0].key]).startsWith('Total') ? 'bg-canvas/70 font-extrabold' : ''}>
                          {preview.data!.columns.map((column) => (
                            <Td key={column.key} className={column.type ? 'text-right' : ''}>
                              {cell(column, row[column.key])}
                            </Td>
                          ))}
                        </tr>
                      ))}
                    </Table>
                  )}
                </div>
              ) : null}
            </Card>
          )}
        </div>
      )}
    </>
  )
}
