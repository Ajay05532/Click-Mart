import { Router } from 'express'
import { z } from 'zod'
import {
  REFRESH_COOKIE,
  consumePasswordReset,
  consumeRefreshToken,
  createPasswordReset,
  burnTime,
  hashPassword,
  issueRefreshToken,
  needsRehash,
  refreshCookieOptions,
  revokeAllRefreshTokens,
  revokeRefreshToken,
  signAccessToken,
  verifyPassword,
} from '../lib/auth.js'
import { createAccount, findAccountByEmail, findAccountById, updateLogin } from '../lib/account.js'
import { badRequest, conflict, unauthorized } from '../lib/errors.js'
import { env } from '../lib/env.js'
import { sendMail } from '../lib/mailer.js'
import type { User } from '../lib/types.js'
import { actor, requireAuth } from '../middleware/auth.js'
import type { Response } from 'express'

export const publicUser = (user: User) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  avatarUrl: user.avatarUrl ?? null,
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
  if (await findAccountByEmail(data.email)) throw conflict('An account with this email already exists')
  const user = await createAccount({ name: data.name, email: data.email, phone: data.phone ?? null, passwordHash: await hashPassword(data.password), role: 'CUSTOMER' })
  res.status(201).json(await startSession(res, user))
})

authRouter.post('/login', async (req, res) => {
  const data = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) }).parse(req.body)
  const user = await findAccountByEmail(data.email)
  // Same message for unknown email and wrong password so accounts cannot be enumerated.
  if (!user) {
    await burnTime(data.password)
    throw unauthorized('Incorrect email or password')
  }
  if (!(await verifyPassword(data.password, user.passwordHash))) throw unauthorized('Incorrect email or password')
  if (user.isBlocked) throw unauthorized('This account has been disabled')
  // Quietly upgrade older password hashes to the current format now that we have the plain password.
  const patch: { passwordHash?: string; lastLoginAt: string } = { lastLoginAt: new Date().toISOString() }
  if (needsRehash(user.passwordHash)) patch.passwordHash = await hashPassword(data.password)
  await updateLogin(user.id, patch).catch((error) => console.error('login stamp failed', error))
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
  const user = await findAccountById(actor(req).id)
  if (!user) throw unauthorized('Current password is incorrect')
  if (!(await verifyPassword(data.currentPassword, user.passwordHash))) throw unauthorized('Current password is incorrect')
  await updateLogin(user.id, { passwordHash: await hashPassword(data.newPassword) })
  await revokeAllRefreshTokens(user.id)
  res.status(204).end()
})

// Always answers the same way, so the form cannot be used to discover which emails have accounts.
authRouter.post('/forgot-password', async (req, res) => {
  const data = z.object({ email: z.string().trim().toLowerCase().email() }).parse(req.body)
  const user = await findAccountByEmail(data.email)
  if (user && !user.isBlocked) {
    const token = await createPasswordReset(user.id)
    const base = user.role === 'CUSTOMER' ? env.STORE_URL : env.ADMIN_URL
    void sendMail(
      user.email,
      'Reset your ClickMart password',
      `Hi ${user.name},\n\nUse this link to choose a new password. It works once and expires in 30 minutes:\n${base}/reset-password?token=${token}\n\nIf you did not ask for this, you can ignore this email. Your password has not changed.\n\n— ClickMart`,
    )
  }
  res.json({ message: 'If that email has an account, a reset link is on its way.' })
})

authRouter.post('/reset-password', async (req, res) => {
  const data = z.object({ token: z.string().min(20).max(200), password: z.string().min(8, 'Use at least 8 characters').max(100) }).parse(req.body)
  const userId = await consumePasswordReset(data.token)
  if (!userId) throw badRequest('This reset link is invalid or has expired. Request a new one.')
  await updateLogin(userId, { passwordHash: await hashPassword(data.password) })
  await revokeAllRefreshTokens(userId) // sign out everywhere
  res.json({ message: 'Password updated. You can log in with it now.' })
})
