export function requireHttps(req, res, next) {
  if (req.secure || req.path === '/health') return next()
  if (req.method === 'GET' || req.method === 'HEAD') return res.redirect(308, `https://${req.headers.host}${req.originalUrl}`)
  res.status(426).json({
    error: 'HTTPS is required',
  })
}
