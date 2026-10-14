import { Router } from 'express'
import { z } from 'zod'
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessCookieOptions,
  consumePasswordReset,
  createPasswordReset,
  burnTime,
  clearAccessCookieOptions,
  hashPassword,
  issueRefreshToken,
  needsRehash,
  refreshCookieOptions,
  clearCookieOptions,
  renewRefreshToken,
  revokeAllRefreshTokens,
  revokeRefreshToken,
  signAccessToken,
  verifyPassword,
} from '../services/auth.js'
import { createAccount, findAccountByEmail, findAccountById, updateLogin } from '../services/account.js'
import { badRequest, conflict, unauthorized } from '../utils/errors.js'
import { env } from '../config/env.js'
import { sendMail } from '../services/mailer.js'
import { actor, requireAuth } from '../middleware/auth.js'
export const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  avatarUrl: user.avatarUrl ?? null,
  role: user.role,
  createdAt: user.createdAt,
})
function writeSessionCookies(res, user, refreshToken) {
  const accessToken = signAccessToken(user)
  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions)
  res.cookie(ACCESS_COOKIE, accessToken, accessCookieOptions)
  return accessToken
}
function clearSessionCookies(res) {
  res.clearCookie(REFRESH_COOKIE, clearCookieOptions)
  res.clearCookie(ACCESS_COOKIE, clearAccessCookieOptions)
}
async function startSession(res, user) {
  const refresh = await issueRefreshToken(user)
  return {
    user: publicUser(user),
    accessToken: writeSessionCookies(res, user, refresh),
  }
}
const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  phone: z
    .string()
    .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number')
    .optional(),
  password: z.string().min(8, 'Use at least 8 characters').max(100),
})
export const authRouter = Router()
authRouter.post('/register', async (req, res) => {
  const data = registerSchema.parse(req.body)
  if (await findAccountByEmail(data.email)) throw conflict('An account with this email already exists')
  const user = await createAccount({
    name: data.name,
    email: data.email,
    phone: data.phone ?? null,
    passwordHash: await hashPassword(data.password),
    role: 'CUSTOMER',
  })
  res.status(201).json(await startSession(res, user))
})
authRouter.post('/login', async (req, res) => {
  const data = z
    .object({
      email: z.string().trim().toLowerCase().email(),
      password: z.string().min(1),
    })
    .parse(req.body)
  const user = await findAccountByEmail(data.email)
  if (!user) {
    await burnTime(data.password)
    throw unauthorized('Incorrect email or password')
  }
  if (!(await verifyPassword(data.password, user.passwordHash))) throw unauthorized('Incorrect email or password')
  if (user.isBlocked) throw unauthorized('This account has been disabled')
  const patch = {
    lastLoginAt: new Date().toISOString(),
  }
  if (needsRehash(user.passwordHash)) patch.passwordHash = await hashPassword(data.password)
  await updateLogin(user.id, patch).catch((error) => console.error('login stamp failed', error))
  res.json(await startSession(res, user))
})
authRouter.post('/refresh', async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE]
  const renewed = token ? await renewRefreshToken(token) : null
  if (!renewed) {
    res.clearCookie(REFRESH_COOKIE, clearCookieOptions)
    throw unauthorized('Session expired. Please log in again.')
  }
  res.json({
    user: publicUser(renewed.user),
    accessToken: writeSessionCookies(res, renewed.user, renewed.refreshToken),
  })
})
authRouter.post('/logout', async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE]
  if (token) await revokeRefreshToken(token)
  clearSessionCookies(res)
  res.status(204).end()
})
authRouter.post('/change-password', requireAuth, async (req, res) => {
  const data = z
    .object({
      currentPassword: z.string(),
      newPassword: z.string().min(8).max(100),
    })
    .parse(req.body)
  const user = await findAccountById(actor(req).id)
  if (!user) throw unauthorized('Current password is incorrect')
  if (!(await verifyPassword(data.currentPassword, user.passwordHash))) throw unauthorized('Current password is incorrect')
  await updateLogin(user.id, {
    passwordHash: await hashPassword(data.newPassword),
  })
  await revokeAllRefreshTokens(user.id)
  clearSessionCookies(res)
  res.status(204).end()
})
authRouter.post('/forgot-password', async (req, res) => {
  const data = z
    .object({
      email: z.string().trim().toLowerCase().email(),
    })
    .parse(req.body)
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
  res.json({
    message: 'If that email has an account, a reset link is on its way.',
  })
})
authRouter.post('/reset-password', async (req, res) => {
  const data = z
    .object({
      token: z.string().min(20).max(200),
      password: z.string().min(8, 'Use at least 8 characters').max(100),
    })
    .parse(req.body)
  const userId = await consumePasswordReset(data.token)
  if (!userId) throw badRequest('This reset link is invalid or has expired. Request a new one.')
  await updateLogin(userId, {
    passwordHash: await hashPassword(data.password),
  })
  await revokeAllRefreshTokens(userId)
  res.json({
    message: 'Password updated. You can log in with it now.',
  })
})
