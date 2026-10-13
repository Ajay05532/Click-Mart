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

// The short-lived access token lives only in memory. The long-lived refresh token is an httpOnly cookie
// that scripts cannot read, so a page refresh restores the session without storing secrets in localStorage.
let accessToken: string | null = null
let onSessionLost: (() => void) | null = null
let refreshing: Promise<boolean> | null = null

export const setAccessToken = (token: string | null) => {
  accessToken = token
}
export const getAccessToken = () => accessToken
export const setSessionLostHandler = (handler: () => void) => {
  onSessionLost = handler
}

type Options = {
  method?: string
  body?: unknown
  form?: FormData
  signal?: AbortSignal
  query?: Record<string, string | number | boolean | string[] | undefined | null>
}

function errorFrom(status: number, json: { error?: string; details?: unknown } | null) {
  let message = json?.error ?? 'Something went wrong. Please try again.'
  if (Array.isArray(json?.details) && json.details.length) {
    const first = json.details[0] as { message?: string }
    if (first?.message) message = first.message
  }
  return new ApiError(status, message, json?.details)
}

export function refreshSession(): Promise<boolean> {
  refreshing ??= fetch(`${PREFIX}/auth/refresh`, { method: 'POST', credentials: 'include' })
    .then(async (response) => {
      if (!response.ok) return false
      const data = (await response.json()) as { accessToken: string }
      accessToken = data.accessToken
      return true
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

export async function api<T = unknown>(path: string, options: Options = {}, retried = false): Promise<T> {
  const url = new URL(`${PREFIX}${path}`, window.location.origin)
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (Array.isArray(value)) for (const item of value) url.searchParams.append(key, item)
    else if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
  }
  let response: Response
  try {
    response = await fetch(BASE ? url.toString() : `${url.pathname}${url.search}`, {
      method: options.method ?? (options.body || options.form ? 'POST' : 'GET'),
      credentials: 'include',
      signal: options.signal,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: options.form ?? (options.body ? JSON.stringify(options.body) : undefined),
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.')
  }

  // An expired access token: refresh once and replay the request.
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

export const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong. Please try again.')
