import path from 'node:path'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import { env, isProd } from './lib/env.js'
import { optionalAuth } from './middleware/auth.js'
import { requireHttps } from './middleware/https.js'
import { errorHandler, notFoundHandler } from './middleware/errors.js'
import { adminRouter, UPLOAD_DIR } from './routes/admin/index.js'
import { authRouter } from './routes/auth.js'
import { catalogRouter } from './routes/catalog.js'
import { geoRouter } from './routes/location.js'
import { meRouter } from './routes/me.js'
import { ordersRouter, paymentsRouter, paymentWebhook } from './routes/orders.js'

export function createApp() {
  const app = express()
  app.set('trust proxy', 1)
  if (isProd) app.use(requireHttps)
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      // Tell browsers to use HTTPS only for the next two years.
      strictTransportSecurity: { maxAge: 63072000, includeSubDomains: true },
    }),
  )
  app.use(cors({ origin: env.CORS_ORIGINS.split(',').map((origin) => origin.trim()), credentials: true }))
  app.use(cookieParser())

  // The webhook must be verified against the exact bytes the gateway signed, so it is mounted before express.json().
  app.post('/api/v1/payments/webhook', express.raw({ type: '*/*', limit: '1mb' }), paymentWebhook)
  app.use(express.json({ limit: '1mb' }))

  app.get('/health', (_req, res) => res.json({ status: 'ok', env: env.NODE_ENV }))
  app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: isProd ? '7d' : 0 }))

  const api = express.Router()
  const limit = (max: number, extra: Partial<Parameters<typeof rateLimit>[0]> = {}) =>
    rateLimit({ windowMs: 15 * 60 * 1000, limit: env.NODE_ENV === 'test' ? 10_000 : max, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many attempts. Please try again later.' }, ...extra })
  const strict = (max: number) => limit(max)
  // Brute-force protection counts FAILED log-ins/registrations only, so normal use never trips it.
  const authFailures = limit(20, { skipSuccessfulRequests: true, skip: (req) => req.path === '/refresh' || req.path === '/logout' || req.path === '/forgot-password' })
  // Every page load restores the session with one refresh call, so it gets its own, much higher, allowance.
  api.use('/auth/refresh', limit(300))
  api.use('/auth/forgot-password', strict(8))
  api.use('/auth', authFailures, authRouter)
  api.use('/checkout', strict(60))
  api.use('/geo', limit(300), geoRouter)
  api.use(optionalAuth)
  api.use('/me', meRouter)
  api.use('/payments', paymentsRouter)
  api.use('/admin', adminRouter)
  api.use(ordersRouter)
  api.use(catalogRouter)
  app.use('/api/v1', api)

  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}
