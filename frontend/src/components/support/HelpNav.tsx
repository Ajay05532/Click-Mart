import { NavLink } from 'react-router-dom'
import { Container } from '../layout/Container.tsx'
import { useAuth } from '../../context/AuthContext.tsx'
import { useUnreadTickets } from '../../lib/support.ts'

const tabs = [
  { to: '/help', label: 'Help centre', end: true },
  { to: '/help/new', label: 'Ask for help', end: true },
  { to: '/help/tickets', label: 'My requests', end: false },
]

/** Small tab bar shared by every help page. */
export function HelpNav() {
  const { user } = useAuth()
  const unread = useUnreadTickets().data ?? 0
  return (
    <nav className="border-b border-line bg-white" aria-label="Help">
      <Container>
        <ul className="no-scrollbar -mb-px flex gap-1 overflow-x-auto">
          {tabs.map((tab) => (
            <li key={tab.to}>
              <NavLink
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  `relative flex items-center gap-2 border-b-2 px-4 py-3.5 text-sm font-bold whitespace-nowrap transition ${isActive ? 'border-accent text-brand' : 'border-transparent text-muted hover:text-ink'}`
                }
              >
                {tab.label}
                {tab.to === '/help/tickets' && user && unread > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-extrabold text-white">{unread}</span>}
              </NavLink>
            </li>
          ))}
        </ul>
      </Container>
    </nav>
  )
}
