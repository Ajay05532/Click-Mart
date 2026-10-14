/** Reads CSV text into rows of cells. Handles quotes, commas and line breaks inside quotes, CRLF and a BOM. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, '')
  const out: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i += 1
        } else quoted = false
      } else cell += char
    } else if (char === '"' && cell === '') quoted = true
    else if (char === ',') {
      row.push(cell)
      cell = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1
      row.push(cell)
      out.push(row)
      row = []
      cell = ''
    } else cell += char
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    out.push(row)
  }
  return out.filter((cells) => cells.some((value) => value.trim() !== ''))
}

export type CsvTable = { headers: string[]; rows: Record<string, string>[] }

/** "Shelf life days" and "shelf_life_days" both become shelf_life_days. Each row remembers its line in the file. */
export function readTable(input: string): CsvTable {
  const [head = [], ...body] = parseCsv(input)
  const headers = head.map((name) => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''))
  const rows = body.map((cells, index) => {
    const row: Record<string, string> = { _line: String(index + 2) }
    headers.forEach((header, column) => {
      if (header) row[header] = (cells[column] ?? '').trim()
    })
    return row
  })
  return { headers: headers.filter(Boolean), rows }
}

/** Builds a downloadable CSV file from rows of cells (used for the import templates). */
export function downloadText(name: string, rows: string[][]) {
  const cell = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value)
  const blob = new Blob([`﻿${rows.map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
