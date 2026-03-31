import { query } from '../config/db.js'
import { computeSSEmployeeBiWeekly, computeTaxForPeriod } from './drPayrollRules.js'

const WEEKLY_44_THRESHOLD = 44
const OT_35_CAP_HOURS_PER_WEEK = 19
const WEEKLY_63_THRESHOLD = 63
const OT_100_MULTIPLIER = 2
const BIWEEKLY_OT35_CAP_HOURS = 38

export function listDateStrings(fromDate, toDate) {
  const dates = []
  const cur = new Date(`${fromDate}T12:00:00Z`)
  const end = new Date(`${toDate}T12:00:00Z`)
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return dates
}

function getWeekMondayKey(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z')
  const day = d.getUTCDay()
  const back = day === 0 ? 6 : day - 1
  d.setUTCDate(d.getUTCDate() - back)
  return d.toISOString().slice(0, 10)
}

/**
 * Check if a date is a scheduled workday for the employee.
 * scheduledDates is a Set of date strings where the employee has schedule assignments.
 * If no schedule data exists, fall back to Mon-Fri.
 */
function isScheduledWorkday(dateStr, scheduledDates) {
  if (scheduledDates && scheduledDates.size > 0) {
    return scheduledDates.has(dateStr)
  }
  const d = new Date(dateStr + 'T12:00:00Z')
  return [1, 2, 3, 4, 5].includes(d.getUTCDay())
}

/**
 * Compute OT buckets per week with:
 * - Schedule-based rest day detection
 * - 44hr/week threshold for OT35
 * - 63hr/week threshold for OT100
 * - 19hr/week cap on OT35
 * - 38hr bi-weekly cap on OT35
 */
