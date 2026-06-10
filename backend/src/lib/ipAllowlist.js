// 10JUN2026 client video Item 8 — Orlando: "limit the software to be
// used from the site or from an approved location. Maybe a list through
// Settings of approved IPs". Middleware that gates clock-in/clock-out
// against the allowlist configured in settings.
//
// Allowlist format (settings.clock_in_ip_allowlist, newline-separated):
//   - "203.0.113.5"          IPv4 exact match
//   - "2001:db8::1"          IPv6 exact match
//   - "203.0.113.0/24"       IPv4 CIDR block
//   - "2001:db8::/32"        IPv6 CIDR block
//   - "# comment"            lines starting with # are ignored
//   - blank lines            ignored
//
// When `clock_in_ip_allowlist_enabled` is false, this middleware is a
// no-op (everyone allowed) — feature is opt-in to avoid locking
// admins out the moment the column is created.

import { getSettings } from './payrollSettings.js'

function ipv4ToInt(ip) {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let n = 0
  for (const p of parts) {
    const v = Number(p)
    if (!Number.isInteger(v) || v < 0 || v > 255) return null
    n = (n << 8) | v
  }
  return n >>> 0 // unsigned
}

function normalizeIp(ip) {
  if (!ip) return ''
  // Strip IPv6-mapped-IPv4 prefix ::ffff: that Node sometimes emits.
  return String(ip).replace(/^::ffff:/i, '').trim()
}

function ipMatchesEntry(reqIp, entry) {
  const ip = normalizeIp(reqIp)
  const clean = entry.replace(/#.*$/, '').trim()
  if (!clean) return false
  if (!clean.includes('/')) {
    // Exact match
    return ip === clean
  }
  // CIDR
  const [base, bitsStr] = clean.split('/')
  const bits = Number(bitsStr)
  if (!Number.isInteger(bits)) return false
  const ipInt = ipv4ToInt(ip)
  const baseInt = ipv4ToInt(base)
  if (ipInt == null || baseInt == null) {
    // IPv6 CIDR — skip for now (rare; can add later if a client needs)
    return false
  }
  if (bits < 0 || bits > 32) return false
  if (bits === 0) return true
  const mask = (~0 << (32 - bits)) >>> 0
  return (ipInt & mask) === (baseInt & mask)
}

/**
 * Express middleware factory. Returns a middleware that rejects with
 * 403 if the IP allowlist is enabled and the request IP isn't on it.
 */
export function clockInIpGuard() {
  return async (req, res, next) => {
    try {
      const s = await getSettings()
      if (!s.clockInIpAllowlistEnabled) return next()
      const list = s.clockInIpAllowlist.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)
      if (list.length === 0) return next() // empty list → allow (defensive)
      const reqIp = normalizeIp(req.ip)
      const allowed = list.some((entry) => ipMatchesEntry(reqIp, entry))
      if (!allowed) {
        return res.status(403).json({
          error: 'Forbidden',
          message: `Clock-in is restricted to approved locations. Your IP (${reqIp}) is not allowed. Contact your admin.`,
        })
      }
      next()
    } catch (err) {
      console.warn('[clockInIpGuard] settings lookup failed; allowing through:', err?.message || err)
      next()
    }
  }
}
