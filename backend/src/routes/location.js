import { Router } from 'express'
import { z } from 'zod'
import { from, exec, maybe } from '../database/db.js'
import { badRequest } from '../utils/errors.js'
import { actor, requireAuth } from '../middleware/auth.js'
import { publicSettings } from '../services/publicCache.js'
import { checkDelivery, isBlocked } from '../services/delivery.js'
const columns = 'pin,city,state,area,label,lat,lng'
const locationSchema = z.object({
  pin: z.string().regex(/^\d{6}$/, 'Enter a 6-digit PIN code'),
  city: z
    .string()
    .trim()
    .max(80)
    .nullish()
    .transform((v) => v || null),
  state: z
    .string()
    .trim()
    .max(60)
    .nullish()
    .transform((v) => v || null),
  area: z
    .string()
    .trim()
    .max(160)
    .nullish()
    .transform((v) => v || null),
  label: z
    .string()
    .trim()
    .max(240)
    .nullish()
    .transform((v) => v || null),
  lat: z
    .number()
    .min(-90)
    .max(90)
    .nullish()
    .transform((v) => v ?? null),
  lng: z
    .number()
    .min(-180)
    .max(180)
    .nullish()
    .transform((v) => v ?? null),
})
export const locationRouter = Router()
locationRouter.use(requireAuth)
locationRouter.get('/', async (req, res) => {
  const location = await maybe(from('DeliveryLocation').select(columns).eq('userId', actor(req).id).maybeSingle())
  res.json({
    location,
  })
})
locationRouter.put('/', async (req, res) => {
  const data = locationSchema.parse(req.body)
  const userId = actor(req).id
  await exec(
    from('DeliveryLocation').upsert(
      {
        ...data,
        userId,
        updatedAt: new Date().toISOString(),
      },
      {
        onConflict: 'userId',
      },
    ),
  )
  res.json({
    location: data,
  })
})
locationRouter.delete('/', async (req, res) => {
  await exec(from('DeliveryLocation').delete().eq('userId', actor(req).id))
  res.status(204).end()
})
const NOMINATIM = 'https://nominatim.openstreetmap.org'
const USER_AGENT = 'ClickMart/1.0 (dry-fruits store; delivery location lookup)'
const cache = new Map()
const CACHE_MS = 60 * 60 * 1000
let lastCall = 0
async function nominatim(path, params) {
  const url = new URL(`${NOMINATIM}${path}`)
  for (const [k, v] of Object.entries({
    format: 'jsonv2',
    addressdetails: '1',
    'accept-language': 'en',
    ...params,
  }))
    url.searchParams.set(k, v)
  const key = url.toString()
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value
  const wait = lastCall + 1100 - Date.now()
  lastCall = Math.max(Date.now(), lastCall) + (wait > 0 ? wait : 0)
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
  const response = await fetch(key, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) throw badRequest('Map search is busy right now. Please try again in a moment.')
  const value = await response.json()
  if (cache.size > 500) cache.clear()
  cache.set(key, {
    at: Date.now(),
    value,
  })
  return value
}
function toPlace(hit) {
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
/**
 * Whether we deliver to a resolved place. An admin block-list (Settings -> Delivery) always applies; on top
 * of that, when NimbusPost is configured with a pickup PIN, its live courier serviceability decides the rest.
 * Defaults to "yes, anywhere in India" (today's storefront copy) when neither check can run.
 */
async function withDeliverable(place) {
  if (!place) return place
  const settings = await publicSettings()
  if (!place.pin) return { ...place, deliverable: !isBlocked(settings, null, place.state) }
  // Same rules as the cart and checkout (services/delivery.js), so the picker never promises what checkout refuses.
  const { deliverable } = await checkDelivery(settings, { pin: place.pin, state: place.state })
  return { ...place, deliverable }
}
export const geoRouter = Router()
geoRouter.get('/search', async (req, res) => {
  const q = z.string().trim().min(3).max(120).parse(req.query.q)
  const hits = await nominatim('/search', {
    q,
    countrycodes: 'in',
    limit: '6',
  })
  res.json({
    items: await Promise.all(hits.map(toPlace).map(withDeliverable)),
  })
})
geoRouter.get('/reverse', async (req, res) => {
  const { lat, lng } = z
    .object({
      lat: z.coerce.number().min(-90).max(90),
      lng: z.coerce.number().min(-180).max(180),
    })
    .parse(req.query)
  const hit = await nominatim('/reverse', {
    lat: lat.toFixed(5),
    lon: lng.toFixed(5),
    zoom: '17',
  })
  if (hit.error || !hit.address || hit.address.country_code !== 'in')
    return res.json({
      place: null,
    })
  res.json({
    place: await withDeliverable({
      ...toPlace(hit),
      lat,
      lng,
    }),
  })
})
/** City, state and area for a 6-digit PIN code (OpenStreetMap), or null when it is not found. */
export async function lookupPin(pin) {
  const hits = await nominatim('/search', {
    postalcode: pin,
    countrycodes: 'in',
    limit: '1',
  })
  return hits.length ? { ...toPlace(hits[0]), pin } : null
}
geoRouter.get('/pin/:pin', async (req, res) => {
  const pin = z
    .string()
    .regex(/^\d{6}$/, 'Enter a 6-digit PIN code')
    .parse(req.params.pin)
  const place = await lookupPin(pin)
  res.json({
    place: place ? await withDeliverable(place) : null,
  })
})
