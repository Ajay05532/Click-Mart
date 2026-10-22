import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { findAccountById } from './account.js'
import { exec, from, maybe, rows } from '../database/db.js'
import { env } from '../config/env.js'
const REFRESH_DAYS = 30
const ACCESS_TTL = '15m'
export { hashPassword, verifyPassword, needsRehash, burnTime } from './passwords.js'
export function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      typ: 'access',
    },
    env.JWT_ACCESS_SECRET,
    {
      expiresIn: ACCESS_TTL,
      algorithm: 'HS256',
      issuer: 'clickmart',
    },
  )
}
function readJwt(token, secret, typ) {
  try {
    const payload = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      issuer: 'clickmart',
    })
    if (!payload?.sub || payload.typ !== typ) return null
    return payload
  } catch {
    return null
  }
}
export function readAccessToken(token) {
  const payload = readJwt(token, env.JWT_ACCESS_SECRET, 'access')
  if (!payload) return null
  return {
    id: payload.sub,
    role: payload.role,
  }
}
const sha = (value) => createHash('sha256').update(value).digest('hex')
const refreshExpiry = () => new Date(Date.now() + REFRESH_DAYS * 86400000).toISOString()
export function signRefreshToken(user, jti) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      jti,
      typ: 'refresh',
    },
    env.JWT_REFRESH_SECRET,
    {
      expiresIn: `${REFRESH_DAYS}d`,
      algorithm: 'HS256',
      issuer: 'clickmart',
    },
  )
}
export function readRefreshToken(token) {
  const payload = readJwt(token, env.JWT_REFRESH_SECRET, 'refresh')
  if (!payload?.jti) return null
  return {
    id: payload.sub,
    role: payload.role,
    jti: payload.jti,
  }
}
export async function issueRefreshToken(user) {
  const jti = randomBytes(32).toString('hex')
  await exec(
    from('RefreshToken').insert({
      userId: user.id,
      tokenHash: sha(jti),
      expiresAt: refreshExpiry(),
    }),
  )
  return signRefreshToken(user, jti)
}
/** Checks the refresh JWT and slides its lifetime. The same session id stays valid, so a reload cannot revoke it. */
export async function renewRefreshToken(token) {
  const payload = readRefreshToken(token)
  if (!payload) return null
  const record = await maybe(from('RefreshToken').select('id, expiresAt, userId').eq('tokenHash', sha(payload.jti)).maybeSingle())
  const user = record ? await findAccountById(record.userId) : null
  if (!record || !user || record.userId !== payload.id || new Date(record.expiresAt) < new Date() || user.isBlocked) return null
  const expiresAt = refreshExpiry()
  await exec(from('RefreshToken').update({ expiresAt }).eq('id', record.id))
  return {
    user,
    refreshToken: signRefreshToken(user, payload.jti),
  }
}
export const purgeExpiredRefreshTokens = async () => {
  const now = new Date().toISOString()
  await exec(from('RefreshToken').delete().lt('expiresAt', now))
  await exec(from('PasswordReset').delete().lt('expiresAt', now))
}
export const revokeRefreshToken = (token) => {
  const payload = readRefreshToken(token)
  return exec(from('RefreshToken').delete().eq('tokenHash', sha(payload ? payload.jti : token)))
}
export const revokeAllRefreshTokens = (userId) => exec(from('RefreshToken').delete().eq('userId', userId))
const RESET_MINUTES = 30
export const CODE_MINUTES = 10
export const CODE_TRIES = 5
const codeHash = (userId, code) => sha(`reset-code:${userId}:${code}`)

/** A fresh 6-digit code for "Forgot password". Any older unused code or link for this person stops working. */
export async function createResetCode(userId) {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  await exec(from('PasswordReset').delete().eq('userId', userId).is('usedAt', null))
  await exec(
    from('PasswordReset').insert({
      userId,
      kind: 'code',
      tokenHash: codeHash(userId, code),
      expiresAt: new Date(Date.now() + CODE_MINUTES * 60000).toISOString(),
    }),
  )
  return code
}

/**
 * Checks a code. Right: the code is used up and a one-time reset token (30 minutes) is returned.
 * Wrong: counts a try; after 5 the code stops working. Returns { token } or { error, triesLeft? }.
 */
export async function verifyResetCode(userId, code) {
  const record = await maybe(
    from('PasswordReset').select('id, tokenHash, expiresAt, attempts').eq('userId', userId).eq('kind', 'code').is('usedAt', null).order('createdAt', { ascending: false }).limit(1).maybeSingle(),
  )
  if (!record || new Date(record.expiresAt) < new Date()) return { error: 'expired' }
  if (record.attempts >= CODE_TRIES) return { error: 'locked' }
  const given = Buffer.from(codeHash(userId, code))
  const expected = Buffer.from(record.tokenHash)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    const attempts = record.attempts + 1
    await exec(from('PasswordReset').update({ attempts }).eq('id', record.id))
    return attempts >= CODE_TRIES ? { error: 'locked' } : { error: 'wrong', triesLeft: CODE_TRIES - attempts }
  }
  const claimed = await rows(from('PasswordReset').update({ usedAt: new Date().toISOString() }).eq('id', record.id).is('usedAt', null).select('id'))
  if (claimed.length !== 1) return { error: 'expired' }
  return { token: await createPasswordReset(userId) }
}

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
  // Only one-time reset tokens, never an emailed code: a code must go through verifyResetCode and its try limit.
  const record = await maybe(from('PasswordReset').select('id, userId, expiresAt, usedAt').eq('tokenHash', sha(token)).neq('kind', 'code').maybeSingle())
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
const cookieFlags = {
  httpOnly: true,
  sameSite: env.COOKIE_SAMESITE,
  secure: env.NODE_ENV === 'production' || env.COOKIE_SAMESITE === 'none',
}
const clearFlags = (path) => ({ httpOnly: true, sameSite: cookieFlags.sameSite, secure: cookieFlags.secure, path })
export const ACCESS_COOKIE = 'cm_access'
export const accessCookieOptions = { ...cookieFlags, path: '/api/v1', maxAge: 15 * 60 * 1000 }
export const clearAccessCookieOptions = clearFlags('/api/v1')
export const REFRESH_COOKIE = 'cm_refresh'
export const refreshCookieOptions = { ...cookieFlags, path: '/api/v1/auth', maxAge: REFRESH_DAYS * 86400000 }
/** Same flags as the refresh cookie, minus the age, so the browser matches it when clearing. */
export const clearCookieOptions = clearFlags('/api/v1/auth')
