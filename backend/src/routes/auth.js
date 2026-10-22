import { Router } from 'express'
import { z } from 'zod'
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessCookieOptions,
  CODE_MINUTES,
  consumePasswordReset,
  createResetCode,
  createVerifyCode,
  verifyResetCode,
  verifyEmailCode,
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
  unusablePassword,
  verifyPassword,
} from '../services/auth.js'
import { createAccount, findAccountByEmail, findAccountById, updateLogin } from '../services/account.js'
import { badRequest, conflict, unauthorized } from '../utils/errors.js'
import { sendPasswordChanged, sendPasswordResetCode, sendVerifyCode, sendWelcome } from '../services/emails.js'
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
})
export const authRouter = Router()
authRouter.post('/register', async (req, res) => {
  const data = registerSchema.parse(req.body)
  const existing = await findAccountByEmail(data.email)
  if (existing && existing.emailVerifiedAt) throw conflict('An account with this email already exists')
  if (existing) {
    // They registered before but never confirmed the email: resend instead of a dead-end "already exists".
    const code = await createVerifyCode(existing.id)
    void sendVerifyCode(existing, code, CODE_MINUTES)
    return res.status(201).json({ requiresVerification: true, email: existing.email, expiresInMinutes: CODE_MINUTES })
  }
  const user = await createAccount({
    name: data.name,
    email: data.email,
    phone: data.phone ?? null,
    // The password is chosen after the email is confirmed (POST /auth/complete-signup).
    passwordHash: await unusablePassword(),
    role: 'CUSTOMER',
    emailVerifiedAt: null,
  })
  const code = await createVerifyCode(user.id)
  void sendVerifyCode(user, code, CODE_MINUTES)
  // No session yet: the account only becomes usable once /auth/verify-email confirms this is really their inbox.
  res.status(201).json({
    requiresVerification: true,
    email: user.email,
    expiresInMinutes: CODE_MINUTES,
  })
})
authRouter.post('/resend-verification', async (req, res) => {
  const data = z
    .object({
      email: z.string().trim().toLowerCase().email(),
    })
    .parse(req.body)
  const user = await findAccountByEmail(data.email)
  if (user && !user.isBlocked && !user.emailVerifiedAt) {
    const code = await createVerifyCode(user.id)
    void sendVerifyCode(user, code, CODE_MINUTES)
  }
  // Same answer either way, so this cannot be used to probe which emails are registered.
  res.json({
    message: 'If that email is waiting to be confirmed, we have sent it a fresh 6-digit code.',
    expiresInMinutes: CODE_MINUTES,
  })
})
authRouter.post('/verify-email', async (req, res) => {
  const data = z
    .object({
      email: z.string().trim().toLowerCase().email(),
      code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from the email'),
    })
    .parse(req.body)
  const user = await findAccountByEmail(data.email)
  if (!user || user.isBlocked) throw badRequest('That code is not right.')
  if (user.emailVerifiedAt) throw badRequest('This email is already confirmed. Try logging in.')
  const result = await verifyEmailCode(user.id, data.code)
  if (result.error === 'expired') throw badRequest('This code has expired or was already used. Request a new one.')
  if (result.error === 'locked') throw badRequest('Too many wrong tries. Request a new code.')
  if (!result.token) throw badRequest(result.triesLeft ? `That code is not right. ${result.triesLeft} ${result.triesLeft === 1 ? 'try' : 'tries'} left.` : 'That code is not right.')
  // Next the shopper chooses a password with this token; only then is the account confirmed and signed in.
  res.json({ setupToken: result.token, expiresInMinutes: 30 })
})
authRouter.post('/complete-signup', async (req, res) => {
  const data = z
    .object({
      token: z.string().min(20).max(200),
      password: z.string().min(8, 'Use at least 8 characters').max(100),
    })
    .parse(req.body)
  const userId = await consumePasswordReset(data.token)
  if (!userId) throw badRequest('This step has expired. Log in with your email to get a new code.')
  const user = await findAccountById(userId)
  if (!user || user.isBlocked) throw badRequest('This step has expired. Log in with your email to get a new code.')
  // A confirmed account changes its password through "Forgot password", which also signs out other devices.
  if (user.emailVerifiedAt) throw badRequest('This email is already confirmed. Log in, or use Forgot password.')
  const now = new Date().toISOString()
  await updateLogin(user.id, { passwordHash: await hashPassword(data.password), emailVerifiedAt: now, lastLoginAt: now })
  void sendWelcome(user)
  res.json(await startSession(res, { ...user, emailVerifiedAt: now }))
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
  if (!user.emailVerifiedAt) {
    const code = await createVerifyCode(user.id)
    void sendVerifyCode(user, code, CODE_MINUTES)
    throw unauthorized('Confirm your email first. We just sent a fresh 6-digit code to it.', { requiresVerification: true, email: user.email })
  }
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
