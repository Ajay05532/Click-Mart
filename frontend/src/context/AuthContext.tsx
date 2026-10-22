import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api, refreshSession, setAccessToken, setSessionLostHandler } from '../lib/api.ts'
import { useNotice } from './NoticeContext.tsx'

export type User = { id: string; name: string; email: string; phone: string | null; avatarUrl: string | null; role: 'CUSTOMER' | 'STAFF' | 'ADMIN' }

type RegisterInput = { name: string; email: string; phone?: string }
export type RegisterResult = { requiresVerification: true; email: string; expiresInMinutes: number }

type AuthContextValue = {
  user: User | null
  /** True until the first silent session check finishes, so pages do not flash "logged out". */
  loading: boolean
  login: (email: string, password: string) => Promise<User>
  register: (input: RegisterInput) => Promise<RegisterResult>
  /** Checks the emailed code. Returns a one-time token for choosing the password. */
  verifyEmail: (email: string, code: string) => Promise<{ setupToken: string }>
  /** Sets the first password after the email is confirmed, and signs in. */
  completeSignup: (setupToken: string, password: string) => Promise<User>
  resendVerification: (email: string) => Promise<{ expiresInMinutes: number }>
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
  const notify = useNotice()
  const signedIn = useRef(false)
  useEffect(() => {
    signedIn.current = !!user
  }, [user])

  // Restore the session from the httpOnly refresh cookie.
  useEffect(() => {
    setSessionLostHandler(() => {
      // Only say so when someone was actually signed in; guests hitting a private address are not "logged out".
      if (signedIn.current) {
        notify({
          tone: 'warning',
          title: 'Your session has ended',
          text: 'For your security you were logged out. Log in again to continue.',
          actions: [{ label: 'Log in', to: '/login', state: { from: `${window.location.pathname}${window.location.search}` }, primary: true }],
        })
      }
      setUser(null)
    })
    let cancelled = false
    ;(async () => {
      try {
        const session = await refreshSession()
        if (!cancelled && session?.user) setUser(session.user as User)
        else if (!session) {
          // The access cookie can still be valid when the refresh cookie is missing.
          const me = await api<{ user: User }>('/me', {}, true)
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
  }, [notify])

  const start = useCallback((session: Session) => {
    setAccessToken(session.accessToken)
    setUser(session.user)
    return session.user
  }, [])

  const login = useCallback(async (email: string, password: string) => start(await api<Session>('/auth/login', { body: { email, password } })), [start])
  const register = useCallback(async (input: RegisterInput) => api<RegisterResult>('/auth/register', { body: input }), [])
  const verifyEmail = useCallback(async (email: string, code: string) => api<{ setupToken: string }>('/auth/verify-email', { body: { email, code } }), [])
  const completeSignup = useCallback(
    async (setupToken: string, password: string) => start(await api<Session>('/auth/complete-signup', { body: { token: setupToken, password } })),
    [start],
  )
  const resendVerification = useCallback(async (email: string) => api<{ expiresInMinutes: number }>('/auth/resend-verification', { body: { email } }), [])

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined)
    setAccessToken(null)
    signedIn.current = false
    setUser(null)
    notify({ tone: 'info', title: 'You have logged out', text: 'Your cart and wishlist stay on this device. See you soon!' })
  }, [notify])

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

  const value = useMemo(
    () => ({ user, loading, login, register, verifyEmail, completeSignup, resendVerification, logout, updateProfile, uploadAvatar, changePassword }),
    [user, loading, login, register, verifyEmail, completeSignup, resendVerification, logout, updateProfile, uploadAvatar, changePassword],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
