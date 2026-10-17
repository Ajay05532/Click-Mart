const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? ''
const PREFIX = `${BASE}/api/v1`

export class ApiError extends Error {
  status: number
  details?: unknown
  constructor(status: number, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.details = details
  }
}

let accessToken: string | null = null
let onSessionLost: (() => void) | null = null
let refreshing: Promise<AuthSession | null> | null = null

export type AuthSession = { accessToken: string; user: { id: string; role: string } }

export const setAccessToken = (token: string | null) => {
  accessToken = token
}
export const setSessionLostHandler = (handler: () => void) => {
  onSessionLost = handler
}
export const assetUrl = (path: string | null | undefined) => {
  if (!path) return ''
  if (/^https?:/.test(path)) return path
  // Catalogue images that start with /images/ live in the storefront's public folder.
  return path.startsWith('/uploads') ? `${BASE}${path}` : `${import.meta.env.VITE_STOREFRONT_URL || (import.meta.env.DEV ? 'http://localhost:5173' : '')}${path}`
}

type Options = {
  method?: string
  body?: unknown
  query?: Record<string, string | number | boolean | undefined | null>
  form?: FormData
}

function errorFrom(status: number, json: { error?: string; details?: unknown } | null) {
  let message = json?.error ?? 'Something went wrong'
  if (Array.isArray(json?.details) && json.details.length) {
    const first = json.details[0] as { path?: string; message?: string }
    if (first?.message) message = first.path ? `${first.path}: ${first.message}` : first.message
  }
  return new ApiError(status, message, json?.details)
}

export function refreshSession(): Promise<AuthSession | null> {
  refreshing ??= fetch(`${PREFIX}/auth/refresh`, { method: 'POST', credentials: 'include' })
    .then(async (response) => {
      if (!response.ok) return null
      const data = (await response.json()) as AuthSession
      if (!data?.accessToken) return null
      accessToken = data.accessToken
      return data
    })
    .catch(() => null)
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

export async function api<T = unknown>(path: string, options: Options = {}, retried = false): Promise<T> {
  const url = new URL(`${PREFIX}${path}`, window.location.origin)
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
  }
  const response = await fetch(BASE ? url.toString() : `${url.pathname}${url.search}`, {
    method: options.method ?? (options.body || options.form ? 'POST' : 'GET'),
    credentials: 'include',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: options.form ?? (options.body ? JSON.stringify(options.body) : undefined),
  })

  if (response.status === 401 && !retried && !path.startsWith('/auth/')) {
    if (await refreshSession()) return api<T>(path, options, true)
    accessToken = null
    onSessionLost?.()
  }
  if (response.status === 204) return undefined as T
  const text = await response.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  if (!response.ok) throw errorFrom(response.status, json as { error?: string; details?: unknown } | null)
  return json as T
}

async function authorised(path: string) {
  const response = await fetch(`${PREFIX}${path}`, { credentials: 'include', headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} })
  if (!response.ok) {
    let message = 'Could not load the document'
    try {
      const json = (await response.json()) as { error?: string }
      if (json?.error) message = json.error
    } catch {
      // keep the generic message
    }
    throw new ApiError(response.status, message)
  }
  return response
}

/** Fetches an authenticated HTML page (invoices, packing slips) and opens it in a new tab. */
export async function openHtml(path: string) {
  const blob = new Blob([await (await authorised(path)).text()], { type: 'text/html' })
  window.open(URL.createObjectURL(blob), '_blank', 'noopener')
}

/** Downloads an authenticated file (a CSV report) using the name the server suggests. */
export async function downloadFile(path: string, fallbackName = 'download.csv') {
  const response = await authorised(path)
  const header = response.headers.get('content-disposition') ?? ''
  const name = /filename="?([^";]+)"?/i.exec(header)?.[1] ?? fallbackName
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
