import { useState, useEffect, useMemo } from 'react'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, CalendarDays, Search, Download } from 'lucide-react'
import { getClients, getShifts, getEmployees, getSchedule, createScheduleAssignment, deleteScheduleAssignment, type Client, type Shift, type ScheduleAssignment } from '@/lib/apiAdmin'
import { addDays, startOfWeek, format, parseISO } from 'date-fns'
import AdminSelect from '@/components/AdminSelect'
import { PageHeader } from '@/components/PageHeader'

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
  const [search, setSearch] = useState('')

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return employees
    return employees.filter((e) => e.name.toLowerCase().includes(q))
  }, [employees, search])

  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(parseISO(weekStart), i))
  const fromDate = weekStart
  const toDate = format(weekDates[6], 'yyyy-MM-dd')

  useEffect(() => {
    getClients().then(setClients).catch(() => {})
    getEmployees().then((list) => setEmployees(list.map((e) => ({ id: e.id, name: e.name })))).catch(() => {})
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

  function exportScheduleCSV() {
    if (!clientId || filteredEmployees.length === 0) return
    const headers = ['Employee', ...weekDates.map((d) => format(d, 'EEE d MMM'))]
    const rows = filteredEmployees.map((emp) => {
      const row: string[] = [emp.name]
      for (const d of weekDates) {
        const dateStr = format(d, 'yyyy-MM-dd')
        const a = getAssignment(emp.id, dateStr)
        row.push(a ? a.shiftName : '')
      }
      return row
    })
    const csv = [
      headers.join(','),
      ...rows.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')),
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `schedule-${fromDate}-to-${toDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="page">
      <PageHeader
        title="Schedule"
        subtitle="Assign employees to shifts per BPO client by week."
        icon={<CalendarDays className="w-5 h-5" />}
        actions={
          <button
            type="button"
            onClick={exportScheduleCSV}
            disabled={!clientId || filteredEmployees.length === 0}
            className="btn-secondary"
          >
            <Download className="w-4 h-4 shrink-0" />
            Export CSV
          </button>
        }
      />

      {/* Filter bar */}
      <div className="toolbar">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 shrink-0" />
          <input
            type="text"
            placeholder="Search employees by name"
            className="input pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-56">
          <AdminSelect
            value={clientId}
            onChange={(val) => setClientId(val)}
            options={[
              { value: '', label: 'Select BPO client' },
              ...clients.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
        </div>
        <div className="flex items-center gap-1 sm:ml-auto">
          <button type="button" onClick={prevWeek} className="btn-icon text-surface-600 bg-white border border-surface-200 hover:bg-surface-50" aria-label="Previous week">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 min-w-[180px] justify-center px-3 py-2 rounded-xl bg-surface-50 border border-surface-200">
            <CalendarIcon className="w-4 h-4 text-surface-500 shrink-0" />
            <span className="text-xs font-semibold text-surface-900 text-center tabular-nums whitespace-nowrap">
              {format(weekDates[0], 'd MMM')} – {format(weekDates[6], 'd MMM yyyy')}
            </span>
          </div>
          <button type="button" onClick={nextWeek} className="btn-icon text-surface-600 bg-white border border-surface-200 hover:bg-surface-50" aria-label="Next week">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {error && (
        <div className="alert-error"><span>{error}</span></div>
      )}

      {!clientId ? (
        <div className="card empty-state">
          <div className="empty-state-icon"><CalendarDays className="w-5 h-5" /></div>
          <p className="empty-state-title">Select a BPO client</p>
          <p className="empty-state-description">Choose a client above to view and edit the weekly schedule.</p>
        </div>
      ) : loading && assignments.length === 0 ? (
        <div className="card overflow-hidden">
          <div className="p-3 sm:p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-surface-200/70 bg-white p-3 flex items-center gap-3">
                <span className="inline-block w-9 h-9 rounded-lg bg-surface-200/70 animate-pulse shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <span className="block h-3 w-1/2 rounded bg-surface-200/70 animate-pulse" />
                  <span className="block h-2.5 w-1/3 rounded bg-surface-200/70 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : filteredEmployees.length === 0 && search ? (
        <div className="card empty-state">
          <div className="empty-state-icon"><Search className="w-5 h-5" /></div>
          <p className="empty-state-title">No matches</p>
          <p className="empty-state-description">No employees match "{search}".</p>
        </div>
      ) : (
        <div className="card overflow-hidden min-w-0">
          <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse min-w-[780px]">
            <thead>
              <tr className="border-b border-surface-200 bg-surface-50/80">
                <th className="py-3 px-3 text-[10px] font-semibold text-surface-500 uppercase tracking-wider md:sticky md:left-0 bg-surface-50 md:z-10 min-w-[140px]">Employee</th>
                {weekDates.map((d) => (
                  <th key={d.toISOString()} className="py-3 px-2 text-[10px] font-semibold text-surface-500 uppercase tracking-wider text-center whitespace-nowrap min-w-[90px]">
                    {WEEKDAY_LABELS[d.getDay() === 0 ? 6 : d.getDay() - 1]}
                    <br />
                    <span className="text-xs font-normal text-surface-700 normal-case">{format(d, 'd')}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employees.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-surface-500 text-sm">No employees.</td>
                </tr>
              ) : (
                filteredEmployees.map((emp) => (
                  <tr key={emp.id} className="border-b border-surface-100 hover:bg-brand-50/20">
                    <td className="py-2 px-3 text-xs font-medium text-surface-900 md:sticky md:left-0 bg-white md:z-10 min-w-[140px]">{emp.name}</td>
                    {weekDates.map((d) => {
                      const dateStr = format(d, 'yyyy-MM-dd')
                      const a = getAssignment(emp.id, dateStr)
                      const key = `${emp.id}-${dateStr}`
                      const isUpdating = updating === key
                      return (
                        <td key={dateStr} className="py-1 px-1 align-middle min-w-[90px]">
                          <AdminSelect
                            value={a?.shiftId ?? ''}
                            onChange={(val) => handleCellChange(emp.id, dateStr, val)}
                            options={[
                              { value: '', label: '—' },
                              ...shifts.map((s) => ({ value: s.id, label: s.name })),
                            ]}
                            disabled={isUpdating}
                            className="text-xs w-full"
                          />
                        </td>
                      )
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  )
}

