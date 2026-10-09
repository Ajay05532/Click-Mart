import type { NextFunction, Request, Response } from 'express'
import type { Role } from '../lib/types.js'
import { readAccessToken, type AuthUser } from '../lib/auth.js'
import { forbidden, unauthorized } from '../lib/errors.js'

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthUser
  }
}

function attach(req: Request) {
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) req.auth = readAccessToken(header.slice(7)) ?? undefined
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  attach(req)
  next()
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  attach(req)
  if (!req.auth) throw unauthorized()
  next()
}

export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    attach(req)
    if (!req.auth) throw unauthorized()
    if (!roles.includes(req.auth.role)) throw forbidden('Your role cannot do this')
    next()
  }

export const staffOnly = requireRole('STAFF', 'ADMIN')
export const adminOnly = requireRole('ADMIN')

export const actor = (req: Request) => {
  if (!req.auth) throw unauthorized()
  return req.auth
}
