import { ACCESS_COOKIE, readAccessToken } from '../services/auth.js'
import { permissionsFor, requiredPermission } from '../services/permissions.js'
import { forbidden, unauthorized } from '../utils/errors.js'
function attach(req) {
  const header = req.headers.authorization
  const bearer = header?.startsWith('Bearer ') ? readAccessToken(header.slice(7)) : null
  const cookie = typeof req.cookies?.[ACCESS_COOKIE] === 'string' ? readAccessToken(req.cookies[ACCESS_COOKIE]) : null
  req.auth = bearer ?? cookie ?? undefined
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

/**
 * Applied to every admin route after staffOnly. Looks at the URL, works out which permission
 * it needs and checks that the signed-in person has it. Administrators pass everything.
 */
export async function permissionGate(req, _res, next) {
  try {
    const needed = requiredPermission(req.path)
    if (!needed) return next()
    attach(req)
    if (!req.auth) throw unauthorized()
    const allowed = await permissionsFor(req.auth.id, req.auth.role)
    if (!allowed.includes(needed)) throw forbidden('Your account does not have access to this. Ask an administrator.')
    next()
  } catch (error) {
    next(error)
  }
}
