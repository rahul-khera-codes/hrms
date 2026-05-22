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

export async function updateAttendanceRecord(
  sessionId: string,
  data: {
    statusOverride?: string | null
    payType?: string
    billType?: string
    task?: string | null
    stage?: string | null
    location?: string | null
    comments?: string | null
    shiftStart?: string | null
    shiftEnd?: string | null
    clockIn?: string | null
    clockOut?: string | null
    reportsToOverride?: string | null
    accountOverride?: string | null
    isLocked?: boolean
    force?: boolean
  }
): Promise<AttendanceRecord> {
  return api<AttendanceRecord>(`/api/admin/attendance/${sessionId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function setAttendanceReviewed(sessionId: string, reviewed: boolean): Promise<{ id: string; reviewed: boolean }> {
  return api<{ id: string; reviewed: boolean }>(`/api/admin/attendance/${sessionId}/reviewed`, {
    method: 'PATCH',
    body: JSON.stringify({ reviewed }),
  })
}

export async function getAttendanceNeedsReview(params?: { from?: string; to?: string }): Promise<{ needsReview: number }> {
  const q = new URLSearchParams()
  if (params?.from) q.set('from', params.from)
  if (params?.to) q.set('to', params.to)
  const qs = q.toString()
  return api<{ needsReview: number }>(`/api/admin/attendance/needs-review${qs ? `?${qs}` : ''}`)
}

export async function createAttendanceRecord(data: {
  employeeId: string
  clockIn: string
  clockOut?: string | null
  shiftStart?: string | null
  shiftEnd?: string | null
  statusOverride?: string | null
  payType?: string
  billType?: string
  task?: string | null
  stage?: string | null
  comments?: string | null
  reportsToOverride?: string | null
  accountOverride?: string | null
  isLocked?: boolean
}): Promise<AttendanceRecord> {
  return api<AttendanceRecord>('/api/admin/attendance', {
    method: 'POST',
    body: JSON.stringify(data),
  })
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
  status: string
  bs?: number
  isSpecial?: boolean
}

export async function getPayrollPeriods(year?: number): Promise<PayrollPeriod[]> {
  const q = year != null ? `?year=${year}` : ''
  return api<PayrollPeriod[]>(`/api/admin/payroll/periods${q}`)
}

export interface AdminUser {
  id: string
  name: string
  email: string
  role: string
}

export async function getAdminUsers(): Promise<AdminUser[]> {
  return api<AdminUser[]>('/api/admin/users')
}

export interface SettingsResponse {
  workingDaysPerMonth: number
  hoursPerDay: number
  otMultiplier: number
  doubleOtMultiplier: number
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
  vertical: string | null
  salesOwnerId: string | null
  salesOwnerName: string | null
  opsOwnerId: string | null
  opsOwnerName: string | null
  registeredAddress: string | null
  website: string | null
  mainPhone: string | null
  opsPoc: string | null
  opsPocEmail: string | null
  opsPhone: string | null
  billingPoc: string | null
  billingPocEmail: string | null
  billingPocPhone: string | null
  billableHeadcount: number | null
  billableType: string | null
  billingRate: number | null
  otPremium: number | null
  contractStatus: string | null
  terminationDate: string | null
  terminationReason: string | null
  isLocked: boolean
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
  published?: boolean
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
  role?: string
  accessLevel?: 'admin' | 'supervisor' | 'agent'
  accessEnabled?: boolean
  salaryType: string
  baseSalary: number
  cmid?: number | null
  harmonyId?: string | null
  contractType?: string | null
  hireDate?: string | null
  location?: string | null
  department?: string | null
  primaryClientId?: string | null
  primaryClientName?: string | null
  jobTitle?: string | null
  reportsTo?: string | null
  reportsToName?: string | null
  contractStatus?: string | null
  terminationDate?: string | null
  bank?: string | null
  bankAccount?: string | null
  payMethod?: string | null
  governmentId?: string | null
  gender?: string | null
  dateOfBirth?: string | null
  personalEmail?: string | null
  companyEmail?: string | null
  homePhone?: string | null
  mobilePhone?: string | null
  terminationReason?: string | null
  isLocked?: boolean
  shiftGroup?: string | null
}

export async function getEmployees(): Promise<EmployeeRecord[]> {
  return api<EmployeeRecord[]>('/api/admin/employees')
}

export async function createEmployee(data: {
  name: string
  email: string
  password: string
  accessLevel?: 'admin' | 'supervisor' | 'agent'
  accessEnabled?: boolean
  salaryType?: 'hourly' | 'monthly'
  baseSalary?: number
  cmid?: number | null
  contractType?: string
  hireDate?: string
  location?: string
  department?: string
  shiftGroup?: string
  primaryClientId?: string
  jobTitle?: string
  reportsTo?: string
  contractStatus?: string
  terminationDate?: string
  terminationReason?: string
  bank?: string
  bankAccount?: string
  payMethod?: string
  governmentId?: string
  gender?: string
  dateOfBirth?: string
  personalEmail?: string
  companyEmail?: string
  homePhone?: string
  mobilePhone?: string
}): Promise<EmployeeRecord> {
  return api<EmployeeRecord>('/api/admin/employees', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateEmployee(
  id: string,
  data: {
    name?: string
    email?: string
    password?: string
    accessLevel?: 'admin' | 'supervisor' | 'agent'
    accessEnabled?: boolean
    salaryType?: 'hourly' | 'monthly'
    baseSalary?: number
    cmid?: number | null
    contractType?: string
    hireDate?: string
    location?: string
    department?: string
    shiftGroup?: string
    primaryClientId?: string
    jobTitle?: string
    reportsTo?: string
    contractStatus?: string
    terminationDate?: string
    terminationReason?: string
    bank?: string
    bankAccount?: string
    payMethod?: string
    governmentId?: string
    gender?: string
    dateOfBirth?: string
    personalEmail?: string
    companyEmail?: string
    homePhone?: string
    mobilePhone?: string
  }
): Promise<EmployeeRecord> {
  return api<EmployeeRecord>(`/api/admin/employees/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function deleteEmployee(id: string): Promise<void> {
  return api<void>(`/api/admin/employees/${id}`, { method: 'DELETE' })
}

export async function setEmployeeLocked(id: string, locked: boolean): Promise<void> {
  return api(`/api/admin/employees/${id}/lock`, { method: 'PATCH', body: JSON.stringify({ locked }) })
}

export async function getClients(): Promise<Client[]> {
  return api<Client[]>('/api/admin/clients')
}

export async function createClient(data: {
  name: string
  code?: string
  vertical?: string | null
  salesOwnerId?: string | null
  opsOwnerId?: string | null
  registeredAddress?: string | null
  website?: string | null
  mainPhone?: string | null
  opsPoc?: string | null
  opsPocEmail?: string | null
  opsPhone?: string | null
  billingPoc?: string | null
  billingPocEmail?: string | null
  billingPocPhone?: string | null
  billableHeadcount?: number | null
  billableType?: string | null
  billingRate?: number | null
  otPremium?: number | null
  contractStatus?: string | null
  terminationDate?: string | null
  terminationReason?: string | null
}): Promise<Client> {
  return api<Client>('/api/admin/clients', { method: 'POST', body: JSON.stringify(data) })
}

export async function updateClient(id: string, data: {
  name?: string
  code?: string
  vertical?: string | null
  salesOwnerId?: string | null
  opsOwnerId?: string | null
  registeredAddress?: string | null
  website?: string | null
  mainPhone?: string | null
  opsPoc?: string | null
  opsPocEmail?: string | null
  opsPhone?: string | null
  billingPoc?: string | null
  billingPocEmail?: string | null
  billingPocPhone?: string | null
  billableHeadcount?: number | null
  billableType?: string | null
  billingRate?: number | null
  otPremium?: number | null
  contractStatus?: string | null
  terminationDate?: string | null
  terminationReason?: string | null
}): Promise<Client> {
  return api<Client>(`/api/admin/clients/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export async function deleteClient(id: string): Promise<void> {
  return api(`/api/admin/clients/${id}`, { method: 'DELETE' })
}

export async function setClientLocked(id: string, locked: boolean): Promise<void> {
  return api(`/api/admin/clients/${id}/lock`, { method: 'PATCH', body: JSON.stringify({ locked }) })
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

// Per-weekday "Master Week" entry — exactly one of `off`, `shiftId`, or
// `startTime/endTime` should be set (per the 19MAY2026 SCHEDULER DEMOs meeting).
export type WeeklyPatternEntry =
  | { off: true }
  | { shiftId: string }
  | { startTime: string; endTime: string }

export interface BulkAssignRequest {
  clientId: string
  shiftId?: string
  overrideStartTime?: string
  overrideEndTime?: string
  userIds?: string[]
  shiftGroup?: string
  allInAccount?: boolean
  dateFrom: string
  dateTo: string
  daysOff?: number[]
  // 7-entry array indexed 0=Sun … 6=Sat. When provided, the endpoint runs in
  // per-weekday mode and ignores `shiftId`, `overrideStart/EndTime`, `daysOff`.
  weeklyPattern?: WeeklyPatternEntry[]
}
export interface BulkAssignResponse {
  created: number
  updated: number
  totalRows: number
  employees: number
  dates: number
  shiftId: string | null
  shiftIds: string[]
  mode: 'same-shift' | 'per-weekday'
  attendanceCreated?: number
}
export async function bulkAssignSchedule(data: BulkAssignRequest): Promise<BulkAssignResponse> {
  return api<BulkAssignResponse>('/api/admin/schedule/bulk-assign', { method: 'POST', body: JSON.stringify(data) })
}

export interface ScheduleStats {
  totalShifts: number
  filledShifts: number
  openShifts: number
  totalHours: number
  publishedCount: number
}
export async function getScheduleStats(params: { clientId: string; from: string; to: string }): Promise<ScheduleStats> {
  const search = new URLSearchParams({ client_id: params.clientId, from: params.from, to: params.to })
  return api<ScheduleStats>(`/api/admin/schedule/stats?${search}`)
}

export async function publishSchedule(data: { clientId: string; from: string; to: string }): Promise<{ published: number }> {
  return api<{ published: number }>('/api/admin/schedule/publish', { method: 'POST', body: JSON.stringify(data) })
}

export async function getShiftGroups(): Promise<string[]> {
  return api<string[]>('/api/admin/schedule/shift-groups')
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
  leaveCategory?: string | null
  returnDate?: string | null
  startTime?: string | null
  endTime?: string | null
  returnTime?: string | null
  hourlyRateInput?: number | null
  dailyHoursInput?: number | null
  monthlyRateInput?: number | null
  assetDeactivation?: string | null
  payrollCycleCode?: string | null
  dailySalary?: number | null
  employeeCmid?: number | null
  accountName?: string | null
  reportsTo?: string | null
  isLocked?: boolean
  payrollStatus?: string | null
  approverName?: string | null
  // 21MAY2026 audit-trail rollout
  createdBy?: string | null
  createdByName?: string | null
  createdOn?: string | null
  modifiedBy?: string | null
  modifiedByName?: string | null
  modifiedOn?: string | null
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
    status: 'pending' | 'approved' | 'rejected'
    isLocked?: boolean
    reviewedNote?: string
    payableDays?: number | null
    leaveCategory?: string | null
    calculationType?: string | null
    associateDaysOff?: string | null
    returnDate?: string | null
    startTime?: string | null
    endTime?: string | null
    returnTime?: string | null
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
    status?: 'approved' | 'rejected'
    reviewedNote?: string
    calculationType?: 'non_payable' | 'hourly_salary' | 'monthly_salary'
    associateDaysOff?: string[]
    payableDays?: number
    isLocked?: boolean
    force?: boolean
    leaveCategory?: string
    startDate?: string
    endDate?: string
    returnDate?: string
    startTime?: string
    endTime?: string
    returnTime?: string
    payrollCycleCode?: string
    hourlyRateInput?: number
    dailyHoursInput?: number
    monthlyRateInput?: number
    assetDeactivation?: string[] | string
    reason?: string
    approverName?: string
    payrollStatus?: string
  }
): Promise<AdminLeaveRequest> {
  return api<AdminLeaveRequest>(`/api/admin/leave-requests/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

/** Toggle just the lock state on a leave request (works on any status) */
export async function setLeaveRequestLocked(id: string, locked: boolean): Promise<AdminLeaveRequest> {
  return api<AdminLeaveRequest>(`/api/admin/leave-requests/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ isLocked: locked }),
  })
}

/** 21MAY2026 client video: hard-delete a leave request (must be unlocked). */
export async function deleteAdminLeaveRequest(id: string): Promise<void> {
  return api<void>(`/api/admin/leave-requests/${id}`, { method: 'DELETE' })
}

export async function createAdminLeaveRequest(data: {
  employeeId: string
  leaveType: 'paid' | 'unpaid'
  leaveCategory?: string
  calculationType: 'non_payable' | 'hourly_salary' | 'monthly_salary'
  payableDays?: number
  hourlyRate?: number
  dailyHours?: number
  monthlyRate?: number
  associateDaysOff?: string[]
  startDate: string
  endDate: string
  returnDate?: string
  startTime?: string
  endTime?: string
  returnTime?: string
  assetDeactivation?: string[]
  payrollCycleCode?: string
  reason?: string
  approverName?: string
  payrollStatus?: string
}): Promise<AdminLeaveRequest> {
  return api<AdminLeaveRequest>('/api/admin/leave-requests', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

/* ============================================================
 * PAYROLL INPUTS (14APR2026 module)
 * ============================================================ */

export const PAYROLL_INPUT_TYPES = [
  'Comisiones',
  'Horas Regulares',
  'Horas Nocturnas',
  'Horas al 35% Extra',
  'Horas al 100% Extra',
  'Horas Feriadas Trabajadas',
  'Bono Colaboración',
  'Bono Reclutamiento',
  'Bonificación de Ley',
  'Incentivo PA',
  'Incentivo KPI',
  'Descuento Dependiente TSS',
  'Descuento Préstamo',
  'Descuento Cafetería',
  'Descuento Gymnasio',
  'Descuento PayLater',
  'Descuento Seguro',
  'Descuento Admin',
  'Subsidio',
  'Reembolso No Gravable',
] as const
export type PayrollInputType = (typeof PAYROLL_INPUT_TYPES)[number]

export const PAYROLL_CURRENCIES = ['DOP', 'USD'] as const
export type PayrollCurrency = (typeof PAYROLL_CURRENCIES)[number]

export type PayrollCalcType = 'hourly' | 'base_amount' | 'both'

export interface PayrollInput {
  id: string
  userId: string
  employeeName: string | null
  employeeCmid: number | null
  accountName: string | null
  reportsTo: string | null
  inputType: string
  calculationType: PayrollCalcType
  payableHours: number | null
  hourlyRate: number | null
  hourlyMultiplier: number | null
  currency: PayrollCurrency | null
  baseAmount: number | null
  exchangeRate: number | null
  inputAmount: number
  payrollCycleCode: string | null
  approverId: string | null
  approverName: string | null
  status: 'pending' | 'approved' | 'rejected'
  reviewedBy: string | null
  reviewedByName: string | null
  reviewedAt: string | null
  reviewedNote: string
  notes: string
  isLocked: boolean
  createdAt: string
  updatedAt: string
  // 21MAY2026 audit trail rollout
  createdBy?: string | null
  createdByName?: string | null
  createdOn?: string | null
  modifiedBy?: string | null
  modifiedByName?: string | null
  modifiedOn?: string | null
}

export interface PayrollInputCreate {
  userId: string
  inputType: PayrollInputType | string
  calculationType?: PayrollCalcType
  payableHours?: number | null
  hourlyRate?: number | null
  hourlyMultiplier?: number | null
  currency?: PayrollCurrency | null
  baseAmount?: number | null
  exchangeRate?: number | null
  payrollCycleCode?: string | null
  approverId?: string | null
  status?: 'pending' | 'approved' | 'rejected'
  notes?: string | null
}

export interface PayrollInputUpdate extends Partial<PayrollInputCreate> {
  isLocked?: boolean
  reviewedNote?: string
  force?: boolean
}

export async function getPayrollInputs(params?: {
  status?: 'all' | 'pending' | 'approved' | 'rejected'
  type?: string
  cycle?: string
  userId?: string
}): Promise<PayrollInput[]> {
  const q = new URLSearchParams()
  if (params?.status && params.status !== 'all') q.set('status', params.status)
  if (params?.type && params.type !== 'all') q.set('type', params.type)
  if (params?.cycle) q.set('cycle', params.cycle)
  if (params?.userId) q.set('userId', params.userId)
  const qs = q.toString()
  return api<PayrollInput[]>(`/api/admin/payroll-inputs${qs ? `?${qs}` : ''}`)
}

export async function createPayrollInput(data: PayrollInputCreate): Promise<PayrollInput> {
  return api<PayrollInput>('/api/admin/payroll-inputs', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updatePayrollInput(id: string, data: PayrollInputUpdate): Promise<PayrollInput> {
  return api<PayrollInput>(`/api/admin/payroll-inputs/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function setPayrollInputLocked(id: string, locked: boolean): Promise<PayrollInput> {
  return updatePayrollInput(id, { isLocked: locked })
}

export async function deletePayrollInput(id: string): Promise<void> {
  await api<void>(`/api/admin/payroll-inputs/${id}`, { method: 'DELETE' })
}

/** Mirror of backend's computeInputAmount — for live preview in forms */
export function computePayrollInputAmount(input: {
  payableHours?: number | null
  hourlyRate?: number | null
  hourlyMultiplier?: number | null
  baseAmount?: number | null
  exchangeRate?: number | null
}): number {
  const ph = Number(input.payableHours) || 0
  const hr = Number(input.hourlyRate) || 0
  const hm = Number(input.hourlyMultiplier) || 0
  const ba = Number(input.baseAmount)
  const er = Number(input.exchangeRate) || 0
  const hourlyPart = ph * hr * hm
  const basePart = Number.isFinite(ba) && ba !== 0 ? ba * er : 0
  return Math.round((hourlyPart + basePart) * 100) / 100
}

export interface BulkUploadResult {
  created: number
  skipped: number
  errors: string[]
}

export async function bulkUploadPayrollInputs(rows: Record<string, unknown>[]): Promise<BulkUploadResult> {
  return api<BulkUploadResult>('/api/admin/payroll-inputs/bulk-upload', {
    method: 'POST',
    body: JSON.stringify({ rows }),
  })
}

/** Helper: is this input type a deduction? (for payroll calculations next phase) */
export function isDeductionInputType(inputType: string): boolean {
  return inputType.startsWith('Descuento')
}

// ── Payroll Calculator ──
export interface PayrollCalcResult {
  id: string
  payrollCycleCode: string
  periodFrom: string
  periodTo: string
  payDate: string | null
  biWeek: number | null
  userId: string
  employeeCmid: number | null
  employeeName: string
  account: string | null
  salaryType: string
  salary: number
  hourlySalary: number
  contractStatus: string | null
  bank: string | null
  bankAccount: string | null
  payMethod: string | null
  hreg1: number; hreg2: number; hreg: number; ordinarySalary: number
  vacation: number; matrimony: number; maternity: number; paternity: number
  bereavement: number; medical: number; vpl: number
  commissions: number
  subsidio: number; reembolso: number; totalOtherIncome: number; infotepSalary: number
  hn15Hours: number; hn15Amount: number; hx35Hours: number; hx35Amount: number
  hx100Hours: number; hx100Amount: number; hholHours: number; hholAmount: number
  overtimeTotal: number
  collaboration: number; recruiting: number; profitSharing: number; bonusesTotal: number
  attendanceIncentive: number; kpiIncentive: number; incentivesTotal: number
  grossSalary: number; tssSalary: number; isrSalary: number
  afp: number; sfs: number; tssDependents: number; infotep: number
  isrRetention: number; govDeductionsTotal: number
  payLater: number; gym: number; insuranceDed: number; cafeteria: number
  adminDeduction: number; deduccionX: number; otherDeductionsSpare: number
  otherDeductionsTotal: number
  deductionValidation: boolean; totalDeductions: number; netSalary: number; notes: string | null
  governmentId: string | null; ccEmail: string | null
  afpEmployer: number; sfsEmployer: number; arl: number; infotepEmployer: number
}

export async function getPayrollCalcResults(cycleCode: string): Promise<PayrollCalcResult[]> {
  return api<PayrollCalcResult[]>(`/api/admin/payroll-calculator?cycle=${encodeURIComponent(cycleCode)}`)
}

export async function calculatePayroll(cycleCode: string): Promise<PayrollCalcResult[]> {
  return api<PayrollCalcResult[]>('/api/admin/payroll-calculator/calculate', {
    method: 'POST',
    body: JSON.stringify({ cycleCode }),
  })
}

export async function updatePayrollResultField(
  id: string,
  fields: { bank?: string; bankAccount?: string; payMethod?: string; notes?: string; ccEmail?: string },
): Promise<PayrollCalcResult> {
  return api<PayrollCalcResult>(`/api/admin/payroll-calculator/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(fields),
  })
}

export function getPaystubUrl(id: string): string {
  const base = import.meta.env.VITE_API_URL || 'http://localhost:4000'
  const token = getToken()
  return `${base}/api/admin/payroll-calculator/paystub/${encodeURIComponent(id)}${token ? `?token=${encodeURIComponent(token)}` : ''}`
}

// ── Documents ──

export interface DocumentRecord {
  id: string
  entityType: string
  entityId: string
  fileName: string
  originalName: string
  mimeType: string
  fileSize: number
  createdAt: string
}

export async function getDocuments(entityType: string, entityId: string): Promise<DocumentRecord[]> {
  return api<DocumentRecord[]>(`/api/documents/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`)
}

export async function uploadDocument(data: {
  entityType: string
  entityId: string
  fileName: string
  mimeType: string
  data: string
}): Promise<DocumentRecord> {
  return api<DocumentRecord>('/api/documents/upload', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function deleteDocument(id: string): Promise<void> {
  return api<void>(`/api/documents/${id}`, { method: 'DELETE' })
}
