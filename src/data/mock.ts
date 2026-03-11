import { format, subDays, startOfDay } from 'date-fns'
import type { ClockSession, PayrollSummary, AttendanceRecord } from '@/types'

const now = new Date()

export const mockSessions: ClockSession[] = [
  {
    id: '1',
    clockIn: subDays(now, 0).toISOString(),
    clockOut: null,
    status: 'active',
  },
  {
    id: '2',
    clockIn: subDays(now, 1).toISOString(),
    clockOut: new Date(subDays(now, 1).setHours(17, 30)).toISOString(),
    status: 'completed',
    regularMinutes: 480,
    overtimeMinutes: 30,
    nightMinutes: 0,
  },
  {
    id: '3',
    clockIn: subDays(now, 2).toISOString(),
    clockOut: new Date(subDays(now, 2).setHours(18, 0)).toISOString(),
    status: 'completed',
    regularMinutes: 480,
    overtimeMinutes: 60,
    nightMinutes: 0,
  },
]

export const mockPayrollSummary: PayrollSummary = {
  period: format(subDays(now, 7), 'MMM d') + ' – ' + format(now, 'MMM d, yyyy'),
  regularHours: 38.5,
  overtimeHours: 4.5,
  nightHours: 0,
  totalHours: 43,
  amount: 2847.5,
}

const employees = ['Jane Doe', 'John Smith', 'Alex Rivera', 'Sam Wilson']
const statuses: AttendanceRecord['status'][] = ['present', 'present', 'absent', 'adjusted']

export const mockAttendanceRecords: AttendanceRecord[] = Array.from({ length: 24 }, (_, i) => {
  const date = subDays(now, i % 7)
  const clockIn = new Date(date)
  clockIn.setHours(9, 0, 0, 0)
  const clockOut = new Date(date)
  clockOut.setHours(17, 30 + (i % 3) * 30, 0, 0)
  return {
    id: `ar-${i + 1}`,
    employeeId: `emp-${(i % 4) + 1}`,
    employeeName: employees[i % 4],
    date: format(startOfDay(date), 'yyyy-MM-dd'),
    clockIn: clockIn.toISOString(),
    clockOut: statuses[i % 4] === 'absent' ? null : clockOut.toISOString(),
    regularHours: statuses[i % 4] === 'absent' ? 0 : 8 + (i % 3) * 0.5,
    overtimeHours: i % 4 === 2 ? 1.5 : 0,
    nightHours: 0,
    status: statuses[i % 4],
  }
})
