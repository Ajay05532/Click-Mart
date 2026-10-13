import { createHash, randomBytes } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { findAccountById } from './account.js'
import { exec, from, maybe, rows } from '../database/db.js'
import { env } from '../config/env.js'
const REFRESH_DAYS = 30
export { hashPassword, verifyPassword, needsRehash, burnTime } from './passwords.js'
export function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
    },
    env.JWT_ACCESS_SECRET,
    {
      expiresIn: '15m',
      algorithm: 'HS256',
      issuer: 'clickmart',
    },
  )
}
export function readAccessToken(token) {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
      issuer: 'clickmart',
    })
    return {
      id: payload.sub,
      role: payload.role,
    }
  } catch {
    return null
  }
}
const sha = (value) => createHash('sha256').update(value).digest('hex')
export async function issueRefreshToken(userId) {
  const token = randomBytes(48).toString('hex')
  await exec(
    from('RefreshToken').insert({
      userId,
      tokenHash: sha(token),
      expiresAt: new Date(Date.now() + REFRESH_DAYS * 86400000).toISOString(),
    }),
  )
  return token
}
const REUSE_GRACE_MS = 30_000
export async function consumeRefreshToken(token) {
  const record = await maybe(from('RefreshToken').select('id, expiresAt, userId').eq('tokenHash', sha(token)).maybeSingle())
  const user = record ? await findAccountById(record.userId) : null
  if (!record || !user || new Date(record.expiresAt) < new Date() || user.isBlocked) return null
  const graceEnd = new Date(Date.now() + REUSE_GRACE_MS)
  if (new Date(record.expiresAt) > graceEnd) {
    await from('RefreshToken')
      .update({
        expiresAt: graceEnd.toISOString(),
      })
      .eq('id', record.id)
  }
  return user
}
export const purgeExpiredRefreshTokens = async () => {
  const now = new Date().toISOString()
  await exec(from('RefreshToken').delete().lt('expiresAt', now))
  await exec(from('PasswordReset').delete().lt('expiresAt', now))
}
export const revokeRefreshToken = (token) => exec(from('RefreshToken').delete().eq('tokenHash', sha(token)))
export const revokeAllRefreshTokens = (userId) => exec(from('RefreshToken').delete().eq('userId', userId))
const RESET_MINUTES = 30
export async function createPasswordReset(userId) {
  const token = randomBytes(32).toString('hex')
  await exec(from('PasswordReset').delete().eq('userId', userId).is('usedAt', null))
  await exec(
    from('PasswordReset').insert({
      userId,
      tokenHash: sha(token),
      expiresAt: new Date(Date.now() + RESET_MINUTES * 60000).toISOString(),
    }),
  )
  return token
}
export async function consumePasswordReset(token) {
  const record = await maybe(from('PasswordReset').select('id, userId, expiresAt, usedAt').eq('tokenHash', sha(token)).maybeSingle())
  if (!record || record.usedAt || new Date(record.expiresAt) < new Date()) return null
  const claimed = await rows(
    from('PasswordReset')
      .update({
        usedAt: new Date().toISOString(),
      })
      .eq('id', record.id)
      .is('usedAt', null)
      .select('id'),
  )
  return claimed.length === 1 ? record.userId : null
}
export const REFRESH_COOKIE = 'cm_refresh'
export const refreshCookieOptions = {
  httpOnly: true,
  sameSite: env.COOKIE_SAMESITE,
  secure: env.NODE_ENV === 'production' || env.COOKIE_SAMESITE === 'none',
  path: '/api/v1/auth',
  maxAge: REFRESH_DAYS * 86400000,
}
/** Same flags as the cookie, minus the age, so the browser matches it when clearing. */
export const clearCookieOptions = { httpOnly: true, sameSite: refreshCookieOptions.sameSite, secure: refreshCookieOptions.secure, path: refreshCookieOptions.path }
