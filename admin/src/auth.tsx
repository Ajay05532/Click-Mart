import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, refreshSession, setAccessToken, setSessionLostHandler } from './api.ts'

export type Role = 'CUSTOMER' | 'STAFF' | 'ADMIN'
export type Permission = 'orders' | 'catalog' | 'inventory' | 'marketing' | 'support' | 'customers' | 'reports'
export type Me = { id: string; name: string; email: string; avatarUrl: string | null; role: Role; permissions?: Permission[] }

type AuthValue = {
  user: Me | null
  loading: boolean
  isAdmin: boolean
  /** True for administrators, and for staff who were given this permission. */
  can: (permission: Permission) => boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  updateProfile: (patch: { name?: string }) => Promise<void>
  uploadAvatar: (file: File) => Promise<void>
  removeAvatar: () => Promise<void>
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setSessionLostHandler(() => setUser(null))
    let cancelled = false
    ;(async () => {
      try {
        const session = await refreshSession()
        const restored = session?.user?.role && session.user.role !== 'CUSTOMER' ? (session.user as Me) : null
        if (!cancelled && restored) setUser(restored)
        else if (!session) {
          const me = await api<{ user: Me }>('/me', {}, true)
          if (!cancelled && me.user.role !== 'CUSTOMER') setUser(me.user)
        }
      } catch {
        /* not signed in */
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const result = await api<{ user: Me; accessToken: string }>('/auth/login', { body: { email, password } })
    if (result.user.role === 'CUSTOMER') {
      await api('/auth/logout', { method: 'POST' }).catch(() => undefined)
      throw new Error('This account does not have access to the admin area.')
    }
    setAccessToken(result.accessToken)
    setUser(result.user)
  }, [])

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined)
    setAccessToken(null)
    setUser(null)
  }, [])

  const updateProfile = useCallback(async (patch: { name?: string }) => {
    const result = await api<{ user: Me }>('/me', { method: 'PATCH', body: patch })
    setUser(result.user)
  }, [])

  const uploadAvatar = useCallback(async (file: File) => {
    const form = new FormData()
    form.append('image', file)
    const result = await api<{ user: Me }>('/me/avatar', { form })
    setUser(result.user)
  }, [])

  const removeAvatar = useCallback(async () => {
    const result = await api<{ user: Me }>('/me', { method: 'PATCH', body: { avatarUrl: null } })
    setUser(result.user)
  }, [])

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      await api('/auth/change-password', { body: { currentPassword, newPassword } })
      // The server signs every session out when the password changes: start a fresh one with the new password.
      if (user) {
        const result = await api<{ user: Me; accessToken: string }>('/auth/login', { body: { email: user.email, password: newPassword } })
        setAccessToken(result.accessToken)
      }
    },
    [user],
  )

  const can = useCallback((permission: Permission) => user?.role === 'ADMIN' || !!user?.permissions?.includes(permission), [user])
  const value = useMemo(
    () => ({ user, loading, isAdmin: user?.role === 'ADMIN', can, login, logout, updateProfile, uploadAvatar, removeAvatar, changePassword }),
    [user, loading, can, login, logout, updateProfile, uploadAvatar, removeAvatar, changePassword],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
