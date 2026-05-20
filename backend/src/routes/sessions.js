import express from 'express'
import { query } from '../config/db.js'
import { authMiddleware } from '../middleware/auth.js'
import { createNotification } from './notifications.js'
import { getSettings } from '../lib/payrollSettings.js'
import { buildPayrollEmployeeRow } from '../lib/payrollEmployeeRow.js'
import { renderPayrollSlipPdf } from '../lib/renderPayrollSlipPdf.js'
import { buildPaystubHTML } from './payroll-calculator.js'

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
 * Midnight rule (DR labor law): if the shift extends to or past midnight (i.e., clock-out is on a
 * different calendar day than clock-in), the ENTIRE shift is paid at the night differential rate.
 * If night hours fall only between 9PM and 11:59PM (same day), only those hours get the differential.
 */
function getNightMinutesBetween(start, end, nightStartHour, nightEndHour) {
  const totalMinutes = (end.getTime() - start.getTime()) / 60000

  // Check if shift crosses midnight: clock-out date differs from clock-in date
  const startDay = start.getFullYear() * 10000 + start.getMonth() * 100 + start.getDate()
  const endDay = end.getFullYear() * 10000 + end.getMonth() * 100 + end.getDate()
  const shiftCrossesMidnight = endDay > startDay

  // Count actual night seconds within the night window
  let nightSeconds = 0
  const endMs = end.getTime()
  let t = start.getTime()
  const oneSecMs = 1000
  while (t < endMs) {
    const d = new Date(t)
    const hour = d.getHours()
    if (hour >= nightStartHour || hour < nightEndHour) {
      nightSeconds += 1
    }
    t += oneSecMs
  }

  // If shift crosses midnight AND has any night hours, entire shift gets night differential
  if (shiftCrossesMidnight && nightSeconds > 0) {
    return totalMinutes
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

// Mirrors admin toAttendanceRecord but lives in sessions.js for the employee my-attendance endpoint
function toMyAttendanceRecord(row) {
  const clockIn = row.first_clock_in || row.clock_in
  const clockOut = row.last_clock_out || row.clock_out
  const hasActive = row.has_active_session
  const regularMinutes = Number(row.regular_minutes ?? 0)
  const overtimeMinutes = Number(row.overtime_minutes ?? 0)
  const nightMinutes = Number(row.night_minutes ?? 0)
  const preciseTotalMinutes = Number(row.precise_total_minutes || 0)
  let regularHours = regularMinutes / 60
  let overtimeHours = overtimeMinutes / 60
  const nightHours = nightMinutes / 60

  if (!hasActive && overtimeMinutes === 0 && nightMinutes === 0 && Number.isFinite(preciseTotalMinutes) && preciseTotalMinutes > 0) {
    regularHours = preciseTotalMinutes / 60
  }
  const allBucketsZero = regularMinutes === 0 && overtimeMinutes === 0 && nightMinutes === 0
  if (!hasActive && allBucketsZero && clockIn && clockOut) {
    const startMs = new Date(clockIn).getTime()
    const endMs = new Date(clockOut).getTime()
    if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs > startMs) {
      regularHours = (endMs - startMs) / 3600000
    }
  }

  const date = row.date ?? (clockIn ? new Date(clockIn).toISOString().slice(0, 10) : '')
  const shiftStart = row.dynamic_shift_start || row.shift_start || null
  const shiftEnd = row.dynamic_shift_end || row.shift_end || null

  // Same canonical title-case strings as the admin endpoint (per 19MAY2026 client video).
  let autoStatus = hasActive ? 'active' : 'Present'
  if (!hasActive && clockIn && shiftStart) {
    const clockInMs = new Date(clockIn).getTime()
    const shiftStartMs = new Date(shiftStart).getTime()
    const shiftEndMs = shiftEnd ? new Date(shiftEnd).getTime() : null
    const clockOutMs = clockOut ? new Date(clockOut).getTime() : null
    const lateThreshold = 5 * 60 * 1000
    const isLate = clockInMs - shiftStartMs > lateThreshold
    const isEarlyOut = clockOutMs && shiftEndMs && (shiftEndMs - clockOutMs > lateThreshold)
    if (isLate && isEarlyOut) autoStatus = 'Late & Left Early'
    else if (isLate) autoStatus = 'Late'
    else if (isEarlyOut) autoStatus = 'Left Early'
  }
  if (!clockIn && !hasActive) autoStatus = 'Absent'
  const LEGACY_MAP = {
    late_in_early_out: 'Late & Left Early',
    late_in: 'Late',
    early_out: 'Left Early',
    present: 'Present',
    absent: 'Absent',
    time_off: 'Time Off',
    system_issues: 'System Issues',
  }
  const rawOverride = row.status_override
  const normalizedOverride = rawOverride && LEGACY_MAP[rawOverride] ? LEGACY_MAP[rawOverride] : rawOverride
  const status = normalizedOverride || autoStatus

  let scheduledHours = 0
  if (shiftStart && shiftEnd) {
    scheduledHours = (new Date(shiftEnd).getTime() - new Date(shiftStart).getTime()) / 3600000
    if (scheduledHours < 0) scheduledHours += 24
  } else if (Number(row.scheduled_minutes ?? 0) > 0) {
    scheduledHours = Number(row.scheduled_minutes) / 60
  }

  let sdbtHours = 0
  if (scheduledHours >= 12) sdbtHours = 1.5
  else if (scheduledHours >= 8) sdbtHours = 1
  else if (scheduledHours >= 4) sdbtHours = 0.5

  let actualHours = 0
  if (clockIn && clockOut) {
    actualHours = (new Date(clockOut).getTime() - new Date(clockIn).getTime()) / 3600000
  } else if (Number(row.actual_minutes ?? 0) > 0) {
    actualHours = Number(row.actual_minutes) / 60
  }

  let adbtHours = 0
  if (actualHours >= 12) adbtHours = 1.5
  else if (actualHours >= 8) adbtHours = 1
  else if (actualHours >= 4) adbtHours = 0.5

  const payType = row.pay_type || 'Regular'
  let regHours = 0
  if (payType === 'Holiday') regHours = Math.max(0, scheduledHours - sdbtHours)
  else if (payType === 'Regular') regHours = Math.max(0, actualHours - adbtHours)

  let n15Hours = 0
  if (payType !== 'DNP' && clockIn && clockOut) {
    const ciDate = new Date(clockIn)
    const coDate = new Date(clockOut)
    const clockInTime = (ciDate.getUTCHours() * 3600 + ciDate.getUTCMinutes() * 60 + ciDate.getUTCSeconds()) / 86400
    const clockOutTime = (coDate.getUTCHours() * 3600 + coDate.getUTCMinutes() * 60 + coDate.getUTCSeconds()) / 86400
    const NINE_PM = 21 / 24
    const SEVEN_AM = 7 / 24
    let nightRawHours = 0
    if (clockOutTime >= NINE_PM && clockOutTime < 1) nightRawHours = (clockOutTime - NINE_PM) * 24
    else if (clockInTime >= NINE_PM && clockInTime < 1) nightRawHours = (coDate.getTime() - ciDate.getTime()) / 3600000
    else if (clockOutTime >= 0 && clockOutTime <= SEVEN_AM) nightRawHours = (coDate.getTime() - ciDate.getTime()) / 3600000
    else if (clockInTime >= 0 && clockInTime <= SEVEN_AM) nightRawHours = (SEVEN_AM - clockInTime) * 24
    n15Hours = nightRawHours >= 3 ? Math.max(0, actualHours - adbtHours) : Math.max(0, nightRawHours)
  }

  let x35Hours = payType === 'X35%' ? Math.max(0, actualHours - adbtHours) : 0
  let x100Hours = payType === 'X100%' ? Math.max(0, actualHours - adbtHours) : 0
  let hdyHours = payType === 'Holiday' ? Math.max(0, actualHours - adbtHours) : 0
  let payableRvwHours = 0
  if (payType === 'Review') {
    payableRvwHours = Math.max(0, actualHours - adbtHours)
    regHours = 0; n15Hours = 0; x35Hours = 0; x100Hours = 0; hdyHours = 0
  }

  const r2 = (v) => Math.round(v * 100) / 100

  return {
    id: row.id,
    sessionId: row.session_id || row.id,
    employeeId: row.user_id,
    employeeName: row.user_name ?? '',
    date,
    shiftStart: shiftStart || null,
    shiftEnd: shiftEnd || null,
    clockIn: clockIn || null,
    clockOut: clockOut || null,
    location: row.location || null,
    stage: row.stage || null,
    reportsTo: row.reports_to_name || null,
    task: row.task || null,
    status,
    payType,
    scheduledHours: r2(scheduledHours),
    sdbtHours: r2(sdbtHours),
    actualHours: r2(actualHours),
    adbtHours: r2(adbtHours),
    regHours: r2(regHours),
    n15Hours: r2(n15Hours),
    x35Hours: r2(x35Hours),
    x100Hours: r2(x100Hours),
    hdyHours: r2(hdyHours),
    payableRvwHours: r2(payableRvwHours),
    comments: row.comments || '',
    accountName: row.account_name || null,
    employeeCmid: row.employee_cmid != null ? Number(row.employee_cmid) : null,
    regularHours,
    overtimeHours,
    nightHours,
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
    // Night hours are classified as regular/OT based on total shift duration.
    // Night differential (+15%) is an ADDITIONAL premium on top of regular/OT pay.
    const regularMinutes = Math.round(Math.min(Math.max(0, totalMinutes), REGULAR_MINUTES_PER_DAY))
    const overtimeMinutes = Math.round(Math.max(0, totalMinutes - REGULAR_MINUTES_PER_DAY))
    const roundedNightMinutes = Math.round(nightMinutes)
    await query(
      `UPDATE sessions SET clock_out = $1, regular_minutes = $2, overtime_minutes = $3, night_minutes = $4
       WHERE id = $5`,
      [clockOut.toISOString(), regularMinutes, overtimeMinutes, roundedNightMinutes, active.rows[0].id]
    )
    // Auto-populate shift and holiday data
    try {
      const clockInDate = clockIn.toISOString().slice(0, 10)
      // Get scheduled shift for this employee on this date
      const shiftResult = await query(
        `SELECT COALESCE(a.override_start_time, s.start_time) AS start_time,
                COALESCE(a.override_end_time, s.end_time) AS end_time
         FROM schedule_assignments a
         JOIN shifts s ON s.id = a.shift_id
         WHERE a.user_id = $1 AND a.date = $2::date
         LIMIT 1`,
        [userId, clockInDate]
      )
      if (shiftResult.rows.length > 0) {
        const shift = shiftResult.rows[0]
        const shiftStartTs = `${clockInDate}T${String(shift.start_time).slice(0, 5)}:00`
        const shiftEndTs = `${clockInDate}T${String(shift.end_time).slice(0, 5)}:00`
        await query(
          `UPDATE sessions SET shift_start = $1, shift_end = $2 WHERE id = $3`,
          [shiftStartTs, shiftEndTs, active.rows[0].id]
        )
      }
      // Check if date is a holiday
      const holidayResult = await query(
        `SELECT name FROM holidays WHERE holiday_date = $1::date AND is_paid = TRUE LIMIT 1`,
        [clockInDate]
      )
      if (holidayResult.rows.length > 0) {
        await query(
          `UPDATE sessions SET holiday_name = $1 WHERE id = $2`,
          [holidayResult.rows[0].name, active.rows[0].id]
        )
      }
      // Calculate and store scheduled/actual/dbt minutes
      const actualMins = Math.round(totalMinutes)
      let dbtMins = 0
      if (actualMins >= 480) dbtMins = 60
      else if (actualMins >= 360) dbtMins = 45
      else if (actualMins >= 240) dbtMins = 30
      else if (actualMins >= 120) dbtMins = 15
      const schedMins = shiftResult.rows.length > 0
        ? Math.round((new Date(`${clockInDate}T${String(shiftResult.rows[0].end_time).slice(0, 5)}:00`).getTime() - new Date(`${clockInDate}T${String(shiftResult.rows[0].start_time).slice(0, 5)}:00`).getTime()) / 60000)
        : 0
      await query(
        `UPDATE sessions SET scheduled_minutes = $1, actual_minutes = $2, dbt_minutes = $3 WHERE id = $4`,
        [schedMins > 0 ? schedMins : 0, actualMins, dbtMins, active.rows[0].id]
      )
    } catch (e) {
      console.warn('Auto-populate shift/holiday data failed:', e.message)
    }
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

// GET /api/sessions/my-attendance?from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns admin-style attendance records for the logged-in employee only (read-only).
router.get('/my-attendance', async (req, res) => {
  try {
    const userId = req.user.id
    const { from, to } = req.query
    // ONE ROW PER SESSION (not aggregated per day) — per 18MAY2026 client video,
    // employee My Attendance should mirror admin Attendance.
    let sql = `
      SELECT
        s.id AS session_id,
        u.id AS user_id,
        u.name AS user_name,
        (s.clock_in AT TIME ZONE 'UTC')::date AS date,
        s.clock_in AS first_clock_in,
        s.clock_out AS last_clock_out,
        COALESCE(s.regular_minutes, 0)::int AS regular_minutes,
        COALESCE(s.overtime_minutes, 0)::int AS overtime_minutes,
        COALESCE(s.night_minutes, 0)::int AS night_minutes,
        COALESCE(CASE WHEN s.clock_out IS NOT NULL THEN EXTRACT(EPOCH FROM (s.clock_out - s.clock_in)) / 60.0 ELSE 0 END, 0) AS precise_total_minutes,
        (s.clock_out IS NULL) AS has_active_session,
        s.shift_start, s.shift_end,
        COALESCE(s.location, e.location) AS location,
        COALESCE(s.stage, 'Production') AS stage,
        s.task,
        s.status_override,
        s.pay_type,
        s.bill_type,
        s.comments,
        COALESCE(s.scheduled_minutes, 0)::int AS scheduled_minutes,
        COALESCE(s.actual_minutes, 0)::int AS actual_minutes,
        s.dbt_minutes,
        s.holiday_name,
        COALESCE(s.reg_hours, 0) AS reg_hours,
        COALESCE(s.n15_hours, 0) AS n15_hours,
        COALESCE(s.x35_hours, 0) AS x35_hours,
        COALESCE(s.x100_hours, 0) AS x100_hours,
        COALESCE(s.hol_hours, 0) AS hol_hours,
        COALESCE(s.billable_reg_hours, 0) AS billable_reg_hours,
        COALESCE(s.billable_prm_hours, 0) AS billable_prm_hours,
        COALESCE(s.billable_rvw_hours, 0) AS billable_rvw_hours,
        COALESCE(s.payable_rvw_hours, 0) AS payable_rvw_hours,
        mgr.name AS reports_to_name,
        c.name AS account_name,
        e.cmid AS employee_cmid,
        s.is_locked,
        CASE WHEN sh.start_time IS NOT NULL THEN
          (((s.clock_in AT TIME ZONE 'UTC')::date || 'T' || COALESCE(sa_shift.override_start, sh.start_time)::text)::timestamp AT TIME ZONE 'UTC')
        ELSE NULL END AS dynamic_shift_start,
        CASE WHEN sh.end_time IS NOT NULL THEN
          (((s.clock_in AT TIME ZONE 'UTC')::date || 'T' || COALESCE(sa_shift.override_end, sh.end_time)::text)::timestamp AT TIME ZONE 'UTC')
        ELSE NULL END AS dynamic_shift_end,
        h.name AS dynamic_holiday_name
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      LEFT JOIN employees e ON e.user_id = u.id
      LEFT JOIN users mgr ON mgr.id = e.reports_to
      LEFT JOIN clients c ON c.id = e.primary_client_id
      LEFT JOIN LATERAL (
        SELECT a.shift_id,
               a.override_start_time AS override_start,
               a.override_end_time AS override_end
        FROM schedule_assignments a
        WHERE a.user_id = u.id AND a.date = (s.clock_in AT TIME ZONE 'UTC')::date
        LIMIT 1
      ) sa_shift ON true
      LEFT JOIN shifts sh ON sh.id = sa_shift.shift_id
      LEFT JOIN holidays h ON h.holiday_date = (s.clock_in AT TIME ZONE 'UTC')::date AND h.is_paid = TRUE
      WHERE s.user_id = $1
    `
    const params = [userId]
    if (from) {
      params.push(from)
      sql += ` AND (s.clock_in AT TIME ZONE 'UTC')::date >= $${params.length}::date`
    }
    if (to) {
      params.push(to)
      sql += ` AND (s.clock_in AT TIME ZONE 'UTC')::date <= $${params.length}::date`
    }
    sql += `
      ORDER BY date DESC, s.clock_in DESC
      LIMIT 5000
    `
    const result = await query(sql, params)

    const records = result.rows.map((row) => {
      const dateStr = row.date ? new Date(row.date).toISOString().slice(0, 10) : ''
      return toMyAttendanceRecord({ ...row, id: row.session_id || `${row.user_id}-${dateStr}`, date: dateStr })
    })

    res.json(records)
  } catch (err) {
    console.error('my-attendance error:', err)
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
      // Night hours are part of regular/OT — differential is just the extra +15%
      regularMinutes += Math.min(Math.max(0, totalMinutes), REGULAR_MINUTES_PER_DAY)
      overtimeMinutes += Math.max(0, totalMinutes - REGULAR_MINUTES_PER_DAY)
      nightMinutes += rowNightMinutes
    }
    const totalMinutes = regularMinutes + overtimeMinutes
    const regularHours = regularMinutes / 60
    const overtimeHours = overtimeMinutes / 60
    const nightHours = nightMinutes / 60
    // totalHours = regular + OT (night hours are already included in these, not additive)
    const totalHours = regularHours + overtimeHours
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
// Returns the logged-in employee's PUBLISHED shift assignments.
// Per 19MAY2026 Scheduler Module Part 1 video: drafts (unpublished) stay invisible
// to employees until the admin presses Publish.
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
         AND a.published = TRUE
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
              lr.created_at,
              lr.leave_calculation_type, lr.leave_payable_days, lr.leave_payable_amount,
              lr.leave_category, lr.leave_associate_days_off,
              lr.return_date::text AS return_date_str,
              lr.start_time::text, lr.end_time::text, lr.return_time::text,
              lr.asset_deactivation
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
      leaveCalculationType: r.leave_calculation_type || null,
      leavePayableDays: r.leave_payable_days != null ? Number(r.leave_payable_days) : null,
      leavePayableAmount: r.leave_payable_amount != null ? Number(r.leave_payable_amount) : null,
      leaveCategory: r.leave_category || null,
      associateDaysOff: r.leave_associate_days_off || null,
      returnDate: r.return_date_str?.slice(0, 10) ?? null,
      startTime: r.start_time || null,
      endTime: r.end_time || null,
      returnTime: r.return_time || null,
      assetDeactivation: r.asset_deactivation || null,
    })))
  } catch (err) {
    console.error('List leave requests error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/sessions/leave-requests
router.post('/leave-requests', async (req, res) => {
  try {
    const {
      leaveType = 'unpaid', startDate, endDate, reason,
      leaveCategory, calculationType, associateDaysOff,
      returnDate, startTime, endTime, returnTime,
    } = req.body
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Bad request', message: 'startDate and endDate are required' })
    }
    const type = leaveType === 'paid' ? 'paid' : 'unpaid'

    const start = new Date(`${startDate}T00:00:00Z`)
    const end = new Date(`${endDate}T00:00:00Z`)
    // Allow same-day leave (single-day requests). Employees submit just the
    // start date per 18MAY2026 client video; admin sets the real end date on review.
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      return res.status(400).json({ error: 'Bad request', message: 'End date cannot be before start date' })
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

    const assocStr = Array.isArray(associateDaysOff)
      ? associateDaysOff.map((d) => String(d).trim()).filter(Boolean).join(', ') || null
      : null
    const calcType = calculationType && ['non_payable', 'hourly_salary', 'monthly_salary'].includes(calculationType)
      ? calculationType
      : null

    const result = await query(
      `INSERT INTO leave_requests (user_id, leave_type, start_date, end_date, reason, status,
         leave_category, leave_calculation_type, leave_associate_days_off,
         return_date, start_time, end_time, return_time)
       VALUES ($1, $2, $3::date, $4::date, $5, 'pending',
         $6, $7, $8,
         $9::date, $10::time, $11::time, $12::time)
       RETURNING id, leave_type, start_date::text AS start_date_str, end_date::text AS end_date_str,
         reason, status, created_at, leave_category, leave_calculation_type, leave_associate_days_off,
         return_date::text AS return_date_str, start_time::text, end_time::text, return_time::text`,
      [
        req.user.id, type, startDate, endDate, reason ? String(reason).trim() : null,
        leaveCategory || null, calcType, assocStr,
        returnDate || null, startTime || null, endTime || null, returnTime || null,
      ]
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
      leaveCategory: r.leave_category || null,
      calculationType: r.leave_calculation_type || null,
      associateDaysOff: r.leave_associate_days_off || null,
      returnDate: r.return_date_str?.slice(0, 10) ?? null,
      startTime: r.start_time || null,
      endTime: r.end_time || null,
      returnTime: r.return_time || null,
    })
  } catch (err) {
    console.error('Create leave request error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/sessions/payroll-slips — list saved payslip PDFs for logged-in employee
router.get('/payroll-slips', async (req, res) => {
  try {
    const userId = req.user.id
    const roleCheck = await query(`SELECT role FROM users WHERE id = $1`, [userId])
    if (!roleCheck.rows.length || roleCheck.rows[0].role !== 'employee') {
      return res.json([])
    }
    const result = await query(
      `SELECT id, period_from::text AS period_from, period_to::text AS period_to, created_at
       FROM employee_payslip_snapshots
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [userId]
    )
    const rows = result.rows.map((r) => ({
      id: r.id,
      periodFrom: r.period_from?.slice(0, 10) ?? '',
      periodTo: r.period_to?.slice(0, 10) ?? '',
      savedAt: r.created_at,
    }))
    res.json(rows)
  } catch (err) {
    console.error('List payroll slips error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/sessions/payroll-slips/:id — download a saved PDF (same employee only)
router.get('/payroll-slips/:id', async (req, res) => {
  try {
    const userId = req.user.id
    const { id } = req.params
    const result = await query(
      `SELECT pdf_data, period_from::text AS period_from, period_to::text AS period_to
       FROM employee_payslip_snapshots
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    )
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Not found', message: 'Payslip not found' })
    }
    const row = result.rows[0]
    const fromStr = row.period_from?.slice(0, 10) ?? 'from'
    const toStr = row.period_to?.slice(0, 10) ?? 'to'
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="payroll-slip-${fromStr}-to-${toStr}.pdf"`)
    res.send(row.pdf_data)
  } catch (err) {
    console.error('Download saved payroll slip error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/sessions/payroll-slip.pdf?from=YYYY-MM-DD&to=YYYY-MM-DD — logged-in employee only
router.get('/payroll-slip.pdf', async (req, res) => {
  try {
    const { from, to } = req.query
    if (!from || !to) {
      return res.status(400).json({ error: 'Bad request', message: 'from and to are required' })
    }
    const fromDate = String(from)
    const toDate = String(to)
    const userId = req.user.id
    const empResult = await query(
      `SELECT u.id, u.name,
              COALESCE(e.salary_type, u.salary_type) AS salary_type,
              COALESCE(e.base_salary, u.base_salary) AS base_salary
       FROM users u
       LEFT JOIN employees e ON e.user_id = u.id
       WHERE u.id = $1 AND u.role = 'employee'`,
      [userId]
    )
    if (!empResult.rows.length) {
      return res.status(403).json({ error: 'Forbidden', message: 'Pay slip is only available for employees' })
    }
    const emp = empResult.rows[0]
    const settings = await getSettings()
    const holidayRows = await query(
      `SELECT holiday_date::text AS holiday_date_str
       FROM holidays
       WHERE is_paid = TRUE
         AND holiday_date >= $1::date
         AND holiday_date <= $2::date`,
      [fromDate, toDate]
    )
    const holidayDates = new Set(holidayRows.rows.map((r) => r.holiday_date_str?.slice(0, 10)).filter(Boolean))
    const lineItemsRows = await query(
      `SELECT id, user_id, type, label, amount FROM payroll_line_items
       WHERE period_from = $1::date AND period_to = $2::date AND user_id = $3`,
      [fromDate, toDate, userId]
    )
    const lineItemsByUser = { [userId]: [] }
    for (const r of lineItemsRows.rows) {
      lineItemsByUser[userId].push({
        id: r.id,
        type: r.type,
        label: r.label || '',
        amount: Number(r.amount),
      })
    }
    const govRows = await query(
      `SELECT user_id, social_security, tax, infotep FROM payroll_government_deductions
       WHERE period_from = $1::date AND period_to = $2::date AND user_id = $3`,
      [fromDate, toDate, userId]
    )
    const govDeductionsByUser = {}
    for (const r of govRows.rows) {
      govDeductionsByUser[r.user_id] = {
        socialSecurity: Number(r.social_security),
        tax: Number(r.tax),
        infotep: Number(r.infotep),
      }
    }
    const row = await buildPayrollEmployeeRow(emp, settings, fromDate, toDate, holidayDates, lineItemsByUser, govDeductionsByUser)
    const pdfBuffer = await renderPayrollSlipPdf(row, settings, fromDate, toDate)
    const persist = req.query.persist === '1' || req.query.persist === 'true'
    if (persist) {
      await query(
        `INSERT INTO employee_payslip_snapshots (user_id, period_from, period_to, pdf_data)
         VALUES ($1::uuid, $2::date, $3::date, $4)
         ON CONFLICT (user_id, period_from, period_to)
         DO UPDATE SET pdf_data = EXCLUDED.pdf_data, created_at = NOW()`,
        [userId, fromDate, toDate, pdfBuffer]
      )
    }
    const safeName = String(row.employeeName || 'employee').replace(/[^a-zA-Z0-9-_]/g, '_')
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="payroll-slip-${safeName}-${fromDate}-to-${toDate}.pdf"`)
    res.send(pdfBuffer)
  } catch (err) {
    console.error('Employee payroll slip PDF error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/sessions/my-payroll?cycle=XXXX — logged-in employee's payroll calculator result
router.get('/my-payroll', async (req, res) => {
  try {
    const userId = req.user.id
    const { cycle } = req.query
    if (!cycle) {
      return res.status(400).json({ error: 'Bad request', message: 'cycle query param is required' })
    }
    const result = await query(
      'SELECT * FROM payroll_calculator_results WHERE user_id = $1 AND payroll_cycle_code = $2',
      [userId, cycle]
    )
    if (!result.rows.length) {
      return res.json(null)
    }
    const r = result.rows[0]
    res.json({
      id: r.id,
      payrollCycleCode: r.payroll_cycle_code,
      periodFrom: r.period_from,
      periodTo: r.period_to,
      payDate: r.pay_date,
      biWeek: r.bi_week != null ? Number(r.bi_week) : null,
      salaryType: r.salary_type,
      salary: Number(r.salary) || 0,
      hourlySalary: Number(r.hourly_salary) || 0,
      hreg1: Number(r.hreg1) || 0,
      hreg2: Number(r.hreg2) || 0,
      hreg: Number(r.hreg) || 0,
      ordinarySalary: Number(r.ordinary_salary) || 0,
      vacation: Number(r.vacation) || 0,
      matrimony: Number(r.matrimony) || 0,
      maternity: Number(r.maternity) || 0,
      paternity: Number(r.paternity) || 0,
      bereavement: Number(r.bereavement) || 0,
      medical: Number(r.medical) || 0,
      vpl: Number(r.vpl) || 0,
      commissions: Number(r.commissions) || 0,
      subsidio: Number(r.subsidio) || 0,
      reembolso: Number(r.reembolso) || 0,
      totalOtherIncome: Number(r.total_other_income) || 0,
      hn15Hours: Number(r.hn15_hours) || 0,
      hn15Amount: Number(r.hn15_amount) || 0,
      hx35Hours: Number(r.hx35_hours) || 0,
      hx35Amount: Number(r.hx35_amount) || 0,
      hx100Hours: Number(r.hx100_hours) || 0,
      hx100Amount: Number(r.hx100_amount) || 0,
      hholHours: Number(r.hhol_hours) || 0,
      hholAmount: Number(r.hhol_amount) || 0,
      overtimeTotal: Number(r.overtime_total) || 0,
      collaboration: Number(r.collaboration) || 0,
      recruiting: Number(r.recruiting) || 0,
      profitSharing: Number(r.profit_sharing) || 0,
      bonusesTotal: Number(r.bonuses_total) || 0,
      attendanceIncentive: Number(r.attendance_incentive) || 0,
      kpiIncentive: Number(r.kpi_incentive) || 0,
      incentivesTotal: Number(r.incentives_total) || 0,
      grossSalary: Number(r.gross_salary) || 0,
      tssSalary: Number(r.tss_salary) || 0,
      isrSalary: Number(r.isr_salary) || 0,
      afp: Number(r.afp) || 0,
      sfs: Number(r.sfs) || 0,
      tssDependents: Number(r.tss_dependents) || 0,
      infotep: Number(r.infotep) || 0,
      isrRetention: Number(r.isr_retention) || 0,
      govDeductionsTotal: Number(r.gov_deductions_total) || 0,
      payLater: Number(r.pay_later) || 0,
      gym: Number(r.gym) || 0,
      insuranceDed: Number(r.insurance_ded) || 0,
      cafeteria: Number(r.cafeteria) || 0,
      adminDeduction: Number(r.admin_deduction) || 0,
      otherDeductionsTotal: Number(r.other_deductions_total) || 0,
      totalDeductions: Number(r.total_deductions) || 0,
      netSalary: Number(r.net_salary) || 0,
    })
  } catch (err) {
    console.error('My payroll error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/sessions/payroll-periods?year=2026 — payroll periods accessible to logged-in employees
router.get('/payroll-periods', async (req, res) => {
  try {
    const year = req.query.year ? parseInt(req.query.year, 10) : new Date().getFullYear()
    const sql = `SELECT period_from, period_to, pay_date, cycle_code, year_cycle, COALESCE(status, 'upcoming') as status, COALESCE(bs, 1) as bs, COALESCE(is_special, false) as is_special
       FROM payroll_periods WHERE year_cycle = $1 ORDER BY period_from`
    const result = await query(sql, [year])
    res.json(result.rows.map((r) => ({
      periodFrom: r.period_from ? new Date(r.period_from).toISOString().slice(0, 10) : '',
      periodTo: r.period_to ? new Date(r.period_to).toISOString().slice(0, 10) : '',
      payDate: r.pay_date ? new Date(r.pay_date).toISOString().slice(0, 10) : '',
      cycleCode: r.cycle_code,
      yearCycle: r.year_cycle,
      status: r.status,
      bs: Number(r.bs) || 1,
      isSpecial: Boolean(r.is_special),
    })))
  } catch (err) {
    console.error('Employee payroll periods error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/sessions/paystub/:id — Render HTML pay stub for the logged-in employee.
// Same renderer as admin (buildPaystubHTML) so the format is identical — per
// 19MAY2026 client video: "we have to make sure that it's the same thing".
router.get('/paystub/:id', async (req, res) => {
  try {
    const { id } = req.params
    // Scope strictly to the logged-in user — no cross-employee access
    const result = await query(
      'SELECT * FROM payroll_calculator_results WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    )
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' })
    const r = result.rows[0]
    const empRes = await query(`
      SELECT e.hire_date, e.job_title, e.location, e.company_email, e.personal_email,
             e.termination_date, sup.name AS supervisor_name
      FROM employees e
      LEFT JOIN users sup ON sup.id = e.reports_to
      WHERE e.user_id = $1
    `, [r.user_id])
    const employeeExtra = empRes.rows[0] || {}
    const html = buildPaystubHTML(r, employeeExtra)
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(html)
  } catch (err) {
    console.error('Employee paystub render error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
