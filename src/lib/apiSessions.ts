import type { ClockSession } from '@/types'
import type { PayrollSummary } from '@/types'
import { api, getToken } from './api'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export interface SessionsSummaryResponse {
  period: string
  regularMinutes?: number
  overtimeMinutes?: number
  nightMinutes?: number
  totalMinutes?: number
  regularHours: number
  overtimeHours: number
  nightHours: number
  totalHours: number
}

export async function getActiveSession(): Promise<ClockSession | null> {
  const data = await api<ClockSession | null>('/api/sessions/active')
  return data
}

export async function getSessions(params?: { from?: string; to?: string; limit?: number }): Promise<ClockSession[]> {
  const search = new URLSearchParams()
  if (params?.from) search.set('from', params.from)
  if (params?.to) search.set('to', params.to)
  if (params?.limit != null) search.set('limit', String(params.limit))
  const q = search.toString()
  const data = await api<ClockSession[]>(`/api/sessions${q ? `?${q}` : ''}`)
  return data
}

export async function getSummary(params?: { from?: string; to?: string }): Promise<SessionsSummaryResponse> {
  const search = new URLSearchParams()
  if (params?.from) search.set('from', params.from)
  if (params?.to) search.set('to', params.to)
  const q = search.toString()
  const data = await api<SessionsSummaryResponse>(`/api/sessions/summary${q ? `?${q}` : ''}`)
  return data as PayrollSummary & SessionsSummaryResponse
}

export async function clockIn(): Promise<ClockSession> {
  return api<ClockSession>('/api/sessions/clock-in', { method: 'POST' })
}

export async function clockOut(): Promise<ClockSession> {
  return api<ClockSession>('/api/sessions/clock-out', { method: 'POST' })
}

/** Fetch PDF payroll slip for the logged-in employee. Set persist to save a copy to payslip history (download). */
export async function fetchMyPayrollSlipPdfBlob(params: {
  from: string
  to: string
  persist?: boolean
}): Promise<Blob> {
  const token = getToken()
  const search = new URLSearchParams({ from: params.from, to: params.to })
  if (params.persist) search.set('persist', '1')
  const res = await fetch(`${API_BASE}/api/sessions/payroll-slip.pdf?${search}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string }
    throw new Error(data.message || 'Failed to load PDF')
  }
  return res.blob()
}

/** Download PDF payroll slip for the logged-in employee (also adds/updates history for this period). */
export async function downloadMyPayrollSlipPdf(params: { from: string; to: string }): Promise<void> {
  const blob = await fetchMyPayrollSlipPdfBlob({ from: params.from, to: params.to, persist: true })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `payroll-slip-${params.from}-to-${params.to}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

export interface PayslipHistoryItem {
  id: string
  periodFrom: string
  periodTo: string
  savedAt: string
}

/** List saved payslip PDFs (per period) for the logged-in employee. */
export async function listMyPayrollSlips(): Promise<PayslipHistoryItem[]> {
  return api<PayslipHistoryItem[]>('/api/sessions/payroll-slips')
}

/** Download a previously saved payslip PDF by id. */
export async function downloadStoredPayslipPdf(item: PayslipHistoryItem): Promise<void> {
  const token = getToken()
  const res = await fetch(`${API_BASE}/api/sessions/payroll-slips/${item.id}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string }
    throw new Error(data.message || 'Failed to download saved payslip')
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `payroll-slip-${item.periodFrom}-to-${item.periodTo}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}
