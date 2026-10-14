export const inr = (value: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value)

export const num = (value: number) => new Intl.NumberFormat('en-IN').format(value)

export const dateTime = (value: string | Date) =>
  new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })

export const dateOnly = (value: string | Date) =>
  new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

/** Value for <input type="datetime-local"> from an ISO string (local time). */
export const toLocalInput = (value?: string | null) => {
  if (!value) return ''
  const d = new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null)

export const label = (value: string) => value.replaceAll('_', ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
/** "5 minutes ago", "in 3 hours", "yesterday". */
export function timeAgo(value: string | number | Date) {
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000)
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [['day', 86400], ['hour', 3600], ['minute', 60]]
  for (const [unit, size] of steps) if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit)
  return 'just now'
}

/** 135 -> "2h 15m". */
export const minutesText = (minutes: number | null | undefined) => {
  if (minutes === null || minutes === undefined) return '—'
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h < 48 ? `${h}h${m ? ` ${m}m` : ''}` : `${Math.round(h / 24)}d`
}
