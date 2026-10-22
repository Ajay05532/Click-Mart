import * as maplibregl from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../../context/AuthContext.tsx'
import { errorMessage } from '../../lib/api.ts'
import { CheckIcon, CloseIcon, PinIcon, SearchIcon } from '../icons.tsx'
import { geo, placeToLocation, type DeliveryLocation, type Place } from '../../lib/location.ts'
import { addressLabels, useSavedAddresses, type SavedAddress } from '../../lib/wallet.ts'

// Vite serves the worker as its own file, so MapLibre must be told where it is.
maplibregl.setWorkerUrl(workerUrl)

// Free vector map: OpenFreeMap (OpenStreetMap data), no API key. Address lookups go through our API (Nominatim).
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'
const INDIA: [number, number] = [78.9, 22.6]
const MIN_ADDRESS_ZOOM = 12

export type AddressPin = {
  location: DeliveryLocation
  name: string
  phone: string
  line: string
  landmark: string | null
  kind: SavedAddress['label']
  isDefault: boolean
}

type AddressDefaults = {
  name?: string
  phone?: string
  line?: string
  landmark?: string
  kind?: SavedAddress['label']
  isDefault?: boolean
}

type Props = {
  current: DeliveryLocation | null
  onSave?: (location: DeliveryLocation) => void
  onSaveAddress?: (value: AddressPin) => Promise<void> | void
  onClear?: () => void
  onClose: () => void
  /** delivery = header "Deliver to". address = save a full address after the pin. */
  purpose?: 'delivery' | 'address'
  addressDefaults?: AddressDefaults
}

type Resolve = { state: 'idle' } | { state: 'loading' } | { state: 'found'; place: Place } | { state: 'none'; reason: string }

const isAbort = (error: unknown) => error instanceof DOMException && error.name === 'AbortError'

