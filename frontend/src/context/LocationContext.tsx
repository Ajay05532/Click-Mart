import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuth } from './AuthContext.tsx'
import { readLocation, serverLocation, writeLocation, type DeliveryLocation } from '../lib/location.ts'

// The map (MapLibre) is large, so it only downloads the first time someone opens the picker.
const LocationPicker = lazy(() => import('../components/location/LocationPicker.tsx'))

type LocationContextValue = {
  location: DeliveryLocation | null
  openPicker: () => void
  save: (location: DeliveryLocation) => void
  clear: () => void
}

const LocationContext = createContext<LocationContextValue | null>(null)

export function LocationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [location, setLocation] = useState<DeliveryLocation | null>(readLocation)
  const [open, setOpen] = useState(false)
  const lastUser = useRef<string | null>(null)
  const current = useRef(location)
  useEffect(() => {
    current.current = location
  }, [location])

  // On sign-in, the saved server location wins; if there is none yet, the guest's choice is saved to the account.
  // On sign-out the choice is forgotten so a shared device does not keep someone's area.
  useEffect(() => {
    const id = user?.id ?? null
    const previous = lastUser.current
    lastUser.current = id
    if (id === previous) return
    if (!id) {
      if (previous) {
        writeLocation(null)
        setLocation(null)
      }
      return
    }
    let cancelled = false
    serverLocation
      .get()
      .then((saved) => {
        if (cancelled) return
        if (saved) {
          writeLocation(saved)
          setLocation(saved)
        } else if (current.current) {
          void serverLocation.save(current.current).catch(() => undefined)
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [user?.id])

  const save = useCallback(
    (next: DeliveryLocation) => {
      writeLocation(next)
      setLocation(next)
      if (user) void serverLocation.save(next).catch(() => undefined)
    },
    [user],
  )

  const clear = useCallback(() => {
    writeLocation(null)
    setLocation(null)
    if (user) void serverLocation.clear().catch(() => undefined)
  }, [user])

  const openPicker = useCallback(() => setOpen(true), [])
  const value = useMemo(() => ({ location, openPicker, save, clear }), [location, openPicker, save, clear])

  return (
    <LocationContext.Provider value={value}>
      {children}
      {open && (
        <Suspense fallback={null}>
          <LocationPicker current={location} onSave={save} onClear={clear} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </LocationContext.Provider>
  )
}

export function useDeliveryLocation() {
  const value = useContext(LocationContext)
  if (!value) throw new Error('useDeliveryLocation must be used inside LocationProvider')
  return value
}
