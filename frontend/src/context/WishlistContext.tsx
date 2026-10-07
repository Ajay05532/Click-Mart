import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

type WishlistContextValue = {
  ids: string[]
  has: (productId: string) => boolean
  toggle: (productId: string) => void
}

const STORAGE_KEY = 'clickmart-wishlist'
const WishlistContext = createContext<WishlistContextValue | null>(null)

function loadIds(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as string[]
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []
  } catch {
    return []
  }
}

export function WishlistProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<string[]>(loadIds)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
  }, [ids])

  const toggle = (productId: string) => {
    setIds((current) =>
      current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId],
    )
  }

  return (
    <WishlistContext.Provider value={{ ids, has: (productId) => ids.includes(productId), toggle }}>
      {children}
    </WishlistContext.Provider>
  )
}

export function useWishlist() {
  const context = useContext(WishlistContext)
  if (!context) throw new Error('useWishlist must be used within WishlistProvider')
  return context
}
