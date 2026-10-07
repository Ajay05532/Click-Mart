import { Router } from 'express'
import { z } from 'zod'
import {
  REFRESH_COOKIE,
  consumeRefreshToken,
  hashPassword,
  issueRefreshToken,
  refreshCookieOptions,
  revokeRefreshToken,
  signAccessToken,
  verifyPassword,
} from '../lib/auth.js'
import { conflict, unauthorized } from '../lib/errors.js'
import { prisma } from '../lib/prisma.js'
import { actor, requireAuth } from '../middleware/auth.js'
import type { Response } from 'express'
import type { User } from '@prisma/client'

export const publicUser = (user: User) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  createdAt: user.createdAt,
})

async function startSession(res: Response, user: User) {
  const refresh = await issueRefreshToken(user.id)
  res.cookie(REFRESH_COOKIE, refresh, refreshCookieOptions)
  return { user: publicUser(user), accessToken: signAccessToken(user) }
}

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number').optional(),
  password: z.string().min(8, 'Use at least 8 characters').max(100),
})

export const authRouter = Router()

authRouter.post('/register', async (req, res) => {
  const data = registerSchema.parse(req.body)
  if (await prisma.user.findUnique({ where: { email: data.email } })) throw conflict('An account with this email already exists')
  const user = await prisma.user.create({
    data: { name: data.name, email: data.email, phone: data.phone, passwordHash: await hashPassword(data.password) },
  })
  res.status(201).json(await startSession(res, user))
})

authRouter.post('/login', async (req, res) => {
  const data = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) }).parse(req.body)
  const user = await prisma.user.findUnique({ where: { email: data.email } })
  // Same message for unknown email and wrong password so accounts cannot be enumerated.
  if (!user || !(await verifyPassword(data.password, user.passwordHash))) throw unauthorized('Incorrect email or password')
  if (user.isBlocked) throw unauthorized('This account has been disabled')
  res.json(await startSession(res, user))
})

authRouter.post('/refresh', async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE] as string | undefined
  const user = token ? await consumeRefreshToken(token) : null
  if (!user) {
    res.clearCookie(REFRESH_COOKIE, { path: refreshCookieOptions.path })
    throw unauthorized('Session expired. Please log in again.')
  }
  res.json(await startSession(res, user))
})

authRouter.post('/logout', async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE] as string | undefined
  if (token) await revokeRefreshToken(token)
  res.clearCookie(REFRESH_COOKIE, { path: refreshCookieOptions.path })
  res.status(204).end()
})

authRouter.post('/change-password', requireAuth, async (req, res) => {
  const data = z.object({ currentPassword: z.string(), newPassword: z.string().min(8).max(100) }).parse(req.body)
  const user = await prisma.user.findUniqueOrThrow({ where: { id: actor(req).id } })
  if (!(await verifyPassword(data.currentPassword, user.passwordHash))) throw unauthorized('Current password is incorrect')
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(data.newPassword) } })
  await prisma.refreshToken.deleteMany({ where: { userId: user.id } })
  res.status(204).end()
})
