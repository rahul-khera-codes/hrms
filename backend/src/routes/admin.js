import express from 'express'
import bcrypt from 'bcryptjs'
import { query } from '../config/db.js'
import { authMiddleware, requireAdmin } from '../middleware/auth.js'
import { getSettings } from '../lib/payrollSettings.js'
import { buildPayrollEmployeeRow, listDateStrings } from '../lib/payrollEmployeeRow.js'
import { computeLeavePaySnapshot, countInclusiveCalendarDays } from '../lib/leavePayComputation.js'
import { renderPayrollSlipPdf } from '../lib/renderPayrollSlipPdf.js'
import { createNotification } from './notifications.js'

const router = express.Router()

/**
 * Map attendance row to full AttendanceRecord with all client-required fields.
 * Dynamically calculates hour classification from session data + pay type + holiday.
 */
function toAttendanceRecord(row) {
  const clockIn = row.first_clock_in || row.clock_in
  const clockOut = row.last_clock_out || row.clock_out
  const hasActive = row.has_active_session
  const regularMinutes = Number(row.regular_minutes ?? 0)
  const overtimeMinutes = Number(row.overtime_minutes ?? 0)
  const nightMinutes = Number(row.night_minutes ?? 0)
  const preciseTotalMinutes = Number(row.precise_total_minutes || 0)

  // Backward-compatible legacy hours
  let regularHours = regularMinutes / 60
  let overtimeHours = overtimeMinutes / 60
  let nightHours = nightMinutes / 60

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

  // Use dynamic shift lookup (from schedule_assignments JOIN) or stored values
  const shiftStart = row.dynamic_shift_start || row.shift_start || null
  const shiftEnd = row.dynamic_shift_end || row.shift_end || null

  // Auto-detect status from shift vs clock comparison
  let autoStatus = hasActive ? 'active' : 'present'
  if (!hasActive && clockIn && shiftStart) {
    const clockInMs = new Date(clockIn).getTime()
    const shiftStartMs = new Date(shiftStart).getTime()
    const shiftEndMs = shiftEnd ? new Date(shiftEnd).getTime() : null
    const clockOutMs = clockOut ? new Date(clockOut).getTime() : null
    const lateThreshold = 5 * 60 * 1000 // 5 minutes
    const isLate = clockInMs - shiftStartMs > lateThreshold
    const isEarlyOut = clockOutMs && shiftEndMs && (shiftEndMs - clockOutMs > lateThreshold)
    if (isLate && isEarlyOut) autoStatus = 'late_in_early_out'
    else if (isLate) autoStatus = 'late_in'
    else if (isEarlyOut) autoStatus = 'early_out'
  }
  if (!clockIn && !hasActive) autoStatus = 'absent'

  const status = row.status_override || autoStatus

  // --- SCH: Scheduled hours (ShiftEnd - ShiftStart) ---
  let scheduledHours = 0
  if (shiftStart && shiftEnd) {
    scheduledHours = (new Date(shiftEnd).getTime() - new Date(shiftStart).getTime()) / 3600000
    if (scheduledHours < 0) scheduledHours += 24 // overnight shift
  } else if (Number(row.scheduled_minutes ?? 0) > 0) {
    scheduledHours = Number(row.scheduled_minutes) / 60
  }

  // --- SDBT: Scheduled Deductible Break Time ---
  // IFS(SCH<4, 0, SCH<8, 0.5, SCH<12, 1, SCH>=12, 1.5)
  let sdbtHours = 0
  if (scheduledHours >= 12) sdbtHours = 1.5
  else if (scheduledHours >= 8) sdbtHours = 1
  else if (scheduledHours >= 4) sdbtHours = 0.5
  // else sdbtHours = 0 (SCH < 4)

  // --- ACT: Actual hours (ClockOut - ClockIn) ---
  let actualHours = 0
  if (clockIn && clockOut) {
    actualHours = (new Date(clockOut).getTime() - new Date(clockIn).getTime()) / 3600000
  } else if (Number(row.actual_minutes ?? 0) > 0) {
    actualHours = Number(row.actual_minutes) / 60
  }

  // --- ADBT: Actual Deductible Break Time ---
  // IFS(ACT<4, 0, ACT<8, 0.5, ACT<12, 1, ACT>=12, 1.5)
  let adbtHours = 0
  if (actualHours >= 12) adbtHours = 1.5
  else if (actualHours >= 8) adbtHours = 1
  else if (actualHours >= 4) adbtHours = 0.5
  // else adbtHours = 0 (ACT < 4)

  // --- Pay type driven classification ---
  const payType = row.pay_type || 'Regular'

  // --- REG: IF(Pay="Holiday", SCH-SDBT, IF(Pay="Regular", ACT-ADBT, 0)) ---
  let regHours = 0
  if (payType === 'Holiday') {
    regHours = Math.max(0, scheduledHours - sdbtHours)
  } else if (payType === 'Regular') {
    regHours = Math.max(0, actualHours - adbtHours)
  }

  // --- N15%: Night differential ---
  let n15Hours = 0
  if (payType !== 'DNP' && clockIn && clockOut) {
    const ciDate = new Date(clockIn)
    const coDate = new Date(clockOut)
    // Time-of-day as fraction of a day (0..1)
    const clockInTime = (ciDate.getUTCHours() * 3600 + ciDate.getUTCMinutes() * 60 + ciDate.getUTCSeconds()) / 86400
    const clockOutTime = (coDate.getUTCHours() * 3600 + coDate.getUTCMinutes() * 60 + coDate.getUTCSeconds()) / 86400

    const NINE_PM = 21 / 24   // 0.875
    const SEVEN_AM = 7 / 24   // ~0.291667

    let nightRawHours = 0
    if (clockOutTime >= NINE_PM && clockOutTime < 1) {
      // ClockOut between 9PM and midnight
      nightRawHours = (clockOutTime - NINE_PM) * 24
    } else if (clockInTime >= NINE_PM && clockInTime < 1) {
      // ClockIn between 9PM and midnight (ClockOut past midnight)
      nightRawHours = (coDate.getTime() - ciDate.getTime()) / 3600000
    } else if (clockOutTime >= 0 && clockOutTime <= SEVEN_AM) {
      // ClockOut between midnight and 7AM
      nightRawHours = (coDate.getTime() - ciDate.getTime()) / 3600000
    } else if (clockInTime >= 0 && clockInTime <= SEVEN_AM) {
      // ClockIn between midnight and 7AM
      nightRawHours = (SEVEN_AM - clockInTime) * 24
    }
    // else nightRawHours = 0

    if (nightRawHours >= 3) {
      // Entire shift becomes night differential
      n15Hours = Math.max(0, actualHours - adbtHours)
    } else {
      n15Hours = Math.max(0, nightRawHours)
    }
  }

  // --- X35%: IF(Pay="X35%", ACT-ADBT, 0) ---
  let x35Hours = 0
  if (payType === 'X35%') {
    x35Hours = Math.max(0, actualHours - adbtHours)
  }

  // --- X100%: IF(Pay="X100%", ACT-ADBT, 0) ---
  let x100Hours = 0
  if (payType === 'X100%') {
    x100Hours = Math.max(0, actualHours - adbtHours)
  }

  // --- HDY: IF(Pay="Holiday", ACT-ADBT, 0) ---
  let hdyHours = 0
  if (payType === 'Holiday') {
    hdyHours = Math.max(0, actualHours - adbtHours)
  }

  // Backward-compatible dbtHours (use adbt for legacy consumers)
  const dbtHours = adbtHours

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
    reportsToId: row.reports_to_override || row.reports_to_id || null,
    task: row.task || null,
    status,
    payType,
    billType: row.bill_type || 'Regular',
    scheduledHours: r2(scheduledHours),
    sdbtHours: r2(sdbtHours),
    actualHours: r2(actualHours),
    adbtHours: r2(adbtHours),
    regHours: r2(regHours),
    n15Hours: r2(n15Hours),
    x35Hours: r2(x35Hours),
    x100Hours: r2(x100Hours),
    hdyHours: r2(hdyHours),
    comments: row.comments || '',
    accountName: row.account_name || null,
    accountId: row.account_override || row.account_id || null,
    employeeCmid: row.employee_cmid != null ? Number(row.employee_cmid) : null,
    isLocked: row.is_locked === true,
    // Backward-compatible fields
    regularHours,
    overtimeHours,
    nightHours,
    dbtHours: r2(dbtHours),
    holHours: r2(hdyHours),
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
// Returns one row per employee per day (aggregated) with all attendance fields.
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
        BOOL_OR(s.clock_out IS NULL) AS has_active_session,
        MIN(s.shift_start) AS shift_start,
        MAX(s.shift_end) AS shift_end,
        MAX(COALESCE(s.location, e.location)) AS location,
        MAX(COALESCE(s.stage, 'Production')) AS stage,
        MAX(s.task) AS task,
        MAX(s.status_override) AS status_override,
        MAX(s.pay_type) AS pay_type,
        MAX(s.bill_type) AS bill_type,
        STRING_AGG(DISTINCT s.comments, '; ') FILTER (WHERE s.comments IS NOT NULL AND s.comments != '') AS comments,
        COALESCE(SUM(s.scheduled_minutes), 0)::int AS scheduled_minutes,
        COALESCE(SUM(s.actual_minutes), 0)::int AS actual_minutes,
        MAX(s.dbt_minutes) AS dbt_minutes,
        MAX(s.holiday_name) AS holiday_name,
        COALESCE(SUM(s.reg_hours), 0) AS reg_hours,
        COALESCE(SUM(s.n15_hours), 0) AS n15_hours,
        COALESCE(SUM(s.x35_hours), 0) AS x35_hours,
        COALESCE(SUM(s.x100_hours), 0) AS x100_hours,
        COALESCE(SUM(s.hol_hours), 0) AS hol_hours,
        MAX(COALESCE(mgr_ov.name, mgr.name)) AS reports_to_name,
        MAX(COALESCE(c_ov.name, c.name)) AS account_name,
        MAX(e.cmid) AS employee_cmid,
        BOOL_OR(s.is_locked) AS is_locked,
        MAX(s.reports_to_override::text)::uuid AS reports_to_override,
        MAX(s.account_override::text)::uuid AS account_override,
        (ARRAY_AGG(s.id ORDER BY s.clock_in DESC))[1] AS session_id,
        -- Dynamic shift lookup from schedule_assignments (backfills null shift_start/end)
        -- Force UTC so comparison with clock_in (stored as UTC) is timezone-correct
        MIN(
          (((s.clock_in AT TIME ZONE 'UTC')::date || 'T' || COALESCE(sa_shift.override_start, sh.start_time)::text)::timestamp AT TIME ZONE 'UTC')
        ) FILTER (WHERE sh.start_time IS NOT NULL) AS dynamic_shift_start,
        MAX(
          (((s.clock_in AT TIME ZONE 'UTC')::date || 'T' || COALESCE(sa_shift.override_end, sh.end_time)::text)::timestamp AT TIME ZONE 'UTC')
        ) FILTER (WHERE sh.end_time IS NOT NULL) AS dynamic_shift_end,
        -- Dynamic holiday lookup from holidays table
        MAX(h.name) AS dynamic_holiday_name
      FROM sessions s
      JOIN users u ON u.id = s.user_id AND u.role = 'employee'
      LEFT JOIN employees e ON e.user_id = u.id
      LEFT JOIN users mgr ON mgr.id = e.reports_to
      LEFT JOIN users mgr_ov ON mgr_ov.id = s.reports_to_override
      LEFT JOIN clients c ON c.id = e.primary_client_id
      LEFT JOIN clients c_ov ON c_ov.id = s.account_override
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
      return toAttendanceRecord({ ...row, id: row.session_id || `${row.user_id}-${dateStr}`, date: dateStr })
    })

    const today = new Date().toISOString().slice(0, 10)
    const existingDates = records.map((r) => r.date).filter(Boolean).sort()
    const boundFrom = from || existingDates[existingDates.length - 1] || today
    const boundTo = to || existingDates[0] || today
    const leaveFrom = boundFrom <= boundTo ? boundFrom : boundTo
    const leaveTo = boundFrom <= boundTo ? boundTo : boundFrom

    const leaveParams = [leaveFrom, leaveTo]
    let leaveSql = `SELECT lr.id, lr.user_id, u.name AS user_name,
              lr.start_date::text AS start_date_str,
              lr.end_date::text AS end_date_str
       FROM leave_requests lr
       JOIN users u ON u.id = lr.user_id
       WHERE u.role = 'employee'
         AND lr.status = 'approved'
         AND lr.start_date <= $2::date
         AND lr.end_date >= $1::date`
    if (search && String(search).trim()) {
      leaveParams.push(`%${String(search).trim()}%`)
      leaveSql += ` AND u.name ILIKE $${leaveParams.length}`
    }
    leaveSql += ` ORDER BY u.name, lr.start_date`
    const approvedLeaves = await query(leaveSql, leaveParams)

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
      let absentSql = "SELECT id, name FROM users WHERE role = 'employee'"
      const absentParams = []
      if (search && String(search).trim()) {
        absentParams.push(`%${String(search).trim()}%`)
        absentSql += ` AND name ILIKE $${absentParams.length}`
      }
      absentSql += ' ORDER BY name'
      const employeesResult = await query(absentSql, absentParams)
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

