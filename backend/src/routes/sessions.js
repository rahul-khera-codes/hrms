import express from 'express'
import { query } from '../config/db.js'
import { authMiddleware } from '../middleware/auth.js'

const router = express.Router()
const REGULAR_MINUTES_PER_DAY = 8 * 60 // 480

async function getNightWindow() {
  try {
    const result = await query('SELECT night_shift_start_hour, night_shift_end_hour FROM settings WHERE id = 1')
    const row = result.rows[0]
    if (row && row.night_shift_start_hour != null && row.night_shift_end_hour != null) {
      return { start: Number(row.night_shift_start_hour), end: Number(row.night_shift_end_hour) }
    }
  } catch (_) { /* ignore */ }
  return { start: 21, end: 7 }
}

/**
 * Minutes between start and end that fall in night window: configurable (default 9:00 PM - 7:00 AM).
 */
function getNightMinutesBetween(start, end, nightStartHour, nightEndHour) {
  let nightMinutes = 0
  const endMs = end.getTime()
  let t = start.getTime()
  const oneMinMs = 60 * 1000
  while (t < endMs) {
    const d = new Date(t)
    const hour = d.getHours()
    if (hour >= nightStartHour || hour < nightEndHour) nightMinutes += 1
    t += oneMinMs
  }
  return nightMinutes
}

function toSession(row) {
  return {
    id: row.id,
    clockIn: row.clock_in,
    clockOut: row.clock_out,
    status: row.clock_out == null ? 'active' : 'completed',
    regularMinutes: row.regular_minutes ?? 0,
    overtimeMinutes: row.overtime_minutes ?? 0,
    nightMinutes: row.night_minutes ?? 0,
  }
}

// All session routes require auth
router.use(authMiddleware)

// POST /api/sessions/clock-in
router.post('/clock-in', async (req, res) => {
  try {
    const userId = req.user.id
    const existing = await query(
      'SELECT id FROM sessions WHERE user_id = $1 AND clock_out IS NULL',
      [userId]
    )
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Conflict', message: 'Already clocked in' })
    }
    const result = await query(
      'INSERT INTO sessions (user_id) VALUES ($1) RETURNING id, clock_in, clock_out, regular_minutes, overtime_minutes, night_minutes',
      [userId]
    )
    const session = toSession(result.rows[0])
    res.status(201).json(session)
  } catch (err) {
    console.error('Clock-in error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/sessions/clock-out
router.post('/clock-out', async (req, res) => {
  try {
    const userId = req.user.id
    const active = await query(
      'SELECT id, clock_in FROM sessions WHERE user_id = $1 AND clock_out IS NULL',
      [userId]
    )
    if (active.rows.length === 0) {
      return res.status(409).json({ error: 'Conflict', message: 'No active clock-in' })
    }
    const clockIn = new Date(active.rows[0].clock_in)
    const clockOut = new Date()
    const { start: nightStart, end: nightEnd } = await getNightWindow()
    const totalMinutes = Math.round((clockOut - clockIn) / 60000)
    const nightMinutes = getNightMinutesBetween(clockIn, clockOut, nightStart, nightEnd)
    const dayMinutes = totalMinutes - nightMinutes
    const regularMinutes = Math.min(Math.max(0, dayMinutes), REGULAR_MINUTES_PER_DAY)
    const overtimeMinutes = Math.max(0, dayMinutes - REGULAR_MINUTES_PER_DAY)
    await query(
      `UPDATE sessions SET clock_out = $1, regular_minutes = $2, overtime_minutes = $3, night_minutes = $4
       WHERE id = $5`,
      [clockOut.toISOString(), regularMinutes, overtimeMinutes, nightMinutes, active.rows[0].id]
    )
    const result = await query(
      'SELECT id, clock_in, clock_out, regular_minutes, overtime_minutes, night_minutes FROM sessions WHERE id = $1',
      [active.rows[0].id]
    )
    const session = toSession(result.rows[0])
    res.json(session)
  } catch (err) {
    console.error('Clock-out error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/sessions/active
router.get('/active', async (req, res) => {
  try {
    const result = await query(
      'SELECT id, clock_in, clock_out, regular_minutes, overtime_minutes, night_minutes FROM sessions WHERE user_id = $1 AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1',
      [req.user.id]
    )
    if (result.rows.length === 0) {
      return res.json(null)
    }
    res.json(toSession(result.rows[0]))
  } catch (err) {
    console.error('Get active session error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/sessions?from=YYYY-MM-DD&to=YYYY-MM-DD&limit=50
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id
    const { from, to, limit = 50 } = req.query
    let sql = 'SELECT id, clock_in, clock_out, regular_minutes, overtime_minutes, night_minutes FROM sessions WHERE user_id = $1'
    const params = [userId]
    if (from) {
      params.push(from)
      sql += ` AND clock_in >= $${params.length}::date`
    }
    if (to) {
      params.push(to)
      sql += ` AND clock_in < ($${params.length}::date + interval '1 day')`
    }
    sql += ' ORDER BY clock_in DESC LIMIT ' + Math.min(parseInt(limit, 10) || 50, 100)
    const result = await query(sql, params)
    res.json(result.rows.map((row) => toSession(row)))
  } catch (err) {
    console.error('List sessions error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/sessions/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/summary', async (req, res) => {
  try {
    const userId = req.user.id
    const { from, to } = req.query
    const now = new Date()
    const toDate = to || now.toISOString().slice(0, 10)
    const fromDate = from || new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const result = await query(
      `SELECT COALESCE(SUM(regular_minutes), 0) AS regular_minutes,
              COALESCE(SUM(overtime_minutes), 0) AS overtime_minutes,
              COALESCE(SUM(night_minutes), 0) AS night_minutes
       FROM sessions
       WHERE user_id = $1 AND clock_out IS NOT NULL
         AND clock_in >= $2::date AND clock_in < ($3::date + interval '1 day')`,
      [userId, fromDate, toDate]
    )
    const row = result.rows[0]
    const regularHours = (row.regular_minutes || 0) / 60
    const overtimeHours = (row.overtime_minutes || 0) / 60
    const nightHours = (row.night_minutes || 0) / 60
    const totalHours = regularHours + overtimeHours + nightHours
    const period = `${fromDate} – ${toDate}`
    res.json({
      period,
      regularHours: Math.round(regularHours * 10) / 10,
      overtimeHours: Math.round(overtimeHours * 10) / 10,
      nightHours: Math.round(nightHours * 10) / 10,
      totalHours: Math.round(totalHours * 10) / 10,
    })
  } catch (err) {
    console.error('Summary error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
