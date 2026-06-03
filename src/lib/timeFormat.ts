/**
 * Universal Atlantic time (UTC-4 year-round, no DST) display + 12-hour format.
 *
 * Per Orlando's 02JUN2026 video feedback ("Universal time zone should be
 * UTC-4… time should be 12-hour format"): every screen that shows a shift or
 * clock time goes through these helpers so the displayed value matches what
 * the admin typed and is consistent everywhere (Attendance, Reports, employee
 * dashboard, schedule widget, etc.) regardless of the user's browser TZ.
 *
 * The choice of zone is **America/Santo_Domingo** specifically because it's
 * fixed at UTC-4 year-round (no DST shift). Using America/New_York would have
 * been UTC-4 in summer but UTC-5 in winter, which would defeat the "universal"
 * ask.
 */

export const DR_TZ = 'America/Santo_Domingo'

type DateInput = Date | string | number | null | undefined

function toDate(v: DateInput): Date | null {
  if (v == null || v === '') return null
  const d = v instanceof Date ? v : new Date(v)
  return isNaN(d.getTime()) ? null : d
}

// Intl.DateTimeFormat instances are expensive to construct — cache the ones
// we hit most often so repeated table cells don't re-build them.
function fmt(opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(opts)
  let cached = fmtCache.get(key)
  if (!cached) {
    cached = new Intl.DateTimeFormat('en-US', { timeZone: DR_TZ, ...opts })
    fmtCache.set(key, cached)
  }
  return cached
}
const fmtCache = new Map<string, Intl.DateTimeFormat>()

/** "08:30 AM" — 12-hour time in Atlantic time. */
export function fmtTime(v: DateInput): string {
  const d = toDate(v)
  if (!d) return ''
  return fmt({ hour: '2-digit', minute: '2-digit', hour12: true }).format(d)
}

/** "08:30:15 AM" — with seconds, for live counters. */
export function fmtTimeWithSeconds(v: DateInput): string {
  const d = toDate(v)
  if (!d) return ''
  return fmt({ hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).format(d)
}

/** "05/27 08:30 AM" — compact date+time for tables. */
export function fmtDateTime(v: DateInput): string {
  const d = toDate(v)
  if (!d) return ''
  return fmt({ month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true }).format(d)
}

/** "05/27/2026 08:30:15 AM" — full timestamp for audit columns. */
export function fmtFullDateTime(v: DateInput): string {
  const d = toDate(v)
  if (!d) return ''
  return fmt({
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  }).format(d)
}

/** "2026-05-27" — ISO date in AST (for filters / sorting / CSV). */
export function fmtDateISO(v: DateInput): string {
  const d = toDate(v)
  if (!d) return ''
  const parts = fmt({ year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** "May 27" — short readable date for dashboard headers. */
export function fmtDateShort(v: DateInput): string {
  const d = toDate(v)
  if (!d) return ''
  return fmt({ month: 'short', day: 'numeric' }).format(d)
}

/**
 * For `<input type="datetime-local">`: convert a UTC ISO string to the
 * Atlantic-local "YYYY-MM-DDTHH:MM" the input expects, AND convert it back to
 * a UTC ISO string when the user picks a value. The native input always uses
 * the browser's TZ, so we round-trip through formatToParts to lock the
 * displayed clock to AST regardless of where the admin's browser is.
 */
export function toDateTimeLocal(v: DateInput): string {
  const d = toDate(v)
  if (!d) return ''
  const parts = fmt({
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  // Intl with hour12:false sometimes returns "24" at midnight — normalize.
  const hh = get('hour') === '24' ? '00' : get('hour')
  return `${get('year')}-${get('month')}-${get('day')}T${hh}:${get('minute')}`
}

export function fromDateTimeLocal(val: string): string | null {
  if (!val) return null
  // Treat the picker value as AST. Compute the matching UTC ISO by accounting
  // for the AST offset (-04:00) — Santo Domingo has no DST so this is fixed.
  const m = val.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (!m) return null
  const [, y, mo, d, h, mi] = m
  // AST = UTC-4 ⇒ UTC = AST + 4h. Build via Date.UTC then ISO.
  const utc = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h) + 4, Number(mi)))
  if (isNaN(utc.getTime())) return null
  return utc.toISOString()
}

/**
 * Read just the time portion of a shift-time STRING (e.g. shift.startTime
 * stored as PG TIME "10:00:00") and reformat as 12-hour. Used in places that
 * still display the raw shift_time field without a date context.
 */
export function fmtShiftTimeStr(s: string | null | undefined): string {
  if (!s) return ''
  const m = String(s).match(/^(\d{1,2}):(\d{2})/)
  if (!m) return String(s).slice(0, 5)
  let h = Number(m[1])
  const mi = m[2]
  const period = h >= 12 ? 'PM' : 'AM'
  if (h === 0) h = 12
  else if (h > 12) h -= 12
  return `${String(h).padStart(2, '0')}:${mi} ${period}`
}
