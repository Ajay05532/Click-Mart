import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api } from '../lib/api.ts'
import { useAuth } from './AuthContext.tsx'

type WishlistContextValue = {
  ids: string[]
  has: (productId: string) => boolean
  toggle: (productId: string) => void
  clear: () => void
}

const STORAGE_KEY = 'clickmart-wishlist-v2'
const WishlistContext = createContext<WishlistContextValue | null>(null)

function loadIds(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as string[]
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []
  } catch {
    return []
  }
}

/** Saved on this device for guests, and on the account (merged on log-in) for customers. */
export function WishlistProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [ids, setIds] = useState<string[]>(loadIds)
  const synced = useRef<string | null>(null)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
  }, [ids])

  useEffect(() => {
    if (!user) {
      synced.current = null
      return
    }
    if (synced.current === user.id) return
    let cancelled = false
    api<{ productIds: string[] }>('/me/wishlist')
      .then(async ({ productIds }) => {
        if (cancelled) return
        synced.current = user.id
        const local = loadIds()
        const missing = local.filter((id) => !productIds.includes(id))
        await Promise.all(missing.map((id) => api(`/me/wishlist/${id}`, { method: 'PUT' }).catch(() => undefined)))
        setIds([...new Set([...productIds, ...local])])
      })
      .catch(() => {
        synced.current = user.id
      })
    return () => {
      cancelled = true
    }
  }, [user])

  const toggle = useCallback(
    (productId: string) => {
      const adding = !ids.includes(productId)
      setIds((current) => (adding ? [...current, productId] : current.filter((id) => id !== productId)))
      if (user) api(`/me/wishlist/${productId}`, { method: adding ? 'PUT' : 'DELETE' }).catch(() => undefined)
    },
    [ids, user],
  )

  const clear = useCallback(() => {
    if (user) ids.forEach((id) => api(`/me/wishlist/${id}`, { method: 'DELETE' }).catch(() => undefined))
    setIds([])
  }, [ids, user])

  const value = useMemo(() => ({ ids, has: (productId: string) => ids.includes(productId), toggle, clear }), [ids, toggle, clear])
  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useWishlist() {
  const context = useContext(WishlistContext)
  if (!context) throw new Error('useWishlist must be used within WishlistProvider')
  return context
}
