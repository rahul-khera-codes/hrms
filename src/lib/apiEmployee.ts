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