function computePayrollBuckets(sessions, scheduledDates) {
  const byWeek = new Map()
  for (const s of sessions) {
    const dateStr = s.date
    if (!dateStr) continue
    const weekKey = getWeekMondayKey(dateStr)
    if (!byWeek.has(weekKey)) {
      byWeek.set(weekKey, { regularMinutes: 0, restDayMinutes: 0, totalMinutes: 0 })
    }
    const row = byWeek.get(weekKey)
    // Night minutes overlap with regular/OT (same hours, just flagged for the 15% premium).
    // Total session duration = regular + overtime only (night is a subset, not additive).
    const sessionMinutes = (s.regular_minutes || 0) + (s.overtime_minutes || 0)
    row.totalMinutes += sessionMinutes
    if (isScheduledWorkday(dateStr, scheduledDates)) {
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
    // OT100: rest day hours + anything beyond 63hrs/week
    const ot100Hrs = restDayHrs + Math.max(0, totalHrs - WEEKLY_63_THRESHOLD)
    // OT35: hours beyond 44hrs/week (on workdays) that aren't OT100, capped at 19hrs/week
    const workdayHrs = totalHrs - restDayHrs
    const ot35FromThreshold = Math.max(0, workdayHrs - WEEKLY_44_THRESHOLD)
    const ot35FromRemaining = Math.max(0, totalHrs - regularHrs - ot100Hrs)
    const ot35Hrs = Math.min(OT_35_CAP_HOURS_PER_WEEK, Math.max(ot35FromThreshold, ot35FromRemaining))
    regularMinutes += row.regularMinutes
    ot35Minutes += Math.round(ot35Hrs * 60)
    ot100Minutes += Math.round(ot100Hrs * 60)
  }
  // Bi-weekly cap: OT35 cannot exceed 38 hours per pay period
  const ot35Hours = ot35Minutes / 60
  if (ot35Hours > BIWEEKLY_OT35_CAP_HOURS) {
    const excessMinutes = Math.round((ot35Hours - BIWEEKLY_OT35_CAP_HOURS) * 60)
    ot35Minutes -= excessMinutes
  }
  return { regularMinutes, ot35Minutes, ot100Minutes }
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

/**
 * Build one employee payroll row — same logic as GET /api/admin/payroll loop.
 */
export async function buildPayrollEmployeeRow(
  emp,
  settings,
  fromDate,
  toDate,
  holidayDates,
  lineItemsByUser,
  govDeductionsByUser
) {
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

  // Fetch schedule assignments to determine scheduled workdays vs rest days
  const scheduleResult = await query(
    `SELECT a.date::text AS date_str
     FROM schedule_assignments a
     WHERE a.user_id = $1
       AND a.date >= $2::date
       AND a.date <= $3::date`,
    [emp.id, fromDate, toDate]
  )
  const scheduledDates = new Set(
    scheduleResult.rows.map((r) => r.date_str ? r.date_str.slice(0, 10) : '').filter(Boolean)
  )

  const { regularMinutes, ot35Minutes, ot100Minutes } = computePayrollBuckets(sessions, scheduledDates)
  const nightMinutes = sessions.reduce((sum, s) => sum + (s.night_minutes || 0), 0)
  const regularHours = Math.round((regularMinutes / 60) * 10) / 10
  const ot35Hours = Math.round((ot35Minutes / 60) * 10) / 10
  const ot100Hours = Math.round((ot100Minutes / 60) * 10) / 10
  const nightHours = Math.round((nightMinutes / 60) * 10) / 10
  // Night hours are already counted inside regular/OT — totalHours should not double-count
  const totalHours = regularHours + ot35Hours + ot100Hours
  const rate = getHourlyRate(emp.salary_type, emp.base_salary, settings.workingDaysPerMonth, settings.hoursPerDay)

  const workedMinutesByDate = new Map()
  for (const s of sessions) {
    if (!s.date) continue
    // Night is a subset of regular+OT, not additive
    const mins = (s.regular_minutes || 0) + (s.overtime_minutes || 0)
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

  // Holiday pay: all scheduled employees get base pay for their shift.
  // Those who actually work get an ADDITIONAL 100% of hourly rate per worked hour (double day).
  // holidayBaseTopUpPay covers the scheduled-but-not-worked portion at 1x rate
  // holidayWorkedBasePay covers the scheduled portion for worked hours at 1x rate
  // holidayWorkedPremiumPay is the extra 100% premium for actually working
  const holidayBaseTopUpPay = (holidayBaseTopUpMinutes / 60) * rate
  const holidayWorkedBasePay = (holidayWorkedMinutes / 60) * rate
  const holidayWorkedPremiumPay = (holidayWorkedMinutes / 60) * rate
  const holidayPay = holidayBaseTopUpPay + holidayWorkedBasePay + holidayWorkedPremiumPay

  const leavePayRows = await query(
    `SELECT start_date::text AS sd, end_date::text AS ed, COALESCE(leave_payable_amount, 0) AS amt
     FROM leave_requests
     WHERE user_id = $1
       AND status = 'approved'
       AND leave_payable_amount IS NOT NULL
       AND leave_payable_amount > 0
       AND start_date <= $3::date
       AND end_date >= $2::date`,
    [emp.id, fromDate, toDate]
  )
  let leavePayTotal = 0
  for (const lr of leavePayRows.rows) {
    const s = lr.sd?.slice(0, 10)
    const e = lr.ed?.slice(0, 10)
    if (!s || !e) continue
    const totalLeaveDays = listDateStrings(s, e).length
    if (totalLeaveDays < 1) continue
    const clipStart = s > fromDate ? s : fromDate
    const clipEnd = e < toDate ? e : toDate
    if (clipStart > clipEnd) continue
    const overlapDays = listDateStrings(clipStart, clipEnd).length
    leavePayTotal += Number(lr.amt) * (overlapDays / totalLeaveDays)
  }
  leavePayTotal = Math.round(leavePayTotal * 100) / 100

  const regularPay = regularHours * rate
  const ot35Pay = ot35Hours * rate * settings.otMultiplier
  const ot100Pay = ot100Hours * rate * OT_100_MULTIPLIER
  // Night differential is the EXTRA premium only (e.g., 0.15 for 15%).
  // Night hours are already counted in regular/OT pay above.
  // nightMultiplier from settings is stored as 1.15, so subtract 1 to get just the premium.
  const nightDiffRate = settings.nightMultiplier - 1
  const nightPay = nightHours * rate * nightDiffRate
  const grossPay = regularPay + ot35Pay + ot100Pay + nightPay + holidayPay + leavePayTotal
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

  return {
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
    leavePay: leavePayTotal,
    totalPay: Math.round(grossPay * 100) / 100,
    lineItems: items,
    additionsTotal: Math.round(additionsTotal * 100) / 100,
    deductionsTotal: Math.round(deductionsTotal * 100) / 100,
    socialSecurity,
    tax,
    infotep: infotepRounded,
    netPay,
    govAutoCalculated: !hasGovOverride,
  }
}
