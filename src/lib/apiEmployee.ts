import { api, getToken } from './api'
import type { AttendanceRecord } from '@/types'

/** Build the URL for the employee HTML pay stub view (same HTML renderer as admin) */
export function getMyPaystubUrl(payrollResultId: string): string {
  const base = import.meta.env.VITE_API_URL || 'http://localhost:4000'
  const token = getToken()
  return `${base}/api/sessions/paystub/${encodeURIComponent(payrollResultId)}${token ? `?token=${encodeURIComponent(token)}` : ''}`
}

export async function getMyAttendance(params: { from?: string; to?: string }): Promise<AttendanceRecord[]> {
  const search = new URLSearchParams()
  if (params.from) search.set('from', params.from)
  if (params.to) search.set('to', params.to)
  const q = search.toString()
  return api<AttendanceRecord[]>(`/api/sessions/my-attendance${q ? `?${q}` : ''}`)
}

export interface MyScheduleEntry {
  id: string
  date: string | null
  clientName: string
  shiftName: string
  startTime: string
  endTime: string
}

export async function getMySchedule(params: { from: string; to: string }): Promise<MyScheduleEntry[]> {
  const search = new URLSearchParams({ from: params.from, to: params.to })
  return api<MyScheduleEntry[]>(`/api/sessions/my-schedule?${search}`)
}

export interface LeaveRequestItem {
  id: string
  leaveType: 'paid' | 'unpaid'
  startDate: string | null
  endDate: string | null
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  reviewedNote?: string
  reviewedAt?: string | null
  reviewedByName?: string
  createdAt?: string
  leaveCalculationType?: string | null
  leavePayableDays?: number | null
  leavePayableAmount?: number | null
  leaveCategory?: string | null
  associateDaysOff?: string | null
  returnDate?: string | null
  startTime?: string | null
  endTime?: string | null
  returnTime?: string | null
  assetDeactivation?: string | null
}

export async function getMyLeaveRequests(): Promise<LeaveRequestItem[]> {
  return api<LeaveRequestItem[]>('/api/sessions/leave-requests')
}

export async function createLeaveRequest(data: {
  leaveType: 'paid' | 'unpaid'
  startDate: string
  endDate: string
  reason?: string
  leaveCategory?: string
  calculationType?: string
  associateDaysOff?: string[]
  returnDate?: string
  startTime?: string
  endTime?: string
  returnTime?: string
}): Promise<LeaveRequestItem> {
  return api<LeaveRequestItem>('/api/sessions/leave-requests', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

// ── Payroll Periods (employee-accessible) ──

export interface PayrollPeriod {
  periodFrom: string
  periodTo: string
  payDate: string
  cycleCode: string
  yearCycle: number
  status: string
  bs?: number
  isSpecial?: boolean
}

export async function getEmployeePayrollPeriods(year?: number): Promise<PayrollPeriod[]> {
  const q = year != null ? `?year=${year}` : ''
  return api<PayrollPeriod[]>(`/api/sessions/payroll-periods${q}`)
}

// ── My Payroll ──

export interface MyPayrollResult {
  id: string
  payrollCycleCode: string
  periodFrom: string
  periodTo: string
  payDate: string | null
  biWeek: number | null
  salaryType: string
  salary: number
  hourlySalary: number
  hreg1: number; hreg2: number; hreg: number; ordinarySalary: number
  vacation: number; matrimony: number; maternity: number; paternity: number
  bereavement: number; medical: number; vpl: number
  commissions: number
  subsidio: number; reembolso: number; totalOtherIncome: number
  hn15Hours: number; hn15Amount: number; hx35Hours: number; hx35Amount: number
  hx100Hours: number; hx100Amount: number; hholHours: number; hholAmount: number
  overtimeTotal: number
  collaboration: number; recruiting: number; profitSharing: number; bonusesTotal: number
  attendanceIncentive: number; kpiIncentive: number; incentivesTotal: number
  grossSalary: number; tssSalary: number; isrSalary: number
  afp: number; sfs: number; tssDependents: number; infotep: number
  isrRetention: number; govDeductionsTotal: number
  payLater: number; gym: number; insuranceDed: number; cafeteria: number
  adminDeduction: number; otherDeductionsTotal: number
  totalDeductions: number; netSalary: number
}

export async function getMyPayroll(cycleCode: string): Promise<MyPayrollResult | null> {
  return api<MyPayrollResult | null>(`/api/sessions/my-payroll?cycle=${encodeURIComponent(cycleCode)}`)
}
