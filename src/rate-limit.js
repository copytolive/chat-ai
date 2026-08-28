export function createRateLimit({ windowMs = 60_000, max = 60, key = (req) => req.ip || req.socket?.remoteAddress || 'unknown' } = {}) {
  const buckets = new Map()
  return function rateLimit(req, res, next) {
    const now = Date.now()
    const id = String(key(req))
    const current = buckets.get(id)
    if (!current || current.resetAt <= now) {
      buckets.set(id, { count: 1, resetAt: now + windowMs })
      return next()
    }
    current.count += 1
    if (current.count > max) {
      res.set('retry-after', String(Math.max(1, Math.ceil((current.resetAt - now) / 1000))))
      return res.status(429).json({ ok: false, error: 'RATE_LIMITED' })
    }
    return next()
  }
}
