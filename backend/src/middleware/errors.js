import { ZodError } from 'zod'
import { HttpError } from '../utils/errors.js'
import { isProd } from '../config/env.js'
export function notFoundHandler(_req, res) {
  res.status(404).json({
    error: 'Route not found',
  })
}
export function errorHandler(err, _req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({
      error: err.message,
      details: err.details,
    })
  }
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    })
  }
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({
      error: 'Malformed JSON body',
    })
  }
  console.error(err)
  res.status(500).json({
    error: 'Something went wrong',
    ...(isProd
      ? {}
      : {
          detail: String(err),
        }),
  })
}
