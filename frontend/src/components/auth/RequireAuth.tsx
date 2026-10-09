import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.tsx'

/** Sends signed-out visitors to the login page and brings them back afterwards. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <span className="motion-spin block size-10 rounded-full border-4 border-brand-soft border-t-brand" role="status" aria-label="Loading" />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
  return <>{children}</>
}
