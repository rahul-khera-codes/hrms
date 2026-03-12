import jwt from 'jsonwebtoken'
import { query } from '../config/db.js'

const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) throw new Error('JWT_SECRET is required')

/**
 * Middleware: require valid JWT and attach req.user { id, email, name, role }
 */
export async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Token required' })
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    const result = await query(
      'SELECT id, email, name, role FROM users WHERE id = $1',
      [decoded.userId]
    )
    const row = result.rows[0]
    if (!row) {
      return res.status(401).json({ error: 'Unauthorized', message: 'User not found' })
    }
    req.user = {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
    }
    next()
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Unauthorized', message: 'Token expired' })
    }
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid token' })
  }
}

/**
 * Optional: require admin role (use after authMiddleware)
 */
export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden', message: 'Admin only' })
  }
  next()
}
