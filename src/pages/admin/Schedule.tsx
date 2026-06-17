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
  updateScheduleAssignment,
  type Client,
  type Shift,
  type ScheduleAssignment,
  type ScheduleStats,
  type BulkAssignRequest,
  type WeeklyPatternEntry,
} from '@/lib/apiAdmin'
import { addDays, startOfWeek, format, parseISO } from 'date-fns'
// 03JUN2026 — render shift TIME strings as AST 12-hour
import { fmtShiftTimeStr } from '@/lib/timeFormat'
import { activeForLookup } from '@/lib/sortByName'
import { TASK_OPTIONS } from '@/lib/taskOptions'
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
// Indexed by JS getDay() — used for per-weekday "Master Week" mode error messages.
const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// One row in the per-weekday "Master Week" matrix.
type PerDayEntry = {
  enabled: boolean
  shiftId: string  // '' = use custom times
  startTime: string
  endTime: string
}

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
  // 10JUN2026 Item 7 — single-cell edit modal state. Clicking on a cell
  // opens this modal (instead of immediately deleting); admin can change
  // the shift template or its override times and Save, or hit Delete
  // (with confirm) to remove the assignment entirely.
  const [editingCell, setEditingCell] = useState<ScheduleAssignment | null>(null)
  const [editShiftId, setEditShiftId] = useState('')
  const [editStartTime, setEditStartTime] = useState('')
  const [editEndTime, setEditEndTime] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  function openCellEditor(a: ScheduleAssignment) {
    setEditingCell(a)
    setEditShiftId(a.shiftId || '')
    setEditStartTime(a.overrideStart ? String(a.overrideStart).slice(0, 5) : '')
    setEditEndTime(a.overrideEnd ? String(a.overrideEnd).slice(0, 5) : '')
  }

  async function saveCellEdit() {
    if (!editingCell) return
    setEditSaving(true)
    setError(null)
    try {
      await updateScheduleAssignment(editingCell.id, {
        ...(editShiftId ? { shiftId: editShiftId } : {}),
        // Empty strings = revert to shift template default times.
        overrideStartTime: editStartTime || '',
        overrideEndTime: editEndTime || '',
      })
      setEditingCell(null)
      await reload()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setEditSaving(false)
    }
  }

  async function deleteFromEditor() {
    if (!editingCell) return
    if (!window.confirm('Delete this shift assignment? This cannot be undone.')) return
    setEditSaving(true)
    try {
      await deleteScheduleAssignment(editingCell.id)
      setEditingCell(null)
      await reload()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete')
    } finally {
      setEditSaving(false)
    }
  }

  const [paneDaysOff, setPaneDaysOff] = useState<number[]>([0, 6]) // default: Sat/Sun off
  // 10JUN2026 client video Item 10 — Orlando: "when creating a shift
  // through the scheduler we should be able to bulk assign the task as
  // well". Task gets passed alongside the shift assignments.
  const [paneTask, setPaneTask] = useState('')
  const [paneSubmitting, setPaneSubmitting] = useState(false)
  const [publishing, setPublishing] = useState(false)

  // "Master Week" per-weekday mode — added 19MAY2026 SCHEDULER DEMOs meeting.
  // Mode is `'same'` (one shift across all working days, old behavior) or
  // `'perDay'` (each weekday independently configured, HHAX-style).
  const [paneMode, setPaneMode] = useState<'same' | 'perDay'>('same')
  // Default: weekdays Mon-Fri enabled with "use default shift template" empty,
  // Sat/Sun off.
  const [paneWeekly, setPaneWeekly] = useState<PerDayEntry[]>(() => {
    return [0, 1, 2, 3, 4, 5, 6].map((w) => ({
      enabled: w >= 1 && w <= 5,
      shiftId: '',
      startTime: '',
      endTime: '',
    }))
  })

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
    setPaneMode('same')
    setPaneWeekly([0, 1, 2, 3, 4, 5, 6].map((w) => ({
      enabled: w >= 1 && w <= 5,
      shiftId: '',
      startTime: '',
      endTime: '',
    })))
    setError(null)
  }
  function updateWeekly(weekday: number, patch: Partial<PerDayEntry>) {
    setPaneWeekly((prev) => prev.map((row, i) => i === weekday ? { ...row, ...patch } : row))
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
    // Build the off-set differently depending on mode.
    const offSet = paneMode === 'perDay'
      ? new Set(paneWeekly.map((row, w) => row.enabled ? -1 : w).filter((w) => w >= 0))
      : new Set(paneDaysOff)
    let totalDays = 0
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
    if (paneMode === 'perDay') {
      const activeDays = paneWeekly
        .map((row, w) => ({ row, w }))
        .filter(({ row }) => row.enabled)
      shiftLabel = activeDays.length === 0
        ? '—'
        : `${activeDays.length} of 7 weekdays`
    } else if (paneShiftId) {
      const s = shifts.find((x) => x.id === paneShiftId)
      if (s) shiftLabel = `${s.name} (${fmtShiftTimeStr(s.startTime)}–${fmtShiftTimeStr(s.endTime)})`
    } else if (paneStart && paneEnd) {
      shiftLabel = `Custom ${paneStart}–${paneEnd}`
    }

    const rangeLabel = `${format(parseISO(paneFrom), 'd MMM')} – ${format(parseISO(paneTo), 'd MMM yyyy')}`
    // totalShifts is meaningful only for explicit user lists (we can compute it).
    const explicitCount = paneEmployeeIds.length
    const totalShifts = explicitCount > 0 && !paneShiftGroup && !paneAllInAccount ? explicitCount * totalDays : null
    return { totalDays, employeeLabel, shiftLabel, rangeLabel, totalShifts }
  }, [paneFrom, paneTo, paneDaysOff, paneEmployeeIds, paneShiftGroup, paneAllInAccount, paneShiftId, paneStart, paneEnd, shifts, paneMode, paneWeekly])

  async function submitAssign() {
    setError(null)
    setInfo(null)
    if (!clientId) {
      setError('Select an account first.')
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

    // Build the request body. Per-weekday mode (Master Week) sends a 7-entry
    // pattern indexed 0=Sun..6=Sat. Same-shift mode uses the single shift +
    // daysOff pills.
    let body: BulkAssignRequest = {
      clientId,
      ...(paneEmployeeIds.length > 0 ? { userIds: paneEmployeeIds } : {}),
      ...(paneShiftGroup ? { shiftGroup: paneShiftGroup } : {}),
      ...(paneAllInAccount ? { allInAccount: true } : {}),
      dateFrom: paneFrom,
      dateTo: paneTo,
      // 10JUN2026 client video Item 10 — bulk-assign the task too.
      ...(paneTask ? { task: paneTask } : {}),
    }

    if (paneMode === 'perDay') {
      const pattern: WeeklyPatternEntry[] = paneWeekly.map((row) => {
        if (!row.enabled) return { off: true }
        if (row.shiftId) return { shiftId: row.shiftId }
        if (row.startTime && row.endTime) return { startTime: row.startTime, endTime: row.endTime }
        return { off: true } // enabled but nothing chosen → treat as off
      })
      const anyWorking = pattern.some((p) => !('off' in p))
      if (!anyWorking) {
        setError('Pick a shift (template or custom times) for at least one weekday.')
        return
      }
      // Validate: enabled rows must have either a template or both times.
      for (let w = 0; w < 7; w++) {
        const row = paneWeekly[w]
        if (!row.enabled) continue
        if (row.shiftId) continue
        if (row.startTime && row.endTime) continue
        setError(`${WEEKDAY_LONG[w]} is enabled but has no shift template or custom times.`)
        return
      }
      body = { ...body, weeklyPattern: pattern }
    } else {
      const usingTemplate = !!paneShiftId
      if (!usingTemplate && (!paneStart || !paneEnd)) {
        setError('Pick a shift template or enter both start and end times.')
        return
      }
      body = {
        ...body,
        ...(usingTemplate ? { shiftId: paneShiftId } : { overrideStartTime: paneStart, overrideEndTime: paneEnd }),
        daysOff: paneDaysOff,
      }
    }

    setPaneSubmitting(true)
    try {
      const res = await bulkAssignSchedule(body)
      const modeNote = res.mode === 'per-weekday' ? ' (Master Week)' : ''
      setInfo(`Assigned ${res.totalRows} shift${res.totalRows === 1 ? '' : 's'}${modeNote} (${res.created} new, ${res.updated} updated) across ${res.employees} employee${res.employees === 1 ? '' : 's'} × ${res.dates} day${res.dates === 1 ? '' : 's'}.`)
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

  // 10JUN2026 client video Item 7 — single-record delete moved into
  // the edit modal's Delete button (with confirm). Cell click now
  // opens the edit modal via openCellEditor() instead of going
  // straight to delete. See editingCell state above.

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
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 dark:text-surface-500 shrink-0" />
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
          <button type="button" onClick={prevWeek} className="btn-icon text-surface-600 dark:text-surface-300 bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-800" aria-label="Previous week">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 min-w-[180px] justify-center px-3 py-2 rounded-xl bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-700">
            <CalendarIcon className="w-4 h-4 text-surface-500 dark:text-surface-400 dark:text-surface-500 shrink-0" />
            <span className="text-xs font-semibold text-surface-900 dark:text-surface-50 text-center tabular-nums whitespace-nowrap">
              {format(weekDates[0], 'd MMM')} – {format(weekDates[6], 'd MMM yyyy')}
            </span>
          </div>
          <button type="button" onClick={nextWeek} className="btn-icon text-surface-600 dark:text-surface-300 bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-800" aria-label="Next week">
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
              <div key={i} className="rounded-xl border border-surface-200/70 bg-white dark:bg-surface-900 p-3 flex items-center gap-3">
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
                <tr className="border-b border-surface-200 dark:border-surface-700 bg-surface-50/80">
                  <th className="py-3 px-3 text-[10px] font-semibold text-surface-500 dark:text-surface-400 dark:text-surface-500 uppercase tracking-wider md:sticky md:left-0 bg-surface-50 dark:bg-surface-900 md:z-10 min-w-[160px]">Employee</th>
                  {weekDates.map((d) => (
                    <th key={d.toISOString()} className="py-3 px-2 text-[10px] font-semibold text-surface-500 dark:text-surface-400 dark:text-surface-500 uppercase tracking-wider text-center whitespace-nowrap min-w-[110px]">
                      {WEEKDAY_LABELS[d.getDay() === 0 ? 6 : d.getDay() - 1]}
                      <br />
                      <span className="text-xs font-normal text-surface-700 dark:text-surface-200 normal-case">{format(d, 'd MMM')}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-surface-500 dark:text-surface-400 dark:text-surface-500 text-sm">{search ? `No employees match "${search}".` : 'No employees.'}</td>
                  </tr>
                ) : (
                  filteredEmployees.map((emp) => (
                    <tr key={emp.id} className="border-b border-surface-100 dark:border-surface-800 hover:bg-brand-50/20">
                      <td className="py-2 px-3 text-xs font-medium text-surface-900 dark:text-surface-50 md:sticky md:left-0 bg-white dark:bg-surface-900 md:z-10 min-w-[160px]">{emp.name}</td>
                      {weekDates.map((d) => {
                        const dateStr = format(d, 'yyyy-MM-dd')
                        const a = getAssignment(emp.id, dateStr)
                        return (
                          <td key={dateStr} className="py-1.5 px-1.5 align-middle min-w-[110px]">
                            {a ? (
                              <button
                                type="button"
                                onClick={() => openCellEditor(a)}
                                title={a.published ? 'Published — click to edit (Delete inside the editor)' : 'Draft (not yet published) — click to edit'}
                                className={`group relative w-full inline-flex flex-col items-stretch rounded-lg px-2 py-1.5 text-[11px] font-medium ring-1 ring-inset ${shiftColor(a.shiftId)} ${a.published ? '' : 'opacity-70'} hover:opacity-90`}
                              >
                                <span className="truncate">{a.shiftName}</span>
                                <span className="text-[10px] opacity-80 tabular-nums">
                                  {String(a.shiftStart).slice(0, 5)}–{String(a.shiftEnd).slice(0, 5)}
                                </span>
                                {!a.published && (
                                  <span className="absolute top-0.5 right-0.5 px-1 rounded-sm bg-white/80 text-[8px] font-bold uppercase tracking-wider text-surface-600 dark:text-surface-300 leading-tight">
                                    Draft
                                  </span>
                                )}
                              </button>
                            ) : (
                              <div className="w-full h-9 rounded-lg border border-dashed border-surface-200 dark:border-surface-700 bg-surface-50/40 text-[10px] text-surface-400 dark:text-surface-500 inline-flex items-center justify-center">
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
          <aside className="absolute right-0 top-0 h-full w-full max-w-md bg-white dark:bg-surface-900 shadow-xl border-l border-surface-200 dark:border-surface-700 overflow-y-auto">
            <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-surface-200 dark:border-surface-700 px-5 py-3.5 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-surface-900 dark:text-surface-50">Assign Shifts</h2>
                <p className="text-xs text-surface-500 dark:text-surface-400 dark:text-surface-500">Bulk-assign across employees, groups or the whole account.</p>
              </div>
              <button type="button" onClick={() => !paneSubmitting && setPaneOpen(false)} className="text-surface-500 dark:text-surface-400 dark:text-surface-500 hover:text-surface-900 dark:text-surface-50 text-sm">Close</button>
            </div>

            <div className="p-5 space-y-5">
              {/* Mode toggle — added 19MAY2026 SCHEDULER DEMOs meeting. */}
              <section>
                <h3 className="text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wider mb-2">Mode</h3>
                <div className="segmented">
                  <button
                    type="button"
                    onClick={() => setPaneMode('same')}
                    className={`segmented-item flex-1 justify-center ${paneMode === 'same' ? 'segmented-item-active' : ''}`}
                  >
                    Same shift every day
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaneMode('perDay')}
                    className={`segmented-item flex-1 justify-center ${paneMode === 'perDay' ? 'segmented-item-active' : ''}`}
                  >
                    Master Week
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] text-surface-500 dark:text-surface-400">
                  {paneMode === 'same'
                    ? 'Apply one shift template (or custom times) across the date range — use the day-off pills to skip weekends/etc.'
                    : 'Pick a different shift for each weekday — Mon morning, Tue night, etc. Days you leave off are skipped.'}
                </p>
              </section>

              {paneMode === 'same' && (
                <section>
                  <h3 className="text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wider mb-2">Shift</h3>
                  <label className="label">Shift Template</label>
                  <AdminSelect
                    value={paneShiftId}
                    onChange={(v) => { setPaneShiftId(v); if (v) { setPaneStart(''); setPaneEnd('') } }}
                    options={[
                      { value: '', label: 'Custom times (no template)' },
                      ...shifts.map((s) => ({ value: s.id, label: `${s.name} · ${fmtShiftTimeStr(s.startTime)}–${fmtShiftTimeStr(s.endTime)}` })),
                    ]}
                  />
                  {!paneShiftId && (
                    <>
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
                      {/* 04JUN2026 — overnight-shift hint, same as Shifts page */}
                      {paneStart && paneEnd && paneEnd < paneStart && (
                        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 flex items-start gap-2">
                          <span className="text-amber-600 dark:text-amber-400 text-sm leading-none mt-0.5">🌙</span>
                          <p className="text-xs text-amber-700 dark:text-amber-300">
                            <strong>Overnight shift</strong> — {fmtShiftTimeStr(paneStart)} to {fmtShiftTimeStr(paneEnd)} the next day. Hours are calculated correctly across midnight.
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </section>
              )}

              {paneMode === 'perDay' && (
                <section>
                  <h3 className="text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wider mb-2">Weekly Pattern</h3>
                  <p className="text-[11px] text-surface-500 dark:text-surface-400 mb-2">Configure each weekday. Unchecked days are skipped.</p>
                  <div className="space-y-1.5">
                    {/* Render Mon → Sun (DAYS_PILLS order). Each row's `value` is the JS getDay() index. */}
                    {DAYS_PILLS.map((day) => {
                      const row = paneWeekly[day.value]
                      return (
                        <div
                          key={day.value}
                          className={`rounded-xl border p-2.5 ${row.enabled
                            ? 'border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900'
                            : 'border-surface-100 dark:border-surface-800 bg-surface-50/60 dark:bg-surface-950'}`}
                        >
                          <div className="flex items-center gap-2">
                            <label className="flex items-center gap-1.5 min-w-[88px] cursor-pointer text-xs font-semibold">
                              <input
                                type="checkbox"
                                checked={row.enabled}
                                onChange={(e) => updateWeekly(day.value, { enabled: e.target.checked })}
                                className="rounded text-brand-600 focus:ring-brand-500"
                              />
                              <span className={row.enabled ? 'text-surface-900 dark:text-surface-50' : 'text-surface-400 dark:text-surface-500'}>
                                {day.short}
                              </span>
                            </label>
                            <div className="flex-1 min-w-0">
                              <AdminSelect
                                value={row.shiftId}
                                onChange={(v) => {
                                  updateWeekly(day.value, { shiftId: v, ...(v ? { startTime: '', endTime: '' } : {}) })
                                }}
                                disabled={!row.enabled}
                                options={[
                                  { value: '', label: 'Custom times' },
                                  ...shifts.map((s) => ({ value: s.id, label: `${s.name} · ${fmtShiftTimeStr(s.startTime)}–${fmtShiftTimeStr(s.endTime)}` })),
                                ]}
                              />
                            </div>
                          </div>
                          {row.enabled && !row.shiftId && (
                            <div className="mt-2 grid grid-cols-2 gap-2 pl-[88px]">
                              <input
                                type="time"
                                className="input text-xs"
                                value={row.startTime}
                                onChange={(e) => updateWeekly(day.value, { startTime: e.target.value })}
                                placeholder="Start"
                              />
                              <input
                                type="time"
                                className="input text-xs"
                                value={row.endTime}
                                onChange={(e) => updateWeekly(day.value, { endTime: e.target.value })}
                                placeholder="End"
                              />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </section>
              )}

              <section>
                <h3 className="text-xs font-semibold text-surface-500 dark:text-surface-400 dark:text-surface-500 uppercase tracking-wider mb-2">Who</h3>
                <label className="label">Employees</label>
                <div className="max-h-44 overflow-y-auto rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900">
                  {employees.length === 0 ? (
                    <p className="p-3 text-xs text-surface-500 dark:text-surface-400 dark:text-surface-500">No employees.</p>
                  ) : (
                    activeForLookup(employees).map((e) => (
                      // 17JUN2026 (Jose 16JUN Issue 2) — terminated /
                      // pre-noticed employees hidden from the Assign
                      // Shifts picker.
                      <label key={e.id} className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-surface-50 dark:hover:bg-surface-800 dark:bg-surface-900 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={paneEmployeeIds.includes(e.id)}
                          onChange={() => togglePaneEmp(e.id)}
                          className="rounded text-brand-600 focus:ring-brand-500"
                        />
                        <span className="text-surface-800 dark:text-surface-100">{e.name}</span>
                      </label>
                    ))
                  )}
                </div>
                <p className="mt-1 text-[11px] text-surface-500 dark:text-surface-400 dark:text-surface-500">{paneEmployeeIds.length} selected</p>

                <div className="mt-3">
                  <label className="label">Shift Group (optional)</label>
                  <AdminSelect
                    value={paneShiftGroup}
                    onChange={setPaneShiftGroup}
                    options={[{ value: '', label: 'None' }, ...shiftGroups.map((g) => ({ value: g, label: g }))]}
                  />
                </div>

                {/* 10JUN2026 client video Item 10 — Orlando: "we should
                    be able to bulk assign the task as well… a dropdown,
                    same options as elsewhere". Reuses TASK_OPTIONS so
                    the Scheduler list matches the per-record Attendance
                    Task field exactly. */}
                <div className="mt-3">
                  <label className="label">Task (optional)</label>
                  <AdminSelect
                    value={paneTask}
                    onChange={setPaneTask}
                    options={[{ value: '', label: '— None —' }, ...TASK_OPTIONS.map((t) => ({ value: t, label: t }))]}
                  />
                </div>

                <label className="mt-3 flex items-center gap-2 text-xs text-surface-700 dark:text-surface-200 cursor-pointer">
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
                <h3 className="text-xs font-semibold text-surface-500 dark:text-surface-400 dark:text-surface-500 uppercase tracking-wider mb-2">When</h3>
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

                {paneMode === 'same' && (
                  <>
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
                                : 'bg-white dark:bg-surface-900 text-surface-700 dark:text-surface-200 border-surface-200 dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-800'
                            }`}
                            title={`${d.long}${active ? ' — off' : ''}`}
                          >
                            {d.short}
                          </button>
                        )
                      })}
                    </div>
                    <p className="mt-1 text-[11px] text-surface-500 dark:text-surface-400">Selected days will be skipped when assigning.</p>
                  </>
                )}
              </section>

              {paneSummary && (
                <div className="rounded-xl bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-700 px-3 py-2.5 text-xs text-surface-700 dark:text-surface-200 space-y-1.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-surface-500 dark:text-surface-400 dark:text-surface-500">Summary</div>
                  <div className="flex items-center justify-between"><span className="text-surface-500 dark:text-surface-400 dark:text-surface-500">Employees</span><span className="font-medium text-surface-900 dark:text-surface-50">{paneSummary.employeeLabel || '—'}</span></div>
                  <div className="flex items-center justify-between"><span className="text-surface-500 dark:text-surface-400 dark:text-surface-500">Shift</span><span className="font-medium text-surface-900 dark:text-surface-50 text-right">{paneSummary.shiftLabel || '—'}</span></div>
                  <div className="flex items-center justify-between"><span className="text-surface-500 dark:text-surface-400 dark:text-surface-500">Date Range</span><span className="font-medium text-surface-900 dark:text-surface-50">{paneSummary.rangeLabel}</span></div>
                  <div className="flex items-center justify-between"><span className="text-surface-500 dark:text-surface-400 dark:text-surface-500">Working Days</span><span className="font-medium text-surface-900 dark:text-surface-50 tabular-nums">{paneSummary.totalDays}</span></div>
                  <div className="flex items-center justify-between border-t border-surface-200 dark:border-surface-700 pt-1.5 mt-1.5">
                    <span className="text-surface-500 dark:text-surface-400 dark:text-surface-500">Total Shifts</span>
                    <span className="font-semibold text-surface-900 dark:text-surface-50 tabular-nums">{paneSummary.totalShifts != null ? paneSummary.totalShifts : 'Resolved on assign'}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="sticky bottom-0 z-10 bg-white/95 backdrop-blur border-t border-surface-200 dark:border-surface-700 px-5 py-3 flex items-center justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => !paneSubmitting && setPaneOpen(false)} disabled={paneSubmitting}>Cancel</button>
              <button type="button" className="btn-primary" onClick={submitAssign} disabled={paneSubmitting}>
                {paneSubmitting ? 'Assigning…' : 'Assign Shifts'}
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* 10JUN2026 client video Item 7 — single-cell edit modal. Opens
          when admin clicks a shift cell in the grid. Lets them swap the
          shift template / tweak override times / or Delete (with
          confirm). Replaces the previous click-to-delete behavior. */}
      {editingCell && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={() => !editSaving && setEditingCell(null)}>
          <div className="bg-white dark:bg-surface-900 rounded-2xl shadow-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-surface-900 dark:text-surface-50 mb-1">Edit shift assignment</h3>
            <p className="text-xs text-surface-500 dark:text-surface-400 mb-4">
              {editingCell.userName} · {editingCell.date}
              {!editingCell.published && <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-surface-100 text-surface-600">Draft</span>}
            </p>
            <div className="space-y-3">
              <div>
                <label className="label">Shift template</label>
                <AdminSelect
                  value={editShiftId}
                  onChange={setEditShiftId}
                  options={shifts.map((s) => ({
                    value: s.id,
                    label: `${s.name} (${fmtShiftTimeStr(s.startTime)}–${fmtShiftTimeStr(s.endTime)})`,
                  }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Override start (optional)</label>
                  <input
                    type="time"
                    value={editStartTime}
                    onChange={(e) => setEditStartTime(e.target.value)}
                    className="input w-full"
                  />
                </div>
                <div>
                  <label className="label">Override end (optional)</label>
                  <input
                    type="time"
                    value={editEndTime}
                    onChange={(e) => setEditEndTime(e.target.value)}
                    className="input w-full"
                  />
                </div>
              </div>
              <p className="text-[11px] text-surface-500 dark:text-surface-400">
                Leave overrides empty to use the shift template's default times. Saving an edit resets the Published flag so admins should re-publish.
              </p>
            </div>
            <div className="flex items-center justify-between gap-2 mt-5 pt-4 border-t border-surface-200 dark:border-surface-700">
              <button
                type="button"
                onClick={deleteFromEditor}
                disabled={editSaving}
                className="btn-danger btn-sm"
                title="Delete this shift assignment (asks for confirmation)"
              >
                Delete shift
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingCell(null)}
                  disabled={editSaving}
                  className="btn-secondary btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveCellEdit}
                  disabled={editSaving || !editShiftId}
                  className="btn-primary btn-sm"
                >
                  {editSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 p-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-brand-50 text-brand-700 inline-flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-surface-500 dark:text-surface-400 dark:text-surface-500 font-semibold">{label}</p>
        <p className="text-base font-semibold text-surface-900 dark:text-surface-50 tabular-nums">{typeof value === 'number' && !Number.isInteger(value) ? value.toFixed(2) : value}</p>
      </div>
    </div>
  )
}
