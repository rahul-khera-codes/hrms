import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { query } from '../config/db.js'
import { authMiddleware } from '../middleware/auth.js'

const router = express.Router()
const JWT_SECRET = process.env.JWT_SECRET
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'

function toUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
  }
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD_LENGTH = 6
const MAX_EMAIL_LENGTH = 255
const MAX_NAME_LENGTH = 255

function isValidEmail(value) {
  if (!value || typeof value !== 'string') return false
  const trimmed = value.trim()
  return trimmed.length <= MAX_EMAIL_LENGTH && EMAIL_REGEX.test(trimmed)
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, role } = req.body
    if (!email || !password || !name || !role) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Email, password, name, and role are required',
      })
    }
    if (!['employee', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Validation failed', message: 'Role must be employee or admin' })
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Validation failed', message: 'Please enter a valid email address' })
    }
    const passwordStr = typeof password === 'string' ? password : String(password ?? '')
    if (passwordStr.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        error: 'Validation failed',
        message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      })
    }
    const nameTrimmed = String(name).trim()
    if (!nameTrimmed) {
      return res.status(400).json({ error: 'Validation failed', message: 'Name is required' })
    }
    if (nameTrimmed.length > MAX_NAME_LENGTH) {
      return res.status(400).json({ error: 'Validation failed', message: `Name must be at most ${MAX_NAME_LENGTH} characters` })
    }

    const existing = await query('SELECT id FROM users WHERE email = $1', [email.trim().toLowerCase()])
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Conflict', message: 'Email already registered' })
    }

    const password_hash = await bcrypt.hash(passwordStr, 10)
    const result = await query(
      `INSERT INTO users (email, name, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, name, role`,
      [email.trim().toLowerCase(), nameTrimmed, password_hash, role]
    )
    const user = toUser(result.rows[0])

    // Ensure employee database row exists for employees (keeps existing logic intact).
    if (user.role === 'employee') {
      await query(
        `INSERT INTO employees (user_id, salary_type, base_salary)
         VALUES ($1, 'hourly', 0)
         ON CONFLICT (user_id) DO NOTHING`,
        [user.id]
      )
    }
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
    res.status(201).json({ user, token })
  } catch (err) {
    console.error('Register error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Email and password are required',
      })
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Validation failed', message: 'Please enter a valid email address' })
    }
    if (typeof password !== 'string' || password.length < 1) {
      return res.status(400).json({ error: 'Validation failed', message: 'Password is required' })
    }
    const passwordStr = typeof password === 'string' ? password : String(password ?? '')
    if (passwordStr.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: 'Validation failed', message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` })
    }

    const result = await query(
      'SELECT id, email, name, role, password_hash, COALESCE(access_enabled, TRUE) AS access_enabled FROM users WHERE email = $1',
      [email.trim().toLowerCase()]
    )
    const row = result.rows[0]
    if (!row) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid email or password' })
    }

    const valid = await bcrypt.compare(passwordStr, row.password_hash)
    if (!valid) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid email or password' })
    }

    // 21MAY2026 client video: per-user access on/off toggle. Disabled users can
    // still exist (so HR can re-enable later) but cannot authenticate.
    if (row.access_enabled === false) {
      return res.status(403).json({ error: 'Forbidden', message: 'Access has been disabled for this account. Contact your administrator.' })
    }

    const user = toUser(row)
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
    res.json({ user, token })
  } catch (err) {
    console.error('Login error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/auth/me (protected)
router.get('/me', authMiddleware, (req, res) => {
  res.json({ user: req.user })
})

export default router
