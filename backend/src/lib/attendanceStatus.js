/**
 * Auto-calculated attendance status — per the 03JUN2026 client spec.
 *
 * Statuses are computed dynamically from the relationship between the
 * scheduled shift (shift_start / shift_end) and the actual punches
 * (clock_in / clock_out) against "now". An admin can always override the
 * auto-calculated value by setting sessions.status_override — when present,
 * the override wins and is returned as-is. Cleared overrides reveal the
 * auto-calc again.
 *
 * Constants — also per the spec:
 *   GRACE_MS       = 5 minutes  (Present vs Late In / Early Out)
 *   MISSED_IN_MS   = 15 minutes (Missed In → Absent transition)
 */

export const GRACE_MS = 5 * 60 * 1000
export const MISSED_IN_MS = 15 * 60 * 1000

export const AUTO_STATUSES = [
  'Blank',
  'Upcoming',
  'Missed In',
  'Absent',
  'Present',
  'Late In',
  'Early Out',
  'Late In + Early Out',
  'Missed Out',
]

export const MANUAL_STATUSES = [
  'Time Off',
  'Vacation',
  'Shift Error',
  'Technical Issue',
  'Suspended',
  'Terminated',
  'Prenotice',
  'Leave',
  'Breastfeeding', // legacy carry-over from prior status list
]

/**
 * Translate any legacy status string into the canonical current spelling.
 * Keeps existing status_override values readable on the UI without a DB rewrite.
 */
export const LEGACY_STATUS_MAP = {
  // Old auto-calc names → new
  'Late': 'Late In',
  'Left Early': 'Early Out',
  'Late & Left Early': 'Late In + Early Out',
  // Old snake_case
  late_in_early_out: 'Late In + Early Out',
  late_in: 'Late In',
  early_out: 'Early Out',
  present: 'Present',
  absent: 'Absent',
  time_off: 'Time Off',
  system_issues: 'Shift Error',
}

export function normalizeStatus(s) {
  if (!s) return null
  return LEGACY_STATUS_MAP[s] || s
}

/**
 * Compute the auto-calculated status given the shift schedule + punches.
 *
 * @param {Object}        args
 * @param {Date|string|null} args.shiftStart  scheduled shift start (timestamptz)
 * @param {Date|string|null} args.shiftEnd    scheduled shift end (timestamptz)
 * @param {Date|string|null} args.clockIn     actual clock-in (null if not punched)
 * @param {Date|string|null} args.clockOut    actual clock-out (null if still in shift / not yet out)
 * @param {Date|string|null} [args.now]       "now" for testability — defaults to current time
 * @returns {string} one of AUTO_STATUSES
 */
export function computeAutoStatus({ shiftStart, shiftEnd, clockIn, clockOut, now }) {
  // 1. Blank — no shift configured
  if (!shiftStart || !shiftEnd) return 'Blank'

  const ms = (v) => (v == null ? null : new Date(v).getTime())
  const start = ms(shiftStart)
  const end = ms(shiftEnd)
  const inMs = ms(clockIn)
  const outMs = ms(clockOut)
  const nowMs = (now ? new Date(now) : new Date()).getTime()

  // Defensive: invalid dates
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 'Blank'

  // 2. Upcoming — shift hasn't started yet
  if (nowMs < start) return 'Upcoming'

  // 3 & 4. No clock-in cases
  if (inMs == null) {
    // Missed In: within 15 minutes of shift start
    if (nowMs <= start + MISSED_IN_MS) return 'Missed In'
    // Absent: more than 15 min past start, or shift date is in the past
    return 'Absent'
  }

  // Has clock-in
  const lateIn = inMs - start > GRACE_MS

  // 9. Missed Out — clocked in but no clock-out, past end + grace
  if (outMs == null) {
    if (nowMs > end + GRACE_MS) return 'Missed Out'
    return lateIn ? 'Late In' : 'Present'
  }

  // 5-8. Has both clock-in and clock-out
  const earlyOut = end - outMs > GRACE_MS
  if (lateIn && earlyOut) return 'Late In + Early Out'
  if (lateIn) return 'Late In'
  if (earlyOut) return 'Early Out'
  return 'Present'
}

/**
 * Resolve the displayed status: override wins if set, otherwise auto-calc.
 * Always returns a string from AUTO_STATUSES or MANUAL_STATUSES (with legacy
 * names normalized).
 */
export function resolveStatus({ statusOverride, shiftStart, shiftEnd, clockIn, clockOut, now }) {
  const norm = normalizeStatus(statusOverride)
  if (norm) return norm
  return computeAutoStatus({ shiftStart, shiftEnd, clockIn, clockOut, now })
}
