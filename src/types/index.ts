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
  reportsTo?: string | null
  reportsToId?: string | null
  task?: string | null
  status: string
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
  comments?: string
  isLocked?: boolean
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
