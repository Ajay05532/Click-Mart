import { api } from './api.ts'

/** A delivery spot picked on the map. Signed-in customers also have it saved on the server. */
export type Place = {
  pin: string | null
  city: string | null
  state: string | null
  area: string | null
  label: string
  lat: number
  lng: number
}

export type DeliveryLocation = {
  pin: string
  city: string | null
  state: string | null
  area: string | null
  label: string | null
  lat: number | null
  lng: number | null
}

const KEY = 'clickmart-location'
const OLD_PIN_KEY = 'clickmart-pin'

export function readLocation(): DeliveryLocation | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const value = JSON.parse(raw) as DeliveryLocation
      if (/^\d{6}$/.test(value.pin)) return value
    }
    // The header used to remember just a PIN.
    const oldPin = localStorage.getItem(OLD_PIN_KEY)
    if (oldPin && /^\d{6}$/.test(oldPin)) return { pin: oldPin, city: null, state: null, area: null, label: null, lat: null, lng: null }
  } catch {
    /* storage blocked or corrupt: start empty */
  }
  return null
}

export function writeLocation(location: DeliveryLocation | null) {
  try {
    if (location) localStorage.setItem(KEY, JSON.stringify(location))
    else localStorage.removeItem(KEY)
    localStorage.removeItem(OLD_PIN_KEY)
  } catch {
    /* ignore */
  }
}

export const placeToLocation = (place: Place & { pin: string }): DeliveryLocation => ({
  pin: place.pin,
  city: place.city,
  state: place.state,
  area: place.area,
  label: place.label,
  lat: place.lat,
  lng: place.lng,
})

export const geo = {
  search: (q: string, signal?: AbortSignal) => api<{ items: Place[] }>('/geo/search', { query: { q }, signal }).then((r) => r.items),
  reverse: (lat: number, lng: number, signal?: AbortSignal) => api<{ place: Place | null }>('/geo/reverse', { query: { lat, lng }, signal }).then((r) => r.place),
  pin: (pin: string, signal?: AbortSignal) => api<{ place: Place | null }>(`/geo/pin/${pin}`, { signal }).then((r) => r.place),
}

export const serverLocation = {
  get: () => api<{ location: DeliveryLocation | null }>('/me/location').then((r) => r.location),
  save: (location: DeliveryLocation) => api('/me/location', { method: 'PUT', body: location }),
  clear: () => api('/me/location', { method: 'DELETE' }),
}
