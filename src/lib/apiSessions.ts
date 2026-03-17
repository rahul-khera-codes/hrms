import type { ClockSession } from '@/types'
import type { PayrollSummary } from '@/types'
import { api } from './api'

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