// UUID validator — prevents 22P02 errors when frontend passes synthetic IDs
// (e.g., "leave-<uuid>" for leave rows shown in the attendance grid).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// PATCH /api/admin/attendance/:sessionId — admin edits attendance record fields
router.patch('/attendance/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params
    if (!UUID_RE.test(sessionId)) {
      return res.status(400).json({ error: 'Bad request', message: 'Session id must be a valid UUID (cannot edit synthetic rows like leave entries).' })
    }
    const {
      statusOverride, payType, billType, task, stage,
      location, comments, shiftStart, shiftEnd,
      // 14APR2026 feedback: fully editable attendance
      clockIn, clockOut, reportsToOverride, accountOverride, isLocked,
      // unlock helper (admin forces override even if locked)
      force,
    } = req.body

    const session = await query('SELECT id, is_locked FROM sessions WHERE id = $1', [sessionId])
    if (!session.rows.length) {
      return res.status(404).json({ error: 'Not found', message: 'Session not found' })
    }

    // If the record is locked, only allow changes to the is_locked field itself
    // (so admin can unlock), unless ?force=true is supplied.
    const wasLocked = session.rows[0].is_locked === true
    const onlyUnlocking = Object.keys(req.body).length === 1 && isLocked === false
    if (wasLocked && !onlyUnlocking && !force) {
      return res.status(409).json({ error: 'Locked', message: 'This record is locked. Unlock it first to edit.' })
    }

    const updates = []
    const params = []
    let i = 1

    if (statusOverride !== undefined) { updates.push(`status_override = $${i++}`); params.push(statusOverride || null) }
    if (payType !== undefined) { updates.push(`pay_type = $${i++}`); params.push(payType || 'Regular') }
    if (billType !== undefined) { updates.push(`bill_type = $${i++}`); params.push(billType || 'Regular') }
    if (task !== undefined) { updates.push(`task = $${i++}`); params.push(task || null) }
    if (stage !== undefined) { updates.push(`stage = $${i++}`); params.push(stage || null) }
    if (location !== undefined) { updates.push(`location = $${i++}`); params.push(location || null) }
    if (comments !== undefined) { updates.push(`comments = $${i++}`); params.push(comments || null) }
    if (shiftStart !== undefined) { updates.push(`shift_start = $${i++}`); params.push(shiftStart || null) }
    if (shiftEnd !== undefined) { updates.push(`shift_end = $${i++}`); params.push(shiftEnd || null) }
    if (clockIn !== undefined) { updates.push(`clock_in = $${i++}`); params.push(clockIn || null) }
    if (clockOut !== undefined) { updates.push(`clock_out = $${i++}`); params.push(clockOut || null) }
    if (reportsToOverride !== undefined) { updates.push(`reports_to_override = $${i++}`); params.push(reportsToOverride || null) }
    if (accountOverride !== undefined) { updates.push(`account_override = $${i++}`); params.push(accountOverride || null) }
    if (isLocked !== undefined) { updates.push(`is_locked = $${i++}`); params.push(!!isLocked) }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Bad request', message: 'No fields to update' })
    }

    params.push(sessionId)
    await query(`UPDATE sessions SET ${updates.join(', ')} WHERE id = $${i}`, params)

    // Re-fetch the updated record with joins
    const updated = await query(
      `SELECT s.id AS session_id, u.id AS user_id, u.name AS user_name,
              (s.clock_in AT TIME ZONE 'UTC')::date AS date,
              s.clock_in AS first_clock_in, s.clock_out AS last_clock_out,
              COALESCE(s.regular_minutes, 0)::int AS regular_minutes,
              COALESCE(s.overtime_minutes, 0)::int AS overtime_minutes,
              COALESCE(s.night_minutes, 0)::int AS night_minutes,
              CASE WHEN s.clock_out IS NOT NULL THEN EXTRACT(EPOCH FROM (s.clock_out - s.clock_in)) / 60.0 ELSE 0 END AS precise_total_minutes,
              (s.clock_out IS NULL) AS has_active_session,
              s.shift_start, s.shift_end,
              COALESCE(s.location, e.location) AS location,
              COALESCE(s.stage, 'Production') AS stage,
              s.task, s.status_override, s.pay_type, s.bill_type, s.comments,
              s.scheduled_minutes, s.actual_minutes, s.dbt_minutes, s.holiday_name,
              s.reg_hours, s.n15_hours, s.x35_hours, s.x100_hours, s.hol_hours,
              s.is_locked,
              s.reports_to_override, s.account_override,
              COALESCE(mgr_ov.name, mgr.name) AS reports_to_name,
              COALESCE(c_ov.name, c.name) AS account_name,
              e.cmid AS employee_cmid
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN employees e ON e.user_id = u.id
       LEFT JOIN users mgr ON mgr.id = e.reports_to
       LEFT JOIN users mgr_ov ON mgr_ov.id = s.reports_to_override
       LEFT JOIN clients c ON c.id = e.primary_client_id
       LEFT JOIN clients c_ov ON c_ov.id = s.account_override
       WHERE s.id = $1`,
      [sessionId]
    )
    if (!updated.rows.length) {
      return res.status(404).json({ error: 'Not found' })
    }
    const row = updated.rows[0]
    const dateStr = row.date ? new Date(row.date).toISOString().slice(0, 10) : ''
    res.json(toAttendanceRecord({ ...row, id: row.session_id, date: dateStr }))
  } catch (err) {
    console.error('Admin update attendance error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/admin/attendance — admin manually creates an attendance record (14APR2026 feedback)
// Used by supervisors when an employee didn't clock in/out through the app.
router.post('/attendance', async (req, res) => {
  try {
    const {
      employeeId, clockIn, clockOut, shiftStart, shiftEnd,
      statusOverride, payType, billType, task, stage, comments,
      reportsToOverride, accountOverride, isLocked,
    } = req.body

    if (!employeeId) {
      return res.status(400).json({ error: 'Bad request', message: 'employeeId is required' })
    }
    if (!clockIn) {
      return res.status(400).json({ error: 'Bad request', message: 'clockIn is required' })
    }

    const user = await query(`SELECT id FROM users WHERE id = $1 AND role = 'employee'`, [employeeId])
    if (!user.rows.length) {
      return res.status(404).json({ error: 'Not found', message: 'Employee not found' })
    }

    const inserted = await query(
      `INSERT INTO sessions (
         user_id, clock_in, clock_out, shift_start, shift_end,
         status_override, pay_type, bill_type, task, stage, comments,
         reports_to_override, account_override, is_locked, is_manual
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, TRUE)
       RETURNING id`,
      [
        employeeId,
        clockIn,
        clockOut || null,
        shiftStart || null,
        shiftEnd || null,
        statusOverride || null,
        payType || 'Regular',
        billType || 'Regular',
        task || null,
        stage || 'Production',
        comments || null,
        reportsToOverride || null,
        accountOverride || null,
        !!isLocked,
      ]
    )
    const newId = inserted.rows[0].id

    // Re-fetch with joins (same as PATCH endpoint)
    const full = await query(
      `SELECT s.id AS session_id, u.id AS user_id, u.name AS user_name,
              (s.clock_in AT TIME ZONE 'UTC')::date AS date,
              s.clock_in AS first_clock_in, s.clock_out AS last_clock_out,
              COALESCE(s.regular_minutes, 0)::int AS regular_minutes,
              COALESCE(s.overtime_minutes, 0)::int AS overtime_minutes,
              COALESCE(s.night_minutes, 0)::int AS night_minutes,
              CASE WHEN s.clock_out IS NOT NULL THEN EXTRACT(EPOCH FROM (s.clock_out - s.clock_in)) / 60.0 ELSE 0 END AS precise_total_minutes,
              (s.clock_out IS NULL) AS has_active_session,
              s.shift_start, s.shift_end,
              COALESCE(s.location, e.location) AS location,
              COALESCE(s.stage, 'Production') AS stage,
              s.task, s.status_override, s.pay_type, s.bill_type, s.comments,
              s.scheduled_minutes, s.actual_minutes, s.dbt_minutes, s.holiday_name,
              s.reg_hours, s.n15_hours, s.x35_hours, s.x100_hours, s.hol_hours,
              s.is_locked, s.reports_to_override, s.account_override,
              COALESCE(mgr_ov.name, mgr.name) AS reports_to_name,
              COALESCE(c_ov.name, c.name) AS account_name,
              e.cmid AS employee_cmid
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN employees e ON e.user_id = u.id
       LEFT JOIN users mgr ON mgr.id = e.reports_to
       LEFT JOIN users mgr_ov ON mgr_ov.id = s.reports_to_override
       LEFT JOIN clients c ON c.id = e.primary_client_id
       LEFT JOIN clients c_ov ON c_ov.id = s.account_override
       WHERE s.id = $1`,
      [newId]
    )
    const row = full.rows[0]
    const dateStr = row.date ? new Date(row.date).toISOString().slice(0, 10) : ''
    res.status(201).json(toAttendanceRecord({ ...row, id: row.session_id, date: dateStr }))
  } catch (err) {
    console.error('Admin create attendance error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/admin/leave-requests — admin creates leave on behalf of employee
router.post('/leave-requests', async (req, res) => {
  try {
    const {
      employeeId, leaveType, leaveCategory, calculationType,
      payableDays, hourlyRate, dailyHours, monthlyRate,
      associateDaysOff, startDate, endDate, returnDate,
      startTime, endTime, returnTime,
      assetDeactivation, payrollCycleCode, reason
    } = req.body

    if (!employeeId || !startDate || !endDate) {
      return res.status(400).json({ error: 'Bad request', message: 'employeeId, startDate and endDate are required' })
    }

    const type = leaveType === 'paid' ? 'paid' : 'unpaid'
    const category = leaveCategory || null
    const calcType = calculationType && ['non_payable', 'hourly_salary', 'monthly_salary'].includes(calculationType)
      ? calculationType : 'non_payable'

    // Compute pay snapshot
    const empResult = await query(
      `SELECT COALESCE(e.salary_type, u.salary_type) AS salary_type,
              COALESCE(e.base_salary, u.base_salary) AS base_salary
       FROM users u LEFT JOIN employees e ON e.user_id = u.id WHERE u.id = $1`,
      [employeeId]
    )
    const emp = empResult.rows[0]
    const settings = await getSettings()

    let dailySalary = 0
    let payableAmount = 0
    const pd = Math.max(0, Number(payableDays) || 0)

    if (calcType === 'hourly_salary') {
      const hr = Number(hourlyRate) || 0
      const dh = Number(dailyHours) || 0
      dailySalary = hr * dh
      payableAmount = Math.round(dailySalary * pd * 100) / 100
    } else if (calcType === 'monthly_salary') {
      const mr = Number(monthlyRate) || 0
      dailySalary = mr / (settings.workingDaysPerMonth || 23.83)
      payableAmount = Math.round(dailySalary * pd * 100) / 100
    }
    dailySalary = Math.round(dailySalary * 10000) / 10000

    // Determine hourly rate for snapshot
    const salaryType = emp?.salary_type === 'monthly' ? 'monthly' : 'hourly'
    const baseSalary = Number(emp?.base_salary) || 0
    const snapshotHourlyRate = salaryType === 'monthly'
      ? baseSalary / (settings.workingDaysPerMonth || 23.83) / (settings.hoursPerDay || 8)
      : baseSalary

    const assocStr = Array.isArray(associateDaysOff)
      ? associateDaysOff.map(d => String(d).trim()).filter(Boolean).join(', ') || null
      : (associateDaysOff || null)
    const assetStr = Array.isArray(assetDeactivation)
      ? assetDeactivation.filter(Boolean).join(', ') || null
      : (assetDeactivation || null)

    const result = await query(
      `INSERT INTO leave_requests (
         user_id, leave_type, start_date, end_date, reason, status,
         leave_category, leave_calculation_type, leave_associate_days_off,
         return_date, start_time, end_time, return_time,
         leave_payable_days, leave_hourly_rate, leave_daily_hours, leave_daily_salary, leave_payable_amount,
         hourly_rate_input, daily_hours_input, monthly_rate_input,
         asset_deactivation, payroll_cycle_code,
         reviewed_by, reviewed_at
       ) VALUES (
         $1, $2, $3::date, $4::date, $5, 'approved',
         $6, $7, $8,
         $9::date, $10::time, $11::time, $12::time,
         $13, $14, $15, $16, $17,
         $18, $19, $20,
         $21, $22,
         $23, NOW()
       )
       RETURNING id, leave_type, start_date::text AS start_date_str, end_date::text AS end_date_str,
         reason, status, created_at, leave_category, leave_calculation_type, leave_associate_days_off,
         return_date::text AS return_date_str, start_time::text, end_time::text, return_time::text,
         leave_payable_days, leave_payable_amount, leave_daily_salary,
         hourly_rate_input, daily_hours_input, monthly_rate_input,
         asset_deactivation, payroll_cycle_code`,
      [
        employeeId, type, startDate, endDate, reason ? String(reason).trim() : null,
        category, calcType, assocStr,
        returnDate || null, startTime || null, endTime || null, returnTime || null,
        pd, Math.round(snapshotHourlyRate * 10000) / 10000, Number(dailyHours) || settings.hoursPerDay, dailySalary, payableAmount,
        Number(hourlyRate) || null, Number(dailyHours) || null, Number(monthlyRate) || null,
        assetStr, payrollCycleCode || null,
        req.user.id
      ]
    )
    const r = result.rows[0]

    // Send notification to employee
    try {
      await query(
        `INSERT INTO notifications (user_id, type, title, message, data) VALUES ($1, $2, $3, $4, $5)`,
        [employeeId, 'leave_request_approved', 'Leave Created',
         `A ${type} leave has been created for you from ${startDate} to ${endDate}.`,
         JSON.stringify({ leaveRequestId: r.id, leaveType: type, startDate, endDate })]
      )
    } catch(_) {}

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
      payableDays: r.leave_payable_days != null ? Number(r.leave_payable_days) : null,
      payableAmount: r.leave_payable_amount != null ? Number(r.leave_payable_amount) : null,
      dailySalary: r.leave_daily_salary != null ? Number(r.leave_daily_salary) : null,
      hourlyRateInput: r.hourly_rate_input != null ? Number(r.hourly_rate_input) : null,
      dailyHoursInput: r.daily_hours_input != null ? Number(r.daily_hours_input) : null,
      monthlyRateInput: r.monthly_rate_input != null ? Number(r.monthly_rate_input) : null,
      assetDeactivation: r.asset_deactivation || null,
      payrollCycleCode: r.payroll_cycle_code || null,
    })
  } catch (err) {
    console.error('Admin create leave request error:', err)
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
              lr.reviewed_note, lr.reviewed_at, lr.created_at,
              lr.leave_calculation_type, lr.leave_associate_days_off,
              lr.leave_payable_days, lr.leave_payable_amount,
              lr.leave_category,
              lr.return_date::text AS return_date_str,
              lr.start_time::text, lr.end_time::text, lr.return_time::text,
              lr.hourly_rate_input, lr.daily_hours_input, lr.monthly_rate_input,
              lr.asset_deactivation, lr.payroll_cycle_code,
              lr.leave_daily_salary,
              lr.is_locked,
              e.cmid AS employee_cmid,
              c.name AS account_name,
              mgr.name AS reports_to_name
       FROM leave_requests lr
       JOIN users u ON u.id = lr.user_id
       LEFT JOIN users reviewer ON reviewer.id = lr.reviewed_by
       LEFT JOIN employees e ON e.user_id = lr.user_id
       LEFT JOIN users mgr ON mgr.id = e.reports_to
       LEFT JOIN clients c ON c.id = e.primary_client_id
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
      leaveCalculationType: r.leave_calculation_type || null,
      leaveAssociateDaysOff: r.leave_associate_days_off || null,
      leavePayableDays: r.leave_payable_days != null ? Number(r.leave_payable_days) : null,
      leavePayableAmount: r.leave_payable_amount != null ? Number(r.leave_payable_amount) : null,
      leaveCategory: r.leave_category || null,
      returnDate: r.return_date_str?.slice(0, 10) ?? null,
      startTime: r.start_time || null,
      endTime: r.end_time || null,
      returnTime: r.return_time || null,
      hourlyRateInput: r.hourly_rate_input != null ? Number(r.hourly_rate_input) : null,
      dailyHoursInput: r.daily_hours_input != null ? Number(r.daily_hours_input) : null,
      monthlyRateInput: r.monthly_rate_input != null ? Number(r.monthly_rate_input) : null,
      assetDeactivation: r.asset_deactivation || null,
      payrollCycleCode: r.payroll_cycle_code || null,
      dailySalary: r.leave_daily_salary != null ? Number(r.leave_daily_salary) : null,
      employeeCmid: r.employee_cmid != null ? Number(r.employee_cmid) : null,
      accountName: r.account_name || null,
      reportsTo: r.reports_to_name || null,
      isLocked: r.is_locked === true,
    })))
  } catch (err) {
    console.error('Admin list leave requests error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/admin/leave-requests/:id/review-context — leave + employee salary + settings (admin review modal)
// Works for any status; PATCH blocks edits only when the record is locked.
router.get('/leave-requests/:id/review-context', async (req, res) => {
  try {
    const { id } = req.params
    if (!UUID_RE.test(id)) {
      return res.status(400).json({ error: 'Bad request', message: 'Leave request id must be a valid UUID.' })
    }
    const lr = await query(
      `SELECT lr.id, lr.user_id, lr.leave_type, lr.status, lr.is_locked,
              lr.start_date::text AS start_date_str, lr.end_date::text AS end_date_str, lr.reason,
              lr.leave_category, lr.leave_calculation_type, lr.leave_associate_days_off,
              lr.leave_payable_days, lr.reviewed_note,
              lr.return_date::text AS return_date_str,
              lr.start_time::text, lr.end_time::text, lr.return_time::text
       FROM leave_requests lr
       WHERE lr.id = $1`,
      [id]
    )
    if (!lr.rows.length) {
      return res.status(404).json({ error: 'Not found', message: 'Leave request not found' })
    }
    const row = lr.rows[0]
    const empResult = await query(
      `SELECT u.name AS user_name,
              COALESCE(e.salary_type, u.salary_type) AS salary_type,
              COALESCE(e.base_salary, u.base_salary) AS base_salary
       FROM users u
       LEFT JOIN employees e ON e.user_id = u.id
       WHERE u.id = $1`,
      [row.user_id]
    )
    const emp = empResult.rows[0]
    const settings = await getSettings()
    const startDate = row.start_date_str?.slice(0, 10) ?? ''
    const endDate = row.end_date_str?.slice(0, 10) ?? ''
    const suggestedPayableDays = countInclusiveCalendarDays(startDate, endDate)
    const salaryType = emp?.salary_type === 'monthly' ? 'monthly' : 'hourly'
    const defaultCalculationType = salaryType === 'monthly' ? 'monthly_salary' : 'hourly_salary'

    res.json({
      leave: {
        id: row.id,
        employeeId: row.user_id,
        employeeName: emp?.user_name || '',
        leaveType: row.leave_type,
        startDate,
        endDate,
        reason: row.reason || '',
        status: row.status,
        isLocked: !!row.is_locked,
        reviewedNote: row.reviewed_note || '',
        payableDays: row.leave_payable_days != null ? Number(row.leave_payable_days) : null,
        leaveCategory: row.leave_category || null,
        calculationType: row.leave_calculation_type || null,
        associateDaysOff: row.leave_associate_days_off || null,
        returnDate: row.return_date_str?.slice(0, 10) ?? null,
        startTime: row.start_time || null,
        endTime: row.end_time || null,
        returnTime: row.return_time || null,
      },
      employee: {
        salaryType,
        baseSalary: Number(emp?.base_salary) || 0,
      },
      settings: {
        workingDaysPerMonth: settings.workingDaysPerMonth,
        hoursPerDay: settings.hoursPerDay,
      },
      suggestedPayableDays,
      defaultCalculationType,
    })
  } catch (err) {
    console.error('Admin leave review context error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PATCH /api/admin/leave-requests/:id
router.patch('/leave-requests/:id', async (req, res) => {
  try {
    const { id } = req.params
    if (!UUID_RE.test(id)) {
      return res.status(400).json({ error: 'Bad request', message: 'Leave request id must be a valid UUID.' })
    }
    const { status, reviewedNote, calculationType, associateDaysOff, payableDays, isLocked, force } = req.body

    // 14APR2026 feedback: lock toggle. Handle lock-only updates separately so they work on any record.
    const existing = await query(
      `SELECT lr.id, lr.user_id, lr.leave_type, lr.status, lr.is_locked,
              lr.start_date::text AS start_date_str, lr.end_date::text AS end_date_str, lr.reason
       FROM leave_requests lr
       WHERE lr.id = $1`,
      [id]
    )
    if (!existing.rows.length) {
      return res.status(404).json({ error: 'Not found', message: 'Leave request not found' })
    }
    const existingRow = existing.rows[0]

    // Lock-only update path (no status change)
    if (isLocked !== undefined && status === undefined) {
      const upd = await query(
        `UPDATE leave_requests SET is_locked = $1, updated_at = NOW() WHERE id = $2
         RETURNING id, user_id, leave_type, start_date::text AS start_date_str, end_date::text AS end_date_str,
                   reason, status, reviewed_note, reviewed_at, created_at,
                   leave_calculation_type, leave_associate_days_off, leave_payable_days, leave_payable_amount,
                   leave_category, return_date::text AS return_date_str, start_time::text, end_time::text, return_time::text, is_locked`,
        [!!isLocked, id]
      )
      return res.json(mapLeaveRowToJson(upd.rows[0]))
    }

    if (!['approved', 'rejected'].includes(String(status))) {
      return res.status(400).json({ error: 'Bad request', message: 'status must be approved or rejected' })
    }

    // Block edits on locked records unless caller explicitly forces
    if (existingRow.is_locked && !force) {
      return res.status(409).json({ error: 'Locked', message: 'This leave request is locked. Unlock it first to edit.' })
    }

    // Allow re-review of any non-locked record (approved → rejected, rejected → approved, or re-apply settings)
    const row = existingRow

    const noteVal = reviewedNote ? String(reviewedNote).trim() : null

    if (status === 'rejected') {
      const result = await query(
        `UPDATE leave_requests
         SET status = 'rejected',
             reviewed_by = $1,
             reviewed_note = $2,
             reviewed_at = NOW(),
             updated_at = NOW(),
             leave_calculation_type = NULL,
             leave_associate_days_off = NULL,
             leave_payable_days = NULL,
             leave_hourly_rate = NULL,
             leave_daily_hours = NULL,
             leave_daily_salary = NULL,
             leave_payable_amount = NULL
         WHERE id = $3
         RETURNING id, user_id, leave_type, start_date::text AS start_date_str, end_date::text AS end_date_str,
                   reason, status, reviewed_note, reviewed_at, created_at,
                   leave_calculation_type, leave_associate_days_off, leave_payable_days, leave_payable_amount,
                   leave_category, return_date::text AS return_date_str, start_time::text, end_time::text, return_time::text`,
        [req.user.id, noteVal, id]
      )
      if (!result.rows.length) {
        return res.status(404).json({ error: 'Not found', message: 'Leave request not found or already reviewed' })
      }
      const r = result.rows[0]
      await sendLeaveDecisionNotification(r, req.user.id, 'rejected', noteVal)
      return res.json(mapLeaveRowToJson(r))
    }

    const empResult = await query(
      `SELECT COALESCE(e.salary_type, u.salary_type) AS salary_type,
              COALESCE(e.base_salary, u.base_salary) AS base_salary
       FROM users u
       LEFT JOIN employees e ON e.user_id = u.id
       WHERE u.id = $1`,
      [row.user_id]
    )
    const emp = empResult.rows[0]
    const settings = await getSettings()
    const salaryType = emp?.salary_type === 'monthly' ? 'monthly' : 'hourly'
    const baseSalary = Number(emp?.base_salary) || 0

    let assocStr = null
    if (associateDaysOff != null) {
      if (Array.isArray(associateDaysOff)) {
        assocStr = associateDaysOff.map((d) => String(d).trim()).filter(Boolean).join(', ') || null
      } else {
        const s = String(associateDaysOff).trim()
        assocStr = s || null
      }
    }

    let leaveCalcType
    let leavePayableDaysNum
    let snap

    if (row.leave_type === 'unpaid') {
      leaveCalcType = 'non_payable'
      leavePayableDaysNum = 0
      snap = computeLeavePaySnapshot({
        salaryType,
        baseSalary,
        workingDaysPerMonth: settings.workingDaysPerMonth,
        hoursPerDay: settings.hoursPerDay,
        calculationType: 'non_payable',
        payableDays: 0,
      })
    } else {
      const ct = String(calculationType || '')
      if (!['non_payable', 'hourly_salary', 'monthly_salary'].includes(ct)) {
        return res.status(400).json({
          error: 'Bad request',
          message: 'calculationType must be non_payable, hourly_salary, or monthly_salary for paid leave',
        })
      }
      const pd = Number(payableDays)
      if (!Number.isFinite(pd) || pd < 0 || pd > 366) {
        return res.status(400).json({ error: 'Bad request', message: 'payableDays must be a number from 0 to 366' })
      }
      leaveCalcType = ct
      leavePayableDaysNum = Math.round(pd * 100) / 100
      snap = computeLeavePaySnapshot({
        salaryType,
        baseSalary,
        workingDaysPerMonth: settings.workingDaysPerMonth,
        hoursPerDay: settings.hoursPerDay,
        calculationType: ct,
        payableDays: pd,
      })
    }

    const result = await query(
      `UPDATE leave_requests
       SET status = 'approved',
           reviewed_by = $1,
           reviewed_note = $2,
           reviewed_at = NOW(),
           updated_at = NOW(),
           leave_calculation_type = $3,
           leave_associate_days_off = $4,
           leave_payable_days = $5,
           leave_hourly_rate = $6,
           leave_daily_hours = $7,
           leave_daily_salary = $8,
           leave_payable_amount = $9
       WHERE id = $10
       RETURNING id, user_id, leave_type, start_date::text AS start_date_str, end_date::text AS end_date_str,
                 reason, status, reviewed_note, reviewed_at, created_at,
                 leave_calculation_type, leave_associate_days_off, leave_payable_days, leave_payable_amount,
                 leave_category, return_date::text AS return_date_str, start_time::text, end_time::text, return_time::text`,
      [
        req.user.id,
        noteVal,
        leaveCalcType,
        assocStr,
        leavePayableDaysNum,
        snap.hourlyRate,
        snap.dailyHours,
        snap.dailySalary,
        snap.payableAmount,
        id,
      ]
    )
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Not found', message: 'Leave request not found or already reviewed' })
    }
    const r = result.rows[0]
    await sendLeaveDecisionNotification(r, req.user.id, 'approved', noteVal)
    res.json(mapLeaveRowToJson(r))
  } catch (err) {
    console.error('Admin review leave request error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

async function sendLeaveDecisionNotification(r, reviewerId, status, reviewedNote) {
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
          reviewedBy: reviewerId,
          reviewedNote,
        }),
      ]
    )
  } catch (notifyErr) {
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
}

function mapLeaveRowToJson(r) {
  return {
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
    leaveCalculationType: r.leave_calculation_type || null,
    leaveAssociateDaysOff: r.leave_associate_days_off || null,
    leavePayableDays: r.leave_payable_days != null ? Number(r.leave_payable_days) : null,
    leavePayableAmount: r.leave_payable_amount != null ? Number(r.leave_payable_amount) : null,
    leaveCategory: r.leave_category || null,
    returnDate: r.return_date_str?.slice(0, 10) ?? null,
    startTime: r.start_time || null,
    endTime: r.end_time || null,
    returnTime: r.return_time || null,
    isLocked: r.is_locked === true,
  }
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
      defaultBaseSalary: s.defaultBaseSalary ?? 0,
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
      defaultBaseSalary,
    } = req.body
    const wd = workingDaysPerMonth != null ? Math.max(0.1, Number(workingDaysPerMonth)) : null
    const hd = hoursPerDay != null ? Math.max(0.1, Number(hoursPerDay)) : null
    const ot = otMultiplier != null ? Math.max(1, Number(otMultiplier)) : null
    const night = nightMultiplier != null ? Math.max(1, Number(nightMultiplier)) : null
    const startH = nightShiftStartHour != null ? Math.min(23, Math.max(0, parseInt(nightShiftStartHour, 10))) : null
    const endH = nightShiftEndHour != null ? Math.min(23, Math.max(0, parseInt(nightShiftEndHour, 10))) : null
    const dbs =
      defaultBaseSalary != null && Number.isFinite(Number(defaultBaseSalary))
        ? Math.max(0, Number(defaultBaseSalary))
        : null
    const updates = []
    const params = []
    let i = 1
    if (wd != null) { updates.push(`working_days_per_month = $${i++}`); params.push(wd) }
    if (hd != null) { updates.push(`hours_per_day = $${i++}`); params.push(hd) }
    if (ot != null) { updates.push(`ot_multiplier = $${i++}`); params.push(ot) }
    if (night != null) { updates.push(`night_multiplier = $${i++}`); params.push(night) }
    if (startH != null) { updates.push(`night_shift_start_hour = $${i++}`); params.push(startH) }
    if (endH != null) { updates.push(`night_shift_end_hour = $${i++}`); params.push(endH) }
    if (dbs != null) { updates.push(`default_base_salary = $${i++}`); params.push(dbs) }
    if (updates.length === 0) {
      const s = await getSettings()
      return res.json({
        workingDaysPerMonth: s.workingDaysPerMonth,
        hoursPerDay: s.hoursPerDay,
        otMultiplier: s.otMultiplier,
        nightMultiplier: s.nightMultiplier,
        nightShiftStartHour: s.nightShiftStartHour,
        nightShiftEndHour: s.nightShiftEndHour,
        defaultBaseSalary: s.defaultBaseSalary ?? 0,
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
      defaultBaseSalary: s.defaultBaseSalary ?? 0,
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
    let totalLeavePay = 0
    let totalAdditions = 0, totalDeductions = 0, totalGovDeductions = 0, totalNetPay = 0
    for (const emp of employees.rows) {
      const row = await buildPayrollEmployeeRow(emp, settings, fromDate, toDate, holidayDates, lineItemsByUser, govDeductionsByUser)
      totalRegularPay += row.regularPay
      totalOt35Pay += row.ot35Pay
      totalOt100Pay += row.ot100Pay
      totalNightPay += row.nightPay
      totalRegularHours += row.regularHours
      totalOt35Hours += row.ot35Hours
      totalOt100Hours += row.ot100Hours
      totalNightHours += row.nightHours
      totalHolidayScheduledHours += row.holidayScheduledHours ?? 0
      totalHolidayWorkedHours += row.holidayWorkedHours ?? 0
      totalHolidayPay += row.holidayPay ?? 0
      totalLeavePay += row.leavePay ?? 0
      totalAdditions += row.additionsTotal ?? 0
      totalDeductions += row.deductionsTotal ?? 0
      totalGovDeductions += (row.socialSecurity ?? 0) + (row.tax ?? 0) + (row.infotep ?? 0)
      totalNetPay += row.netPay ?? 0
      payroll.push(row)
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
        totalLeavePay: Math.round(totalLeavePay * 100) / 100,
        totalRegularPay: Math.round(totalRegularPay * 100) / 100,
        totalOt35Pay: Math.round(totalOt35Pay * 100) / 100,
        totalOt100Pay: Math.round(totalOt100Pay * 100) / 100,
        totalNightPay: Math.round(totalNightPay * 100) / 100,
        totalPay: Math.round((totalRegularPay + totalOt35Pay + totalOt100Pay + totalNightPay + totalHolidayPay + totalLeavePay) * 100) / 100,
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

// GET /api/admin/payroll/slip.pdf?employeeId=&from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/payroll/slip.pdf', async (req, res) => {
  try {
    const { employeeId, from, to } = req.query
    if (!employeeId || !from || !to) {
      return res.status(400).json({ error: 'Bad request', message: 'employeeId, from, and to are required' })
    }
    const fromDate = String(from)
    const toDate = String(to)
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
    const empResult = await query(
      `SELECT u.id, u.name,
              COALESCE(e.salary_type, u.salary_type) AS salary_type,
              COALESCE(e.base_salary, u.base_salary) AS base_salary
       FROM users u
       LEFT JOIN employees e ON e.user_id = u.id
       WHERE u.id = $1 AND u.role = 'employee'`,
      [employeeId]
    )
    if (!empResult.rows.length) {
      return res.status(404).json({ error: 'Not found', message: 'Employee not found' })
    }
    const emp = empResult.rows[0]
    const lineItemsRows = await query(
      `SELECT id, user_id, type, label, amount FROM payroll_line_items
       WHERE period_from = $1::date AND period_to = $2::date`,
      [fromDate, toDate]
    )
    const lineItemsByUser = {}
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
    const govRows = await query(
      `SELECT user_id, social_security, tax, infotep FROM payroll_government_deductions
       WHERE period_from = $1::date AND period_to = $2::date`,
      [fromDate, toDate]
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
    const safeName = String(row.employeeName || 'employee').replace(/[^a-zA-Z0-9-_]/g, '_')
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="payroll-slip-${safeName}-${fromDate}-to-${toDate}.pdf"`)
    res.send(pdfBuffer)
  } catch (err) {
    console.error('Admin payroll slip PDF error:', err)
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
    const { name, email, password, salaryType, baseSalary,
            cmid, contractType, hireDate, location, department,
            primaryClientId, jobTitle, reportsTo, contractStatus, terminationDate } = req.body
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

    const cmidVal = cmid !== undefined ? (cmid != null && Number.isInteger(Number(cmid)) ? Number(cmid) : null) : undefined
    const harmonyIdVal = cmidVal !== undefined ? (cmidVal != null ? `HRM-${String(cmidVal).padStart(5, '0')}` : null) : undefined
    const contractTypeVal = contractType !== undefined ? (contractType === 'contractor' ? 'contractor' : 'employee') : undefined
    const contractStatusVal = contractStatus !== undefined ? (['active', 'terminated', 'suspended'].includes(contractStatus) ? contractStatus : 'active') : undefined
    const termDateVal = contractStatusVal === 'terminated' && terminationDate ? terminationDate : (contractStatusVal && contractStatusVal !== 'terminated' ? null : undefined)

    // Build the employees upsert with all engagement fields
    const empFields = {
      salary_type: st,
      base_salary: sal,
      cmid: cmidVal,
      harmony_id: harmonyIdVal,
      contract_type: contractTypeVal,
      hire_date: hireDate !== undefined ? (hireDate || null) : undefined,
      location: location !== undefined ? (location || null) : undefined,
      department: department !== undefined ? (department || null) : undefined,
      primary_client_id: primaryClientId !== undefined ? (primaryClientId || null) : undefined,
      job_title: jobTitle !== undefined ? (jobTitle || null) : undefined,
      reports_to: reportsTo !== undefined ? (reportsTo || null) : undefined,
      contract_status: contractStatusVal,
      termination_date: termDateVal,
    }

    // Filter only defined fields
    const definedFields = Object.entries(empFields).filter(([, v]) => v !== undefined)
    if (definedFields.length > 0) {
      // Always upsert into employees table
      const currentEmp = await query('SELECT * FROM employees WHERE user_id = $1', [id])
      if (currentEmp.rows.length === 0) {
        // Insert new
        const cols = ['user_id', ...definedFields.map(([k]) => k)]
        const vals = [id, ...definedFields.map(([, v]) => v)]
        const placeholders = vals.map((_, idx) => {
          const col = cols[idx]
          if (['hire_date', 'termination_date'].includes(col)) return `$${idx + 1}::date`
          if (['primary_client_id', 'reports_to'].includes(col)) return `$${idx + 1}::uuid`
          return `$${idx + 1}`
        })
        await query(`INSERT INTO employees (${cols.join(', ')}) VALUES (${placeholders.join(', ')})`, vals)
      } else {
        // Update existing
        const setClauses = definedFields.map(([k], idx) => {
          if (['hire_date', 'termination_date'].includes(k)) return `${k} = $${idx + 1}::date`
          if (['primary_client_id', 'reports_to'].includes(k)) return `${k} = $${idx + 1}::uuid`
          return `${k} = $${idx + 1}`
        })
        setClauses.push('updated_at = NOW()')
        const vals = [...definedFields.map(([, v]) => v), id]
        await query(`UPDATE employees SET ${setClauses.join(', ')} WHERE user_id = $${vals.length}`, vals)
      }
    }

    const updated = await query(
      `SELECT u.id, u.name, u.email,
              COALESCE(e.salary_type, u.salary_type) AS salary_type,
              COALESCE(e.base_salary, u.base_salary) AS base_salary,
              e.cmid, e.harmony_id, e.contract_type, e.hire_date::text AS hire_date,
              e.location, e.department, e.primary_client_id, e.job_title,
              e.reports_to, e.contract_status, e.termination_date::text AS termination_date,
              c.name AS primary_client_name,
              mgr.name AS reports_to_name
       FROM users u
       LEFT JOIN employees e ON e.user_id = u.id
       LEFT JOIN clients c ON c.id = e.primary_client_id
       LEFT JOIN users mgr ON mgr.id = e.reports_to
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
      cmid: row.cmid != null ? Number(row.cmid) : null,
      harmonyId: row.harmony_id || null,
      contractType: row.contract_type || 'employee',
      hireDate: row.hire_date?.slice(0, 10) ?? null,
      location: row.location || null,
      department: row.department || null,
      primaryClientId: row.primary_client_id || null,
      primaryClientName: row.primary_client_name || null,
      jobTitle: row.job_title || null,
      reportsTo: row.reports_to || null,
      reportsToName: row.reports_to_name || null,
      contractStatus: row.contract_status || 'active',
      terminationDate: row.termination_date?.slice(0, 10) ?? null,
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
    const totalHours = regularHours + overtimeHours
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
              COALESCE(e.base_salary, u.base_salary) AS base_salary,
              e.cmid, e.harmony_id, e.contract_type, e.hire_date::text AS hire_date,
              e.location, e.department, e.primary_client_id, e.job_title,
              e.reports_to, e.contract_status, e.termination_date::text AS termination_date,
              c.name AS primary_client_name,
              mgr.name AS reports_to_name
       FROM users u
       LEFT JOIN employees e ON e.user_id = u.id
       LEFT JOIN clients c ON c.id = e.primary_client_id
       LEFT JOIN users mgr ON mgr.id = e.reports_to
       WHERE u.role = 'employee'
       ORDER BY u.name`
    )
    res.json(result.rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email || '',
      salaryType: r.salary_type || 'hourly',
      baseSalary: r.base_salary != null ? Number(r.base_salary) : 0,
      cmid: r.cmid != null ? Number(r.cmid) : null,
      harmonyId: r.harmony_id || null,
      contractType: r.contract_type || 'employee',
      hireDate: r.hire_date?.slice(0, 10) ?? null,
      location: r.location || null,
      department: r.department || null,
      primaryClientId: r.primary_client_id || null,
      primaryClientName: r.primary_client_name || null,
      jobTitle: r.job_title || null,
      reportsTo: r.reports_to || null,
      reportsToName: r.reports_to_name || null,
      contractStatus: r.contract_status || 'active',
      terminationDate: r.termination_date?.slice(0, 10) ?? null,
    })))
  } catch (err) {
    console.error('Admin list employees error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/admin/employees - create employee (admin only)
router.post('/employees', requireAdmin, async (req, res) => {
  try {
    const { name, email, password, salaryType, baseSalary,
            cmid, contractType, hireDate, location, department,
            primaryClientId, jobTitle, reportsTo, contractStatus, terminationDate } = req.body
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
    const contractTypeVal = contractType === 'contractor' ? 'contractor' : 'employee'
    const contractStatusVal = ['active', 'terminated', 'suspended'].includes(contractStatus) ? contractStatus : 'active'
    const cmidVal = cmid != null && Number.isInteger(Number(cmid)) ? Number(cmid) : null
    const harmonyIdVal = cmidVal != null ? `HRM-${String(cmidVal).padStart(5, '0')}` : null
    const termDateVal = contractStatusVal === 'terminated' && terminationDate ? terminationDate : null
    await query(
      `INSERT INTO employees (user_id, salary_type, base_salary, cmid, harmony_id, contract_type, hire_date, location, department, primary_client_id, job_title, reports_to, contract_status, termination_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8, $9, $10::uuid, $11, $12::uuid, $13, $14::date)
       ON CONFLICT (user_id) DO UPDATE SET salary_type = $2, base_salary = $3, cmid = $4, harmony_id = $5, contract_type = $6, hire_date = $7::date, location = $8, department = $9, primary_client_id = $10::uuid, job_title = $11, reports_to = $12::uuid, contract_status = $13, termination_date = $14::date, updated_at = NOW()`,
      [u.id, st, sal, cmidVal, harmonyIdVal, contractTypeVal, hireDate || null, location || null, department || null, primaryClientId || null, jobTitle || null, reportsTo || null, contractStatusVal, termDateVal]
    )
    const created = await query(
      `SELECT u.id, u.name, u.email,
              COALESCE(e.salary_type, u.salary_type) AS salary_type,
              COALESCE(e.base_salary, u.base_salary) AS base_salary,
              e.cmid, e.harmony_id, e.contract_type, e.hire_date::text AS hire_date,
              e.location, e.department, e.primary_client_id, e.job_title,
              e.reports_to, e.contract_status, e.termination_date::text AS termination_date,
              c.name AS primary_client_name,
              mgr.name AS reports_to_name
       FROM users u
       LEFT JOIN employees e ON e.user_id = u.id
       LEFT JOIN clients c ON c.id = e.primary_client_id
       LEFT JOIN users mgr ON mgr.id = e.reports_to
       WHERE u.id = $1`,
      [u.id]
    )
    const row = created.rows[0]
    res.status(201).json({
      id: row.id,
      name: row.name,
      email: row.email || '',
      salaryType: row.salary_type || 'hourly',
      baseSalary: row.base_salary != null ? Number(row.base_salary) : 0,
      cmid: row.cmid != null ? Number(row.cmid) : null,
      harmonyId: row.harmony_id || null,
      contractType: row.contract_type || 'employee',
      hireDate: row.hire_date?.slice(0, 10) ?? null,
      location: row.location || null,
      department: row.department || null,
      primaryClientId: row.primary_client_id || null,
      primaryClientName: row.primary_client_name || null,
      jobTitle: row.job_title || null,
      reportsTo: row.reports_to || null,
      reportsToName: row.reports_to_name || null,
      contractStatus: row.contract_status || 'active',
      terminationDate: row.termination_date?.slice(0, 10) ?? null,
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
