import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Container } from '../components/layout/Container.tsx'
import { ChatIcon, ChevronIcon } from '../components/icons.tsx'
import { HelpNav } from '../components/support/HelpNav.tsx'
import { topicIcons } from '../components/support/topicIcons.tsx'
import { Badge, EmptyState } from '../components/ui/Primitives.tsx'
import { PageHero } from '../components/ui/PageHero.tsx'
import { statusInfo, timeAgo, useMyTickets } from '../lib/support.ts'
import { useDocumentTitle } from '../lib/useDocumentTitle.ts'

const tabs = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'closed', label: 'Resolved' },
] as const

export function MyRequestsPage() {
  useDocumentTitle('My requests')
  const [tab, setTab] = useState<(typeof tabs)[number]['id']>('all')
  const query = useMyTickets(tab)
  const items = query.data?.items ?? []

  return (
    <div className="bg-canvas">
      <PageHero title="My requests" intro="Every conversation with our team in one place." />
      <HelpNav />
      <Container className="py-8 sm:py-10">
        <div className="mx-auto max-w-3xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-1 rounded-full bg-white p-1 ring-1 ring-line" role="tablist" aria-label="Filter requests">
              {tabs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.id}
                  onClick={() => setTab(item.id)}
                  className={`rounded-full px-4 py-2 text-sm font-bold transition ${tab === item.id ? 'bg-brand text-white shadow-sm' : 'text-ink-soft hover:text-ink'}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <Link to="/help/new" className="btn btn-accent btn-sm">
              <ChatIcon className="size-4" /> New request
            </Link>
          </div>

          <div className="mt-5">
            {query.isLoading ? (
              <div className="space-y-3" aria-busy="true">
                {[0, 1, 2].map((index) => (
                  <div key={index} className="card h-24 animate-pulse" />
                ))}
              </div>
            ) : query.isError ? (
              <div className="card px-6 py-12 text-center">
                <p className="font-extrabold">We could not load your requests</p>
                <button type="button" onClick={() => void query.refetch()} className="btn btn-brand btn-sm mt-4">
                  Try again
                </button>
              </div>
            ) : items.length === 0 ? (
              <EmptyState
                icon={<ChatIcon className="size-9" />}
                title={tab === 'all' ? 'No requests yet' : 'Nothing here'}
                text={tab === 'all' ? 'When you ask us for help, the whole conversation shows up here so you can follow it.' : 'No requests in this list.'}
                action={tab === 'all' ? { to: '/help/new', label: 'Ask for help' } : undefined}
              />
            ) : (
              <ul className="space-y-3">
                {items.map((ticket) => {
                  const Icon = topicIcons[ticket.category]
                  const info = statusInfo[ticket.status]
                  return (
                    <li key={ticket.id}>
                      <Link to={`/help/tickets/${ticket.code}`} className="card group flex items-start gap-4 p-4 transition hover:border-brand hover:shadow-lift sm:p-5">
                        <span className="relative grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
                          <Icon className="size-5" />
                          {ticket.unread && <span className="absolute -top-1 -right-1 size-3 rounded-full border-2 border-white bg-accent" aria-label="New reply" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className={`truncate ${ticket.unread ? 'font-extrabold' : 'font-bold'}`}>{ticket.subject}</span>
                            <Badge tone={info.tone}>{info.label}</Badge>
                          </span>
                          {ticket.preview && (
                            <span className="mt-1 block truncate text-sm text-muted">
                              <span className="font-semibold text-ink-soft">{ticket.lastMessageBy === 'STAFF' ? 'ClickMart: ' : 'You: '}</span>
                              {ticket.preview}
                            </span>
                          )}
                          <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                            <span className="font-mono font-bold text-ink-soft">{ticket.code}</span>
                            <span>{ticket.categoryLabel}</span>
                            {ticket.order && <span>Order {ticket.order.code}</span>}
                            <span>Updated {timeAgo(ticket.lastMessageAt)}</span>
                          </span>
                        </span>
                        <ChevronIcon className="mt-3 size-5 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-brand" />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </Container>
    </div>
  )
}
