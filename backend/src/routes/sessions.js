import express from 'express'
import { query } from '../config/db.js'
import { authMiddleware } from '../middleware/auth.js'
import { createNotification } from './notifications.js'

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
  let nightSeconds = 0
  const endMs = end.getTime()
  let t = start.getTime()
  const oneSecMs = 1000
  while (t < endMs) {
    const d = new Date(t)
    const hour = d.getHours()
    if (hour >= nightStartHour || hour < nightEndHour) nightSeconds += 1
    t += oneSecMs
  }
  return nightSeconds / 60
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
    const totalMinutes = (clockOut - clockIn) / 60000
    const nightMinutes = getNightMinutesBetween(clockIn, clockOut, nightStart, nightEnd)
    const dayMinutes = totalMinutes - nightMinutes
    const regularMinutes = Math.round(Math.min(Math.max(0, dayMinutes), REGULAR_MINUTES_PER_DAY))
    const overtimeMinutes = Math.round(Math.max(0, dayMinutes - REGULAR_MINUTES_PER_DAY))
    const roundedNightMinutes = Math.round(nightMinutes)
    await query(
      `UPDATE sessions SET clock_out = $1, regular_minutes = $2, overtime_minutes = $3, night_minutes = $4
       WHERE id = $5`,
      [clockOut.toISOString(), regularMinutes, overtimeMinutes, roundedNightMinutes, active.rows[0].id]
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
    const { start: nightStart, end: nightEnd } = await getNightWindow()
    const result = await query(
      `SELECT clock_in, clock_out
       FROM sessions
       WHERE user_id = $1 AND clock_out IS NOT NULL
         AND clock_in >= $2::date AND clock_in < ($3::date + interval '1 day')`,
      [userId, fromDate, toDate]
    )
    let regularMinutes = 0
    let overtimeMinutes = 0
    let nightMinutes = 0
    for (const row of result.rows) {
      const clockIn = new Date(row.clock_in)
      const clockOut = new Date(row.clock_out)
      const totalMinutes = (clockOut - clockIn) / 60000
      const rowNightMinutes = getNightMinutesBetween(clockIn, clockOut, nightStart, nightEnd)
      const rowDayMinutes = totalMinutes - rowNightMinutes
      regularMinutes += Math.min(Math.max(0, rowDayMinutes), REGULAR_MINUTES_PER_DAY)
      overtimeMinutes += Math.max(0, rowDayMinutes - REGULAR_MINUTES_PER_DAY)
      nightMinutes += rowNightMinutes
    }
    const totalMinutes = regularMinutes + overtimeMinutes + nightMinutes
    const regularHours = regularMinutes / 60
    const overtimeHours = overtimeMinutes / 60
    const nightHours = nightMinutes / 60
    const totalHours = regularHours + overtimeHours + nightHours
    const period = `${fromDate} – ${toDate}`
    res.json({
      period,
      regularMinutes,
      overtimeMinutes,
      nightMinutes,
      totalMinutes,
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

// GET /api/sessions/my-schedule?from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns the logged-in employee's shift assignments (for My Schedule page).
router.get('/my-schedule', async (req, res) => {
  try {
    const userId = req.user.id
    const { from, to } = req.query
    const fromDate = from || new Date().toISOString().slice(0, 10)
    const toDate = to || fromDate
    const result = await query(
      `SELECT a.id, a.date::text AS date_str,
              c.name AS client_name, s.name AS shift_name,
              COALESCE(a.override_start_time, s.start_time) AS start_time,
              COALESCE(a.override_end_time, s.end_time) AS end_time
       FROM schedule_assignments a
       JOIN clients c ON c.id = a.client_id
       JOIN shifts s ON s.id = a.shift_id
       WHERE a.user_id = $1 AND a.date >= $2::date AND a.date <= $3::date
       ORDER BY a.date, s.start_time`,
      [userId, fromDate, toDate]
    )
    res.json(result.rows.map((r) => ({
      id: r.id,
      date: r.date_str ? r.date_str.slice(0, 10) : null,
      clientName: r.client_name,
      shiftName: r.shift_name,
      startTime: r.start_time,
      endTime: r.end_time,
    })))
  } catch (err) {
    console.error('My schedule error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/sessions/leave-requests
router.get('/leave-requests', async (req, res) => {
  try {
    const result = await query(
      `SELECT lr.id, lr.leave_type, lr.start_date::text AS start_date_str, lr.end_date::text AS end_date_str,
              lr.reason, lr.status, lr.reviewed_note, lr.reviewed_at,
              reviewer.name AS reviewed_by_name,
              lr.created_at
       FROM leave_requests lr
       LEFT JOIN users reviewer ON reviewer.id = lr.reviewed_by
       WHERE lr.user_id = $1
       ORDER BY lr.created_at DESC`,
      [req.user.id]
    )
    res.json(result.rows.map((r) => ({
      id: r.id,
      leaveType: r.leave_type,
      startDate: r.start_date_str?.slice(0, 10) ?? null,
      endDate: r.end_date_str?.slice(0, 10) ?? null,
      reason: r.reason || '',
      status: r.status,
      reviewedNote: r.reviewed_note || '',
      reviewedAt: r.reviewed_at,
      reviewedByName: r.reviewed_by_name || '',
      createdAt: r.created_at,
    })))
  } catch (err) {
    console.error('List leave requests error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/sessions/leave-requests
router.post('/leave-requests', async (req, res) => {
  try {
    const { leaveType = 'unpaid', startDate, endDate, reason } = req.body
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Bad request', message: 'startDate and endDate are required' })
    }
    const type = leaveType === 'paid' ? 'paid' : 'unpaid'

    const start = new Date(`${startDate}T00:00:00Z`)
    const end = new Date(`${endDate}T00:00:00Z`)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return res.status(400).json({ error: 'Bad request', message: 'End date must be at least one day after start date' })
    }

    const overlap = await query(
      `SELECT id
       FROM leave_requests
       WHERE user_id = $1
         AND status = 'approved'
         AND NOT (end_date < $2::date OR start_date > $3::date)
       LIMIT 1`,
      [req.user.id, startDate, endDate]
    )
    if (overlap.rows.length > 0) {
      return res.status(409).json({ error: 'Conflict', message: 'You have an approved leave during this period' })
    }

    const result = await query(
      `INSERT INTO leave_requests (user_id, leave_type, start_date, end_date, reason, status)
       VALUES ($1, $2, $3::date, $4::date, $5, 'pending')
       RETURNING id, leave_type, start_date::text AS start_date_str, end_date::text AS end_date_str, reason, status, created_at`,
      [req.user.id, type, startDate, endDate, reason ? String(reason).trim() : null]
    )
    const r = result.rows[0]

    const admins = await query(
      `SELECT id
       FROM users
       WHERE role = 'admin'`
    )
    await Promise.all(
      admins.rows.map((admin) =>
        createNotification(
          admin.id,
          'leave_request_submitted',
          'New Leave Request',
          `${req.user.name} requested ${type} leave from ${startDate} to ${endDate}`,
          {
            leaveRequestId: r.id,
            employeeId: req.user.id,
            employeeName: req.user.name,
            leaveType: type,
            startDate,
            endDate,
          }
        )
      )
    )

    res.status(201).json({
      id: r.id,
      leaveType: r.leave_type,
      startDate: r.start_date_str?.slice(0, 10) ?? null,
      endDate: r.end_date_str?.slice(0, 10) ?? null,
      reason: r.reason || '',
      status: r.status,
      createdAt: r.created_at,
    })
  } catch (err) {
    console.error('Create leave request error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
