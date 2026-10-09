import { createHash, randomBytes } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { findAccountById } from './account.js'
import { exec, from, maybe, rows } from './db.js'
import { env } from './env.js'
import type { Role, User } from './types.js'

export type AuthUser = { id: string; role: Role }

const REFRESH_DAYS = 30

export { hashPassword, verifyPassword, needsRehash, burnTime } from './passwords.js'

export function signAccessToken(user: Pick<User, 'id' | 'role'>) {
  return jwt.sign({ sub: user.id, role: user.role }, env.JWT_ACCESS_SECRET, { expiresIn: '15m', algorithm: 'HS256', issuer: 'clickmart' })
}

export function readAccessToken(token: string): AuthUser | null {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'], issuer: 'clickmart' }) as { sub: string; role: Role }
    return { id: payload.sub, role: payload.role }
  } catch {
    return null
  }
}

const sha = (value: string) => createHash('sha256').update(value).digest('hex')

export async function issueRefreshToken(userId: string) {
  const token = randomBytes(48).toString('hex')
  await exec(from('RefreshToken').insert({ userId, tokenHash: sha(token), expiresAt: new Date(Date.now() + REFRESH_DAYS * 86400000).toISOString() }))
  return token
}

// A refresh can be interrupted (page reload, second tab, flaky network) after the server has rotated the token
// but before the browser stored the new cookie. Keeping the old token alive for a few seconds lets that retry succeed.
const REUSE_GRACE_MS = 30_000

/** Rotating: the presented token stops working after a short grace window; the caller issues a replacement. */
export async function consumeRefreshToken(token: string) {
  const record = await maybe<{ id: string; expiresAt: string; userId: string }>(
    from('RefreshToken').select('id, expiresAt, userId').eq('tokenHash', sha(token)).maybeSingle(),
  )
  const user = record ? await findAccountById(record.userId) : null
  if (!record || !user || new Date(record.expiresAt) < new Date() || user.isBlocked) return null
  const graceEnd = new Date(Date.now() + REUSE_GRACE_MS)
  if (new Date(record.expiresAt) > graceEnd) {
    await from('RefreshToken').update({ expiresAt: graceEnd.toISOString() }).eq('id', record.id)
  }
  return user
}

export const purgeExpiredRefreshTokens = async () => {
  const now = new Date().toISOString()
  await exec(from('RefreshToken').delete().lt('expiresAt', now))
  await exec(from('PasswordReset').delete().lt('expiresAt', now))
}

export const revokeRefreshToken = (token: string) => exec(from('RefreshToken').delete().eq('tokenHash', sha(token)))
export const revokeAllRefreshTokens = (userId: string) => exec(from('RefreshToken').delete().eq('userId', userId))

const RESET_MINUTES = 30

/** One-time password reset token. Only its hash is stored; the raw token travels by email. */
export async function createPasswordReset(userId: string) {
  const token = randomBytes(32).toString('hex')
  // A newer request invalidates older unused links.
  await exec(from('PasswordReset').delete().eq('userId', userId).is('usedAt', null))
  await exec(from('PasswordReset').insert({ userId, tokenHash: sha(token), expiresAt: new Date(Date.now() + RESET_MINUTES * 60000).toISOString() }))
  return token
}

/** Marks the token used and returns its user id, or null if it is unknown, used or expired. */
export async function consumePasswordReset(token: string) {
  const record = await maybe<{ id: string; userId: string; expiresAt: string; usedAt: string | null }>(
    from('PasswordReset').select('id, userId, expiresAt, usedAt').eq('tokenHash', sha(token)).maybeSingle(),
  )
  if (!record || record.usedAt || new Date(record.expiresAt) < new Date()) return null
  // The conditional update makes it single-use even if two requests race.
  const claimed = await rows(from('PasswordReset').update({ usedAt: new Date().toISOString() }).eq('id', record.id).is('usedAt', null).select('id'))
  return claimed.length === 1 ? record.userId : null
}

export const REFRESH_COOKIE = 'cm_refresh'
export const refreshCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: env.NODE_ENV === 'production',
  path: '/api/v1/auth',
  maxAge: REFRESH_DAYS * 86400000,
}
