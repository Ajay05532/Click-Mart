import { Router } from 'express'
import { z } from 'zod'
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessCookieOptions,
  CODE_MINUTES,
  consumePasswordReset,
  createResetCode,
  verifyResetCode,
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
import { sendPasswordChanged, sendPasswordResetCode, sendWelcome } from '../services/emails.js'
import { actor, requireAuth } from '../middleware/auth.js'
import { permissionsFor } from '../services/permissions.js'
export const publicUser = (user, permissions) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  avatarUrl: user.avatarUrl ?? null,
  role: user.role,
  createdAt: user.createdAt,
  ...(permissions ? { permissions } : {}),
})
/** The user as the apps see it. Team members also get what they may open in the admin app. */
export async function sessionUser(user) {
  return publicUser(user, user.role === 'CUSTOMER' ? undefined : await permissionsFor(user.id, user.role))
}
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
    user: await sessionUser(user),
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
  void sendWelcome(user)
  res.status(201).json(await startSession(res, user))
})
authRouter.post('/login', async (req, res) => {
  const data = z
    .object({
      email: z.string().trim().toLowerCase().email(),
      password: z.string().min(1),
      // The admin app sends this so staff get a precise reason. The storefront keeps one generic message
      // so a stranger cannot test which customer emails exist.
      portal: z.enum(['admin']).optional(),
    })
    .parse(req.body)
  const adminPortal = data.portal === 'admin'
  const user = await findAccountByEmail(data.email)
  if (!user || (adminPortal && user.role === 'CUSTOMER')) {
    await burnTime(data.password)
    throw unauthorized(adminPortal ? 'No staff account found with this email' : 'Incorrect email or password')
  }
  if (!(await verifyPassword(data.password, user.passwordHash))) {
    throw unauthorized(adminPortal ? 'Incorrect password. Try again or reset it' : 'Incorrect email or password')
  }
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
    user: await sessionUser(renewed.user),
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
  void sendPasswordChanged(user)
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
    const code = await createResetCode(user.id)
    void sendPasswordResetCode(user, code, CODE_MINUTES)
  }
  // Same answer whether or not the email has an account, so nobody can test which emails are registered.
  res.json({
    message: 'If that email has an account, we have sent it a 6-digit code.',
    expiresInMinutes: CODE_MINUTES,
  })
})
authRouter.post('/verify-reset-code', async (req, res) => {
  const data = z
    .object({
      email: z.string().trim().toLowerCase().email(),
      code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from the email'),
    })
    .parse(req.body)
  const user = await findAccountByEmail(data.email)
  const result = user && !user.isBlocked ? await verifyResetCode(user.id, data.code) : { error: 'wrong', triesLeft: undefined }
  if (result.token) return res.json({ resetToken: result.token })
  if (result.error === 'expired') throw badRequest('This code has expired or was already used. Request a new one.')
  if (result.error === 'locked') throw badRequest('Too many wrong tries. Request a new code.')
  throw badRequest(result.triesLeft ? `That code is not right. ${result.triesLeft} ${result.triesLeft === 1 ? 'try' : 'tries'} left.` : 'That code is not right.')
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
  const account = await findAccountById(userId)
  if (account) void sendPasswordChanged(account)
  res.json({
    message: 'Password updated. You can log in with it now.',
  })
})
