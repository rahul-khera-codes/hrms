import express from 'express'
import bcrypt from 'bcryptjs'
import { query } from '../config/db.js'
import { authMiddleware, requireAdmin } from '../middleware/auth.js'
import { computeSSEmployeeBiWeekly, computeTaxForPeriod } from '../lib/drPayrollRules.js'
import { createNotification } from './notifications.js'

const router = express.Router()

/**
 * Map aggregated row (one per employee per day) to AttendanceRecord shape.
 * clockIn = first punch of day, clockOut = last punch of day.
 */
function toAttendanceRecord(row) {
  const clockIn = row.first_clock_in
  const clockOut = row.last_clock_out
  const hasActive = row.has_active_session
  const status = hasActive ? 'active' : 'present'
  const regularMinutes = Number(row.regular_minutes ?? 0)
  const overtimeMinutes = Number(row.overtime_minutes ?? 0)
  const nightMinutes = Number(row.night_minutes ?? 0)
  const preciseTotalMinutes = Number(row.precise_total_minutes)
  const allBucketsZero = regularMinutes === 0 && overtimeMinutes === 0 && nightMinutes === 0

  let regularHours = regularMinutes / 60
  let overtimeHours = overtimeMinutes / 60
  let nightHours = nightMinutes / 60

  // For normal day sessions (no OT/Night), use exact elapsed duration so admin matches employee-side totals.
  if (!hasActive && overtimeMinutes === 0 && nightMinutes === 0 && Number.isFinite(preciseTotalMinutes) && preciseTotalMinutes > 0) {
    regularHours = preciseTotalMinutes / 60
  }

  // Fallback for very short sessions that persisted as zero minute buckets.
  if (!hasActive && allBucketsZero && clockIn && clockOut) {
    const startMs = new Date(clockIn).getTime()
    const endMs = new Date(clockOut).getTime()
    if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs > startMs) {
      regularHours = (endMs - startMs) / 3600000
    }
  }
  const date = row.date ?? (clockIn ? new Date(clockIn).toISOString().slice(0, 10) : '')
  return {
    id: row.id,
    employeeId: row.user_id,
    employeeName: row.user_name ?? '',
    date,
    clockIn: clockIn || null,
    clockOut: clockOut || null,
    regularHours,
    overtimeHours,
    nightHours,
    status,
  }
}

function listDateStrings(fromDate, toDate) {
  const dates = []
  const cur = new Date(`${fromDate}T12:00:00Z`)
  const end = new Date(`${toDate}T12:00:00Z`)
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return dates
}

router.use(authMiddleware)
router.use(requireAdmin)