export default function LocationPicker({ current, onSave, onSaveAddress, onClear, onClose, purpose = 'delivery', addressDefaults }: Props) {
  const { user } = useAuth()
  const addresses = useSavedAddresses(user?.id)
  const mapEl = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const reverseJob = useRef<{ timer?: number; abort?: AbortController }>({})
  const [resolve, setResolve] = useState<Resolve>({ state: 'idle' })
  const [dragging, setDragging] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Place[]>([])
  const [searching, setSearching] = useState(false)
  const [message, setMessage] = useState('')
  const [locating, setLocating] = useState(false)
  const [step, setStep] = useState<'map' | 'details'>('map')
  const [details, setDetails] = useState({
    name: addressDefaults?.name || user?.name || '',
    phone: (addressDefaults?.phone || user?.phone || '').replace(/\D/g, ''),
    line: addressDefaults?.line ?? '',
    landmark: addressDefaults?.landmark ?? '',
    kind: addressDefaults?.kind ?? 'HOME',
    isDefault: addressDefaults?.isDefault ?? true,
  })
  const [detailError, setDetailError] = useState('')
  const [saving, setSaving] = useState(false)

  // Place the pin: used for search hits, PIN lookups and "use my location".
  const goTo = useCallback((place: Place, zoom = 16) => {
    setResults([])
    setQuery('')
    setMessage('')
    map.current?.flyTo({ center: [place.lng, place.lat], zoom: place.pin ? zoom : Math.min(zoom, 14), duration: 900 })
    if (place.pin) return setResolve({ state: 'found', place })
    // Broad results (a whole locality) often carry no PIN: ask the map for the one at that point.
    setResolve({ state: 'loading' })
    geo
      .reverse(place.lat, place.lng)
      .then((found) => setResolve(found?.pin ? { state: 'found', place: found } : { state: 'none', reason: 'No PIN code on record for this spot. Move the pin to a nearby street.' }))
      .catch(() => setResolve({ state: 'none', reason: 'Address lookup failed. Check your connection and try again.' }))
  }, [])

  // ---- Map setup ---------------------------------------------------------------------------------------------
  useEffect(() => {
    if (!mapEl.current) return
    const hasSpot = current?.lat != null && current.lng != null
    const instance = new maplibregl.Map({
      container: mapEl.current,
      style: MAP_STYLE,
      center: hasSpot ? [current.lng!, current.lat!] : INDIA,
      zoom: hasSpot ? 16 : 4.2,
      attributionControl: { compact: true },
      cooperativeGestures: false,
    })
    map.current = instance
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
    instance.once('load', () => instance.resize())
    if (hasSpot && current!.pin) {
      setResolve({
        state: 'found',
        // Already the confirmed delivery address; re-checked against today's Settings only once the map settles.
        place: { pin: current!.pin, city: current!.city, state: current!.state, area: current!.area, label: current!.label ?? '', lat: current!.lat!, lng: current!.lng!, deliverable: true },
      })
    }

    instance.on('dragstart', () => setDragging(true))
    instance.on('zoomstart', (event) => event.originalEvent && setDragging(true))
    // Only user moves (drag / zoom) look up a new address; flyTo from search already knows the place.
    instance.on('moveend', (event) => {
      setDragging(false)
      if (!event.originalEvent) return
      const jobs = reverseJob.current
      window.clearTimeout(jobs.timer)
      jobs.abort?.abort()
      if (instance.getZoom() < MIN_ADDRESS_ZOOM) {
        setResolve({ state: 'none', reason: 'Zoom in and drag the map so the pin sits on your doorstep.' })
        return
      }
      setResolve({ state: 'loading' })
      jobs.timer = window.setTimeout(async () => {
        const abort = new AbortController()
        jobs.abort = abort
        const { lat, lng } = instance.getCenter()
        try {
          const place = await geo.reverse(lat, lng, abort.signal)
          if (!place) setResolve({ state: 'none', reason: 'We could not find an address here. We deliver only within India.' })
          else if (!place.pin) setResolve({ state: 'none', reason: 'No PIN code on record for this spot. Move the pin to a nearby street.' })
          else setResolve({ state: 'found', place })
        } catch (error) {
          if (!isAbort(error)) setResolve({ state: 'none', reason: 'Address lookup failed. Check your connection and move the map again.' })
        }
      }, 450)
    })
    const jobs = reverseJob.current
    return () => {
      window.clearTimeout(jobs.timer)
      jobs.abort?.abort()
      instance.remove()
      map.current = null
    }
    // The map is created once; `current` only seeds the starting view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- Escape closes, page behind does not scroll ------------------------------------------------------------
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [onClose])

  // ---- Search (address / area, or a 6-digit PIN) -------------------------------------------------------------
  useEffect(() => {
    const text = query.trim()
    if (text.length < 3 || /^\d{1,5}$/.test(text)) {
      setResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    const abort = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        if (/^\d{6}$/.test(text)) {
          const place = await geo.pin(text, abort.signal)
          setResults(place ? [place] : [])
          if (!place) setMessage(`We couldn't find PIN ${text}. Check it and try again.`)
        } else {
          const items = await geo.search(text, abort.signal)
          setResults(items)
          setMessage(items.length ? '' : 'No places found. Try a nearby landmark or your PIN code.')
        }
        setSearching(false)
      } catch (error) {
        if (!isAbort(error)) {
          setSearching(false)
          setMessage('Search is unavailable right now. Please try again.')
        }
      }
    }, 600)
    return () => {
      window.clearTimeout(timer)
      abort.abort()
    }
  }, [query])

  const useMyLocation = () => {
    if (!navigator.geolocation) return setMessage('Your browser does not support location.')
    setLocating(true)
    setMessage('')
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const place = await geo.reverse(coords.latitude, coords.longitude)
          if (!place) setMessage('You appear to be outside India. Search for your delivery address instead.')
          else goTo(place)
        } catch {
          setMessage('Could not look up your address. Please try again.')
        } finally {
          setLocating(false)
        }
      },
      (error) => {
        setLocating(false)
        setMessage(error.code === error.PERMISSION_DENIED ? 'Location access is blocked. Allow it in your browser, or search instead.' : 'Could not get your location. Search instead.')
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  }

  const pickSaved = async (pin: string) => {
    setMessage('')
    try {
      const place = await geo.pin(pin)
      if (place) goTo(place, 14)
      else setMessage(`We couldn't place PIN ${pin} on the map.`)
    } catch {
      setMessage('Could not look that up. Please try again.')
    }
  }

  const confirm = (event?: FormEvent) => {
    event?.preventDefault()
    if (resolve.state !== 'found' || !resolve.place.pin || !resolve.place.deliverable) return
    const location = placeToLocation({ ...resolve.place, pin: resolve.place.pin })
    if (purpose === 'address') {
      setDetails((currentDetails) => ({
        ...currentDetails,
        line: currentDetails.line.trim().length >= 8 ? currentDetails.line : (location.label || [location.area, location.city].filter(Boolean).join(', ')).slice(0, 250),
      }))
      setDetailError('')
      setStep('details')
      return
    }
    onSave?.(location)
    onClose()
  }

  const saveAddress = async (event: FormEvent) => {
    event.preventDefault()
    if (resolve.state !== 'found' || !resolve.place.pin || !resolve.place.deliverable) return
    if (details.name.trim().length < 2) return setDetailError('Enter the full name for this address')
    if (!/^[6-9]\d{9}$/.test(details.phone)) return setDetailError('Enter a valid 10-digit mobile number')
    if (details.line.trim().length < 8) return setDetailError('Add the house, flat or building (at least 8 characters)')
    setSaving(true)
    setDetailError('')
    try {
      await onSaveAddress?.({
        location: placeToLocation({ ...resolve.place, pin: resolve.place.pin }),
        name: details.name.trim(),
        phone: details.phone,
        line: details.line.trim(),
        landmark: details.landmark.trim() || null,
        kind: details.kind,
        isDefault: details.isDefault,
      })
      onClose()
    } catch (error) {
      setDetailError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const place = resolve.state === 'found' ? resolve.place : null
  const heading = place ? [place.area, place.city].filter(Boolean).join(', ') || place.label.split(', ')[0] : ''

  const showSaved = purpose === 'delivery' && results.length === 0 && query.trim().length < 3

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-stretch justify-center bg-ink/55 sm:items-center sm:p-4" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={purpose === 'address' ? 'Add address' : 'Choose delivery location'} className="relative h-dvh w-full overflow-hidden bg-white sm:h-[520px] sm:max-w-xl sm:rounded-3xl sm:shadow-pop">
        <div className="absolute inset-0">
          <div ref={mapEl} className="map-picker h-full w-full" />
        </div>

        <div className="pointer-events-none absolute top-[42%] left-1/2 z-10 -translate-x-1/2 -translate-y-full sm:top-[46%]">
          <div className={`flex flex-col items-center transition-transform duration-150 ${dragging ? '-translate-y-3' : ''}`}>
            {place && !dragging && step === 'map' && (
              <span className="motion-pop mb-1 max-w-56 truncate rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white shadow-lg">{heading}</span>
            )}
            <svg viewBox="0 0 40 52" className="h-12 w-9 drop-shadow-lg" aria-hidden="true">
              <path d="M20 1C9.5 1 1 9.4 1 19.8 1 33.5 20 51 20 51s19-17.5 19-31.2C39 9.4 30.5 1 20 1Z" fill="#f47b20" stroke="#fff" strokeWidth="2" />
              <circle cx="20" cy="20" r="7" fill="#fff" />
            </svg>
          </div>
          <div className={`mx-auto -mt-1 h-1.5 w-4 rounded-full bg-black/30 blur-[2px] transition-all ${dragging ? 'scale-50 opacity-40' : ''}`} />
        </div>

        {step === 'map' && (
          <>
            <div className="absolute top-0 right-0 left-0 z-20 p-2.5">
              <div className="flex items-center gap-2">
                <button type="button" onClick={onClose} aria-label="Close" className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-ink shadow-pop">
                  <CloseIcon className="size-4" />
                </button>
                <label className="relative min-w-0 flex-1">
                  <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
                  <input
                    autoFocus
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search area, street or 6-digit PIN"
                    className="h-9 w-full rounded-xl border border-white bg-white pr-9 pl-9 text-sm shadow-pop outline-none focus:border-brand"
                  />
                  {searching && <span className="absolute top-1/2 right-3.5 size-4 -translate-y-1/2 animate-spin rounded-full border-2 border-brand border-t-transparent" />}
                </label>
              </div>
              {(results.length > 0 || message || showSaved) && (
                <div className="mt-2 max-h-64 overflow-y-auto rounded-2xl bg-white p-1 shadow-pop">
                  {message && results.length === 0 && <p className="px-3 py-2 text-xs text-accent-dark">{message}</p>}
                  {results.map((item, index) => (
                    <button key={`${item.lat},${item.lng},${index}`} type="button" onClick={() => goTo(item, /^\d{6}$/.test(query.trim()) ? 14 : 16)} className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-canvas">
                      <PinIcon className="mt-0.5 size-4 shrink-0 text-muted" />
                      <span className="min-w-0 text-sm">
                        <span className="block truncate font-semibold text-ink">{item.label.split(', ')[0]}</span>
                        <span className="block text-xs text-muted">{[item.label.split(', ').slice(1).join(', '), item.pin].filter(Boolean).join(' · ')}</span>
                      </span>
                    </button>
                  ))}
                  {showSaved && user && (addresses.data?.length ?? 0) > 0 && (
                    <div>
                      <p className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wider text-muted uppercase">Saved addresses</p>
                      {addresses.data!.map((address) => (
                        <button key={address.id} type="button" onClick={() => pickSaved(address.pin)} className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-canvas">
                          <span className="mt-0.5 rounded-md bg-brand-soft px-1.5 py-0.5 text-[10px] font-bold text-brand uppercase">{addressLabels[address.label] ?? 'Other'}</span>
                          <span className="min-w-0 text-sm">
                            <span className="block truncate font-semibold text-ink">{address.line}</span>
                            <span className="block text-xs text-muted">{address.city}, {address.state} {address.pin}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {showSaved && !user && <p className="px-3 py-2 text-xs text-muted">Sign in to see saved addresses. This device keeps your delivery PIN until then.</p>}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={useMyLocation}
              disabled={locating}
              className="absolute left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-brand shadow-pop disabled:opacity-60"
              style={{ bottom: '7.25rem' }}
            >
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="12" cy="12" r="3.5" />
                <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                <circle cx="12" cy="12" r="8" />
              </svg>
              {locating ? 'Finding you…' : 'Use current location'}
            </button>

            <form onSubmit={confirm} className="absolute right-0 bottom-0 left-0 z-20 rounded-t-2xl bg-white px-3 pt-2.5 pb-3 shadow-[0_-8px_24px_rgb(15_23_42/0.12)]">
              {resolve.state === 'found' && place ? (
                <>
                  <p className="truncate text-sm font-extrabold text-ink">{heading || `PIN ${place.pin}`} <span className="font-semibold text-muted">· {place.pin}</span></p>
                  {place.deliverable ? (
                    <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-success">
                      <CheckIcon className="size-3.5" /> We deliver to this address
                    </p>
                  ) : (
                    <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-rose-600">
                      <CloseIcon className="size-3.5" /> Sorry, we currently don't deliver to this area
                    </p>
                  )}
                </>
              ) : resolve.state === 'loading' ? (
                <p className="flex items-center gap-2 text-xs text-muted">
                  <span className="size-3.5 animate-spin rounded-full border-2 border-brand border-t-transparent" /> Finding this address…
                </p>
              ) : resolve.state === 'none' ? (
                <p className="text-xs font-semibold text-accent-dark">{resolve.reason}</p>
              ) : (
                <p className="text-xs text-muted">Search, or drag the map so the pin sits on the doorstep.</p>
              )}
              <button type="submit" disabled={resolve.state !== 'found' || !place?.deliverable} className="btn btn-accent mt-2 h-9 w-full text-sm disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500">
                <CheckIcon className="size-4" /> {purpose === 'address' ? 'Confirm and add details' : 'Confirm location'}
              </button>
              {purpose === 'delivery' && current && onClear && (
                <p className="mt-2 text-center text-xs text-muted">
                  Now delivering to <span className="font-semibold text-ink">{current.pin}</span>{current.city ? `, ${current.city}` : ''}.{' '}
                  <button type="button" onClick={() => { onClear(); onClose() }} className="font-semibold text-brand hover:underline">Remove</button>
                </p>
              )}
            </form>
          </>
        )}

        {step === 'details' && place && (
          <form onSubmit={(event) => void saveAddress(event)} className="absolute inset-x-0 bottom-0 z-30 flex max-h-[78%] flex-col rounded-t-3xl bg-white shadow-[0_-12px_40px_rgb(15_23_42/0.18)]">
            <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold tracking-wider text-success uppercase">Pinned location</p>
                <p className="truncate text-base font-extrabold">{heading || `PIN ${place.pin}`}</p>
                <p className="truncate text-xs text-muted">{place.city}{place.state ? `, ${place.state}` : ''} · {place.pin}</p>
              </div>
              <button type="button" onClick={() => setStep('map')} className="shrink-0 text-sm font-bold text-brand">Change</button>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-5">
              <label className="block text-xs font-bold text-ink">
                House / flat / building *
                <input required value={details.line} onChange={(event) => setDetails({ ...details, line: event.target.value })} className="field mt-1.5 font-normal" placeholder="12, Shanti Nivas, near the temple" />
              </label>
              <label className="block text-xs font-bold text-ink">
                Landmark
                <input value={details.landmark} maxLength={120} onChange={(event) => setDetails({ ...details, landmark: event.target.value })} className="field mt-1.5 font-normal" placeholder="Opposite the post office" />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-bold text-ink">
                  Full name *
                  <input required value={details.name} onChange={(event) => setDetails({ ...details, name: event.target.value })} className="field mt-1.5 font-normal" />
                </label>
                <label className="block text-xs font-bold text-ink">
                  Mobile *
                  <input required inputMode="numeric" maxLength={10} value={details.phone} onChange={(event) => setDetails({ ...details, phone: event.target.value.replace(/\D/g, '') })} className="field mt-1.5 font-normal" placeholder="10-digit mobile" />
                </label>
              </div>
              <div>
                <span className="text-xs font-bold text-ink">Save as</span>
                <div className="mt-1.5 flex gap-2">
                  {(['HOME', 'WORK', 'OTHER'] as const).map((kind) => (
                    <button key={kind} type="button" aria-pressed={details.kind === kind} onClick={() => setDetails({ ...details, kind })} className={`rounded-full border-2 px-4 py-1.5 text-sm font-bold transition ${details.kind === kind ? 'border-brand bg-brand-soft text-brand' : 'border-line hover:border-brand/40'}`}>
                      {addressLabels[kind]}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={details.isDefault} onChange={(event) => setDetails({ ...details, isDefault: event.target.checked })} /> Use as my default address
              </label>
              {detailError && <p role="alert" className="text-sm font-semibold text-rose-600">{detailError}</p>}
            </div>
            <div className="flex gap-2 border-t border-line px-4 py-3 sm:px-5">
              <button type="button" onClick={onClose} className="btn btn-outline h-12 flex-1">Cancel</button>
              <button type="submit" disabled={saving} className="btn btn-accent h-12 flex-[2] text-base">{saving ? 'Saving…' : 'Save address'}</button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  )
}
