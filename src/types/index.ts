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
  regularHours: number
  overtimeHours: number
  nightHours: number
  totalHours: number
  amount?: number
}

export interface AttendanceRecord {
  id: string
  employeeId: string
  employeeName: string
  date: string
  clockIn: string
  clockOut: string | null
  regularHours: number
  overtimeHours: number
  nightHours: number
  status: 'present' | 'absent' | 'leave' | 'adjusted'
}

export interface PayrollRule {
  id: string
  name: string
  type: 'regular' | 'overtime' | 'night'
  rateMultiplier: number
  applicableStart?: string
  applicableEnd?: string
}
