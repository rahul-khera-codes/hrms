import type { AttendanceRecord } from '@/types'
import { api } from './api'

export interface AdminDashboardResponse {
  totalEmployees: number
  presentToday: number
  absentToday: number
  pendingAdjustments: number
  recentAttendance: AttendanceRecord[]
}

export async function getAdminDashboard(): Promise<AdminDashboardResponse> {
  return api<AdminDashboardResponse>('/api/admin/dashboard')
}

export interface AdminAttendanceParams {
  from?: string
  to?: string
  search?: string
  status?: string
}

export async function getAdminAttendance(
  params?: AdminAttendanceParams
): Promise<AttendanceRecord[]> {
  const search = new URLSearchParams()
  if (params?.from) search.set('from', params.from)
  if (params?.to) search.set('to', params.to)
  if (params?.search) search.set('search', params.search)
  if (params?.status && params.status !== 'all') search.set('status', params.status)
  const q = search.toString()
  const data = await api<AttendanceRecord[]>(`/api/admin/attendance${q ? `?${q}` : ''}`)
  return data
}

export interface ReportsSummaryResponse {
  period: string
  regularHours: number
  overtimeHours: number
  nightHours: number
  totalHours: number
}

export async function getReportsSummary(params?: {
  from?: string
  to?: string
}): Promise<ReportsSummaryResponse> {
  const search = new URLSearchParams()
  if (params?.from) search.set('from', params.from)
  if (params?.to) search.set('to', params.to)
  const q = search.toString()
  return api<ReportsSummaryResponse>(`/api/admin/reports/summary${q ? `?${q}` : ''}`)
}

export interface PayrollEmployeeRow {
  employeeId: string
  employeeName: string
  salaryType: string
  hourlyRate: number
  regularHours: number
  ot35Hours: number
  ot100Hours: number
  nightHours: number
  totalHours: number
  regularPay: number
  ot35Pay: number
  ot100Pay: number
  nightPay: number
  totalPay: number
}

export interface PayrollResponse {
  period: string
  from: string
  to: string
  employees: PayrollEmployeeRow[]
  summary: {
    totalRegularHours: number
    totalOt35Hours: number
    totalOt100Hours: number
    totalNightHours: number
    totalRegularPay: number
    totalOt35Pay: number
    totalOt100Pay: number
    totalNightPay: number
    totalPay: number
  }
}

export async function getPayroll(params: { from: string; to: string }): Promise<PayrollResponse> {
  const search = new URLSearchParams({ from: params.from, to: params.to })
  return api<PayrollResponse>(`/api/admin/payroll?${search}`)
}

export async function updateEmployeeSalary(
  employeeId: string,
  data: { salaryType: 'hourly' | 'monthly'; baseSalary: number }
): Promise<{ employeeId: string; employeeName: string; salaryType: string; baseSalary: number }> {
  return api(`/api/admin/employees/${employeeId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export interface SettingsResponse {
  workingDaysPerMonth: number
  hoursPerDay: number
  otMultiplier: number
  nightMultiplier: number
  nightShiftStartHour: number
  nightShiftEndHour: number
}

export async function getSettings(): Promise<SettingsResponse> {
  return api<SettingsResponse>('/api/admin/settings')
}

export async function updateSettings(data: Partial<SettingsResponse>): Promise<SettingsResponse> {
  return api<SettingsResponse>('/api/admin/settings', {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}
