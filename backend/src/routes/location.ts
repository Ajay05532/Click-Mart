import { Router } from 'express'
import { z } from 'zod'
import { from, exec, maybe } from '../lib/db.js'
import { badRequest } from '../lib/errors.js'
import { actor, requireAuth } from '../middleware/auth.js'

const columns = 'pin,city,state,area,label,lat,lng'

const locationSchema = z.object({
  pin: z.string().regex(/^\d{6}$/, 'Enter a 6-digit PIN code'),
  city: z.string().trim().max(80).nullish().transform((v) => v || null),
  state: z.string().trim().max(60).nullish().transform((v) => v || null),
  area: z.string().trim().max(160).nullish().transform((v) => v || null),
  label: z.string().trim().max(240).nullish().transform((v) => v || null),
  lat: z.number().min(-90).max(90).nullish().transform((v) => v ?? null),
  lng: z.number().min(-180).max(180).nullish().transform((v) => v ?? null),
})

/** The signed-in customer's chosen delivery spot (header "Set PIN"). Mounted at /me/location. */
export const locationRouter = Router()
locationRouter.use(requireAuth)

locationRouter.get('/', async (req, res) => {
  const location = await maybe(from('DeliveryLocation').select(columns).eq('userId', actor(req).id).maybeSingle())
  res.json({ location })
})

locationRouter.put('/', async (req, res) => {
  const data = locationSchema.parse(req.body)
  const userId = actor(req).id
  await exec(from('DeliveryLocation').upsert({ ...data, userId, updatedAt: new Date().toISOString() }, { onConflict: 'userId' }))
  res.json({ location: data })
})

locationRouter.delete('/', async (req, res) => {
  await exec(from('DeliveryLocation').delete().eq('userId', actor(req).id))
  res.status(204).end()
})

// ---- Free map lookups (OpenStreetMap Nominatim + India Post PIN directory) -----------------------------------
// Proxied here because Nominatim's policy needs a real User-Agent, at most 1 request per second, and caching.

const NOMINATIM = 'https://nominatim.openstreetmap.org'
const USER_AGENT = 'ClickMart/1.0 (dry-fruits store; delivery location lookup)'

export type Place = { pin: string | null; city: string | null; state: string | null; area: string | null; label: string; lat: number; lng: number }

type NominatimHit = {
  lat: string
  lon: string
  display_name: string
  address?: Record<string, string>
}

const cache = new Map<string, { at: number; value: unknown }>()
const CACHE_MS = 60 * 60 * 1000
let lastCall = 0

async function nominatim(path: string, params: Record<string, string>): Promise<unknown> {
  const url = new URL(`${NOMINATIM}${path}`)
  for (const [k, v] of Object.entries({ format: 'jsonv2', addressdetails: '1', 'accept-language': 'en', ...params })) url.searchParams.set(k, v)
  const key = url.toString()
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value
  // One request per second, as the usage policy asks.
  const wait = lastCall + 1100 - Date.now()
  lastCall = Math.max(Date.now(), lastCall) + (wait > 0 ? wait : 0)
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
  const response = await fetch(key, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(8000) })
  if (!response.ok) throw badRequest('Map search is busy right now. Please try again in a moment.')
  const value = await response.json()
  if (cache.size > 500) cache.clear()
  cache.set(key, { at: Date.now(), value })
  return value
}

function toPlace(hit: NominatimHit): Place {
  const a = hit.address ?? {}
  const pin = (a.postcode ?? '').replace(/\s/g, '')
  const area = a.suburb ?? a.neighbourhood ?? a.village ?? a.hamlet ?? a.road ?? a.city_district ?? null
  return {
    pin: /^\d{6}$/.test(pin) ? pin : null,
    city: a.city ?? a.town ?? a.village ?? a.county ?? a.state_district ?? null,
    state: a.state ?? null,
    area,
    label: hit.display_name.split(', ').slice(0, 4).join(', '),
    lat: Number(hit.lat),
    lng: Number(hit.lon),
  }
}

export const geoRouter = Router()

geoRouter.get('/search', async (req, res) => {
  const q = z.string().trim().min(3).max(120).parse(req.query.q)
  const hits = (await nominatim('/search', { q, countrycodes: 'in', limit: '6' })) as NominatimHit[]
  res.json({ items: hits.map(toPlace) })
})

geoRouter.get('/reverse', async (req, res) => {
  const { lat, lng } = z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) }).parse(req.query)
  // Round to ~1 m so nearby map drags share cache entries.
  const hit = (await nominatim('/reverse', { lat: lat.toFixed(5), lon: lng.toFixed(5), zoom: '17' })) as NominatimHit & { error?: string }
  if (hit.error || !hit.address || hit.address.country_code !== 'in') return res.json({ place: null })
  res.json({ place: { ...toPlace(hit), lat, lng } })
})

geoRouter.get('/pin/:pin', async (req, res) => {
  const pin = z.string().regex(/^\d{6}$/, 'Enter a 6-digit PIN code').parse(req.params.pin)
  const hits = (await nominatim('/search', { postalcode: pin, countrycodes: 'in', limit: '1' })) as NominatimHit[]
  if (!hits.length) return res.json({ place: null })
  res.json({ place: { ...toPlace(hits[0]), pin } })
})