// GET /api/admin/dashboard - stats and recent attendance for admin dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10)
    const totalResult = await query(
      "SELECT COUNT(*)::int AS count FROM users WHERE role = 'employee'"
    )
    const totalEmployees = totalResult.rows[0]?.count ?? 0
    const presentResult = await query(
      `SELECT COUNT(DISTINCT s.user_id)::int AS count
       FROM sessions s
       JOIN users u ON u.id = s.user_id AND u.role = 'employee'
       WHERE (s.clock_in AT TIME ZONE 'UTC')::date = $1::date
          OR s.clock_out IS NULL`,
      [today]
    )
    const presentToday = presentResult.rows[0]?.count ?? 0
    const absentToday = Math.max(0, totalEmployees - presentToday)
    const pendingAdjustments = 0
    const fromRecent = new Date()
    fromRecent.setDate(fromRecent.getDate() - 7)
    const fromStr = fromRecent.toISOString().slice(0, 10)
    const recentSql = `
      SELECT u.id AS user_id, u.name AS user_name,
             (s.clock_in AT TIME ZONE 'UTC')::date AS date,
             MIN(s.clock_in) AS first_clock_in, MAX(s.clock_out) AS last_clock_out,
             COALESCE(SUM(s.regular_minutes), 0)::int AS regular_minutes,
             COALESCE(SUM(s.overtime_minutes), 0)::int AS overtime_minutes,
             COALESCE(SUM(s.night_minutes), 0)::int AS night_minutes,
             BOOL_OR(s.clock_out IS NULL) AS has_active_session
      FROM sessions s
      JOIN users u ON u.id = s.user_id AND u.role = 'employee'
      WHERE (s.clock_in AT TIME ZONE 'UTC')::date >= $1::date
        AND (s.clock_in AT TIME ZONE 'UTC')::date <= $2::date
      GROUP BY u.id, u.name, (s.clock_in AT TIME ZONE 'UTC')::date
      ORDER BY (s.clock_in AT TIME ZONE 'UTC')::date DESC, MIN(s.clock_in) DESC
      LIMIT 5
    `
    const recentResult = await query(recentSql, [fromStr, today])
    const recentAttendance = recentResult.rows.map((row) => {
      const dateStr = row.date ? new Date(row.date).toISOString().slice(0, 10) : ''
      return toAttendanceRecord({
        ...row,
        id: `${row.user_id}-${dateStr}`,
      })
    })
    res.json({
      totalEmployees,
      presentToday,
      absentToday,
      pendingAdjustments,
      recentAttendance,
    })
  } catch (err) {
    console.error('Admin dashboard error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/admin/attendance?from=YYYY-MM-DD&to=YYYY-MM-DD&search=&status=
// Returns one row per employee per day with total hours (first clock-in, last clock-out).
router.get('/attendance', async (req, res) => {
  try {
    const { from, to, search, status: statusFilter } = req.query
    let sql = `
      SELECT
        u.id AS user_id,
        u.name AS user_name,
        (s.clock_in AT TIME ZONE 'UTC')::date AS date,
        MIN(s.clock_in) AS first_clock_in,
        MAX(s.clock_out) AS last_clock_out,
        COALESCE(SUM(s.regular_minutes), 0)::int AS regular_minutes,
        COALESCE(SUM(s.overtime_minutes), 0)::int AS overtime_minutes,
        COALESCE(SUM(s.night_minutes), 0)::int AS night_minutes,
        COALESCE(SUM(CASE WHEN s.clock_out IS NOT NULL THEN EXTRACT(EPOCH FROM (s.clock_out - s.clock_in)) / 60.0 ELSE 0 END), 0) AS precise_total_minutes,
        BOOL_OR(s.clock_out IS NULL) AS has_active_session
      FROM sessions s
      JOIN users u ON u.id = s.user_id AND u.role = 'employee'
      WHERE 1=1
    `
    const params = []
    if (from) {
      params.push(from)
      sql += ` AND (s.clock_in AT TIME ZONE 'UTC')::date >= $${params.length}::date`
    }
    if (to) {
      params.push(to)
      sql += ` AND (s.clock_in AT TIME ZONE 'UTC')::date <= $${params.length}::date`
    }
    if (search && String(search).trim()) {
      params.push(`%${String(search).trim()}%`)
      sql += ` AND u.name ILIKE $${params.length}`
    }
    sql += `
      GROUP BY u.id, u.name, (s.clock_in AT TIME ZONE 'UTC')::date
      ORDER BY date DESC, u.name
      LIMIT 500
    `
    const result = await query(sql, params)
    let records = result.rows.map((row) => {
      const dateStr = row.date ? new Date(row.date).toISOString().slice(0, 10) : ''
      return toAttendanceRecord({ ...row, id: `${row.user_id}-${dateStr}` })
    })

    const today = new Date().toISOString().slice(0, 10)
    const existingDates = records.map((r) => r.date).filter(Boolean).sort()
    const boundFrom = from || existingDates[existingDates.length - 1] || today
    const boundTo = to || existingDates[0] || today
    const leaveFrom = boundFrom <= boundTo ? boundFrom : boundTo
    const leaveTo = boundFrom <= boundTo ? boundTo : boundFrom

    const approvedLeaves = await query(
      `SELECT lr.id, lr.user_id, u.name AS user_name,
              lr.start_date::text AS start_date_str,
              lr.end_date::text AS end_date_str
       FROM leave_requests lr
       JOIN users u ON u.id = lr.user_id
       WHERE u.role = 'employee'
         AND lr.status = 'approved'
         AND lr.start_date <= $2::date
         AND lr.end_date >= $1::date
       ORDER BY u.name, lr.start_date`,
      [leaveFrom, leaveTo]
    )

    const existingKeys = new Set(records.map((r) => `${r.employeeId}-${r.date}`))
    const approvedLeaveKeys = new Set()
    const leaveRangeRows = []
    for (const leave of approvedLeaves.rows) {
      const startDate = leave.start_date_str?.slice(0, 10)
      const endDate = leave.end_date_str?.slice(0, 10)
      if (!startDate || !endDate) continue
      const clippedStart = startDate > leaveFrom ? startDate : leaveFrom
      const clippedEnd = endDate < leaveTo ? endDate : leaveTo
      leaveRangeRows.push({
        id: `leave-${leave.id}`,
        employeeId: leave.user_id,
        employeeName: leave.user_name,
        date: `${clippedStart} - ${clippedEnd}`,
        clockIn: null,
        clockOut: null,
        regularHours: 0,
        overtimeHours: 0,
        nightHours: 0,
        status: 'absent',
      })
      const days = listDateStrings(
        clippedStart,
        clippedEnd
      )
      for (const dateStr of days) {
        const key = `${leave.user_id}-${dateStr}`
        approvedLeaveKeys.add(key)
        if (existingKeys.has(key)) continue
        existingKeys.add(key)
        records.push({
          id: key,
          employeeId: leave.user_id,
          employeeName: leave.user_name,
          date: dateStr,
          clockIn: null,
          clockOut: null,
          regularHours: 0,
          overtimeHours: 0,
          nightHours: 0,
          status: 'absent',
        })
      }
    }

    // Approved leave dates should be treated as absent in attendance and carry no worked time.
    records = records.map((r) => {
      const key = `${r.employeeId}-${r.date}`
      if (!approvedLeaveKeys.has(key)) return r
      return {
        ...r,
        clockIn: null,
        clockOut: null,
        regularHours: 0,
        overtimeHours: 0,
        nightHours: 0,
        status: 'absent',
      }
    })

    // Show approved leave as one row per leave request (start - end), not one row per leave day.
    records = records.filter((r) => !approvedLeaveKeys.has(`${r.employeeId}-${r.date}`))
    records.push(...leaveRangeRows)

    // Include ABSENT rows only when filtering explicitly by "absent".
    // Here "absent" means employees who had NO attendance activity at all in the range.
    if (statusFilter === 'absent' && from && to) {
      const employeesResult = await query("SELECT id, name FROM users WHERE role = 'employee' ORDER BY name")
      const employees = employeesResult.rows || []
      const hadActivity = new Set(records.map((r) => r.employeeId))
      const fromDate = new Date(`${from}T12:00:00Z`)
      const toDate = new Date(`${to}T12:00:00Z`)
      for (const emp of employees) {
        // Skip employees who had any attendance (present/active/etc.) in the range.
        if (hadActivity.has(emp.id)) continue
        const cur = new Date(fromDate)
        while (cur <= toDate) {
          const dateStr = cur.toISOString().slice(0, 10)
          const key = `${emp.id}-${dateStr}`
          records.push({
            id: key,
            employeeId: emp.id,
            employeeName: emp.name,
            date: dateStr,
            clockIn: null,
            clockOut: null,
            regularHours: 0,
            overtimeHours: 0,
            nightHours: 0,
            status: 'absent',
          })
          cur.setUTCDate(cur.getUTCDate() + 1)
        }
      }
      // After adding synthetic absent rows, restrict to absent only.
      records = records.filter((r) => r.status === 'absent')
    } else if (statusFilter && statusFilter !== 'all') {
      records = records.filter((r) => r.status === statusFilter)
    }
    res.json(records)
  } catch (err) {
    console.error('Admin attendance list error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/admin/leave-requests?status=pending|approved|rejected|all
router.get('/leave-requests', async (req, res) => {
  try {
    const status = req.query.status ? String(req.query.status) : 'all'
    const params = []
    let sql =
      `SELECT lr.id, lr.user_id, u.name AS user_name, lr.leave_type,
              lr.start_date::text AS start_date_str,
              lr.end_date::text AS end_date_str,
              lr.reason, lr.status,
              reviewer.name AS reviewed_by_name,
              lr.reviewed_note, lr.reviewed_at, lr.created_at
       FROM leave_requests lr
       JOIN users u ON u.id = lr.user_id
       LEFT JOIN users reviewer ON reviewer.id = lr.reviewed_by
       WHERE u.role = 'employee'`
    if (status !== 'all') {
      params.push(status)
      sql += ` AND lr.status = $${params.length}`
    }
    sql += ' ORDER BY CASE WHEN lr.status = \'pending\' THEN 0 ELSE 1 END, lr.created_at DESC'

    const result = await query(sql, params)
    res.json(result.rows.map((r) => ({
      id: r.id,
      employeeId: r.user_id,
      employeeName: r.user_name,
      leaveType: r.leave_type,
      startDate: r.start_date_str?.slice(0, 10) ?? null,
      endDate: r.end_date_str?.slice(0, 10) ?? null,
      reason: r.reason || '',
      status: r.status,
      reviewedByName: r.reviewed_by_name || '',
      reviewedNote: r.reviewed_note || '',
      reviewedAt: r.reviewed_at,
      createdAt: r.created_at,
    })))
  } catch (err) {
    console.error('Admin list leave requests error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/admin/leave-requests/:id
router.patch('/leave-requests/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { status, reviewedNote } = req.body
    if (!['approved', 'rejected'].includes(String(status))) {
      return res.status(400).json({ error: 'Bad request', message: 'status must be approved or rejected' })
    }

    const result = await query(
      `UPDATE leave_requests
       SET status = $1,
           reviewed_by = $2,
           reviewed_note = $3,
           reviewed_at = NOW(),
           updated_at = NOW()
       WHERE id = $4
       RETURNING id, user_id, leave_type, start_date::text AS start_date_str, end_date::text AS end_date_str,
                 reason, status, reviewed_note, reviewed_at, created_at`,
      [status, req.user.id, reviewedNote ? String(reviewedNote).trim() : null, id]
    )
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Not found' })
    }
    const r = result.rows[0]

    try {
      await query(
        `INSERT INTO notifications (user_id, type, title, message, data)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          r.user_id,
          status === 'approved' ? 'leave_request_approved' : 'leave_request_rejected',
          status === 'approved' ? 'Leave Approved' : 'Leave Rejected',
          `Your ${r.leave_type} leave request from ${r.start_date_str?.slice(0, 10) ?? ''} to ${r.end_date_str?.slice(0, 10) ?? ''} was ${status}.`,
          JSON.stringify({
            leaveRequestId: r.id,
            status,
            reviewedBy: req.user.id,
            reviewedNote: reviewedNote ? String(reviewedNote).trim() : null,
          }),
        ]
      )
    } catch (notifyErr) {
      // Fallback for older notification table versions missing JSONB data column.
      if (notifyErr?.code === '42703') {
        await query(
          `INSERT INTO notifications (user_id, type, title, message)
           VALUES ($1, $2, $3, $4)`,
          [
            r.user_id,
            status === 'approved' ? 'leave_request_approved' : 'leave_request_rejected',
            status === 'approved' ? 'Leave Approved' : 'Leave Rejected',
            `Your ${r.leave_type} leave request from ${r.start_date_str?.slice(0, 10) ?? ''} to ${r.end_date_str?.slice(0, 10) ?? ''} was ${status}.`,
          ]
        )
      } else {
        console.error('Failed to create employee leave decision notification:', notifyErr)
      }
    }

    res.json({
      id: r.id,
      employeeId: r.user_id,
      leaveType: r.leave_type,
      startDate: r.start_date_str?.slice(0, 10) ?? null,
      endDate: r.end_date_str?.slice(0, 10) ?? null,
      reason: r.reason || '',
      status: r.status,
      reviewedNote: r.reviewed_note || '',
      reviewedAt: r.reviewed_at,
      createdAt: r.created_at,
    })
  } catch (err) {
    console.error('Admin review leave request error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Callmax: monthly salary → hourly = monthly / 23.83 / 8. OT 35% extra (1.35x), night 15% extra (1.15x).
const DEFAULT_WORKING_DAYS_PER_MONTH = 23.83
const DEFAULT_HOURS_PER_DAY = 8
const DEFAULT_OT_MULTIPLIER = 1.35
const DEFAULT_NIGHT_MULTIPLIER = 1.15
// Callmax: 35% OT capped at 19h/week (38 bi-weekly); hours beyond 63/week = 100% extra; rest-day work = 100% extra.
const OT_35_CAP_HOURS_PER_WEEK = 19
const WEEKLY_63_THRESHOLD = 63
const OT_100_MULTIPLIER = 2
// Monday=1 .. Friday=5 (JavaScript getDay(): 0=Sun, 1=Mon, ..., 6=Sat)
const WORK_DAY_JS = [1, 2, 3, 4, 5]

/** Returns YYYY-MM-DD of Monday of the week containing the given date string. */
function getWeekMondayKey(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z')
  const day = d.getUTCDay()
  const back = day === 0 ? 6 : day - 1
  d.setUTCDate(d.getUTCDate() - back)
  return d.toISOString().slice(0, 10)
}

function isWorkday(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z')
  return WORK_DAY_JS.includes(d.getUTCDay())
}

/**
 * Callmax rules: per week — regular (workday first 8h), OT 35% (same-day OT, cap 19h), OT 100% (rest-day + beyond 63h).
 * sessions: array of { date, regular_minutes, overtime_minutes, night_minutes } (date = YYYY-MM-DD).
 */
function computePayrollBuckets(sessions) {
  const byWeek = new Map()
  for (const s of sessions) {
    const dateStr = s.date
    if (!dateStr) continue
    const weekKey = getWeekMondayKey(dateStr)
    if (!byWeek.has(weekKey)) {
      byWeek.set(weekKey, { regularMinutes: 0, restDayMinutes: 0, totalMinutes: 0 })
    }
    const row = byWeek.get(weekKey)
    const sessionMinutes = (s.regular_minutes || 0) + (s.overtime_minutes || 0) + (s.night_minutes || 0)
    row.totalMinutes += sessionMinutes
    if (isWorkday(dateStr)) {
      row.regularMinutes += s.regular_minutes || 0
    } else {
      row.restDayMinutes += sessionMinutes
    }
  }
  let regularMinutes = 0
  let ot35Minutes = 0
  let ot100Minutes = 0
  for (const row of byWeek.values()) {
    const totalHrs = row.totalMinutes / 60
    const regularHrs = row.regularMinutes / 60
    const restDayHrs = row.restDayMinutes / 60
    const ot100Hrs = restDayHrs + Math.max(0, totalHrs - WEEKLY_63_THRESHOLD)
    const ot35Hrs = Math.min(OT_35_CAP_HOURS_PER_WEEK, Math.max(0, totalHrs - regularHrs - ot100Hrs))
    regularMinutes += row.regularMinutes
    ot35Minutes += Math.round(ot35Hrs * 60)
    ot100Minutes += Math.round(ot100Hrs * 60)
  }
  return { regularMinutes, ot35Minutes, ot100Minutes }
}

async function getSettings() {
  const result = await query('SELECT * FROM settings WHERE id = 1')
  const row = result.rows[0]
  if (!row) {
    return {
      workingDaysPerMonth: DEFAULT_WORKING_DAYS_PER_MONTH,
      hoursPerDay: DEFAULT_HOURS_PER_DAY,
      otMultiplier: DEFAULT_OT_MULTIPLIER,
      nightMultiplier: DEFAULT_NIGHT_MULTIPLIER,
      nightShiftStartHour: 21,
      nightShiftEndHour: 7,
    }
  }
  return {
    workingDaysPerMonth: Number(row.working_days_per_month) || DEFAULT_WORKING_DAYS_PER_MONTH,
    hoursPerDay: Number(row.hours_per_day) || DEFAULT_HOURS_PER_DAY,
    otMultiplier: Number(row.ot_multiplier) || DEFAULT_OT_MULTIPLIER,
    nightMultiplier: Number(row.night_multiplier) || DEFAULT_NIGHT_MULTIPLIER,
    nightShiftStartHour: Number(row.night_shift_start_hour) ?? 21,
    nightShiftEndHour: Number(row.night_shift_end_hour) ?? 7,
  }
}

function getHourlyRate(salaryType, baseSalary, workingDaysPerMonth, hoursPerDay) {
  const n = Number(baseSalary) || 0
  if (salaryType === 'monthly') return n / workingDaysPerMonth / hoursPerDay
  return n
}

function timeToMinutes(value) {
  if (!value) return null
  const parts = String(value).split(':')
  if (parts.length < 2) return null
  const h = parseInt(parts[0], 10)
  const m = parseInt(parts[1], 10)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return (h * 60) + m
}

function shiftMinutes(startTime, endTime) {
  const start = timeToMinutes(startTime)
  const end = timeToMinutes(endTime)
  if (start == null || end == null) return 0
  const diff = end - start
  if (diff === 0) return 0
  if (diff > 0) return diff
  return (24 * 60 - start) + end
}

// GET /api/admin/holidays?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/holidays', async (req, res) => {
  try {
    const { from, to } = req.query
    const params = []
    let sql = `SELECT id, holiday_date::text AS holiday_date_str, name, is_paid FROM holidays WHERE 1=1`
    if (from) {
      params.push(from)
      sql += ` AND holiday_date >= $${params.length}::date`
    }
    if (to) {
      params.push(to)
      sql += ` AND holiday_date <= $${params.length}::date`
    }
    sql += ' ORDER BY holiday_date ASC'
    const result = await query(sql, params)
    res.json(result.rows.map((r) => ({
      id: r.id,
      date: r.holiday_date_str ? r.holiday_date_str.slice(0, 10) : null,
      name: r.name,
      isPaid: !!r.is_paid,
    })))
  } catch (err) {
    console.error('Admin list holidays error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/admin/holidays
router.post('/holidays', async (req, res) => {
  try {
    const { date, name, isPaid = true } = req.body
    if (!date || !name) {
      return res.status(400).json({ error: 'Bad request', message: 'date and name are required' })
    }
    const result = await query(
      `INSERT INTO holidays (holiday_date, name, is_paid)
       VALUES ($1::date, $2, $3)
       ON CONFLICT (holiday_date) DO UPDATE
       SET name = EXCLUDED.name,
           is_paid = EXCLUDED.is_paid,
           updated_at = NOW()
       RETURNING id, holiday_date::text AS holiday_date_str, name, is_paid`,
      [date, String(name).trim(), Boolean(isPaid)]
    )
    const r = result.rows[0]
    res.status(201).json({
      id: r.id,
      date: r.holiday_date_str ? r.holiday_date_str.slice(0, 10) : null,
      name: r.name,
      isPaid: !!r.is_paid,
    })
  } catch (err) {
    console.error('Admin create holiday error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/admin/holidays/:id
router.delete('/holidays/:id', async (req, res) => {
  try {
    const { id } = req.params
    const result = await query('DELETE FROM holidays WHERE id = $1 RETURNING id', [id])
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' })
    res.status(204).send()
  } catch (err) {
    console.error('Admin delete holiday error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/admin/settings
router.get('/settings', async (req, res) => {
  try {
    const s = await getSettings()
    res.json({
      workingDaysPerMonth: s.workingDaysPerMonth,
      hoursPerDay: s.hoursPerDay,
      otMultiplier: s.otMultiplier,
      nightMultiplier: s.nightMultiplier,
      nightShiftStartHour: s.nightShiftStartHour,
      nightShiftEndHour: s.nightShiftEndHour,
    })
  } catch (err) {
    console.error('Admin get settings error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/admin/settings
router.patch('/settings', async (req, res) => {
  try {
    const {
      workingDaysPerMonth,
      hoursPerDay,
      otMultiplier,
      nightMultiplier,
      nightShiftStartHour,
      nightShiftEndHour,
    } = req.body
    const wd = workingDaysPerMonth != null ? Math.max(0.1, Number(workingDaysPerMonth)) : null
    const hd = hoursPerDay != null ? Math.max(0.1, Number(hoursPerDay)) : null
    const ot = otMultiplier != null ? Math.max(1, Number(otMultiplier)) : null
    const night = nightMultiplier != null ? Math.max(1, Number(nightMultiplier)) : null
    const startH = nightShiftStartHour != null ? Math.min(23, Math.max(0, parseInt(nightShiftStartHour, 10))) : null
    const endH = nightShiftEndHour != null ? Math.min(23, Math.max(0, parseInt(nightShiftEndHour, 10))) : null
    const updates = []
    const params = []
    let i = 1
    if (wd != null) { updates.push(`working_days_per_month = $${i++}`); params.push(wd) }
    if (hd != null) { updates.push(`hours_per_day = $${i++}`); params.push(hd) }
    if (ot != null) { updates.push(`ot_multiplier = $${i++}`); params.push(ot) }
    if (night != null) { updates.push(`night_multiplier = $${i++}`); params.push(night) }
    if (startH != null) { updates.push(`night_shift_start_hour = $${i++}`); params.push(startH) }
    if (endH != null) { updates.push(`night_shift_end_hour = $${i++}`); params.push(endH) }
    if (updates.length === 0) {
      const s = await getSettings()
      return res.json({
        workingDaysPerMonth: s.workingDaysPerMonth,
        hoursPerDay: s.hoursPerDay,
        otMultiplier: s.otMultiplier,
        nightMultiplier: s.nightMultiplier,
        nightShiftStartHour: s.nightShiftStartHour,
        nightShiftEndHour: s.nightShiftEndHour,
      })
    }
    updates.push('updated_at = NOW()')
    params.push(1)
    await query(
      `UPDATE settings SET ${updates.join(', ')} WHERE id = $${i}`,
      params
    )
    const s = await getSettings()
    res.json({
      workingDaysPerMonth: s.workingDaysPerMonth,
      hoursPerDay: s.hoursPerDay,
      otMultiplier: s.otMultiplier,
      nightMultiplier: s.nightMultiplier,
      nightShiftStartHour: s.nightShiftStartHour,
      nightShiftEndHour: s.nightShiftEndHour,
    })
  } catch (err) {
    console.error('Admin update settings error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/admin/payroll?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/payroll', async (req, res) => {
  try {
    const settings = await getSettings()
    const { from, to } = req.query
    const toDate = to || new Date().toISOString().slice(0, 10)
    const fromDate = from || new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const holidayRows = await query(
      `SELECT holiday_date::text AS holiday_date_str
       FROM holidays
       WHERE is_paid = TRUE
         AND holiday_date >= $1::date
         AND holiday_date <= $2::date`,
      [fromDate, toDate]
    )
    const holidayDates = new Set(holidayRows.rows.map((r) => r.holiday_date_str?.slice(0, 10)).filter(Boolean))
    const employees = await query(
      `SELECT u.id, u.name,
              COALESCE(e.salary_type, u.salary_type) AS salary_type,
              COALESCE(e.base_salary, u.base_salary) AS base_salary
       FROM users u
       LEFT JOIN employees e ON e.user_id = u.id
       WHERE u.role = 'employee'
       ORDER BY u.name`
    )
    const lineItemsByUser = {}
    const lineItemsRows = await query(
      `SELECT id, user_id, type, label, amount FROM payroll_line_items
       WHERE period_from = $1::date AND period_to = $2::date`,
      [fromDate, toDate]
    )
    for (const r of lineItemsRows.rows) {
      const uid = r.user_id
      if (!lineItemsByUser[uid]) lineItemsByUser[uid] = []
      lineItemsByUser[uid].push({
        id: r.id,
        type: r.type,
        label: r.label || '',
        amount: Number(r.amount),
      })
    }
    const govDeductionsByUser = {}
    const govRows = await query(
      `SELECT user_id, social_security, tax, infotep FROM payroll_government_deductions
       WHERE period_from = $1::date AND period_to = $2::date`,
      [fromDate, toDate]
    )
    for (const r of govRows.rows) {
      govDeductionsByUser[r.user_id] = {
        socialSecurity: Number(r.social_security),
        tax: Number(r.tax),
        infotep: Number(r.infotep),
      }
    }
    const payroll = []
    let totalRegularPay = 0, totalOt35Pay = 0, totalOt100Pay = 0, totalNightPay = 0
    let totalRegularHours = 0, totalOt35Hours = 0, totalOt100Hours = 0, totalNightHours = 0
    let totalHolidayScheduledHours = 0, totalHolidayWorkedHours = 0, totalHolidayPay = 0
    let totalAdditions = 0, totalDeductions = 0, totalGovDeductions = 0, totalNetPay = 0
    for (const emp of employees.rows) {
      const approvedLeavesForEmployee = await query(
        `SELECT start_date::text AS start_date_str, end_date::text AS end_date_str
         FROM leave_requests
         WHERE user_id = $1
           AND status = 'approved'
           AND start_date <= $3::date
           AND end_date >= $2::date`,
        [emp.id, fromDate, toDate]
      )
      const approvedLeaveDateSet = new Set()
      for (const leave of approvedLeavesForEmployee.rows) {
        const startDate = leave.start_date_str?.slice(0, 10)
        const endDate = leave.end_date_str?.slice(0, 10)
        if (!startDate || !endDate) continue
        const days = listDateStrings(
          startDate > fromDate ? startDate : fromDate,
          endDate < toDate ? endDate : toDate
        )
        for (const d of days) approvedLeaveDateSet.add(d)
      }

      const sessionsResult = await query(
        `SELECT (clock_in AT TIME ZONE 'UTC')::date AS date,
                regular_minutes, overtime_minutes, night_minutes
         FROM sessions WHERE user_id = $1 AND clock_out IS NOT NULL
           AND (clock_in AT TIME ZONE 'UTC')::date >= $2::date
           AND (clock_in AT TIME ZONE 'UTC')::date <= $3::date
         ORDER BY clock_in`,
        [emp.id, fromDate, toDate]
      )
      const sessions = sessionsResult.rows.map((r) => ({
        date: r.date ? new Date(r.date).toISOString().slice(0, 10) : '',
        regular_minutes: r.regular_minutes ?? 0,
        overtime_minutes: r.overtime_minutes ?? 0,
        night_minutes: r.night_minutes ?? 0,
      })).filter((s) => s.date && !approvedLeaveDateSet.has(s.date))
      const { regularMinutes, ot35Minutes, ot100Minutes } = computePayrollBuckets(sessions)
      const nightMinutes = sessions.reduce((sum, s) => sum + (s.night_minutes || 0), 0)
      const regularHours = Math.round((regularMinutes / 60) * 10) / 10
      const ot35Hours = Math.round((ot35Minutes / 60) * 10) / 10
      const ot100Hours = Math.round((ot100Minutes / 60) * 10) / 10
      const nightHours = Math.round((nightMinutes / 60) * 10) / 10
      const totalHours = regularHours + ot35Hours + ot100Hours + nightHours
      const rate = getHourlyRate(emp.salary_type, emp.base_salary, settings.workingDaysPerMonth, settings.hoursPerDay)

      const workedMinutesByDate = new Map()
      for (const s of sessions) {
        if (!s.date) continue
        const mins = (s.regular_minutes || 0) + (s.overtime_minutes || 0) + (s.night_minutes || 0)
        workedMinutesByDate.set(s.date, (workedMinutesByDate.get(s.date) || 0) + mins)
      }

      const holidayAssignmentsResult = await query(
        `SELECT a.date::text AS date_str,
                COALESCE(a.override_start_time, s.start_time) AS start_time,
                COALESCE(a.override_end_time, s.end_time) AS end_time
         FROM schedule_assignments a
         JOIN shifts s ON s.id = a.shift_id
         WHERE a.user_id = $1
           AND a.date >= $2::date
           AND a.date <= $3::date`,
        [emp.id, fromDate, toDate]
      )
      const scheduledHolidayMinutesByDate = new Map()
      for (const row of holidayAssignmentsResult.rows) {
        const dateKey = row.date_str ? row.date_str.slice(0, 10) : null
        if (!dateKey || !holidayDates.has(dateKey)) continue
        if (approvedLeaveDateSet.has(dateKey)) continue
        const mins = shiftMinutes(row.start_time, row.end_time)
        scheduledHolidayMinutesByDate.set(dateKey, (scheduledHolidayMinutesByDate.get(dateKey) || 0) + mins)
      }

      let holidayScheduledMinutes = 0
      let holidayWorkedMinutes = 0
      let holidayBaseTopUpMinutes = 0
      for (const dateKey of holidayDates) {
        if (approvedLeaveDateSet.has(dateKey)) continue
        const scheduled = scheduledHolidayMinutesByDate.get(dateKey) || 0
        const worked = workedMinutesByDate.get(dateKey) || 0
        holidayScheduledMinutes += scheduled
        holidayWorkedMinutes += worked
        holidayBaseTopUpMinutes += Math.max(0, scheduled - worked)
      }

      const holidayBaseTopUpPay = (holidayBaseTopUpMinutes / 60) * rate
      const holidayPremiumPay = (holidayWorkedMinutes / 60) * rate
      const holidayPay = holidayBaseTopUpPay + holidayPremiumPay

      const regularPay = regularHours * rate
      const ot35Pay = ot35Hours * rate * settings.otMultiplier
      const ot100Pay = ot100Hours * rate * OT_100_MULTIPLIER
      const nightPay = nightHours * rate * settings.nightMultiplier
      const grossPay = regularPay + ot35Pay + ot100Pay + nightPay + holidayPay
      const items = lineItemsByUser[emp.id] || []
      let additionsTotal = 0
      let deductionsTotal = 0
      for (const it of items) {
        if (it.type === 'bonus' || it.type === 'incentive') {
          additionsTotal += it.amount
        } else {
          deductionsTotal += Math.abs(it.amount)
        }
      }
      const hasGovOverride = !!govDeductionsByUser[emp.id]
      let socialSecurity = 0
      let tax = 0
      const infotep = hasGovOverride ? govDeductionsByUser[emp.id].infotep : 0
      if (hasGovOverride) {
        socialSecurity = govDeductionsByUser[emp.id].socialSecurity
        tax = govDeductionsByUser[emp.id].tax
      } else {
        socialSecurity = computeSSEmployeeBiWeekly(regularPay)
        const periodTaxable = grossPay + additionsTotal - deductionsTotal
        tax = computeTaxForPeriod(periodTaxable, true)
      }
      socialSecurity = Math.round(socialSecurity * 100) / 100
      tax = Math.round(tax * 100) / 100
      const infotepRounded = Math.round(infotep * 100) / 100
      const govTotal = socialSecurity + tax + infotepRounded
      const netPay = Math.round((grossPay + additionsTotal - deductionsTotal - govTotal) * 100) / 100
      totalRegularPay += regularPay
      totalOt35Pay += ot35Pay
      totalOt100Pay += ot100Pay
      totalNightPay += nightPay
      totalRegularHours += regularHours
      totalOt35Hours += ot35Hours
      totalOt100Hours += ot100Hours
      totalNightHours += nightHours
      totalHolidayScheduledHours += holidayScheduledMinutes / 60
      totalHolidayWorkedHours += holidayWorkedMinutes / 60
      totalHolidayPay += holidayPay
      totalAdditions += additionsTotal
      totalDeductions += deductionsTotal
      totalGovDeductions += govTotal
      totalNetPay += netPay
      payroll.push({
        employeeId: emp.id,
        employeeName: emp.name,
        salaryType: emp.salary_type,
        hourlyRate: Math.round(rate * 100) / 100,
        regularHours,
        ot35Hours,
        ot100Hours,
        nightHours,
        totalHours,
        regularPay: Math.round(regularPay * 100) / 100,
        ot35Pay: Math.round(ot35Pay * 100) / 100,
        ot100Pay: Math.round(ot100Pay * 100) / 100,
        nightPay: Math.round(nightPay * 100) / 100,
        holidayScheduledHours: Math.round((holidayScheduledMinutes / 60) * 10) / 10,
        holidayWorkedHours: Math.round((holidayWorkedMinutes / 60) * 10) / 10,
        holidayPay: Math.round(holidayPay * 100) / 100,
        totalPay: Math.round(grossPay * 100) / 100,
        lineItems: items,
        additionsTotal: Math.round(additionsTotal * 100) / 100,
        deductionsTotal: Math.round(deductionsTotal * 100) / 100,
        socialSecurity,
        tax,
        infotep: infotepRounded,
        netPay,
        govAutoCalculated: !hasGovOverride,
      })
    }
    res.json({
      period: `${fromDate} – ${toDate}`,
      from: fromDate,
      to: toDate,
      employees: payroll,
      summary: {
        totalRegularHours: Math.round(totalRegularHours * 10) / 10,
        totalOt35Hours: Math.round(totalOt35Hours * 10) / 10,
        totalOt100Hours: Math.round(totalOt100Hours * 10) / 10,
        totalNightHours: Math.round(totalNightHours * 10) / 10,
        totalHolidayScheduledHours: Math.round(totalHolidayScheduledHours * 10) / 10,
        totalHolidayWorkedHours: Math.round(totalHolidayWorkedHours * 10) / 10,
        totalHolidayPay: Math.round(totalHolidayPay * 100) / 100,
        totalRegularPay: Math.round(totalRegularPay * 100) / 100,
        totalOt35Pay: Math.round(totalOt35Pay * 100) / 100,
        totalOt100Pay: Math.round(totalOt100Pay * 100) / 100,
        totalNightPay: Math.round(totalNightPay * 100) / 100,
        totalPay: Math.round((totalRegularPay + totalOt35Pay + totalOt100Pay + totalNightPay + totalHolidayPay) * 100) / 100,
        totalAdditions: Math.round(totalAdditions * 100) / 100,
        totalDeductions: Math.round(totalDeductions * 100) / 100,
        totalGovDeductions: Math.round(totalGovDeductions * 100) / 100,
        totalNetPay: Math.round(totalNetPay * 100) / 100,
      },
      rulesUsed: {
        otMultiplier: settings.otMultiplier,
        nightMultiplier: settings.nightMultiplier,
      },
    })
  } catch (err) {
    console.error('Admin payroll error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/admin/payroll/line-items?from=&to=
router.get('/payroll/line-items', async (req, res) => {
  try {
    const { from, to } = req.query
    if (!from || !to) {
      return res.status(400).json({ error: 'Bad request', message: 'from and to dates required' })
    }
    const result = await query(
      `SELECT pl.id, pl.user_id, pl.period_from, pl.period_to, pl.type, pl.label, pl.amount, u.name AS user_name
       FROM payroll_line_items pl
       JOIN users u ON u.id = pl.user_id
       WHERE pl.period_from = $1::date AND pl.period_to = $2::date
       ORDER BY u.name, pl.type`,
      [from, to]
    )
    res.json(result.rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      userName: r.user_name,
      periodFrom: r.period_from ? new Date(r.period_from).toISOString().slice(0, 10) : '',
      periodTo: r.period_to ? new Date(r.period_to).toISOString().slice(0, 10) : '',
      type: r.type,
      label: r.label || '',
      amount: Number(r.amount),
    })))
  } catch (err) {
    console.error('List payroll line items error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/admin/payroll/line-items
router.post('/payroll/line-items', async (req, res) => {
  try {
    const { employeeId, periodFrom, periodTo, type, label, amount } = req.body
    if (!employeeId || !periodFrom || !periodTo || !type || amount === undefined) {
      return res.status(400).json({ error: 'Bad request', message: 'employeeId, periodFrom, periodTo, type, and amount are required' })
    }
    const validTypes = ['bonus', 'incentive', 'deduction', 'passthrough_credit']
    if (!validTypes.includes(String(type))) {
      return res.status(400).json({ error: 'Bad request', message: 'type must be bonus, incentive, deduction, or passthrough_credit' })
    }
    const amt = Number(amount)
    if (Number.isNaN(amt)) {
      return res.status(400).json({ error: 'Bad request', message: 'amount must be a number' })
    }
    const result = await query(
      `INSERT INTO payroll_line_items (user_id, period_from, period_to, type, label, amount)
       VALUES ($1, $2::date, $3::date, $4, $5, $6)
       RETURNING id, user_id, period_from, period_to, type, label, amount`,
      [employeeId, periodFrom, periodTo, type, label || '', amt]
    )
    const r = result.rows[0]
    res.status(201).json({
      id: r.id,
      userId: r.user_id,
      periodFrom: r.period_from ? new Date(r.period_from).toISOString().slice(0, 10) : '',
      periodTo: r.period_to ? new Date(r.period_to).toISOString().slice(0, 10) : '',
      type: r.type,
      label: r.label || '',
      amount: Number(r.amount),
    })
  } catch (err) {
    console.error('Create payroll line item error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/admin/payroll/line-items/:id
router.delete('/payroll/line-items/:id', async (req, res) => {
  try {
    const { id } = req.params
    const result = await query('DELETE FROM payroll_line_items WHERE id = $1 RETURNING id', [id])
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not found' })
    }
    res.status(204).send()
  } catch (err) {
    console.error('Delete payroll line item error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /api/admin/payroll/deductions - set government deductions for one employee, one period
router.put('/payroll/deductions', async (req, res) => {
  try {
    const { employeeId, periodFrom, periodTo, socialSecurity, tax, infotep } = req.body
    if (!employeeId || !periodFrom || !periodTo) {
      return res.status(400).json({ error: 'Bad request', message: 'employeeId, periodFrom, periodTo required' })
    }
    const ss = Math.max(0, Number(socialSecurity) || 0)
    const tx = Math.max(0, Number(tax) || 0)
    const inf = Math.max(0, Number(infotep) || 0)
    await query(
      `INSERT INTO payroll_government_deductions (user_id, period_from, period_to, social_security, tax, infotep, updated_at)
       VALUES ($1, $2::date, $3::date, $4, $5, $6, NOW())
       ON CONFLICT (user_id, period_from, period_to)
       DO UPDATE SET social_security = $4, tax = $5, infotep = $6, updated_at = NOW()`,
      [employeeId, periodFrom, periodTo, ss, tx, inf]
    )
    res.json({
      employeeId,
      periodFrom,
      periodTo,
      socialSecurity: ss,
      tax: tx,
      infotep: inf,
    })
  } catch (err) {
    console.error('Set payroll deductions error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/admin/payroll/periods?year=2026 - bi-weekly payroll calendar periods (DR)
router.get('/payroll/periods', async (req, res) => {
  try {
    const year = req.query.year ? parseInt(req.query.year, 10) : new Date().getFullYear()
    const result = await query(
      `SELECT period_from, period_to, pay_date, cycle_code, year_cycle
       FROM payroll_periods WHERE year_cycle = $1 ORDER BY period_from`,
      [year]
    )
    res.json(result.rows.map((r) => ({
      periodFrom: r.period_from ? new Date(r.period_from).toISOString().slice(0, 10) : '',
      periodTo: r.period_to ? new Date(r.period_to).toISOString().slice(0, 10) : '',
      payDate: r.pay_date ? new Date(r.pay_date).toISOString().slice(0, 10) : '',
      cycleCode: r.cycle_code,
      yearCycle: r.year_cycle,
    })))
  } catch (err) {
    console.error('List payroll periods error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/admin/employees/:id - update employee (name, email, password, salary)
router.patch('/employees/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { name, email, password, salaryType, baseSalary } = req.body
    const emp = await query(
      "SELECT id FROM users WHERE id = $1 AND role = 'employee'",
      [id]
    )
    if (emp.rows.length === 0) {
      return res.status(404).json({ error: 'Not found', message: 'Employee not found' })
    }
    const updates = []
    const params = []
    let i = 1
    if (name !== undefined && String(name).trim() !== '') {
      updates.push(`name = $${i++}`)
      params.push(String(name).trim())
    }
    if (email !== undefined && String(email).trim() !== '') {
      const emailTrim = String(email).trim().toLowerCase()
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(emailTrim)) {
        return res.status(400).json({ error: 'Validation failed', message: 'Valid email is required' })
      }
      const existing = await query('SELECT id FROM users WHERE email = $1 AND id != $2', [emailTrim, id])
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'Conflict', message: 'Email already in use' })
      }
      updates.push(`email = $${i++}`)
      params.push(emailTrim)
    }
    if (password !== undefined && String(password).length >= 6) {
      const password_hash = await bcrypt.hash(String(password), 10)
      updates.push(`password_hash = $${i++}`)
      params.push(password_hash)
    }
    const st = salaryType !== undefined ? (salaryType === 'monthly' ? 'monthly' : 'hourly') : undefined
    const sal = baseSalary !== undefined ? Math.max(0, Number(baseSalary)) : undefined
    if (updates.length > 0) {
      params.push(id)
      await query(`UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${i}`, params)
    }

    if (st !== undefined || sal !== undefined) {
      await query(
        `INSERT INTO employees (user_id, salary_type, base_salary, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (user_id) DO UPDATE SET salary_type = $2, base_salary = $3, updated_at = NOW()`,
        [id, st ?? 'hourly', sal ?? 0]
      )
    }

    const updated = await query(
      `SELECT u.id, u.name, u.email,
              COALESCE(e.salary_type, u.salary_type) AS salary_type,
              COALESCE(e.base_salary, u.base_salary) AS base_salary
       FROM users u
       LEFT JOIN employees e ON e.user_id = u.id
       WHERE u.id = $1`,
      [id]
    )
    const row = updated.rows[0]
    res.json({
      id: row.id,
      name: row.name,
      email: row.email || '',
      salaryType: row.salary_type || 'hourly',
      baseSalary: row.base_salary != null ? Number(row.base_salary) : 0,
    })
  } catch (err) {
    console.error('Update employee error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/admin/reports/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
// Aggregated hours across all employees for the period (for payroll report).
router.get('/reports/summary', async (req, res) => {
  try {
    const { from, to } = req.query
    const toDate = to || new Date().toISOString().slice(0, 10)
    const fromDate = from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const result = await query(
      `SELECT
         COALESCE(SUM(s.regular_minutes), 0)::int AS regular_minutes,
         COALESCE(SUM(s.overtime_minutes), 0)::int AS overtime_minutes,
         COALESCE(SUM(s.night_minutes), 0)::int AS night_minutes
       FROM sessions s
       JOIN users u ON u.id = s.user_id AND u.role = 'employee'
       WHERE s.clock_out IS NOT NULL
         AND (s.clock_in AT TIME ZONE 'UTC')::date >= $1::date
         AND (s.clock_in AT TIME ZONE 'UTC')::date <= $2::date`,
      [fromDate, toDate]
    )
    const row = result.rows[0]
    const regularHours = (row?.regular_minutes ?? 0) / 60
    const overtimeHours = (row?.overtime_minutes ?? 0) / 60
    const nightHours = (row?.night_minutes ?? 0) / 60
    const totalHours = regularHours + overtimeHours + nightHours
    res.json({
      period: `${fromDate} – ${toDate}`,
      regularHours: Math.round(regularHours * 10) / 10,
      overtimeHours: Math.round(overtimeHours * 10) / 10,
      nightHours: Math.round(nightHours * 10) / 10,
      totalHours: Math.round(totalHours * 10) / 10,
    })
  } catch (err) {
    console.error('Admin reports summary error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// --- Scheduling (admin as supervisor): BPO clients, shifts, schedule assignments ---

// GET /api/admin/employees - list employees (full for database page; schedule uses id, name)
router.get('/employees', async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.name, u.email,
              COALESCE(e.salary_type, u.salary_type) AS salary_type,
              COALESCE(e.base_salary, u.base_salary) AS base_salary
       FROM users u
       LEFT JOIN employees e ON e.user_id = u.id
       WHERE u.role = 'employee'
       ORDER BY u.name`
    )
    res.json(result.rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email || '',
      salaryType: r.salary_type || 'hourly',
      baseSalary: r.base_salary != null ? Number(r.base_salary) : 0,
    })))
  } catch (err) {
    console.error('Admin list employees error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/admin/employees - create employee (admin only)
router.post('/employees', requireAdmin, async (req, res) => {
  try {
    const { name, email, password, salaryType, baseSalary } = req.body
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!name || String(name).trim() === '') {
      return res.status(400).json({ error: 'Validation failed', message: 'Name is required' })
    }
    if (!email || !emailRegex.test(String(email).trim())) {
      return res.status(400).json({ error: 'Validation failed', message: 'Valid email is required' })
    }
    if (!password || String(password).length < 6) {
      return res.status(400).json({ error: 'Validation failed', message: 'Password must be at least 6 characters' })
    }
    const existing = await query('SELECT id FROM users WHERE email = $1', [String(email).trim().toLowerCase()])
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Conflict', message: 'Email already registered' })
    }
    const password_hash = await bcrypt.hash(String(password), 10)
    const st = salaryType === 'monthly' ? 'monthly' : 'hourly'
    const sal = baseSalary != null ? Math.max(0, Number(baseSalary)) : 0
    const createdUser = await query(
      `INSERT INTO users (email, name, password_hash, role, salary_type, base_salary)
       VALUES ($1, $2, $3, 'employee', $4, $5)
       RETURNING id, name, email`,
      [String(email).trim().toLowerCase(), String(name).trim(), password_hash, st, sal]
    )
    const u = createdUser.rows[0]
    await query(
      `INSERT INTO employees (user_id, salary_type, base_salary)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET salary_type = $2, base_salary = $3, updated_at = NOW()`,
      [u.id, st, sal]
    )
    res.status(201).json({
      id: u.id,
      name: u.name,
      email: u.email,
      salaryType: st,
      baseSalary: sal,
    })
  } catch (err) {
    console.error('Admin create employee error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/admin/clients
router.get('/clients', async (req, res) => {
  try {
    const result = await query('SELECT id, name, code, created_at FROM clients ORDER BY name')
    res.json(result.rows.map((r) => ({ id: r.id, name: r.name, code: r.code || null })))
  } catch (err) {
    console.error('Admin list clients error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/admin/clients
router.post('/clients', async (req, res) => {
  try {
    const { name, code } = req.body
    if (!name || String(name).trim() === '') {
      return res.status(400).json({ error: 'Bad request', message: 'Name is required' })
    }
    const result = await query(
      'INSERT INTO clients (name, code) VALUES ($1, $2) RETURNING id, name, code',
      [String(name).trim(), code ? String(code).trim() : null]
    )
    res.status(201).json(result.rows[0])
  } catch (err) {
    console.error('Admin create client error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/admin/clients/:id
router.patch('/clients/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { name, code } = req.body
    const updates = []
    const params = []
    let i = 1
    if (name !== undefined) { updates.push(`name = $${i++}`); params.push(String(name).trim()) }
    if (code !== undefined) { updates.push(`code = $${i++}`); params.push(code ? String(code).trim() : null) }
    if (updates.length === 0) {
      const r = await query('SELECT id, name, code FROM clients WHERE id = $1', [id])
      if (r.rows.length === 0) return res.status(404).json({ error: 'Not found' })
      return res.json(r.rows[0])
    }
    updates.push('updated_at = NOW()')
    params.push(id)
    await query(`UPDATE clients SET ${updates.join(', ')} WHERE id = $${i}`, params)
    const r = await query('SELECT id, name, code FROM clients WHERE id = $1', [id])
    if (r.rows.length === 0) return res.status(404).json({ error: 'Not found' })
    res.json(r.rows[0])
  } catch (err) {
    console.error('Admin update client error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/admin/clients/:id
router.delete('/clients/:id', async (req, res) => {
  try {
    const { id } = req.params
    const result = await query('DELETE FROM clients WHERE id = $1 RETURNING id', [id])
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' })
    res.status(204).send()
  } catch (err) {
    console.error('Admin delete client error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/admin/shifts?client_id=
router.get('/shifts', async (req, res) => {
  try {
    const { client_id } = req.query
    let sql = 'SELECT s.id, s.name, s.start_time, s.end_time, s.client_id, s.timezone FROM shifts s WHERE 1=1'
    const params = []
    if (client_id) {
      params.push(client_id)
      sql += ` AND (s.client_id = $${params.length} OR s.client_id IS NULL)`
    }
    sql += ' ORDER BY s.name'
    const result = await query(sql, params)
    res.json(result.rows.map((r) => ({
      id: r.id,
      name: r.name,
      startTime: r.start_time,
      endTime: r.end_time,
      clientId: r.client_id,
      timezone: r.timezone || 'UTC',
    })))
  } catch (err) {
    console.error('Admin list shifts error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/admin/shifts
router.post('/shifts', async (req, res) => {
  try {
    const { name, startTime, endTime, clientId, timezone } = req.body
    if (!name || String(name).trim() === '') {
      return res.status(400).json({ error: 'Bad request', message: 'Name is required' })
    }
    const start = startTime != null ? String(startTime) : '09:00'
    const end = endTime != null ? String(endTime) : '17:00'
    const tz = timezone && String(timezone).trim() ? String(timezone).trim() : 'UTC'
    const result = await query(
      'INSERT INTO shifts (name, start_time, end_time, client_id, timezone) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, start_time, end_time, client_id, timezone',
      [String(name).trim(), start, end, clientId || null, tz]
    )
    const r = result.rows[0]
    res.status(201).json({ id: r.id, name: r.name, startTime: r.start_time, endTime: r.end_time, clientId: r.client_id, timezone: r.timezone || 'UTC' })
  } catch (err) {
    console.error('Admin create shift error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/admin/shifts/:id
router.patch('/shifts/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { name, startTime, endTime, clientId, timezone } = req.body
    const updates = []
    const params = []
    let i = 1
    if (name !== undefined) { updates.push(`name = $${i++}`); params.push(String(name).trim()) }
    if (startTime !== undefined) { updates.push(`start_time = $${i++}`); params.push(String(startTime)) }
    if (endTime !== undefined) { updates.push(`end_time = $${i++}`); params.push(String(endTime)) }
    if (clientId !== undefined) { updates.push(`client_id = $${i++}`); params.push(clientId || null) }
    if (timezone !== undefined) { updates.push(`timezone = $${i++}`); params.push(timezone && String(timezone).trim() ? String(timezone).trim() : 'UTC') }
    if (updates.length === 0) {
      const r = await query('SELECT id, name, start_time, end_time, client_id, timezone FROM shifts WHERE id = $1', [id])
      if (r.rows.length === 0) return res.status(404).json({ error: 'Not found' })
      const row = r.rows[0]
      return res.json({ id: row.id, name: row.name, startTime: row.start_time, endTime: row.end_time, clientId: row.client_id, timezone: row.timezone || 'UTC' })
    }
    params.push(id)
    await query(`UPDATE shifts SET ${updates.join(', ')} WHERE id = $${i}`, params)
    const r = await query('SELECT id, name, start_time, end_time, client_id, timezone FROM shifts WHERE id = $1', [id])
    if (r.rows.length === 0) return res.status(404).json({ error: 'Not found' })
    const row = r.rows[0]
    res.json({ id: row.id, name: row.name, startTime: row.start_time, endTime: row.end_time, clientId: row.client_id, timezone: row.timezone || 'UTC' })
  } catch (err) {
    console.error('Admin update shift error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/admin/shifts/:id
router.delete('/shifts/:id', async (req, res) => {
  try {
    const { id } = req.params
    const result = await query('DELETE FROM shifts WHERE id = $1 RETURNING id', [id])
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' })
    res.status(204).send()
  } catch (err) {
    console.error('Admin delete shift error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/admin/schedule?client_id=&from=YYYY-MM-DD&to=YYYY-MM-DD
// Use a.date::text so we return calendar date YYYY-MM-DD without timezone shift.
router.get('/schedule', async (req, res) => {
  try {
    const { client_id, from, to } = req.query
    if (!client_id) return res.status(400).json({ error: 'Bad request', message: 'client_id is required' })
    const fromDate = from || new Date().toISOString().slice(0, 10)
    const toDate = to || fromDate
    const result = await query(
      `SELECT a.id, a.client_id, a.user_id, a.shift_id, a.date::text AS date_str,
              a.override_start_time, a.override_end_time,
              u.name AS user_name, s.name AS shift_name,
              COALESCE(a.override_start_time, s.start_time) AS shift_start,
              COALESCE(a.override_end_time, s.end_time) AS shift_end
       FROM schedule_assignments a
       JOIN users u ON u.id = a.user_id
       JOIN shifts s ON s.id = a.shift_id
       WHERE a.client_id = $1 AND a.date >= $2::date AND a.date <= $3::date
       ORDER BY a.date, u.name`,
      [client_id, fromDate, toDate]
    )
    res.json(result.rows.map((r) => ({
      id: r.id,
      clientId: r.client_id,
      userId: r.user_id,
      userName: r.user_name,
      shiftId: r.shift_id,
      shiftName: r.shift_name,
      shiftStart: r.shift_start,
      shiftEnd: r.shift_end,
      overrideStart: r.override_start_time,
      overrideEnd: r.override_end_time,
      date: r.date_str ? r.date_str.slice(0, 10) : null,
    })))
  } catch (err) {
    console.error('Admin list schedule error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/admin/schedule
router.post('/schedule', async (req, res) => {
  try {
    const { clientId, userId, shiftId, date, overrideStartTime, overrideEndTime } = req.body
    if (!clientId || !userId || !shiftId || !date) {
      return res.status(400).json({ error: 'Bad request', message: 'clientId, userId, shiftId, date are required' })
    }
    const hasStartOverride = overrideStartTime != null && String(overrideStartTime).trim() !== ''
    const hasEndOverride = overrideEndTime != null && String(overrideEndTime).trim() !== ''
    if (hasStartOverride !== hasEndOverride) {
      return res.status(400).json({ error: 'Bad request', message: 'Provide both overrideStartTime and overrideEndTime or leave both empty' })
    }
    const startOverride = hasStartOverride ? String(overrideStartTime).slice(0, 5) : null
    const endOverride = hasEndOverride ? String(overrideEndTime).slice(0, 5) : null
    
    // Fetch existing assignment to check if it's an update
    const checkExisting = await query(
      `SELECT id FROM schedule_assignments WHERE client_id = $1 AND user_id = $2 AND date = $3::date`,
      [clientId, userId, date]
    )
    const isUpdate = checkExisting.rows.length > 0

    const result = await query(
      `INSERT INTO schedule_assignments (client_id, user_id, shift_id, date, override_start_time, override_end_time)
       VALUES ($1, $2, $3, $4::date, $5::time, $6::time)
       ON CONFLICT (client_id, user_id, date) DO UPDATE SET
         shift_id = EXCLUDED.shift_id,
         override_start_time = EXCLUDED.override_start_time,
         override_end_time = EXCLUDED.override_end_time
       RETURNING id, client_id, user_id, shift_id, date::text AS date_str, override_start_time, override_end_time`,
      [clientId, userId, shiftId, date, startOverride, endOverride]
    )
    const r = result.rows[0]
    
    // Fetch details for notification
    const detailsRes = await query(
      `SELECT u.name AS user_name, c.name AS client_name, s.name AS shift_name, s.start_time, s.end_time
       FROM users u, clients c, shifts s
       WHERE u.id = $1 AND c.id = $2 AND s.id = $3`,
      [userId, clientId, shiftId]
    )
    
    if (detailsRes.rows.length > 0) {
      const { user_name, client_name, shift_name, start_time, end_time } = detailsRes.rows[0]
      const timeDisplay = hasStartOverride 
        ? `${startOverride}-${endOverride}` 
        : `${start_time}-${end_time}`
      const title = isUpdate ? 'Schedule Updated' : 'New Shift Assigned'
      const message = `${shift_name} shift at ${client_name} on ${date} (${timeDisplay})`
      
      await createNotification(
        userId,
        isUpdate ? 'schedule_updated' : 'schedule_assigned',
        title,
        message,
        {
          clientId,
          shiftId,
          date,
          hasOverride: hasStartOverride,
          overrideStart: startOverride,
          overrideEnd: endOverride,
        }
      )
    }
    
    res.status(201).json({
      id: r.id,
      clientId: r.client_id,
      userId: r.user_id,
      shiftId: r.shift_id,
      overrideStart: r.override_start_time,
      overrideEnd: r.override_end_time,
      date: r.date_str ? r.date_str.slice(0, 10) : null,
    })
  } catch (err) {
    console.error('Admin create schedule error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/admin/schedule/:id
router.delete('/schedule/:id', async (req, res) => {
  try {
    const { id } = req.params
    const result = await query('DELETE FROM schedule_assignments WHERE id = $1 RETURNING id', [id])
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' })
    res.status(204).send()
  } catch (err) {
    console.error('Admin delete schedule error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
