import { useState, useEffect, useMemo } from 'react'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, CalendarDays, Search, Download, Plus, Clock, Users, CheckCircle2 } from 'lucide-react'
import {
  getClients,
  getShifts,
  getEmployees,
  getSchedule,
  bulkAssignSchedule,
  getScheduleStats,
  publishSchedule,
  getShiftGroups,
  deleteScheduleAssignment,
  type Client,
  type Shift,
  type ScheduleAssignment,
  type ScheduleStats,
} from '@/lib/apiAdmin'
import { addDays, startOfWeek, format, parseISO } from 'date-fns'
import AdminSelect from '@/components/AdminSelect'
import { PageHeader } from '@/components/PageHeader'

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
// JS Date weekday: 0=Sun … 6=Sat. We display Mon-first.
const DAYS_PILLS: { value: number; short: string; long: string }[] = [
  { value: 1, short: 'Mon', long: 'Monday' },
  { value: 2, short: 'Tue', long: 'Tuesday' },
  { value: 3, short: 'Wed', long: 'Wednesday' },
  { value: 4, short: 'Thu', long: 'Thursday' },
  { value: 5, short: 'Fri', long: 'Friday' },
  { value: 6, short: 'Sat', long: 'Saturday' },
  { value: 0, short: 'Sun', long: 'Sunday' },
]

// Color palette for shift badges keyed by shift id.
const SHIFT_COLORS = [
  'bg-brand-100 text-brand-800 ring-brand-200',
  'bg-emerald-100 text-emerald-800 ring-emerald-200',
  'bg-amber-100 text-amber-800 ring-amber-200',
  'bg-sky-100 text-sky-800 ring-sky-200',
  'bg-rose-100 text-rose-800 ring-rose-200',
  'bg-violet-100 text-violet-800 ring-violet-200',
  'bg-teal-100 text-teal-800 ring-teal-200',
  'bg-orange-100 text-orange-800 ring-orange-200',
]
function shiftColor(shiftId: string): string {
  let h = 0
  for (let i = 0; i < shiftId.length; i++) h = (h * 31 + shiftId.charCodeAt(i)) & 0x7fffffff
  return SHIFT_COLORS[h % SHIFT_COLORS.length]
}

