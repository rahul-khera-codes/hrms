import express from 'express'
import { query } from '../config/db.js'
import { authMiddleware, requireAdmin } from '../middleware/auth.js'

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
  const regularHours = (row.regular_minutes ?? 0) / 60
  const overtimeHours = (row.overtime_minutes ?? 0) / 60
  const nightHours = (row.night_minutes ?? 0) / 60
  const date = row.date ?? (clockIn ? new Date(clockIn).toISOString().slice(0, 10) : '')
  return {
    id: row.id,
    employeeId: row.user_id,
    employeeName: row.user_name ?? '',
    date,
    clockIn: clockIn || null,
    clockOut: clockOut || null,
    regularHours: Math.round(regularHours * 10) / 10,
    overtimeHours: Math.round(overtimeHours * 10) / 10,
    nightHours: Math.round(nightHours * 10) / 10,
    status,
  }
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
       WHERE (s.clock_in AT TIME ZONE 'UTC')::date = $1::date`,
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
    if (statusFilter === 'present') {
      records = records.filter((r) => r.status === 'present')
    }
    if (statusFilter === 'active') {
      records = records.filter((r) => r.status === 'active')
    }
    res.json(records)
  } catch (err) {
    console.error('Admin attendance list error:', err)
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
    const employees = await query(
      `SELECT id, name, salary_type, base_salary FROM users WHERE role = 'employee' ORDER BY name`
    )
    const payroll = []
    let totalRegularPay = 0, totalOt35Pay = 0, totalOt100Pay = 0, totalNightPay = 0
    let totalRegularHours = 0, totalOt35Hours = 0, totalOt100Hours = 0, totalNightHours = 0
    for (const emp of employees.rows) {
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
      }))
      const { regularMinutes, ot35Minutes, ot100Minutes } = computePayrollBuckets(sessions)
      const nightMinutes = sessions.reduce((sum, s) => sum + (s.night_minutes || 0), 0)
      const regularHours = Math.round((regularMinutes / 60) * 10) / 10
      const ot35Hours = Math.round((ot35Minutes / 60) * 10) / 10
      const ot100Hours = Math.round((ot100Minutes / 60) * 10) / 10
      const nightHours = Math.round((nightMinutes / 60) * 10) / 10
      const totalHours = regularHours + ot35Hours + ot100Hours + nightHours
      const rate = getHourlyRate(emp.salary_type, emp.base_salary, settings.workingDaysPerMonth, settings.hoursPerDay)
      const regularPay = regularHours * rate
      const ot35Pay = ot35Hours * rate * settings.otMultiplier
      const ot100Pay = ot100Hours * rate * OT_100_MULTIPLIER
      const nightPay = nightHours * rate * settings.nightMultiplier
      const totalPay = regularPay + ot35Pay + ot100Pay + nightPay
      totalRegularPay += regularPay
      totalOt35Pay += ot35Pay
      totalOt100Pay += ot100Pay
      totalNightPay += nightPay
      totalRegularHours += regularHours
      totalOt35Hours += ot35Hours
      totalOt100Hours += ot100Hours
      totalNightHours += nightHours
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
        totalPay: Math.round(totalPay * 100) / 100,
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
        totalRegularPay: Math.round(totalRegularPay * 100) / 100,
        totalOt35Pay: Math.round(totalOt35Pay * 100) / 100,
        totalOt100Pay: Math.round(totalOt100Pay * 100) / 100,
        totalNightPay: Math.round(totalNightPay * 100) / 100,
        totalPay: Math.round((totalRegularPay + totalOt35Pay + totalOt100Pay + totalNightPay) * 100) / 100,
      },
    })
  } catch (err) {
    console.error('Admin payroll error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/admin/employees/:id
router.patch('/employees/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { salaryType, baseSalary } = req.body
    const emp = await query(
      "SELECT id FROM users WHERE id = $1 AND role = 'employee'",
      [id]
    )
    if (emp.rows.length === 0) {
      return res.status(404).json({ error: 'Not found', message: 'Employee not found' })
    }
    const st = salaryType === 'monthly' ? 'monthly' : 'hourly'
    const sal = baseSalary != null ? Math.max(0, Number(baseSalary)) : null
    if (sal === null) {
      await query('UPDATE users SET salary_type = $1, updated_at = NOW() WHERE id = $2', [st, id])
    } else {
      await query('UPDATE users SET salary_type = $1, base_salary = $2, updated_at = NOW() WHERE id = $3', [st, sal, id])
    }
    const updated = await query('SELECT id, name, salary_type, base_salary FROM users WHERE id = $1', [id])
    const row = updated.rows[0]
    res.json({
      employeeId: row.id,
      employeeName: row.name,
      salaryType: row.salary_type,
      baseSalary: row.base_salary != null ? Number(row.base_salary) : 0,
    })
  } catch (err) {
    console.error('Update employee salary error:', err)
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

export default router
