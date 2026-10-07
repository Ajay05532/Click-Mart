export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message)
  }
}

export const badRequest = (message: string, details?: unknown) => new HttpError(400, message, details)
export const unauthorized = (message = 'Please log in to continue') => new HttpError(401, message)
export const forbidden = (message = 'You do not have access to this') => new HttpError(403, message)
export const notFound = (what = 'Resource') => new HttpError(404, `${what} not found`)
export const conflict = (message: string, details?: unknown) => new HttpError(409, message, details)