export default function AdminSchedule() {
  const [clients, setClients] = useState<Client[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([])
  const [assignments, setAssignments] = useState<ScheduleAssignment[]>([])
  const [clientId, setClientId] = useState('')
  const [shiftGroups, setShiftGroups] = useState<string[]>([])
  const [stats, setStats] = useState<ScheduleStats | null>(null)
  const [weekStart, setWeekStart] = useState(() => {
    const d = startOfWeek(new Date(), { weekStartsOn: 1 })
    return format(d, 'yyyy-MM-dd')
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // Assign Shifts side-panel state
  const [paneOpen, setPaneOpen] = useState(false)
  const [paneShiftId, setPaneShiftId] = useState('')
  const [paneStart, setPaneStart] = useState('')
  const [paneEnd, setPaneEnd] = useState('')
  const [paneEmployeeIds, setPaneEmployeeIds] = useState<string[]>([])
  const [paneShiftGroup, setPaneShiftGroup] = useState('')
  const [paneAllInAccount, setPaneAllInAccount] = useState(false)
  const [paneFrom, setPaneFrom] = useState('')
  const [paneTo, setPaneTo] = useState('')
  const [paneDaysOff, setPaneDaysOff] = useState<number[]>([0, 6]) // default: Sat/Sun off
  const [paneSubmitting, setPaneSubmitting] = useState(false)
  const [publishing, setPublishing] = useState(false)

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
    getShiftGroups().then(setShiftGroups).catch(() => {})
  }, [])

  useEffect(() => {
    if (clientId) {
      getShifts(clientId).then(setShifts).catch(() => setShifts([]))
    } else {
      setShifts([])
    }
  }, [clientId])

  async function reload() {
    if (!clientId) {
      setAssignments([])
      setStats(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [next, nextStats] = await Promise.all([
        getSchedule({ clientId, from: fromDate, to: toDate }),
        getScheduleStats({ clientId, from: fromDate, to: toDate }),
      ])
      setAssignments(next)
      setStats(nextStats)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load schedule')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, fromDate, toDate])

  function getAssignment(userId: string, date: string): ScheduleAssignment | undefined {
    return assignments.find((a) => a.userId === userId && a.date === date)
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
        row.push(a ? `${a.shiftName} ${String(a.shiftStart).slice(0, 5)}-${String(a.shiftEnd).slice(0, 5)}` : '')
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

  function openAssignPane() {
    setPaneOpen(true)
    setPaneFrom(paneFrom || fromDate)
    setPaneTo(paneTo || toDate)
  }
  function resetPane() {
    setPaneShiftId('')
    setPaneStart('')
    setPaneEnd('')
    setPaneEmployeeIds([])
    setPaneShiftGroup('')
    setPaneAllInAccount(false)
    setPaneDaysOff([0, 6])
    setError(null)
  }
  function togglePaneEmp(id: string) {
    setPaneEmployeeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }
  function togglePaneDayOff(d: number) {
    setPaneDaysOff((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))
  }

  const paneSummary = useMemo(() => {
    if (!paneFrom || !paneTo) return null
    const start = parseISO(paneFrom)
    const end = parseISO(paneTo)
    if (start > end) return null
    let totalDays = 0
    const offSet = new Set(paneDaysOff)
    for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
      if (!offSet.has(d.getDay())) totalDays++
    }
    // Employee count we can show client-side. Shift group + allInAccount resolve
    // server-side, so report "TBD" for those.
    let employeeLabel: string
    if (paneAllInAccount) employeeLabel = 'All in account'
    else if (paneShiftGroup) employeeLabel = paneEmployeeIds.length > 0 ? `${paneEmployeeIds.length} + group "${paneShiftGroup}"` : `Group "${paneShiftGroup}"`
    else employeeLabel = `${paneEmployeeIds.length}`

    let shiftLabel = ''
    if (paneShiftId) {
      const s = shifts.find((x) => x.id === paneShiftId)
      if (s) shiftLabel = `${s.name} (${String(s.startTime).slice(0, 5)}–${String(s.endTime).slice(0, 5)})`
    } else if (paneStart && paneEnd) {
      shiftLabel = `Custom ${paneStart}–${paneEnd}`
    }

    const rangeLabel = `${format(parseISO(paneFrom), 'd MMM')} – ${format(parseISO(paneTo), 'd MMM yyyy')}`
    // totalShifts is meaningful only for explicit user lists (we can compute it).
    const explicitCount = paneEmployeeIds.length
    const totalShifts = explicitCount > 0 && !paneShiftGroup && !paneAllInAccount ? explicitCount * totalDays : null
    return { totalDays, employeeLabel, shiftLabel, rangeLabel, totalShifts }
  }, [paneFrom, paneTo, paneDaysOff, paneEmployeeIds, paneShiftGroup, paneAllInAccount, paneShiftId, paneStart, paneEnd, shifts])

  async function submitAssign() {
    setError(null)
    setInfo(null)
    if (!clientId) {
      setError('Select an account first.')
      return
    }
    const usingTemplate = !!paneShiftId
    if (!usingTemplate && (!paneStart || !paneEnd)) {
      setError('Pick a shift template or enter both start and end times.')
      return
    }
    const hasEmpSelection = paneEmployeeIds.length > 0 || !!paneShiftGroup || paneAllInAccount
    if (!hasEmpSelection) {
      setError('Pick at least one employee, a shift group, or "All employees in account".')
      return
    }
    if (!paneFrom || !paneTo) {
      setError('Pick a date range.')
      return
    }
    setPaneSubmitting(true)
    try {
      const res = await bulkAssignSchedule({
        clientId,
        ...(usingTemplate ? { shiftId: paneShiftId } : { overrideStartTime: paneStart, overrideEndTime: paneEnd }),
        ...(paneEmployeeIds.length > 0 ? { userIds: paneEmployeeIds } : {}),
        ...(paneShiftGroup ? { shiftGroup: paneShiftGroup } : {}),
        ...(paneAllInAccount ? { allInAccount: true } : {}),
        dateFrom: paneFrom,
        dateTo: paneTo,
        daysOff: paneDaysOff,
      })
      setInfo(`Assigned ${res.totalRows} shift${res.totalRows === 1 ? '' : 's'} (${res.created} new, ${res.updated} updated) across ${res.employees} employee${res.employees === 1 ? '' : 's'} × ${res.dates} day${res.dates === 1 ? '' : 's'}.`)
      await reload()
      resetPane()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Bulk assignment failed')
    } finally {
      setPaneSubmitting(false)
    }
  }

  async function handlePublish() {
    if (!clientId) return
    setPublishing(true)
    setError(null)
    setInfo(null)
    try {
      const res = await publishSchedule({ clientId, from: fromDate, to: toDate })
      setInfo(res.published > 0 ? `Published ${res.published} shift${res.published === 1 ? '' : 's'} — employees notified.` : 'All shifts in this week were already published.')
      await reload()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Publish failed')
    } finally {
      setPublishing(false)
    }
  }

  async function handleClearCell(assignmentId: string) {
    setError(null)
    try {
      await deleteScheduleAssignment(assignmentId)
      await reload()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to clear')
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Scheduler"
        subtitle="Bulk-assign shifts by employee, shift group, or whole account."
        icon={<CalendarDays className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={exportScheduleCSV}
              disabled={!clientId || filteredEmployees.length === 0}
              className="btn-secondary"
            >
              <Download className="w-4 h-4 shrink-0" />
              Export CSV
            </button>
            <button
              type="button"
              onClick={handlePublish}
              disabled={!clientId || publishing || (stats?.filledShifts ?? 0) === 0}
              className="btn-secondary"
              title="Mark all shifts in this week as published & notify employees"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              {publishing ? 'Publishing…' : 'Publish'}
            </button>
            <button
              type="button"
              onClick={openAssignPane}
              disabled={!clientId}
              className="btn-primary"
            >
              <Plus className="w-4 h-4 shrink-0" />
              Assign Shifts
            </button>
          </div>
        }
      />

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
              { value: '', label: 'Select BPO account' },
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

      {error && (<div className="alert-error"><span>{error}</span></div>)}
      {info && (<div className="alert-success"><span>{info}</span></div>)}

      {!clientId ? (
        <div className="card empty-state">
          <div className="empty-state-icon"><CalendarDays className="w-5 h-5" /></div>
          <p className="empty-state-title">Select an account</p>
          <p className="empty-state-description">Pick a BPO account to view and bulk-assign shifts for the week.</p>
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
      ) : (
        <div className="card overflow-hidden min-w-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse min-w-[780px]">
              <thead>
                <tr className="border-b border-surface-200 bg-surface-50/80">
                  <th className="py-3 px-3 text-[10px] font-semibold text-surface-500 uppercase tracking-wider md:sticky md:left-0 bg-surface-50 md:z-10 min-w-[160px]">Employee</th>
                  {weekDates.map((d) => (
                    <th key={d.toISOString()} className="py-3 px-2 text-[10px] font-semibold text-surface-500 uppercase tracking-wider text-center whitespace-nowrap min-w-[110px]">
                      {WEEKDAY_LABELS[d.getDay() === 0 ? 6 : d.getDay() - 1]}
                      <br />
                      <span className="text-xs font-normal text-surface-700 normal-case">{format(d, 'd MMM')}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-surface-500 text-sm">{search ? `No employees match "${search}".` : 'No employees.'}</td>
                  </tr>
                ) : (
                  filteredEmployees.map((emp) => (
                    <tr key={emp.id} className="border-b border-surface-100 hover:bg-brand-50/20">
                      <td className="py-2 px-3 text-xs font-medium text-surface-900 md:sticky md:left-0 bg-white md:z-10 min-w-[160px]">{emp.name}</td>
                      {weekDates.map((d) => {
                        const dateStr = format(d, 'yyyy-MM-dd')
                        const a = getAssignment(emp.id, dateStr)
                        return (
                          <td key={dateStr} className="py-1.5 px-1.5 align-middle min-w-[110px]">
                            {a ? (
                              <button
                                type="button"
                                onClick={() => handleClearCell(a.id)}
                                title={a.published ? 'Published — click to clear' : 'Draft (not yet published) — click to clear'}
                                className={`group relative w-full inline-flex flex-col items-stretch rounded-lg px-2 py-1.5 text-[11px] font-medium ring-1 ring-inset ${shiftColor(a.shiftId)} ${a.published ? '' : 'opacity-70'} hover:opacity-90`}
                              >
                                <span className="truncate">{a.shiftName}</span>
                                <span className="text-[10px] opacity-80 tabular-nums">
                                  {String(a.shiftStart).slice(0, 5)}–{String(a.shiftEnd).slice(0, 5)}
                                </span>
                                {!a.published && (
                                  <span className="absolute top-0.5 right-0.5 px-1 rounded-sm bg-white/80 text-[8px] font-bold uppercase tracking-wider text-surface-600 leading-tight">
                                    Draft
                                  </span>
                                )}
                              </button>
                            ) : (
                              <div className="w-full h-9 rounded-lg border border-dashed border-surface-200 bg-surface-50/40 text-[10px] text-surface-400 inline-flex items-center justify-center">
                                Open
                              </div>
                            )}
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

      {/* Footer stats */}
      {clientId && stats && (
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total Shifts" value={stats.totalShifts} icon={<CalendarDays className="w-4 h-4" />} />
          <StatCard label="Filled Shifts" value={stats.filledShifts} icon={<CheckCircle2 className="w-4 h-4" />} />
          <StatCard label="Open Shifts" value={stats.openShifts} icon={<Users className="w-4 h-4" />} />
          <StatCard label="Total Hours" value={stats.totalHours} icon={<Clock className="w-4 h-4" />} />
        </div>
      )}

      {/* Right-side Assign Shifts pane */}
      {paneOpen && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/30" onClick={() => !paneSubmitting && setPaneOpen(false)} />
          <aside className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-xl border-l border-surface-200 overflow-y-auto">
            <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-surface-200 px-5 py-3.5 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-surface-900">Assign Shifts</h2>
                <p className="text-xs text-surface-500">Bulk-assign across employees, groups or the whole account.</p>
              </div>
              <button type="button" onClick={() => !paneSubmitting && setPaneOpen(false)} className="text-surface-500 hover:text-surface-900 text-sm">Close</button>
            </div>

            <div className="p-5 space-y-5">
              <section>
                <h3 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Shift</h3>
                <label className="label">Shift Template</label>
                <AdminSelect
                  value={paneShiftId}
                  onChange={(v) => { setPaneShiftId(v); if (v) { setPaneStart(''); setPaneEnd('') } }}
                  options={[
                    { value: '', label: 'Custom times (no template)' },
                    ...shifts.map((s) => ({ value: s.id, label: `${s.name} · ${String(s.startTime).slice(0, 5)}–${String(s.endTime).slice(0, 5)}` })),
                  ]}
                />
                {!paneShiftId && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div>
                      <label className="label">Start</label>
                      <input type="time" className="input" value={paneStart} onChange={(e) => setPaneStart(e.target.value)} />
                    </div>
                    <div>
                      <label className="label">End</label>
                      <input type="time" className="input" value={paneEnd} onChange={(e) => setPaneEnd(e.target.value)} />
                    </div>
                  </div>
                )}
              </section>

              <section>
                <h3 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Who</h3>
                <label className="label">Employees</label>
                <div className="max-h-44 overflow-y-auto rounded-xl border border-surface-200 bg-white">
                  {employees.length === 0 ? (
                    <p className="p-3 text-xs text-surface-500">No employees.</p>
                  ) : (
                    employees.map((e) => (
                      <label key={e.id} className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-surface-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={paneEmployeeIds.includes(e.id)}
                          onChange={() => togglePaneEmp(e.id)}
                          className="rounded text-brand-600 focus:ring-brand-500"
                        />
                        <span className="text-surface-800">{e.name}</span>
                      </label>
                    ))
                  )}
                </div>
                <p className="mt-1 text-[11px] text-surface-500">{paneEmployeeIds.length} selected</p>

                <div className="mt-3">
                  <label className="label">Shift Group (optional)</label>
                  <AdminSelect
                    value={paneShiftGroup}
                    onChange={setPaneShiftGroup}
                    options={[{ value: '', label: 'None' }, ...shiftGroups.map((g) => ({ value: g, label: g }))]}
                  />
                </div>

                <label className="mt-3 flex items-center gap-2 text-xs text-surface-700 cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded text-brand-600 focus:ring-brand-500"
                    checked={paneAllInAccount}
                    onChange={(e) => setPaneAllInAccount(e.target.checked)}
                  />
                  All employees in this account
                </label>
              </section>

              <section>
                <h3 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">When</h3>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label">From</label>
                    <input type="date" className="input" value={paneFrom} onChange={(e) => setPaneFrom(e.target.value)} />
                  </div>
                  <div>
                    <label className="label">To</label>
                    <input type="date" className="input" value={paneTo} onChange={(e) => setPaneTo(e.target.value)} />
                  </div>
                </div>

                <label className="label mt-3">Days Off</label>
                <div className="flex flex-wrap gap-1.5">
                  {DAYS_PILLS.map((d) => {
                    const active = paneDaysOff.includes(d.value)
                    return (
                      <button
                        key={d.value}
                        type="button"
                        onClick={() => togglePaneDayOff(d.value)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-medium border ${
                          active
                            ? 'bg-brand-600 text-white border-brand-600'
                            : 'bg-white text-surface-700 border-surface-200 hover:bg-surface-50'
                        }`}
                        title={`${d.long}${active ? ' — off' : ''}`}
                      >
                        {d.short}
                      </button>
                    )
                  })}
                </div>
                <p className="mt-1 text-[11px] text-surface-500">Selected days will be skipped when assigning.</p>
              </section>

              {paneSummary && (
                <div className="rounded-xl bg-surface-50 border border-surface-200 px-3 py-2.5 text-xs text-surface-700 space-y-1.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-surface-500">Summary</div>
                  <div className="flex items-center justify-between"><span className="text-surface-500">Employees</span><span className="font-medium text-surface-900">{paneSummary.employeeLabel || '—'}</span></div>
                  <div className="flex items-center justify-between"><span className="text-surface-500">Shift</span><span className="font-medium text-surface-900 text-right">{paneSummary.shiftLabel || '—'}</span></div>
                  <div className="flex items-center justify-between"><span className="text-surface-500">Date Range</span><span className="font-medium text-surface-900">{paneSummary.rangeLabel}</span></div>
                  <div className="flex items-center justify-between"><span className="text-surface-500">Working Days</span><span className="font-medium text-surface-900 tabular-nums">{paneSummary.totalDays}</span></div>
                  <div className="flex items-center justify-between border-t border-surface-200 pt-1.5 mt-1.5">
                    <span className="text-surface-500">Total Shifts</span>
                    <span className="font-semibold text-surface-900 tabular-nums">{paneSummary.totalShifts != null ? paneSummary.totalShifts : 'Resolved on assign'}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="sticky bottom-0 z-10 bg-white/95 backdrop-blur border-t border-surface-200 px-5 py-3 flex items-center justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => !paneSubmitting && setPaneOpen(false)} disabled={paneSubmitting}>Cancel</button>
              <button type="button" className="btn-primary" onClick={submitAssign} disabled={paneSubmitting}>
                {paneSubmitting ? 'Assigning…' : 'Assign Shifts'}
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-surface-200 bg-white p-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-brand-50 text-brand-700 inline-flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-surface-500 font-semibold">{label}</p>
        <p className="text-base font-semibold text-surface-900 tabular-nums">{typeof value === 'number' && !Number.isInteger(value) ? value.toFixed(2) : value}</p>
      </div>
    </div>
  )
}
