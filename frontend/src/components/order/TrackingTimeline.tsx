import { BoxIcon, CheckIcon, TruckIcon } from '../icons.tsx'
import { formatDateTime, isEnded, stageOf, stageTime, trackingStages, type TrackView } from '../../lib/orders.ts'

const stageIcons = [CheckIcon, BoxIcon, TruckIcon, TruckIcon, CheckIcon]

export function TrackingTimeline({ view }: { view: TrackView }) {
  const stage = stageOf(view)
  const ended = isEnded(view.status)
  const placed = new Date(view.placedAt).getTime()
  return (
    <ol className="relative">
      {trackingStages.map((item, index) => {
        const done = index < stage || (index === stage && (stage === trackingStages.length - 1 || ended))
        const active = index === stage && !done
        const Icon = stageIcons[index]!
        const at = stageTime(view, index)
        const expected = new Date(placed + item.expectedHours * 3600000)
        return (
          <li key={item.key} className="relative flex gap-4 pb-8 last:pb-0">
            {index < trackingStages.length - 1 && (
              <span className="absolute top-10 bottom-0 left-5 -ml-px w-0.5 bg-line">
                <span className="block w-full bg-success transition-all duration-700" style={{ height: index < stage ? '100%' : '0%' }} />
              </span>
            )}
            <span
              className={`relative grid size-10 shrink-0 place-items-center rounded-full ring-4 ring-white transition-colors duration-500 ${
                done ? 'bg-success text-white' : active ? 'motion-ripple bg-brand text-white' : 'bg-canvas text-muted ring-1 ring-line'
              }`}
            >
              <Icon className="size-5" />
            </span>
            <div className="pt-1.5">
              <p className={`text-[15px] font-extrabold ${done || active ? 'text-ink' : 'text-muted'}`}>
                {item.label}
                {active && <span className="ml-2 rounded-full bg-brand-soft px-2 py-0.5 align-middle text-[10px] font-extrabold text-brand">In progress</span>}
              </p>
              <p className="mt-0.5 text-sm text-muted">{view.events.find((event) => (item.statuses as readonly string[]).includes(event.status) && event.note)?.note ?? item.note}</p>
              <p className="mt-1 text-xs font-semibold text-muted">
                {at ? formatDateTime(at) : ended ? '' : `Expected ${formatDateTime(expected.getTime())}`}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export function ProgressBar({ status, events }: Pick<TrackView, 'status' | 'events'>) {
  const stage = stageOf({ status, events })
  const ended = isEnded(status)
  const pct = ((stage + (stage === trackingStages.length - 1 && !ended ? 1 : 0.5)) / trackingStages.length) * 100
  return (
    <div>
      <div className="h-2 overflow-hidden rounded-full bg-line">
        <div
          className={`h-full rounded-full transition-all duration-700 ${ended ? 'bg-rose-500' : status === 'DELIVERED' ? 'bg-success' : 'bg-gradient-to-r from-brand to-accent'}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <div className="mt-2 hidden justify-between text-[11px] font-bold text-muted sm:flex">
        {trackingStages.map((item, index) => (
          <span key={item.key} className={index <= stage ? 'text-ink' : ''}>
            {item.label}
          </span>
        ))}
      </div>
    </div>
  )
}
