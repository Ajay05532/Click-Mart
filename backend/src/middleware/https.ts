import type { NextFunction, Request, Response } from 'express'

/**
 * In production every request must arrive over HTTPS (the platform's proxy terminates TLS and sets
 * X-Forwarded-Proto; express "trust proxy" turns that into req.secure). Plain-HTTP browser requests are
 * redirected, and anything else is refused, so passwords and tokens never travel unencrypted.
 */
export function requireHttps(req: Request, res: Response, next: NextFunction) {
  if (req.secure || req.path === '/health') return next()
  if (req.method === 'GET' || req.method === 'HEAD') return res.redirect(308, `https://${req.headers.host}${req.originalUrl}`)
  res.status(426).json({ error: 'HTTPS is required' })
}
