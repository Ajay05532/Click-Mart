import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

export type NoticeTone = 'success' | 'info' | 'warning' | 'error'
export type NoticeAction = { label: string; to?: string; state?: unknown; onClick?: () => void; primary?: boolean }
export type Notice = {
  tone?: NoticeTone
  title: string
  text?: ReactNode
  actions?: NoticeAction[]
  /** Milliseconds on screen. Errors and messages with buttons stay a little longer by default. */
  duration?: number
}
type Shown = Notice & { id: number }

type NoticeContextValue = {
  notices: Shown[]
  notify: (notice: Notice) => number
  dismiss: (id: number) => void
}

const NoticeContext = createContext<NoticeContextValue | null>(null)
const MAX_SHOWN = 3

/** Short messages for the whole shop (added to cart, logged out, session ended, ...). Shown by <NoticeStack />. */
export function NoticeProvider({ children }: { children: ReactNode }) {
  const [notices, setNotices] = useState<Shown[]>([])
  const nextId = useRef(1)
  const timers = useRef(new Map<number, number>())

  const dismiss = useCallback((id: number) => {
    window.clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setNotices((current) => current.filter((notice) => notice.id !== id))
  }, [])

  const notify = useCallback(
    (notice: Notice) => {
      const id = nextId.current++
      // The same message again (e.g. adding a second item) replaces the old one instead of stacking.
      setNotices((current) => [...current.filter((item) => item.title !== notice.title), { ...notice, id }].slice(-MAX_SHOWN))
      const duration = notice.duration ?? (notice.tone === 'error' || notice.actions?.length ? 6000 : 4000)
      timers.current.set(id, window.setTimeout(() => dismiss(id), duration))
      return id
    },
    [dismiss],
  )

  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach((timer) => window.clearTimeout(timer))
  }, [])

  const value = useMemo(() => ({ notices, notify, dismiss }), [notices, notify, dismiss])
  return <NoticeContext.Provider value={value}>{children}</NoticeContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useNotice() {
  const context = useContext(NoticeContext)
  if (!context) throw new Error('useNotice must be used within NoticeProvider')
  return context.notify
}

const toneStyle: Record<NoticeTone, { badge: string; icon: string; bar: string }> = {
  success: { badge: 'bg-success text-white', icon: '✓', bar: 'bg-success' },
  info: { badge: 'bg-brand text-white', icon: 'i', bar: 'bg-brand' },
  warning: { badge: 'bg-accent text-white', icon: '!', bar: 'bg-accent' },
  error: { badge: 'bg-rose-600 text-white', icon: '!', bar: 'bg-rose-600' },
}

/** The on-screen stack. Lives inside the router so buttons can be links. */
export function NoticeStack() {
  const context = useContext(NoticeContext)
  if (!context || context.notices.length === 0) return null
  return (
    <div className="pointer-events-none fixed top-20 right-4 z-50 flex w-[min(23rem,calc(100vw-2rem))] flex-col gap-2.5" aria-live="polite">
      {context.notices.map((notice) => {
        const tone = toneStyle[notice.tone ?? 'success']
        return (
          <div
            key={notice.id}
            role={notice.tone === 'error' ? 'alert' : 'status'}
            className="motion-toast pointer-events-auto relative overflow-hidden rounded-2xl border border-line bg-white p-4 pl-5 text-ink shadow-pop"
          >
            <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${tone.bar}`} />
            <div className="flex items-start gap-3">
              <span aria-hidden="true" className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-extrabold ${tone.badge}`}>
                {tone.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-6 font-extrabold">{notice.title}</p>
                {notice.text && <div className="mt-0.5 text-sm leading-5 text-muted">{notice.text}</div>}
              </div>
              <button type="button" onClick={() => context.dismiss(notice.id)} aria-label="Dismiss" className="-mt-1 -mr-1 grid size-7 shrink-0 place-items-center rounded-lg text-muted hover:bg-canvas hover:text-ink">
                ×
              </button>
            </div>
            {notice.actions?.length ? (
              <div className="mt-3 flex gap-2 pl-9">
                {notice.actions.map((action) => {
                  const className = `btn btn-sm flex-1 ${action.primary ? 'btn-accent' : 'btn-outline'}`
                  const close = () => {
                    action.onClick?.()
                    context.dismiss(notice.id)
                  }
                  return action.to ? (
                    <Link key={action.label} to={action.to} state={action.state} onClick={close} className={className}>
                      {action.label}
                    </Link>
                  ) : (
                    <button key={action.label} type="button" onClick={close} className={className}>
                      {action.label}
                    </button>
                  )
                })}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
