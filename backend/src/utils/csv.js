/** One CSV cell. Text that a spreadsheet could run as a formula is defused with a leading quote. */
export function csvCell(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  let text = value instanceof Date ? value.toISOString() : String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

/** CSV with a byte-order mark so Excel opens rupee signs and Hindi names correctly. */
export function toCsv(columns, rows) {
  const head = columns.map((column) => csvCell(column.label)).join(',')
  const body = rows.map((row) => columns.map((column) => csvCell(row[column.key])).join(','))
  return `﻿${[head, ...body].join('\r\n')}\r\n`
}

const IST = 'Asia/Kolkata'
const parts = (iso, options) => new Intl.DateTimeFormat('en-CA', { timeZone: IST, hourCycle: 'h23', ...options }).format(new Date(iso))
/** 2026-10-14 in Indian time. */
export const istDate = (iso) => (iso ? parts(iso, { year: 'numeric', month: '2-digit', day: '2-digit' }) : '')
/** 2026-10-14 18:05 in Indian time. */
export const istDateTime = (iso) => (iso ? `${istDate(iso)} ${parts(iso, { hour: '2-digit', minute: '2-digit' })}` : '')

/** Start and end (UTC instants) of a date range given as Indian calendar days. */
export function istRange(from, to) {
  return {
    start: new Date(`${from}T00:00:00+05:30`).toISOString(),
    end: new Date(`${to}T23:59:59.999+05:30`).toISOString(),
  }
}
