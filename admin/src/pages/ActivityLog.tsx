import { useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api.ts'
import { AdminOnly } from '../Layout.tsx'
import { dateTime, label, timeAgo } from '../format.ts'
import { Card, EmptyState, ErrorState, PageHeader, PageLoader, Pagination, Select, Tabs } from '../ui.tsx'

type Log = {
  id: string
  action: string
  entity: string
  entityId: string | null
  diff: Record<string, unknown> | null
  createdAt: string
  actor: { name: string; email: string } | null
  record: string | null
}
type Page = { items: Log[]; total: number; page: number; pages: number }

type Area = 'orders' | 'catalog' | 'marketing' | 'support' | 'people' | 'store'
const areas: Record<Area, { label: string; entities: string[]; tone: string; icon: string }> = {
  orders: { label: 'Orders', entities: ['Order'], tone: 'bg-brand-soft text-brand', icon: 'M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21zM9 8h6M9 12h6' },
  catalog: { label: 'Catalogue', entities: ['Product', 'ProductVariant', 'Category', 'Brand'], tone: 'bg-emerald-50 text-emerald-700', icon: 'M3 8l9-5 9 5-9 5-9-5zM3 8v8l9 5 9-5V8M12 13v8' },
  marketing: { label: 'Marketing', entities: ['Offer', 'Coupon', 'Banner', 'Review'], tone: 'bg-orange-50 text-orange-700', icon: 'M19 5L5 19M7.5 8.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM16.5 18.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z' },
  support: { label: 'Support', entities: ['SupportTicket', 'Faq'], tone: 'bg-violet-50 text-violet-700', icon: 'M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.2-4.4A8 8 0 1 1 21 12z' },
  people: { label: 'People', entities: ['Login'], tone: 'bg-sky-50 text-sky-700', icon: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 19a6 6 0 0 1 12 0M16 11a2.5 2.5 0 1 0 0-5M17 19a5 5 0 0 0-2.2-4.1' },
  store: { label: 'Store', entities: ['Setting', 'Report'], tone: 'bg-slate-100 text-slate-700', icon: 'M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-8' },
}
const areaOf = (entity: string) => (Object.keys(areas) as Area[]).find((key) => areas[key].entities.includes(entity)) ?? 'store'

const noun: Record<string, string> = {
  Product: 'product',
  ProductVariant: 'pack size',
  Category: 'category',
  Brand: 'brand',
  Order: 'order',
  Offer: 'offer',
  Coupon: 'coupon',
  Banner: 'banner',
  Review: 'review',
  SupportTicket: 'ticket',
  Faq: 'help article',
  Login: 'account',
  Setting: 'settings',
  Report: 'report',
}

/** Where a record can be opened in the admin. Deleted records get no link. */
function linkFor(log: Log): string | null {
  if (!log.entityId || /delete$/.test(log.action)) return null
  const id = encodeURIComponent(log.entityId)
  switch (log.entity) {
    case 'Order':
      return `/orders?open=${id}`
    case 'SupportTicket':
      return `/support/${id}`
    case 'Product':
      return log.record ? `/products?q=${encodeURIComponent(log.record)}` : '/products'
    case 'ProductVariant':
      return '/inventory'
    case 'Category':
      return '/categories'
    case 'Brand':
      return '/brands'
    case 'Offer':
      return '/offers'
    case 'Coupon':
      return '/coupons'
    case 'Banner':
      return '/banners'
    case 'Review':
      return '/reviews'
    case 'Faq':
      return '/help-content'
    case 'Report':
      return '/reports'
    default:
      return null
  }
}

const count = (value: unknown) => (typeof value === 'number' ? value : Array.isArray(value) ? value.length : null)
const plural = (n: number | null, word: string) => (n === null ? `${word}s` : `${n} ${word}${n === 1 ? '' : 's'}`)

/** Turns "order.status.packed" into "moved ORD-1 to Packed" and so on. */
function describe(log: Log, target: ReactNode): ReactNode {
  const [subject, verb, extra] = log.action.split('.')
  const diff = log.diff ?? {}
  const thing = noun[log.entity] ?? label(log.entity)
  if (subject === 'order' && verb === 'status') return <>moved {target} to <b className="font-bold">{label(extra ?? '')}</b></>
  if (subject === 'order' && verb === 'bulk') return <>marked {plural(count(diff.count), 'order')} as <b className="font-bold">{label(extra ?? '')}</b></>
  if (log.action === 'order.refund') return <>refunded {target}</>
  if (subject === 'product' && verb === 'bulk') {
    const n = count(diff.ids)
    if (extra === 'activate') return <>showed {plural(n, 'product')} in the shop</>
    if (extra === 'deactivate') return <>hid {plural(n, 'product')} from the shop</>
    if (extra === 'bestseller') return <>marked {plural(n, 'product')} as bestsellers</>
    if (extra === 'priceChange') return <>changed prices by <b className="font-bold">{String(diff.percent ?? '')}%</b> on {plural(n, 'product')}</>
    return <>updated {plural(n, 'product')} in bulk</>
  }
  if (log.action === 'import.products') return <>imported products from a CSV file</>
  if (log.action === 'import.stock') return <>updated stock from a CSV file</>
  if (log.action === 'report.download') return <>downloaded the <b className="font-bold">{label(log.entityId ?? 'report')}</b> report</>
  if (log.action === 'settings.update') return <>updated the store settings</>
  if (log.action === 'stock.change') return <>changed the stock of {target}</>
  if (log.action === 'customer.block') return <>blocked {target}</>
  if (log.action === 'customer.unblock') return <>unblocked {target}</>
  if (log.action === 'staff.create') return <>added {target} to the team</>
  if (log.action === 'staff.update') return <>changed access for {target}</>
  if (subject === 'review') return <>{verb === 'approved' ? 'approved' : verb === 'rejected' ? 'rejected' : `marked ${verb} on`} {target}</>
  if (log.action === 'support.update') return <>updated {target}</>
  const verbs: Record<string, string> = { create: 'added', update: 'edited', delete: 'deleted', archive: 'hid' }
  return <>{verbs[verb ?? ''] ?? label(verb ?? 'changed').toLowerCase()} {thing} {target}</>
}

const humanKey = (key: string) => label(key.replace(/([a-z0-9])([A-Z])/g, '$1_$2'))
function showValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return dateTime(value)
  if (Array.isArray(value)) return value.length ? value.map((item) => (typeof item === 'object' ? JSON.stringify(item) : String(item))).join(', ') : 'None'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function dayHeading(value: string) {
  const day = new Date(value)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  if (day.toDateString() === today.toDateString()) return 'Today'
  if (day.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return day.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
}

function Entry({ log }: { log: Log }) {
  const [open, setOpen] = useState(false)
  const area = areas[areaOf(log.entity)]
  const details = Object.entries(log.diff ?? {}).filter(([key, value]) => key !== 'id' && value !== undefined)
  const href = linkFor(log)
  const name = log.record ?? (log.entityId ? `#${log.entityId.slice(0, 8)}` : null)
  const target = name ? (
    href ? (
      <Link to={href} className="font-bold text-brand hover:underline">
        {name}
      </Link>
    ) : (
      <b className="font-bold">{name}</b>
    )
  ) : null

  return (
    <li className="relative flex gap-3 px-4 py-3 sm:px-5">
      <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${area.tone}`} aria-hidden="true">
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d={area.icon} />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-6 text-ink-soft">
          <b className="font-extrabold text-ink">{log.actor?.name ?? 'System'}</b> {describe(log, target)}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
          <time dateTime={log.createdAt} title={dateTime(log.createdAt)}>
            {new Date(log.createdAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })} · {timeAgo(log.createdAt)}
          </time>
          <span className="rounded bg-canvas px-1.5 py-px font-mono text-[10px]">{log.action}</span>
          {details.length > 0 && (
            <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="font-bold text-brand hover:underline">
              {open ? 'Hide details' : 'Details'}
            </button>
          )}
        </p>
        {open && (
          <dl className="anim-fade mt-2 grid gap-x-4 gap-y-1 rounded-xl bg-canvas p-3 text-xs sm:grid-cols-[10rem_minmax(0,1fr)]">
            {details.map(([key, value]) => (
              <div key={key} className="contents">
                <dt className="font-semibold text-muted">{humanKey(key)}</dt>
                <dd className="break-words text-ink">{showValue(value)}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </li>
  )
}

export function AuditPage() {
  const [params, setParams] = useSearchParams()
  const area = (params.get('area') as Area | null) ?? null
  const actor = params.get('actor') ?? ''
  const page = Number(params.get('page') ?? 1)
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    if (!('page' in patch)) next.delete('page')
    setParams(next, { replace: true })
  }

  const team = useQuery({ queryKey: ['staff'], queryFn: () => api<{ items: { id: string; name: string }[] }>('/admin/staff'), staleTime: 60_000 })
  const query = useQuery({
    queryKey: ['audit', area, actor, page],
    queryFn: () => api<Page>('/admin/audit', { query: { page, actor, entity: area ? areas[area].entities.join(',') : undefined } }),
    placeholderData: (previous) => previous,
  })

  const groups: { day: string; items: Log[] }[] = []
  for (const log of query.data?.items ?? []) {
    const day = dayHeading(log.createdAt)
    const last = groups[groups.length - 1]
    if (last?.day === day) last.items.push(log)
    else groups.push({ day, items: [log] })
  }

  return (
    <AdminOnly>
      <PageHeader title="Activity log" subtitle="Every change made in the admin: who did it, what changed and when." />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs<'all' | Area>
          value={area ?? 'all'}
          onChange={(value) => set({ area: value === 'all' ? null : value })}
          items={[{ id: 'all', label: 'All' }, ...(Object.keys(areas) as Area[]).map((key) => ({ id: key, label: areas[key].label }))]}
        />
        <Select value={actor} onChange={(event) => set({ actor: event.target.value || null })} aria-label="Who" className="!w-48">
          <option value="">Everyone</option>
          {(team.data?.items ?? []).map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </Select>
      </div>

      <Card>
        {query.isLoading ? (
          <PageLoader />
        ) : query.error ? (
          <ErrorState error={query.error} retry={() => void query.refetch()} />
        ) : groups.length === 0 ? (
          <EmptyState title="Nothing here yet" text={area || actor ? 'No activity matches these filters.' : 'Changes made in the admin will appear here.'} />
        ) : (
          <>
            {groups.map((group, index) => (
              <section key={group.day}>
                <h2 className={`sticky top-[57px] z-10 border-b border-line bg-canvas/90 px-4 py-2 ${index === 0 ? 'rounded-t-2xl' : ''} text-[11px] font-extrabold tracking-wider text-muted uppercase backdrop-blur sm:px-5`}>
                  {group.day} <span className="font-semibold normal-case">· {group.items.length} {group.items.length === 1 ? 'change' : 'changes'}</span>
                </h2>
                <ul className="divide-y divide-line">
                  {group.items.map((log) => (
                    <Entry key={log.id} log={log} />
                  ))}
                </ul>
              </section>
            ))}
            <Pagination page={query.data!.page} pages={query.data!.pages} total={query.data!.total} onChange={(next) => set({ page: String(next) })} />
          </>
        )}
      </Card>
    </AdminOnly>
  )
}
