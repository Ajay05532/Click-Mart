import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api.ts'
import { dateTime, label, minutesText, timeAgo } from '../format.ts'
import type { Paged, SupportStats, SupportTicket } from '../types.ts'
import { categories, dueLabel, priorityTone, statusText, statusTone } from '../supportMeta.ts'
import { Badge, Card, EmptyState, ErrorState, PageHeader, PageLoader, Pagination, SearchBox, Select, Table, Tabs, Td } from '../ui.tsx'

type View = 'active' | 'needsReply' | 'mine' | 'unassigned' | 'overdue' | 'resolved' | 'closed' | 'all'
const views: Record<View, Record<string, string>> = {
  active: { status: 'active' },
  needsReply: { needsReply: '1' },
  mine: { assignee: 'me', status: 'active' },
  unassigned: { assignee: 'unassigned', status: 'active' },
  overdue: { overdue: '1' },
  resolved: { status: 'RESOLVED' },
  closed: { status: 'CLOSED' },
  all: {},
}

export function SupportPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const view = (params.get('view') as View) || 'active'
  const q = params.get('q') ?? ''
  const priority = params.get('priority') ?? ''
  const category = params.get('category') ?? ''
  const sort = params.get('sort') ?? 'recent'
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

  const stats = useQuery({ queryKey: ['support-stats'], queryFn: () => api<SupportStats>('/admin/support/stats'), refetchInterval: 30_000 })
  const list = useQuery({
    queryKey: ['support-tickets', view, q, priority, category, sort, page],
    queryFn: () => api<Paged<SupportTicket>>('/admin/support/tickets', { query: { ...views[view], q, priority, category, sort, page } }),
    placeholderData: (prev) => prev,
    refetchInterval: 30_000,
  })
  const s = stats.data

  const tiles: { label: string; value: string; hint: string; view?: View; tone?: 'accent' | 'red' }[] = [
    { label: 'Needs a reply', value: String(s?.needsReply ?? '–'), hint: 'Customer wrote last', view: 'needsReply', tone: 'accent' },
    { label: 'Overdue', value: String(s?.overdue ?? '–'), hint: 'Past the reply target', view: 'overdue', tone: 'red' },
    { label: 'Unassigned', value: String(s?.unassigned ?? '–'), hint: 'Nobody owns these yet', view: 'unassigned' },
    { label: 'Avg first reply', value: minutesText(s?.avgFirstResponseMinutes), hint: 'Last 30 days' },
    { label: 'Satisfaction', value: s?.csat ? `${s.csat} ★` : '–', hint: s?.csatCount ? `${s.csatCount} rating${s.csatCount === 1 ? '' : 's'}, 90 days` : 'No ratings yet' },
  ]

  return (
    <>
      <PageHeader title="Support" subtitle="Reply to customers, keep an eye on response times and close the loop." actions={<SearchBox value={q} onChange={(value) => set({ q: value || null })} placeholder="Search ticket no., name, email or subject" />} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {tiles.map((tile) => {
          const body = (
            <>
              <p className="text-[11px] font-bold tracking-wider text-muted uppercase">{tile.label}</p>
              <p className={`mt-1.5 text-2xl font-extrabold tabular-nums ${tile.tone === 'red' && s?.overdue ? 'text-rose-600' : tile.tone === 'accent' && s?.needsReply ? 'text-accent-dark' : ''}`}>{tile.value}</p>
              <p className="mt-0.5 text-xs text-muted">{tile.hint}</p>
            </>
          )
          return tile.view ? (
            <button key={tile.label} type="button" onClick={() => set({ view: tile.view! })} className="rounded-2xl border border-line/80 bg-white p-4 text-left shadow-card transition hover:border-brand">
              {body}
            </button>
          ) : (
            <div key={tile.label} className="rounded-2xl border border-line/80 bg-white p-4 shadow-card">
              {body}
            </div>
          )
        })}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs
          value={view}
          onChange={(value) => set({ view: value === 'active' ? null : value })}
          items={[
            { id: 'active', label: 'Active', count: s ? s.open + s.inProgress + s.waiting : undefined },
            { id: 'needsReply', label: 'Needs reply', count: s?.needsReply },
            { id: 'mine', label: 'Mine', count: s?.mine },
            { id: 'unassigned', label: 'Unassigned', count: s?.unassigned },
            { id: 'overdue', label: 'Overdue', count: s?.overdue },
            { id: 'resolved', label: 'Resolved', count: s?.resolved },
            { id: 'closed', label: 'Closed', count: s?.closed },
            { id: 'all', label: 'All' },
          ]}
        />
        <div className="ml-auto flex flex-wrap gap-2">
          <Select aria-label="Priority" value={priority} onChange={(event) => set({ priority: event.target.value || null })} className="!h-10 !w-auto">
            <option value="">Any priority</option>
            {(['URGENT', 'HIGH', 'NORMAL', 'LOW'] as const).map((value) => (
              <option key={value} value={value}>
                {label(value)}
              </option>
            ))}
          </Select>
          <Select aria-label="Topic" value={category} onChange={(event) => set({ category: event.target.value || null })} className="!h-10 !w-auto">
            <option value="">Any topic</option>
            {categories.map(([id, text]) => (
              <option key={id} value={id}>
                {text}
              </option>
            ))}
          </Select>
          <Select aria-label="Sort" value={sort} onChange={(event) => set({ sort: event.target.value === 'recent' ? null : event.target.value })} className="!h-10 !w-auto">
            <option value="recent">Newest activity</option>
            <option value="oldest">Oldest activity</option>
            <option value="priority">Highest priority</option>
          </Select>
        </div>
      </div>

      <Card>
        {list.isLoading ? (
          <PageLoader />
        ) : list.error ? (
          <ErrorState error={list.error} retry={() => void list.refetch()} />
        ) : list.data!.items.length === 0 ? (
          <EmptyState title={view === 'needsReply' || view === 'active' ? 'Inbox zero' : 'No tickets here'} text={view === 'active' ? 'No active tickets right now. Nice work.' : 'Tickets matching this view will show up here.'} />
        ) : (
          <>
            <Table head={['Ticket', 'Customer', 'Priority', 'Status', 'Owner', 'Reply target', 'Last activity']}>
              {list.data!.items.map((ticket) => {
                const due = dueLabel(ticket)
                return (
                  <tr key={ticket.id} onClick={() => navigate(`/support/${ticket.id}`)} className="cursor-pointer hover:bg-canvas/60">
                    <Td className="max-w-[22rem]">
                      <div className="flex items-start gap-2.5">
                        <span className={`mt-1.5 size-2 shrink-0 rounded-full ${ticket.needsReply ? 'bg-accent' : 'bg-transparent'}`} aria-label={ticket.needsReply ? 'Needs a reply' : undefined} />
                        <div className="min-w-0">
                          <p className={`truncate ${ticket.needsReply ? 'font-extrabold' : 'font-semibold'}`}>{ticket.subject}</p>
                          <p className="truncate text-xs text-muted">
                            <span className="font-mono font-bold text-brand">{ticket.code}</span> · {ticket.categoryLabel}
                            {ticket.order ? ` · ${ticket.order.code}` : ''}
                          </p>
                          {ticket.preview && <p className="mt-0.5 truncate text-xs text-muted">{ticket.preview}</p>}
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <p className="font-semibold">{ticket.customer.name}</p>
                      <p className="max-w-[12rem] truncate text-xs text-muted">{ticket.customer.email}</p>
                    </Td>
                    <Td>
                      <Badge tone={priorityTone[ticket.priority]}>{label(ticket.priority)}</Badge>
                    </Td>
                    <Td>
                      <Badge tone={statusTone[ticket.status]}>{statusText[ticket.status]}</Badge>
                    </Td>
                    <Td className="text-muted">{ticket.assignee?.name ?? <span className="text-xs">Unassigned</span>}</Td>
                    <Td>{due ? <span className={`text-xs font-bold ${ticket.overdue ? 'text-rose-600' : 'text-muted'}`}>{due}</span> : <span className="text-xs text-muted">—</span>}</Td>
                    <Td className="text-muted">
                      <span title={dateTime(ticket.lastMessageAt)}>{timeAgo(ticket.lastMessageAt)}</span>
                    </Td>
                  </tr>
                )
              })}
            </Table>
            <Pagination page={list.data!.page} pages={list.data!.pages} total={list.data!.total} onChange={(next) => set({ page: String(next) })} />
          </>
        )}
      </Card>
      <p className="mt-3 text-xs text-muted">Reply targets: urgent 2 hours, high 8 hours, normal 1 day, low 2 days. Money and item problems start as high.</p>
    </>
  )
}
