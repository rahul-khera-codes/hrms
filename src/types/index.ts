export interface ClockSession {
  id: string
  clockIn: string
  clockOut: string | null
  status: 'active' | 'completed'
  regularMinutes?: number
  overtimeMinutes?: number
  nightMinutes?: number
}

export interface PayrollSummary {
  period: string
  regularMinutes?: number
  overtimeMinutes?: number
  nightMinutes?: number
  totalMinutes?: number
  regularHours: number
  overtimeHours: number
  nightHours: number
  totalHours: number
  amount?: number
}

export interface AttendanceRecord {
  id: string
  sessionId?: string
  employeeId: string
  employeeName: string
  employeeCmid?: number | null
  accountName?: string | null
  accountId?: string | null
  date: string
  shiftStart?: string | null
  shiftEnd?: string | null
  clockIn: string
  clockOut: string | null
  location?: string | null
  stage?: string | null
  // 10JUN2026 DR site-manager request — assigned shift's name (e.g. "Day",
  // "Night") exposed for the attendance CSV export's "SHIFT TYPE" column.
  shiftType?: string | null
  reportsTo?: string | null
  reportsToId?: string | null
  task?: string | null
  status: string
  // 03JUN2026 client spec — separate auto-calc value (Blank/Upcoming/Missed In/
  // Absent/Present/Late In/Early Out/Late In + Early Out/Missed Out) from any
  // admin override. `status` is the resolved (override || auto) value.
  autoStatus?: string
  statusOverride?: string | null
  // 04JUN2026 client video — per-field "Manually adjusted, click to reset"
  // metadata. *Raw = the original captured punch / planned shift; *Override =
  // admin's manual edit (or null). The flat clockIn / shiftStart fields hold
  // the effective value (override ?? raw).
  clockInRaw?: string | null
  clockInOverride?: string | null
  clockInOverridden?: boolean
  clockOutRaw?: string | null
  clockOutOverride?: string | null
  clockOutOverridden?: boolean
  shiftStartRaw?: string | null
  shiftStartOverride?: string | null
  shiftStartOverridden?: boolean
  shiftEndRaw?: string | null
  shiftEndOverride?: string | null
  shiftEndOverridden?: boolean
  payType?: string
  billType?: string
  scheduledHours?: number
  sdbtHours?: number
  actualHours?: number
  adbtHours?: number
  dbtHours?: number
  regHours?: number
  n15Hours?: number
  x35Hours?: number
  x100Hours?: number
  hdyHours?: number
  holHours?: number
  payableRvwHours?: number
  billableRegHours?: number
  billablePrmHours?: number
  billableRvwHours?: number
  comments?: string
  isLocked?: boolean
  // 19MAY2026 Scheduler Demos meeting — audit + reviewed fields.
  createdBy?: string | null
  createdByName?: string | null
  createdOn?: string | null
  modifiedBy?: string | null
  modifiedByName?: string | null
  modifiedOn?: string | null
  reviewed?: boolean
  reviewedBy?: string | null
  reviewedByName?: string | null
  reviewedAt?: string | null
  isScheduled?: boolean
  recordId?: string | null
  // Backward compatibility
  regularHours: number
  overtimeHours: number
  nightHours: number
}

export interface PayrollRule {
  id: string
  name: string
  type: 'regular' | 'overtime' | 'night'
  rateMultiplier: number
  applicableStart?: string
  applicableEnd?: string
}
