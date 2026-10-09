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
