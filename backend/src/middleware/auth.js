import { readAccessToken } from '../services/auth.js'
import { forbidden, unauthorized } from '../utils/errors.js'
function attach(req) {
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) req.auth = readAccessToken(header.slice(7)) ?? undefined
}
export function optionalAuth(req, _res, next) {
  attach(req)
  next()
}
export function requireAuth(req, _res, next) {
  attach(req)
  if (!req.auth) throw unauthorized()
  next()
}
export const requireRole =
  (...roles) =>
  (req, _res, next) => {
    attach(req)
    if (!req.auth) throw unauthorized()
    if (!roles.includes(req.auth.role)) throw forbidden('Your role cannot do this')
    next()
  }
export const staffOnly = requireRole('STAFF', 'ADMIN')
export const adminOnly = requireRole('ADMIN')
export const actor = (req) => {
  if (!req.auth) throw unauthorized()
  return req.auth
}
