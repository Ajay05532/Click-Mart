import { createHash, randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import type { Role, User } from '@prisma/client'
import { env } from './env.js'
import { prisma } from './prisma.js'

export type AuthUser = { id: string; role: Role }

const REFRESH_DAYS = 30

export const hashPassword = (password: string) => bcrypt.hash(password, 11)
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash)

export function signAccessToken(user: Pick<User, 'id' | 'role'>) {
  return jwt.sign({ sub: user.id, role: user.role }, env.JWT_ACCESS_SECRET, { expiresIn: '15m' })
}

export function readAccessToken(token: string): AuthUser | null {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as { sub: string; role: Role }
    return { id: payload.sub, role: payload.role }
  } catch {
    return null
  }
}

const sha = (value: string) => createHash('sha256').update(value).digest('hex')

export async function issueRefreshToken(userId: string) {
  const token = randomBytes(48).toString('hex')
  await prisma.refreshToken.create({
    data: { userId, tokenHash: sha(token), expiresAt: new Date(Date.now() + REFRESH_DAYS * 86400000) },
  })
  return token
}

/** Single-use: the presented token is deleted and a new one is issued by the caller. */
export async function consumeRefreshToken(token: string) {
  const record = await prisma.refreshToken.findUnique({ where: { tokenHash: sha(token) }, include: { user: true } })
  if (!record) return null
  await prisma.refreshToken.delete({ where: { id: record.id } }).catch(() => undefined)
  if (record.expiresAt < new Date() || record.user.isBlocked) return null
  return record.user
}

export const revokeRefreshToken = (token: string) =>
  prisma.refreshToken.deleteMany({ where: { tokenHash: sha(token) } })

export const REFRESH_COOKIE = 'cm_refresh'
export const refreshCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: env.NODE_ENV === 'production',
  path: '/api/v1/auth',
  maxAge: REFRESH_DAYS * 86400000,
}
