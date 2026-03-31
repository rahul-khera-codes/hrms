import type { AttendanceRecord } from '@/types'
import { api, getToken } from './api'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000'

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

export interface PayrollLineItem {
  id: string
  type: string
  label: string
  amount: number
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
  holidayScheduledHours?: number
  holidayWorkedHours?: number
  holidayPay?: number
  leavePay?: number
  totalHours: number
  regularPay: number
  ot35Pay: number
  ot100Pay: number
  nightPay: number
  totalPay: number
  lineItems?: PayrollLineItem[]
  additionsTotal?: number
  deductionsTotal?: number
  socialSecurity?: number
  tax?: number
  infotep?: number
  netPay?: number
  govAutoCalculated?: boolean
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
    totalHolidayScheduledHours?: number
    totalHolidayWorkedHours?: number
    totalHolidayPay?: number
    totalLeavePay?: number
    totalRegularPay: number
    totalOt35Pay: number
    totalOt100Pay: number
    totalNightPay: number
    totalPay: number
    totalAdditions?: number
    totalDeductions?: number
    totalGovDeductions?: number
    totalNetPay?: number
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

/** Download PDF payroll slip for one employee (admin). */
export async function downloadPayrollSlipPdf(params: { employeeId: string; from: string; to: string }): Promise<void> {
  const token = getToken()
  const search = new URLSearchParams({
    employeeId: params.employeeId,
    from: params.from,
    to: params.to,
  })
  const res = await fetch(`${API_BASE}/api/admin/payroll/slip.pdf?${search}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string }
    throw new Error(data.message || 'Failed to download PDF')
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `payroll-slip-${params.from}-to-${params.to}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

export interface HolidayItem {
  id: string
  date: string | null
  name: string
  isPaid: boolean
}

export async function getHolidays(params?: { from?: string; to?: string }): Promise<HolidayItem[]> {
  const q = new URLSearchParams()
  if (params?.from) q.set('from', params.from)
  if (params?.to) q.set('to', params.to)
  return api<HolidayItem[]>(`/api/admin/holidays${q.toString() ? `?${q.toString()}` : ''}`)
}

export async function createHoliday(data: { date: string; name: string; isPaid?: boolean }): Promise<HolidayItem> {
  return api<HolidayItem>('/api/admin/holidays', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function deleteHoliday(id: string): Promise<void> {
  return api(`/api/admin/holidays/${id}`, { method: 'DELETE' })
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

export async function getPayrollLineItems(params: { from: string; to: string }): Promise<
  { id: string; userId: string; userName: string; periodFrom: string; periodTo: string; type: string; label: string; amount: number }[]
> {
  const q = new URLSearchParams({ from: params.from, to: params.to })
  return api(`/api/admin/payroll/line-items?${q}`)
}

export async function createPayrollLineItem(data: {
  employeeId: string
  periodFrom: string
  periodTo: string
  type: 'bonus' | 'incentive' | 'deduction' | 'passthrough_credit'
  label?: string
  amount: number
}): Promise<{ id: string; userId: string; periodFrom: string; periodTo: string; type: string; label: string; amount: number }> {
  return api('/api/admin/payroll/line-items', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function deletePayrollLineItem(id: string): Promise<void> {
  return api(`/api/admin/payroll/line-items/${id}`, { method: 'DELETE' })
}

export async function setPayrollDeductions(data: {
  employeeId: string
  periodFrom: string
  periodTo: string
  socialSecurity: number
  tax: number
  infotep: number
}): Promise<{ employeeId: string; periodFrom: string; periodTo: string; socialSecurity: number; tax: number; infotep: number }> {
  return api('/api/admin/payroll/deductions', {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export interface PayrollPeriod {
  periodFrom: string
  periodTo: string
  payDate: string
  cycleCode: string
  yearCycle: number
}

export async function getPayrollPeriods(year?: number): Promise<PayrollPeriod[]> {
  const q = year != null ? `?year=${year}` : ''
  return api<PayrollPeriod[]>(`/api/admin/payroll/periods${q}`)
}

export interface SettingsResponse {
  workingDaysPerMonth: number
  hoursPerDay: number
  otMultiplier: number
  nightMultiplier: number
  nightShiftStartHour: number
  nightShiftEndHour: number
  /** Company default reference amount (USD); per-employee pay is still set under Employees. */
  defaultBaseSalary: number
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
  overrideStart?: string | null
  overrideEnd?: string | null
  date: string
}

export interface EmployeeOption {
  id: string
  name: string
}

export interface EmployeeRecord {
  id: string
  name: string
  email: string
  salaryType: string
  baseSalary: number
}

export async function getEmployees(): Promise<EmployeeRecord[]> {
  return api<EmployeeRecord[]>('/api/admin/employees')
}

export async function createEmployee(data: {
  name: string
  email: string
  password: string
  salaryType?: 'hourly' | 'monthly'
  baseSalary?: number
}): Promise<EmployeeRecord> {
  return api<EmployeeRecord>('/api/admin/employees', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateEmployee(
  id: string,
  data: { name?: string; email?: string; password?: string; salaryType?: 'hourly' | 'monthly'; baseSalary?: number }
): Promise<EmployeeRecord> {
  return api<EmployeeRecord>(`/api/admin/employees/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
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

export async function createScheduleAssignment(data: {
  clientId: string
  userId: string
  shiftId: string
  date: string
  overrideStartTime?: string
  overrideEndTime?: string
}): Promise<ScheduleAssignment> {
  return api<ScheduleAssignment>('/api/admin/schedule', { method: 'POST', body: JSON.stringify(data) })
}

export async function deleteScheduleAssignment(id: string): Promise<void> {
  return api(`/api/admin/schedule/${id}`, { method: 'DELETE' })
}

export interface AdminLeaveRequest {
  id: string
  employeeId: string
  employeeName: string
  leaveType: 'paid' | 'unpaid'
  startDate: string | null
  endDate: string | null
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  reviewedByName?: string
  reviewedNote?: string
  reviewedAt?: string | null
  createdAt?: string
  leaveCalculationType?: string | null
  leaveAssociateDaysOff?: string | null
  leavePayableDays?: number | null
  leavePayableAmount?: number | null
}

export interface LeaveReviewContext {
  leave: {
    id: string
    employeeId: string
    employeeName: string
    leaveType: 'paid' | 'unpaid'
    startDate: string
    endDate: string
    reason: string
    status: 'pending'
  }
  employee: { salaryType: 'hourly' | 'monthly'; baseSalary: number }
  settings: { workingDaysPerMonth: number; hoursPerDay: number }
  suggestedPayableDays: number
  defaultCalculationType: 'hourly_salary' | 'monthly_salary'
}

export async function getAdminLeaveRequests(status: 'all' | 'pending' | 'approved' | 'rejected' = 'all'): Promise<AdminLeaveRequest[]> {
  const q = new URLSearchParams()
  if (status !== 'all') q.set('status', status)
  return api<AdminLeaveRequest[]>(`/api/admin/leave-requests${q.toString() ? `?${q.toString()}` : ''}`)
}

export async function getLeaveReviewContext(id: string): Promise<LeaveReviewContext> {
  return api<LeaveReviewContext>(`/api/admin/leave-requests/${id}/review-context`)
}

export async function reviewAdminLeaveRequest(
  id: string,
  data: {
    status: 'approved' | 'rejected'
    reviewedNote?: string
    calculationType?: 'non_payable' | 'hourly_salary' | 'monthly_salary'
    associateDaysOff?: string[]
    payableDays?: number
  }
): Promise<AdminLeaveRequest> {
  return api<AdminLeaveRequest>(`/api/admin/leave-requests/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}
