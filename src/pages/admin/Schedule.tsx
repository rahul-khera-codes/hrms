import { useState, useEffect } from 'react'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react'
import { getClients, getShifts, getEmployees, getSchedule, createScheduleAssignment, deleteScheduleAssignment, type Client, type Shift, type ScheduleAssignment } from '@/lib/apiAdmin'
import { addDays, startOfWeek, format, parseISO } from 'date-fns'

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function AdminSchedule() {
  const [clients, setClients] = useState<Client[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([])
  const [assignments, setAssignments] = useState<ScheduleAssignment[]>([])
  const [clientId, setClientId] = useState('')
  const [weekStart, setWeekStart] = useState(() => {
    const d = startOfWeek(new Date(), { weekStartsOn: 1 })
    return format(d, 'yyyy-MM-dd')
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)

  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(parseISO(weekStart), i))
  const fromDate = weekStart
  const toDate = format(weekDates[6], 'yyyy-MM-dd')

  useEffect(() => {
    getClients().then(setClients).catch(() => {})
    getEmployees().then(setEmployees).catch(() => {})
  }, [])

  useEffect(() => {
    if (clientId) {
      getShifts(clientId).then(setShifts).catch(() => setShifts([]))
    } else {
      setShifts([])
    }
  }, [clientId])

  useEffect(() => {
    if (!clientId) {
      setAssignments([])
      return
    }
    setLoading(true)
    setError(null)
    getSchedule({ clientId, from: fromDate, to: toDate })
      .then(setAssignments)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load schedule'))
      .finally(() => setLoading(false))
  }, [clientId, fromDate, toDate])

  function getAssignment(userId: string, date: string): ScheduleAssignment | undefined {
    return assignments.find((a) => a.userId === userId && a.date === date)
  }

  async function handleCellChange(userId: string, date: string, shiftId: string) {
    if (!clientId) return
    const key = `${userId}-${date}`
    setUpdating(key)
    setError(null)
    try {
      const existing = getAssignment(userId, date)
      if (shiftId === '') {
        if (existing) await deleteScheduleAssignment(existing.id)
      } else {
        await createScheduleAssignment({ clientId, userId, shiftId, date })
      }
      const next = await getSchedule({ clientId, from: fromDate, to: toDate })
      setAssignments(next)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update')
    } finally {
      setUpdating(null)
    }
  }

  function prevWeek() {
    setWeekStart(format(addDays(parseISO(weekStart), -7), 'yyyy-MM-dd'))
  }

  function nextWeek() {
    setWeekStart(format(addDays(parseISO(weekStart), 7), 'yyyy-MM-dd'))
  }

  return (
    <div className="space-y-6 sm:space-y-8 overflow-x-hidden">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-surface-900 tracking-tight">Schedule</h1>
        <p className="text-surface-500 mt-1 text-xs sm:text-sm">Assign employees to shifts per BPO client by week.</p>
      </div>

      <div className="rounded-xl sm:rounded-2xl border border-surface-200/80 bg-white p-4 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row flex-wrap gap-4 items-stretch sm:items-end">
          <div className="flex-1 min-w-0 sm:max-w-xs">
            <label className="label">BPO Client</label>
            <select
              className="input w-full rounded-xl min-h-[2.75rem]"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            >
              <option value="">Select client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={prevWeek} className="p-2 rounded-xl border border-surface-200 hover:bg-surface-50" aria-label="Previous week">
              <ChevronLeft className="w-5 h-5 text-surface-600" />
            </button>
            <div className="flex items-center gap-2 min-w-[200px] justify-center">
              <CalendarIcon className="w-5 h-5 text-surface-500" />
              <span className="text-sm font-medium text-surface-900">
                {format(weekDates[0], 'd MMM')} – {format(weekDates[6], 'd MMM yyyy')}
              </span>
            </div>
            <button type="button" onClick={nextWeek} className="p-2 rounded-xl border border-surface-200 hover:bg-surface-50" aria-label="Next week">
              <ChevronRight className="w-5 h-5 text-surface-600" />
            </button>
          </div>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600" role="alert">{error}</p>
      )}

      {!clientId ? (
        <div className="rounded-xl border border-surface-200/80 bg-white p-8 text-center text-surface-500 text-sm">
          Select a BPO client to view and edit the schedule.
        </div>
      ) : loading && assignments.length === 0 ? (
        <div className="rounded-xl border border-surface-200/80 bg-white p-8 text-center text-surface-500 text-sm">
          Loading schedule…
        </div>
      ) : (
        <div className="rounded-xl sm:rounded-2xl border border-surface-200/80 bg-white shadow-sm overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse min-w-[600px]">
            <thead>
              <tr className="border-b border-surface-200 bg-surface-50/80">
                <th className="py-3 px-3 font-medium text-surface-700 sticky left-0 bg-surface-50/80 z-10 min-w-[120px]">Employee</th>
                {weekDates.map((d) => (
                  <th key={d.toISOString()} className="py-3 px-2 font-medium text-surface-700 text-center whitespace-nowrap">
                    {WEEKDAY_LABELS[d.getDay() === 0 ? 6 : d.getDay() - 1]}
                    <br />
                    <span className="text-xs font-normal text-surface-500">{format(d, 'd')}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employees.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-surface-500">No employees.</td>
                </tr>
              ) : (
                employees.map((emp) => (
                  <tr key={emp.id} className="border-b border-surface-100 hover:bg-surface-50/50">
                    <td className="py-2 px-3 font-medium text-surface-900 sticky left-0 bg-white z-10">{emp.name}</td>
                    {weekDates.map((d) => {
                      const dateStr = format(d, 'yyyy-MM-dd')
                      const a = getAssignment(emp.id, dateStr)
                      const key = `${emp.id}-${dateStr}`
                      const isUpdating = updating === key
                      return (
                        <td key={dateStr} className="py-1 px-1 align-middle">
                          <select
                            className="w-full text-xs rounded-lg border border-surface-200 bg-white py-1.5 px-2 min-h-[2rem] disabled:opacity-60"
                            value={a?.shiftId ?? ''}
                            onChange={(e) => handleCellChange(emp.id, dateStr, e.target.value)}
                            disabled={isUpdating}
                          >
                            <option value="">—</option>
                            {shifts.map((s) => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        </td>
                      )
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
