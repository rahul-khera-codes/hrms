import { api } from './api'

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
