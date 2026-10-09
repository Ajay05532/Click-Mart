import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, refreshSession, setAccessToken, setSessionLostHandler } from '../lib/api.ts'

export type User = { id: string; name: string; email: string; phone: string | null; avatarUrl: string | null; role: 'CUSTOMER' | 'STAFF' | 'ADMIN' }

type RegisterInput = { name: string; email: string; password: string; phone?: string }

type AuthContextValue = {
  user: User | null
  /** True until the first silent session check finishes, so pages do not flash "logged out". */
  loading: boolean
  login: (email: string, password: string) => Promise<User>
  register: (input: RegisterInput) => Promise<User>
  logout: () => Promise<void>
  updateProfile: (patch: { name?: string; phone?: string | null; avatarUrl?: null }) => Promise<User>
  uploadAvatar: (file: File) => Promise<User>
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

type Session = { user: User; accessToken: string }

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // Restore the session from the httpOnly refresh cookie.
  useEffect(() => {
    setSessionLostHandler(() => setUser(null))
    let cancelled = false
    ;(async () => {
      try {
        if (await refreshSession()) {
          const me = await api<{ user: User }>('/me')
          if (!cancelled) setUser(me.user)
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

  const start = useCallback((session: Session) => {
    setAccessToken(session.accessToken)
    setUser(session.user)
    return session.user
  }, [])

  const login = useCallback(async (email: string, password: string) => start(await api<Session>('/auth/login', { body: { email, password } })), [start])
  const register = useCallback(async (input: RegisterInput) => start(await api<Session>('/auth/register', { body: input })), [start])

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined)
    setAccessToken(null)
    setUser(null)
  }, [])

  const updateProfile = useCallback(async (patch: { name?: string; phone?: string | null; avatarUrl?: null }) => {
    const result = await api<{ user: User }>('/me', { method: 'PATCH', body: patch })
    setUser(result.user)
    return result.user
  }, [])

  const uploadAvatar = useCallback(async (file: File) => {
    const form = new FormData()
    form.append('image', file)
    const result = await api<{ user: User }>('/me/avatar', { form })
    setUser(result.user)
    return result.user
  }, [])

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    await api('/auth/change-password', { body: { currentPassword, newPassword } })
    // The server signs every session out when the password changes: start a fresh one with the new password.
    const email = user?.email
    if (email) start(await api<Session>('/auth/login', { body: { email, password: newPassword } }))
  }, [start, user?.email])

  const value = useMemo(() => ({ user, loading, login, register, logout, updateProfile, uploadAvatar, changePassword }), [user, loading, login, register, logout, updateProfile, uploadAvatar, changePassword])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
