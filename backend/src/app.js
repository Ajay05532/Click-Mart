import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import { env, isProd } from './config/env.js'
import { optionalAuth } from './middleware/auth.js'
import { requireHttps } from './middleware/https.js'
import { errorHandler, notFoundHandler } from './middleware/errors.js'
import { adminRouter } from './routes/admin/index.js'
import { authRouter } from './routes/auth.js'
import { catalogRouter } from './routes/catalog.js'
import { geoRouter } from './routes/location.js'
import { meRouter } from './routes/me.js'
import { ordersRouter, paymentsRouter, paymentWebhook } from './routes/orders.js'
import { supportRouter } from './routes/support.js'
import { shippingWebhook } from './routes/shippingWebhook.js'
import { clearPublicCache } from './services/publicCache.js'
const CATALOGUE_WRITES = /^\/api\/v1\/(admin|checkout|orders|payments|shipping)(\/|$)/
export function createApp() {
  const app = express()
  app.set('trust proxy', 1)
  if (isProd) app.use(requireHttps)
  // The API is data, not pages. Keep every address on it out of search results.
  app.use((_req, res, next) => {
    res.set('X-Robots-Tag', 'noindex, nofollow')
    next()
  })
  app.use(
    helmet({
      crossOriginResourcePolicy: {
        policy: 'cross-origin',
      },
      strictTransportSecurity: {
        maxAge: 63072000,
        includeSubDomains: true,
      },
    }),
  )
  app.use(
    cors({
      origin: env.CORS_ORIGINS.split(',').map((origin) => origin.trim()),
      credentials: true,
      // Signed-in requests carry an Authorization header, so the browser asks first (preflight). Chrome keeps the answer at most 2 hours.
      maxAge: 7200,
    }),
  )
  // Writes that can change what shoppers see (catalogue, stock, prices) drop the cached catalogue.
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS' && CATALOGUE_WRITES.test(req.path)) {
      res.on('finish', () => {
        if (res.statusCode < 400) clearPublicCache()
      })
    }
    next()
  })
  app.use(cookieParser())
  app.post(
    '/api/v1/payments/webhook',
    express.raw({
      type: '*/*',
      limit: '1mb',
    }),
    paymentWebhook,
  )
  app.post('/api/v1/shipping/webhook', express.raw({ type: '*/*', limit: '1mb' }), shippingWebhook)
  app.use(
    express.json({
      limit: '1mb',
    }),
  )
  app.get('/health', (_req, res) =>
    res.json({
      status: 'ok',
      env: env.NODE_ENV,
    }),
  )
  const api = express.Router()
  const limit = (max, extra = {}) =>
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: env.NODE_ENV === 'test' ? 10_000 : max,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        error: 'Too many attempts. Please try again later.',
      },
      ...extra,
    })
  const strict = (max) => limit(max)
  const authFailures = limit(20, {
    skipSuccessfulRequests: true,
    skip: (req) =>
      req.path === '/refresh' ||
      req.path === '/logout' ||
      req.path === '/forgot-password' ||
      req.path === '/verify-reset-code' ||
      req.path === '/resend-verification' ||
      req.path === '/verify-email',
  })
  api.use('/auth/refresh', limit(300))
  api.use('/auth/forgot-password', strict(8))
  // Codes also lock after 5 wrong tries each; this caps guessing across many requested codes.
  api.use('/auth/verify-reset-code', strict(30))
  api.use('/auth/resend-verification', strict(8))
  api.use('/auth/verify-email', strict(30))
  api.use('/auth', authFailures, authRouter)
  api.use('/checkout', strict(60))
  api.use('/geo', limit(300), geoRouter)
  api.use(optionalAuth)
  api.use('/me', meRouter)
  // Contact form and new tickets are the spam targets, so they get tighter limits than reading.
  api.post('/support/contact', limit(6, { windowMs: 60 * 60 * 1000 }))
  api.post('/support/tickets', limit(20, { windowMs: 60 * 60 * 1000 }))
  api.post('/support/attachments', limit(30, { windowMs: 60 * 60 * 1000 }))
  api.use('/support', limit(600), supportRouter)
  api.use('/payments', paymentsRouter)
  api.use('/admin', adminRouter)
  api.use(ordersRouter)
  api.use(catalogRouter)
  app.use('/api/v1', api)
  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}
