import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { HelpNav } from '../components/support/HelpNav.tsx'
import { Container } from '../components/layout/Container.tsx'
import { BoxIcon, CardIcon, ChatIcon, ChevronIcon, ClockIcon, HeadsetIcon, MailIcon, PhoneIcon, RefreshIcon, SearchIcon, TruckIcon } from '../components/icons.tsx'
import { useAuth } from '../context/AuthContext.tsx'
import { defaultFaqs } from '../data/helpFaq.ts'
import { formatPrice } from '../lib/money.ts'
import { useStoreSettings } from '../lib/catalog.ts'
import { storeEmail, storePhone, storePhoneTel } from '../lib/store.ts'
import { api } from '../lib/api.ts'
import { faqCategoryLabel, isActiveTicket, statusInfo, timeAgo, useFaqs, useMyTickets, type Faq, type FaqCategory } from '../lib/support.ts'
import { Badge } from '../components/ui/Primitives.tsx'
import { useDocumentTitle } from '../lib/useDocumentTitle.ts'

const quick = [
  { to: '/orders', label: 'Track an order', text: 'See where your pouches are right now', icon: TruckIcon },
  { to: '/orders', label: 'Cancel an order', text: 'Open an order and cancel before it is packed', icon: BoxIcon },
  { to: '/help/new?topic=REFUND_RETURN', label: 'Return or replace', text: 'Damaged, wrong or not fresh', icon: RefreshIcon },
  { to: '/help/new?topic=PAYMENT', label: 'Payment or refund', text: 'Failed payment, money deducted, refund status', icon: CardIcon },
]

const VOTED_KEY = 'clickmart-faq-votes'
const readVotes = (): Record<string, boolean> => {
  try {
    return JSON.parse(localStorage.getItem(VOTED_KEY) ?? '{}') as Record<string, boolean>
  } catch {
    return {}
  }
}

