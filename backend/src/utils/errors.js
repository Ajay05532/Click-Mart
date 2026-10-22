export class HttpError extends Error {
  status
  details
  constructor(status, message, details) {
    ;(super(message), (this.status = status), (this.details = details))
  }
}
export const badRequest = (message, details) => new HttpError(400, message, details)
export const unauthorized = (message = 'Please log in to continue', details) => new HttpError(401, message, details)
export const forbidden = (message = 'You do not have access to this') => new HttpError(403, message)
export const notFound = (what = 'Resource') => new HttpError(404, `${what} not found`)
export const conflict = (message, details) => new HttpError(409, message, details)
