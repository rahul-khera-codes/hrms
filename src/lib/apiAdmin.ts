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
  rulesUsed?: {
    otMultiplier: number
    nightMultiplier: number
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

// --- Scheduling: BPO clients, shifts, schedule ---

export interface Client {
  id: string
  name: string
  code: string | null
}

export interface Shift {
  id: string
  name: string
  startTime: string
  endTime: string
  clientId: string | null
  timezone?: string
}

export interface ScheduleAssignment {
  id: string
  clientId: string
  userId: string
  userName: string
  shiftId: string
  shiftName: string
  shiftStart: string
  shiftEnd: string
  date: string
}

export interface EmployeeOption {
  id: string
  name: string
}

export async function getEmployees(): Promise<EmployeeOption[]> {
  return api<EmployeeOption[]>('/api/admin/employees')
}

export async function getClients(): Promise<Client[]> {
  return api<Client[]>('/api/admin/clients')
}

export async function createClient(data: { name: string; code?: string }): Promise<Client> {
  return api<Client>('/api/admin/clients', { method: 'POST', body: JSON.stringify(data) })
}

export async function updateClient(id: string, data: { name?: string; code?: string }): Promise<Client> {
  return api<Client>(`/api/admin/clients/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export async function deleteClient(id: string): Promise<void> {
  return api(`/api/admin/clients/${id}`, { method: 'DELETE' })
}

export async function getShifts(clientId?: string): Promise<Shift[]> {
  const q = clientId ? `?client_id=${encodeURIComponent(clientId)}` : ''
  return api<Shift[]>(`/api/admin/shifts${q}`)
}

export async function createShift(data: { name: string; startTime?: string; endTime?: string; clientId?: string; timezone?: string }): Promise<Shift> {
  return api<Shift>('/api/admin/shifts', { method: 'POST', body: JSON.stringify(data) })
}

export async function updateShift(id: string, data: { name?: string; startTime?: string; endTime?: string; clientId?: string; timezone?: string }): Promise<Shift> {
  return api<Shift>(`/api/admin/shifts/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export async function deleteShift(id: string): Promise<void> {
  return api(`/api/admin/shifts/${id}`, { method: 'DELETE' })
}

export async function getSchedule(params: { clientId: string; from: string; to: string }): Promise<ScheduleAssignment[]> {
  const search = new URLSearchParams({ client_id: params.clientId, from: params.from, to: params.to })
  return api<ScheduleAssignment[]>(`/api/admin/schedule?${search}`)
}

export async function createScheduleAssignment(data: { clientId: string; userId: string; shiftId: string; date: string }): Promise<ScheduleAssignment> {
  return api<ScheduleAssignment>('/api/admin/schedule', { method: 'POST', body: JSON.stringify(data) })
}

export async function deleteScheduleAssignment(id: string): Promise<void> {
  return api(`/api/admin/schedule/${id}`, { method: 'DELETE' })
}