export function HelpCenterPage() {
  useDocumentTitle('Help centre')
  const { user } = useAuth()
  const settings = useStoreSettings()
  const faqQuery = useFaqs()
  const tickets = useMyTickets('open')
  const [term, setTerm] = useState('')
  const [category, setCategory] = useState<FaqCategory | 'ALL'>('ALL')
  const [openId, setOpenId] = useState<string | null>(null)
  const [votes, setVotes] = useState<Record<string, boolean>>(readVotes)

  // Articles the team published replace the built-in answers.
  const published = faqQuery.data ?? []
  const faqs: Faq[] = published.length ? published : defaultFaqs
  const categories = useMemo(() => (Object.keys(faqCategoryLabel) as FaqCategory[]).filter((id) => faqs.some((faq) => faq.category === id)), [faqs])
  const words = term.toLowerCase().split(/\s+/).filter(Boolean)
  const visible = faqs.filter((faq) => (category === 'ALL' || faq.category === category) && words.every((word) => `${faq.question} ${faq.answer}`.toLowerCase().includes(word)))

  const vote = (faq: Faq, helpful: boolean) => {
    const next = { ...votes, [faq.id]: helpful }
    setVotes(next)
    try {
      localStorage.setItem(VOTED_KEY, JSON.stringify(next))
    } catch {
      // Voting still works for this visit without storage.
    }
    if (!faq.id.startsWith('default-')) void api(`/support/faqs/${faq.id}/vote`, { body: { helpful } }).catch(() => undefined)
  }

  const open = (tickets.data?.items ?? []).filter((ticket) => isActiveTicket(ticket.status)).slice(0, 3)

  return (
    <div className="bg-canvas">
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-dark via-brand to-[#1d56b8] text-white">
        <div aria-hidden="true" className="pointer-events-none absolute -top-24 -right-16 size-80 rounded-full bg-accent/20 blur-3xl" />
        <Container className="relative py-14 text-center sm:py-16">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-bold tracking-wide text-white/90 ring-1 ring-white/15">
            <HeadsetIcon className="size-4" /> ClickMart Help centre
          </p>
          <h1 className="mx-auto mt-5 max-w-2xl text-3xl font-extrabold tracking-tight sm:text-5xl">How can we help you today?</h1>
          <p className="mx-auto mt-3 max-w-xl text-white/80">Quick answers, order help and a real team behind every reply.</p>
          <form
            role="search"
            onSubmit={(event) => {
              event.preventDefault()
              document.getElementById('answers')?.scrollIntoView({ behavior: 'smooth' })
            }}
            className="relative mx-auto mt-8 max-w-xl"
          >
            <SearchIcon className="pointer-events-none absolute top-1/2 left-5 size-5 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Search for answers, for example refund or delivery"
              aria-label="Search the help centre"
              className="h-14 w-full rounded-full border-0 bg-white pr-5 pl-13 text-base text-ink shadow-pop outline-none placeholder:text-muted/70 focus:ring-4 focus:ring-white/30"
            />
          </form>
        </Container>
      </section>

      <HelpNav />

      <Container className="py-8 sm:py-10">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {quick.map((item) => (
            <li key={item.label}>
              <Link to={item.to} className="card group flex h-full items-start gap-4 p-5 transition hover:-translate-y-0.5 hover:border-brand hover:shadow-lift">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand transition group-hover:bg-brand group-hover:text-white">
                  <item.icon className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block font-extrabold">{item.label}</span>
                  <span className="mt-0.5 block text-sm leading-5 text-muted">{item.text}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
          <section id="answers" aria-labelledby="answers-title" className="scroll-mt-24">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 id="answers-title" className="text-2xl font-extrabold tracking-tight">
                Answers to common questions
              </h2>
              <p className="text-sm text-muted" aria-live="polite">
                {visible.length} {visible.length === 1 ? 'answer' : 'answers'}
              </p>
            </div>

            <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Topics">
              {(['ALL', ...categories] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={category === id}
                  onClick={() => setCategory(id)}
                  className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition ${category === id ? 'bg-brand text-white shadow-sm' : 'bg-white text-ink-soft ring-1 ring-line hover:ring-brand'}`}
                >
                  {id === 'ALL' ? 'All topics' : faqCategoryLabel[id]}
                </button>
              ))}
            </div>

            {visible.length === 0 ? (
              <div className="card mt-4 px-6 py-12 text-center">
                <span className="mx-auto grid size-14 place-items-center rounded-full bg-brand-soft text-brand">
                  <SearchIcon className="size-6" />
                </span>
                <p className="mt-4 font-extrabold">No answer matches “{term}”</p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-muted">Try a different word, or ask our team directly. We read every message.</p>
                <Link to="/help/new" className="btn btn-accent mt-5">
                  Ask for help
                </Link>
              </div>
            ) : (
              <ul className="card mt-4 divide-y divide-line overflow-hidden">
                {visible.map((faq) => {
                  const expanded = openId === faq.id
                  return (
                    <li key={faq.id}>
                      <h3>
                        <button
                          type="button"
                          aria-expanded={expanded}
                          aria-controls={`faq-${faq.id}`}
                          onClick={() => setOpenId(expanded ? null : faq.id)}
                          className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-canvas/70 sm:px-6"
                        >
                          <span className="min-w-0">
                            <span className="block font-bold">{faq.question}</span>
                            <span className="mt-0.5 block text-xs font-semibold text-muted">{faqCategoryLabel[faq.category]}</span>
                          </span>
                          <ChevronIcon className={`size-5 shrink-0 text-muted transition ${expanded ? 'text-brand' : ''}`} dir={expanded ? 'up' : 'down'} />
                        </button>
                      </h3>
                      {expanded && (
                        <div id={`faq-${faq.id}`} className="motion-fade px-5 pb-5 sm:px-6">
                          <p className="max-w-2xl text-sm leading-7 whitespace-pre-line text-ink-soft">{faq.answer}</p>
                          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
                            {votes[faq.id] === undefined ? (
                              <>
                                <span className="font-semibold text-muted">Was this helpful?</span>
                                <button type="button" onClick={() => vote(faq, true)} className="rounded-full px-3.5 py-1.5 font-bold ring-1 ring-line hover:bg-emerald-50 hover:text-success hover:ring-success">
                                  Yes
                                </button>
                                <button type="button" onClick={() => vote(faq, false)} className="rounded-full px-3.5 py-1.5 font-bold ring-1 ring-line hover:bg-orange-50 hover:text-accent-dark hover:ring-accent">
                                  No
                                </button>
                              </>
                            ) : votes[faq.id] ? (
                              <span className="font-semibold text-success">Thanks for the feedback.</span>
                            ) : (
                              <span className="font-semibold text-ink-soft">
                                Sorry about that.{' '}
                                <Link to="/help/new" className="font-extrabold text-brand underline underline-offset-2">
                                  Ask our team
                                </Link>
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <aside className="space-y-4 lg:sticky lg:top-24">
            {user && open.length > 0 && (
              <section className="card p-5">
                <div className="flex items-center justify-between">
                  <h2 className="font-extrabold">Your open requests</h2>
                  <Link to="/help/tickets" className="text-sm font-bold text-brand hover:underline">
                    View all
                  </Link>
                </div>
                <ul className="mt-3 space-y-2">
                  {open.map((ticket) => (
                    <li key={ticket.id}>
                      <Link to={`/help/tickets/${ticket.code}`} className="block rounded-xl p-3 ring-1 ring-line transition hover:bg-canvas hover:ring-brand">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-bold">{ticket.subject}</span>
                          {ticket.unread && <span className="size-2.5 shrink-0 rounded-full bg-accent" aria-label="New reply" />}
                        </span>
                        <span className="mt-1.5 flex items-center justify-between gap-2 text-xs text-muted">
                          <Badge tone={statusInfo[ticket.status].tone}>{statusInfo[ticket.status].label}</Badge>
                          <span>{timeAgo(ticket.lastMessageAt)}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="card overflow-hidden">
              <div className="bg-brand-dark px-5 py-4 text-white">
                <h2 className="flex items-center gap-2 font-extrabold">
                  <ChatIcon className="size-5 text-accent" /> Still need help?
                </h2>
                <p className="mt-1 text-sm text-white/75">Send us the details and we will get back to you.</p>
              </div>
              <div className="space-y-3 p-5">
                <Link to="/help/new" className="btn btn-accent w-full">
                  Ask for help
                </Link>
                <ul className="space-y-3 pt-2 text-sm">
                  <li>
                    <a href={`tel:${storePhoneTel}`} className="flex items-center gap-3 font-semibold hover:text-brand">
                      <span className="grid size-9 place-items-center rounded-full bg-brand-soft text-brand">
                        <PhoneIcon className="size-4" />
                      </span>
                      {settings.supportPhone || storePhone}
                    </a>
                  </li>
                  <li>
                    <a href={`mailto:${settings.supportEmail || storeEmail}`} className="flex min-w-0 items-center gap-3 font-semibold hover:text-brand">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
                        <MailIcon className="size-4" />
                      </span>
                      <span className="truncate">{settings.supportEmail || storeEmail}</span>
                    </a>
                  </li>
                  <li className="flex items-center gap-3 text-muted">
                    <span className="grid size-9 place-items-center rounded-full bg-canvas text-ink-soft">
                      <ClockIcon className="size-4" />
                    </span>
                    Mon to Sat, 9:00 to 18:00 IST
                  </li>
                </ul>
              </div>
            </section>

            <section className="card p-5 text-sm">
              <h2 className="font-extrabold">Good to know</h2>
              <ul className="mt-3 space-y-2.5 text-ink-soft">
                <li className="flex gap-2">
                  <TruckIcon className="mt-0.5 size-4 shrink-0 text-brand" /> Free delivery above {formatPrice(settings.freeShippingThreshold)}.
                </li>
                {settings.codEnabled && (
                  <li className="flex gap-2">
                    <CardIcon className="mt-0.5 size-4 shrink-0 text-brand" /> Cash on delivery up to {formatPrice(settings.codMaxOrder)}.
                  </li>
                )}
                <li className="flex gap-2">
                  <RefreshIcon className="mt-0.5 size-4 shrink-0 text-brand" /> Cancel any order before it ships and prepaid amounts go back to you.
                </li>
              </ul>
            </section>
          </aside>
        </div>
      </Container>
    </div>
  )
}
