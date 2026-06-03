import { useState, useEffect, useMemo, useCallback } from 'react'
import { format, startOfWeek, endOfWeek } from 'date-fns'
import { Search, Clock, ArrowUp, ArrowDown, Filter } from 'lucide-react'
import { getMyAttendance, getEmployeePayrollPeriods, type PayrollPeriod } from '@/lib/apiEmployee'
import { buildCycleOptions } from '@/lib/cycleOptions'
import type { AttendanceRecord } from '@/types'
import DateRangePicker from '@/components/DateRangePicker'
import AdminSelect from '@/components/AdminSelect'
import { PageHeader } from '@/components/PageHeader'
import { EmployeeClockWidget } from '@/components/EmployeeClockWidget'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Same scheme as admin Attendance — per 19MAY2026 client video
const statusColors: Record<string, string> = {
  Present: 'bg-emerald-100 text-emerald-700',
  Absent: 'bg-red-100 text-red-700',
  Late: 'bg-amber-100 text-amber-700',
  'Left Early': 'bg-amber-100 text-amber-700',
  'Late & Left Early': 'bg-amber-100 text-amber-700',
  'Time Off': 'bg-sky-100 text-sky-700',
  'System Issues': 'bg-surface-200 text-surface-700 dark:text-surface-200',
  Terminated: 'bg-surface-200 text-surface-700 dark:text-surface-200',
  Prenotice: 'bg-surface-200 text-surface-700 dark:text-surface-200',
  Breastfeeding: 'bg-surface-200 text-surface-700 dark:text-surface-200',
  REVIEW: 'bg-indigo-100 text-indigo-700',
  present: 'bg-emerald-100 text-emerald-700',
  absent: 'bg-red-100 text-red-700',
  active: 'bg-amber-100 text-amber-700',
  leave: 'bg-sky-100 text-sky-700',
  adjusted: 'bg-indigo-100 text-indigo-700',
  late_in: 'bg-amber-100 text-amber-700',
  early_out: 'bg-amber-100 text-amber-700',
  late_in_early_out: 'bg-amber-100 text-amber-700',
  'Late In': 'bg-amber-100 text-amber-700',
  'Early Out': 'bg-amber-100 text-amber-700',
  'Late In-Early Out': 'bg-amber-100 text-amber-700',
  Review: 'bg-indigo-100 text-indigo-700',
}

const CARD_COLORS: Record<string, { border: string; bg: string; label: string }> = {
  brand: { border: 'border-brand-200/80', bg: 'bg-brand-50/50', label: 'text-brand-700' },
  red: { border: 'border-red-200/80', bg: 'bg-red-50/50', label: 'text-red-700' },
  amber: { border: 'border-amber-200/80', bg: 'bg-amber-50/50', label: 'text-amber-700' },
  emerald: { border: 'border-emerald-200/80', bg: 'bg-emerald-50/50', label: 'text-emerald-700' },
  sky: { border: 'border-sky-200/80', bg: 'bg-sky-50/50', label: 'text-sky-700' },
  violet: { border: 'border-violet-200/80', bg: 'bg-violet-50/50', label: 'text-violet-700' },
  surface: { border: 'border-surface-200/80', bg: 'bg-surface-50/50', label: 'text-surface-500 dark:text-surface-400 dark:text-surface-500' },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// 03JUN2026 — Atlantic-time 12-hour formatting via the shared helper.
import { fmtTime, fmtDateTime } from '@/lib/timeFormat'

function fmtHours(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return '0.00'
  return val.toFixed(2)
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SummaryCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  const c = color && CARD_COLORS[color] ? CARD_COLORS[color] : null
  return (
    <div className={`rounded-xl border ${c?.border ?? 'border-surface-200/70'} ${c?.bg ?? 'bg-white dark:bg-surface-900'} p-3 sm:p-3.5 shadow-card`}>
      <p className={`text-[10px] sm:text-[11px] font-semibold ${c?.label ?? 'text-surface-500 dark:text-surface-400 dark:text-surface-500'} uppercase tracking-wider`}>{label}</p>
      <p className="mt-0.5 text-base sm:text-lg font-bold text-surface-900 dark:text-surface-50 tabular-nums tracking-tight">{value}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EmployeeSessions() {
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState(() => format(startOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd'))
  const [dateTo, setDateTo] = useState(() => format(endOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd'))

  // Sort & Filter state
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({})
  const [filterOpen, setFilterOpen] = useState<string | null>(null)

  // Detail modal
  const [detailRecord, setDetailRecord] = useState<AttendanceRecord | null>(null)

  // Payroll cycle filter
  const [payrollPeriods, setPayrollPeriods] = useState<PayrollPeriod[]>([])
  const [filterCycle, setFilterCycle] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  function handleDateRangeChange(start: string, end: string) {
    setDateFrom(start)
    setDateTo(end)
  }

  // -----------------------------------------------------------------------
  // Fetch
  // -----------------------------------------------------------------------

  useEffect(() => {
    getEmployeePayrollPeriods().then(setPayrollPeriods).catch(() => setPayrollPeriods([]))
  }, [])

  const fetchAttendance = useCallback(async () => {
    try {
      const list = await getMyAttendance({ from: dateFrom, to: dateTo })
      setRecords(list)
      setLoading(false)
    } catch {
      setRecords([])
      setLoading(false)
    }
  }, [dateFrom, dateTo])

  useEffect(() => {
    fetchAttendance()
    const intervalId = window.setInterval(() => {
      if (!document.hidden) fetchAttendance()
    }, 5000)
    const handleVisibilityChange = () => {
      if (!document.hidden) fetchAttendance()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [fetchAttendance])

  // -----------------------------------------------------------------------
  // Summary stats
  // -----------------------------------------------------------------------

  const summary = useMemo(() => {
    const total = records.length
    const present = records.filter((r) => r.status.toLowerCase() === 'present').length
    const absent = records.filter((r) => r.status.toLowerCase() === 'absent').length
    const late = records.filter((r) => r.status.toLowerCase().includes('late')).length
    const leftEarly = records.filter((r) => r.status.toLowerCase().includes('left early')).length
    const timeOff = records.filter((r) => r.status.toLowerCase() === 'time off').length
    const systemIssues = records.filter((r) => r.status.toLowerCase() === 'system issues').length
    const totalReg = records.reduce((a, r) => a + (r.regHours ?? 0), 0)
    const totalN15 = records.reduce((a, r) => a + (r.n15Hours ?? 0), 0)
    const totalX35 = records.reduce((a, r) => a + (r.x35Hours ?? 0), 0)
    const totalX100 = records.reduce((a, r) => a + (r.x100Hours ?? 0), 0)
    const totalHdy = records.reduce((a, r) => a + (r.hdyHours ?? 0), 0)
    const totalDnp = records.filter((r) => r.payType === 'DNP').reduce((a, r) => a + (r.actualHours ?? 0) - (r.adbtHours ?? 0), 0)
    const totalPayableRvw = records.reduce((a, r) => a + (r.payableRvwHours ?? 0), 0)
    return {
      total, present, absent, late, leftEarly, timeOff, systemIssues,
      totalReg, totalN15, totalX35, totalX100, totalHdy, totalDnp, totalPayableRvw,
    }
  }, [records])

  // -----------------------------------------------------------------------
  // Sort & Filter
  // -----------------------------------------------------------------------

  const colAccessor = useCallback((r: AttendanceRecord, col: string): string | number => {
    switch (col) {
      case 'Date': return r.date ?? ''
      case 'Account': return (r.accountName ?? '').toLowerCase()
      case 'Shift Start': return r.shiftStart ?? ''
      case 'Clock In': return r.clockIn ?? ''
      case 'Shift End': return r.shiftEnd ?? ''
      case 'Clock Out': return r.clockOut ?? ''
      case 'Status': return r.status.toLowerCase()
      case 'Bill': return (r.billType ?? '').toLowerCase()
      case 'Stage': return (r.stage ?? '').toLowerCase()
      case 'Comments': return (r.comments ?? '').toLowerCase()
      case 'Pay': return (r.payType ?? '').toLowerCase()
      case 'Stage': return (r.stage ?? '').toLowerCase()
      case 'Task': return (r.task ?? '').toLowerCase()
      case 'SCH': return r.scheduledHours ?? 0
      case 'SDBT': return r.sdbtHours ?? 0
      case 'ACT': return r.actualHours ?? 0
      case 'ADBT': return r.adbtHours ?? 0
      case 'P-REG': return r.regHours ?? 0
      case 'P-N15%': return r.n15Hours ?? 0
      case 'P-X35%': return r.x35Hours ?? 0
      case 'P-X100%': return r.x100Hours ?? 0
      case 'P-HDY': return r.hdyHours ?? 0
      case 'P-RVW': return r.payableRvwHours ?? 0
      default: return ''
    }
  }, [])

  const filteredAndSorted = useMemo(() => {
    let result = [...records]

    // Global search
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter((r) => {
        const dateStr = r.date ?? ''
        return dateStr.includes(q) || r.status.toLowerCase().includes(q) || (r.payType ?? '').toLowerCase().includes(q) || (r.task ?? '').toLowerCase().includes(q)
      })
    }

    // Status filter (per 19MAY2026 client video)
    if (filterStatus) {
      if (filterStatus === 'blank') {
        result = result.filter((r) => !r.status || r.status.trim() === '')
      } else {
        result = result.filter((r) => (r.status ?? '') === filterStatus)
      }
    }

    // Column filters
    for (const [col, filterVal] of Object.entries(columnFilters)) {
      if (!filterVal) continue
      const lower = filterVal.toLowerCase()
      result = result.filter((r) => String(colAccessor(r, col)).toLowerCase().includes(lower))
    }

    // Sort
    if (sortCol) {
      result.sort((a, b) => {
        const aVal = colAccessor(a, sortCol)
        const bVal = colAccessor(b, sortCol)
        if (typeof aVal === 'number' && typeof bVal === 'number') return sortDir === 'asc' ? aVal - bVal : bVal - aVal
        const cmp = String(aVal).localeCompare(String(bVal))
        return sortDir === 'asc' ? cmp : -cmp
      })
    }
    return result
  }, [records, search, filterStatus, columnFilters, sortCol, sortDir, colAccessor])

  function handleSort(col: string) {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortCol(col); setSortDir('asc') }
  }

  function handleColumnFilter(col: string, value: string) {
    setColumnFilters((prev) => ({ ...prev, [col]: value }))
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="page overflow-x-hidden">
      <PageHeader
        title="My Attendance"
        subtitle="Track your time and view your records."
        icon={<Clock className="w-5 h-5" />}
      />

      {/* Clock-in/out + Today's Shift widget (top of page per 18MAY2026 client video) */}
      <EmployeeClockWidget onChange={() => void fetchAttendance()} />

      {/* Filters */}
      <div className="toolbar">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 dark:text-surface-500 shrink-0" />
          <input
            type="text"
            placeholder="Search by date, status, pay type, or task"
            className="input pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-auto sm:min-w-[320px]">
          <DateRangePicker startDate={dateFrom} endDate={dateTo} onChange={handleDateRangeChange} />
        </div>
        <div className="w-full sm:w-auto sm:min-w-[180px]">
          <AdminSelect
            value={filterCycle}
            onChange={(val) => {
              setFilterCycle(val)
              if (val) {
                const period = payrollPeriods.find((p) => p.cycleCode === val)
                if (period) {
                  setDateFrom(period.periodFrom)
                  setDateTo(period.periodTo)
                }
              } else {
                setDateFrom(format(startOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd'))
                setDateTo(format(endOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd'))
              }
            }}
            options={buildCycleOptions(payrollPeriods, [{ value: '', label: 'All cycles' }])}
          />
        </div>
        <div className="w-full sm:w-auto sm:min-w-[180px]">
          <AdminSelect
            value={filterStatus}
            onChange={(val) => setFilterStatus(val)}
            options={[
              { value: '', label: 'All statuses' },
              { value: 'blank', label: '— (no status)' },
              { value: 'Present', label: 'Present' },
              { value: 'Absent', label: 'Absent' },
              { value: 'Late', label: 'Late' },
              { value: 'Left Early', label: 'Left Early' },
              { value: 'Late & Left Early', label: 'Late & Left Early' },
              { value: 'Time Off', label: 'Time Off' },
              { value: 'System Issues', label: 'System Issues' },
              { value: 'Terminated', label: 'Terminated' },
              { value: 'Prenotice', label: 'Prenotice' },
              { value: 'Breastfeeding', label: 'Breastfeeding' },
            ]}
          />
        </div>
      </div>

      {/* Summary cards - Row 1: Counts */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 sm:gap-4">
        <SummaryCard label="Records" value={summary.total} />
        <SummaryCard label="Present" value={summary.present} color="brand" />
        <SummaryCard label="Absent" value={summary.absent} color="red" />
        <SummaryCard label="Late" value={summary.late} color="amber" />
        <SummaryCard label="Left Early" value={summary.leftEarly} color="amber" />
        <SummaryCard label="Time Off" value={summary.timeOff} color="sky" />
        <SummaryCard label="System Issues" value={summary.systemIssues} color="surface" />
      </div>

      {/* Summary cards - Row 2: Payable Hours */}
      <div>
        <p className="text-[10px] sm:text-xs font-semibold text-surface-500 dark:text-surface-400 dark:text-surface-500 uppercase tracking-wider mb-2">Payable Hours</p>
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-3 sm:gap-4">
          <SummaryCard label="Regular" value={fmtHours(summary.totalReg)} color="brand" />
          <SummaryCard label="Night (15%)" value={fmtHours(summary.totalN15)} color="violet" />
          <SummaryCard label="X35%" value={fmtHours(summary.totalX35)} color="amber" />
          <SummaryCard label="X100%" value={fmtHours(summary.totalX100)} color="red" />
          <SummaryCard label="Holiday" value={fmtHours(summary.totalHdy)} color="emerald" />
          <SummaryCard label="DNP" value={fmtHours(summary.totalDnp)} color="surface" />
          <SummaryCard label="Review" value={fmtHours(summary.totalPayableRvw)} color="red" />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl sm:rounded-2xl border border-surface-200/80 bg-white dark:bg-surface-900 overflow-hidden shadow-sm min-w-0">
        {loading ? (
          <div className="p-12 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : records.length === 0 ? (
          <div className="p-8 sm:p-16 text-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-surface-100 dark:bg-surface-800 flex items-center justify-center text-surface-400 dark:text-surface-500">
                <Clock className="w-5 h-5" />
              </div>
              <p className="text-sm font-medium text-surface-700 dark:text-surface-200">No attendance records</p>
              <p className="text-xs text-surface-500 dark:text-surface-400 dark:text-surface-500">No records match your date range. Try adjusting the dates.</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1800px] w-full text-left border-collapse">
              {/* Header */}
              <thead className="sticky top-0 z-10 bg-surface-50 dark:bg-surface-900">
                {/* Group header row */}
                <tr>
                  <th colSpan={2} className="px-2 py-1 text-[9px] font-bold text-brand-600 uppercase tracking-wider whitespace-nowrap border-b border-surface-200 dark:border-surface-700 bg-brand-50/40 text-center">Employee</th>
                  <th colSpan={4} className="px-2 py-1 text-[9px] font-bold text-violet-600 uppercase tracking-wider whitespace-nowrap border-b border-surface-200 dark:border-surface-700 bg-violet-50/40 text-center">Shift</th>
                  <th colSpan={5} className="px-2 py-1 text-[9px] font-bold text-amber-600 uppercase tracking-wider whitespace-nowrap border-b border-surface-200 dark:border-surface-700 bg-amber-50/40 text-center">Classification</th>
                  <th colSpan={4} className="px-2 py-1 text-[9px] font-bold text-surface-500 dark:text-surface-400 dark:text-surface-500 uppercase tracking-wider whitespace-nowrap border-b border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 text-center">Time</th>
                  <th colSpan={6} className="px-2 py-1 text-[9px] font-bold text-blue-600 uppercase tracking-wider whitespace-nowrap border-b border-surface-200 dark:border-surface-700 bg-blue-50/40 text-center">Payable Hours</th>
                  <th colSpan={1} className="px-2 py-1 text-[9px] font-bold text-surface-500 dark:text-surface-400 dark:text-surface-500 uppercase tracking-wider whitespace-nowrap border-b border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 text-center">&nbsp;</th>
                </tr>
                {/* Column header row */}
                <tr>
                  {[
                    'Date',
                    'Account',
                    'Shift Start',
                    'Clock In',
                    'Shift End',
                    'Clock Out',
                    'Status',
                    'Pay',
                    'Bill',
                    'Stage',
                    'Task',
                    'SCH',
                    'SDBT',
                    'ACT',
                    'ADBT',
                    'P-REG',
                    'P-N15%',
                    'P-X35%',
                    'P-X100%',
                    'P-HDY',
                    'P-RVW',
                    'Comments',
                  ].map((col) => (
                    <th
                      key={col}
                      className="px-2 py-1 text-[10px] font-semibold text-surface-500 dark:text-surface-400 dark:text-surface-500 uppercase tracking-wider whitespace-nowrap border-b border-surface-200 dark:border-surface-700"
                    >
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          className="flex items-center gap-0.5 hover:text-surface-700 dark:text-surface-200 transition-colors"
                          onClick={() => handleSort(col)}
                        >
                          {col}
                          {sortCol === col && (
                            sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                          )}
                        </button>
                        <button
                          type="button"
                          className={`p-0.5 rounded hover:bg-surface-200/60 transition-colors ${columnFilters[col] ? 'text-brand-600' : 'text-surface-400 dark:text-surface-500'}`}
                          onClick={(e) => { e.stopPropagation(); setFilterOpen(filterOpen === col ? null : col) }}
                        >
                          <Filter className="w-2.5 h-2.5" />
                        </button>
                      </div>
                      {filterOpen === col && (
                        <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            value={columnFilters[col] ?? ''}
                            onChange={(e) => handleColumnFilter(col, e.target.value)}
                            placeholder={`Filter ${col}...`}
                            className="w-full text-[10px] font-normal normal-case tracking-normal border border-surface-200 dark:border-surface-700 rounded px-1.5 py-1 bg-white dark:bg-surface-900 focus:ring-1 focus:ring-brand-300 outline-none"
                            autoFocus
                          />
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>

              {/* Body */}
              <tbody>
                {filteredAndSorted.length === 0 ? (
                  <tr>
                    <td colSpan={22} className="py-12">
                      <div className="flex flex-col items-center justify-center text-center">
                        <div className="w-12 h-12 rounded-full bg-surface-100 dark:bg-surface-800 flex items-center justify-center text-surface-400 dark:text-surface-500 mb-3">
                          <Search className="w-5 h-5" />
                        </div>
                        <p className="text-sm font-medium text-surface-700 dark:text-surface-200">No matches</p>
                        <p className="text-xs text-surface-500 dark:text-surface-400 dark:text-surface-500 mt-1">Try adjusting your search or column filters.</p>
                        {Object.values(columnFilters).some(Boolean) && (
                          <button type="button" className="btn-secondary btn-sm mt-3" onClick={() => { setColumnFilters({}); setFilterOpen(null) }}>
                            Clear column filters
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : null}
                {filteredAndSorted.map((r) => {
                  const sid = r.sessionId ?? r.id
                  return (
                    <tr
                      key={sid}
                      className="border-b border-surface-100 dark:border-surface-800 hover:bg-surface-50/60 transition-colors cursor-pointer"
                      onClick={() => setDetailRecord(r)}
                    >
                      {/* Date */}
                      <td className="px-2 py-1.5 text-xs font-medium text-surface-900 dark:text-surface-50 whitespace-nowrap">
                        {r.date ?? ''}
                      </td>
                      {/* Account */}
                      <td className="px-2 py-1.5 text-xs text-surface-700 dark:text-surface-200 whitespace-nowrap">
                        {r.accountName ?? '-'}
                      </td>
                      {/* Shift Start */}
                      <td className="px-2 py-1.5 text-xs font-mono text-surface-700 dark:text-surface-200 tabular-nums whitespace-nowrap">
                        {fmtDateTime(r.shiftStart)}
                      </td>
                      {/* Clock In */}
                      <td className="px-2 py-1.5 text-xs font-mono text-surface-700 dark:text-surface-200 tabular-nums whitespace-nowrap">
                        {fmtDateTime(r.clockIn)}
                      </td>
                      {/* Shift End */}
                      <td className="px-2 py-1.5 text-xs font-mono text-surface-700 dark:text-surface-200 tabular-nums whitespace-nowrap">
                        {fmtDateTime(r.shiftEnd)}
                      </td>
                      {/* Clock Out */}
                      <td className="px-2 py-1.5 text-xs font-mono text-surface-700 dark:text-surface-200 tabular-nums whitespace-nowrap">
                        {fmtDateTime(r.clockOut)}
                      </td>
                      {/* Status */}
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium capitalize ${statusColors[r.status] || 'bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-300'}`}>
                          {r.status}
                        </span>
                      </td>
                      {/* Pay */}
                      <td className="px-2 py-1.5 text-xs text-surface-700 dark:text-surface-200 whitespace-nowrap">
                        {r.payType ?? ''}
                      </td>
                      {/* Bill */}
                      <td className="px-2 py-1.5 text-xs text-surface-700 dark:text-surface-200 whitespace-nowrap">
                        {r.billType ?? ''}
                      </td>
                      {/* Stage */}
                      <td className="px-2 py-1.5 text-xs text-surface-700 dark:text-surface-200 whitespace-nowrap">
                        {r.stage ?? ''}
                      </td>
                      {/* Task */}
                      <td className="px-2 py-1.5 text-xs text-surface-700 dark:text-surface-200 whitespace-nowrap">
                        {r.task ?? ''}
                      </td>
                      {/* SCH */}
                      <td className={`px-2 py-1.5 text-xs tabular-nums whitespace-nowrap text-right ${(r.scheduledHours ?? 0) > 0 ? 'text-surface-700 dark:text-surface-200 font-medium' : 'text-surface-300'}`}>
                        {fmtHours(r.scheduledHours)}
                      </td>
                      {/* SDBT */}
                      <td className={`px-2 py-1.5 text-xs tabular-nums whitespace-nowrap text-right ${(r.sdbtHours ?? 0) > 0 ? 'text-surface-700 dark:text-surface-200 font-medium' : 'text-surface-300'}`}>
                        {fmtHours(r.sdbtHours)}
                      </td>
                      {/* ACT */}
                      <td className={`px-2 py-1.5 text-xs tabular-nums whitespace-nowrap text-right ${(r.actualHours ?? 0) > 0 ? 'text-surface-700 dark:text-surface-200 font-medium' : 'text-surface-300'}`}>
                        {fmtHours(r.actualHours)}
                      </td>
                      {/* ADBT */}
                      <td className={`px-2 py-1.5 text-xs tabular-nums whitespace-nowrap text-right ${(r.adbtHours ?? 0) > 0 ? 'text-surface-700 dark:text-surface-200 font-medium' : 'text-surface-300'}`}>
                        {fmtHours(r.adbtHours)}
                      </td>
                      {/* P-REG */}
                      <td className={`px-2 py-1.5 text-xs tabular-nums whitespace-nowrap text-right font-medium ${(r.regHours ?? 0) > 0 ? 'text-brand-600' : 'text-surface-300'}`}>
                        {fmtHours(r.regHours)}
                      </td>
                      {/* P-N15% */}
                      <td className={`px-2 py-1.5 text-xs tabular-nums whitespace-nowrap text-right font-medium ${(r.n15Hours ?? 0) > 0 ? 'text-violet-600' : 'text-surface-300'}`}>
                        {fmtHours(r.n15Hours)}
                      </td>
                      {/* P-X35% */}
                      <td className={`px-2 py-1.5 text-xs tabular-nums whitespace-nowrap text-right font-medium ${(r.x35Hours ?? 0) > 0 ? 'text-amber-600' : 'text-surface-300'}`}>
                        {fmtHours(r.x35Hours)}
                      </td>
                      {/* P-X100% */}
                      <td className={`px-2 py-1.5 text-xs tabular-nums whitespace-nowrap text-right font-medium ${(r.x100Hours ?? 0) > 0 ? 'text-red-600' : 'text-surface-300'}`}>
                        {fmtHours(r.x100Hours)}
                      </td>
                      {/* P-HDY */}
                      <td className={`px-2 py-1.5 text-xs tabular-nums whitespace-nowrap text-right font-medium ${(r.hdyHours ?? 0) > 0 ? 'text-emerald-600' : 'text-surface-300'}`}>
                        {fmtHours(r.hdyHours)}
                      </td>
                      {/* P-RVW */}
                      <td className={`px-2 py-1.5 text-xs tabular-nums whitespace-nowrap text-right font-medium ${(r.payableRvwHours ?? 0) > 0 ? 'text-red-600' : 'text-surface-300'}`}>
                        {fmtHours(r.payableRvwHours)}
                      </td>
                      {/* Comments */}
                      <td className="px-2 py-1.5 text-xs text-surface-600 dark:text-surface-300 whitespace-nowrap max-w-[200px] truncate" title={r.comments ?? ''}>
                        {r.comments ?? ''}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Modal (read-only) */}
      {detailRecord && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={() => setDetailRecord(null)}
            aria-label="Close"
          />
          <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 shadow-xl">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-white dark:bg-surface-900 rounded-t-2xl border-b border-surface-100 dark:border-surface-800 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-surface-900 dark:text-surface-50">Attendance Detail</h2>
                <p className="text-xs text-surface-500 dark:text-surface-400 dark:text-surface-500 mt-0.5">{detailRecord.date}</p>
              </div>
              <button
                type="button"
                onClick={() => setDetailRecord(null)}
                className="p-2 rounded-lg text-surface-400 dark:text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-700 dark:bg-surface-800 hover:text-surface-700 dark:text-surface-200"
              >
                <span className="sr-only">Close</span>
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Shift & Clock */}
              <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 p-4">
                <p className="text-[10px] font-semibold text-surface-400 dark:text-surface-500 uppercase tracking-wider mb-3">Shift & Clock</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {([
                    { label: 'Shift Start', val: fmtTime(detailRecord.shiftStart) || '--' },
                    { label: 'Clock In', val: fmtTime(detailRecord.clockIn) || '--' },
                    { label: 'Shift End', val: fmtTime(detailRecord.shiftEnd) || '--' },
                    { label: 'Clock Out', val: fmtTime(detailRecord.clockOut) || '--' },
                  ]).map((item) => (
                    <div key={item.label} className="text-center rounded-lg bg-white dark:bg-surface-900 border border-surface-100 dark:border-surface-800 py-2 px-1">
                      <p className="text-[10px] font-medium text-surface-400 dark:text-surface-500 uppercase">{item.label}</p>
                      <p className="text-sm font-semibold tabular-nums mt-0.5 text-surface-800 dark:text-surface-100 font-mono">{item.val}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Classification — added Account/Stage/Reports To per 19MAY2026 client video */}
              <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 p-4">
                <p className="text-[10px] font-semibold text-surface-400 dark:text-surface-500 uppercase tracking-wider mb-3">Classification</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center rounded-lg bg-white dark:bg-surface-900 border border-surface-100 dark:border-surface-800 py-2 px-1">
                    <p className="text-[10px] font-medium text-surface-400 dark:text-surface-500 uppercase">Status</p>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium capitalize mt-1 ${statusColors[detailRecord.status] || 'bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-300'}`}>
                      {detailRecord.status}
                    </span>
                  </div>
                  <div className="text-center rounded-lg bg-white dark:bg-surface-900 border border-surface-100 dark:border-surface-800 py-2 px-1">
                    <p className="text-[10px] font-medium text-surface-400 dark:text-surface-500 uppercase">Account</p>
                    <p className="text-sm font-semibold text-surface-800 dark:text-surface-100 mt-0.5 truncate" title={detailRecord.accountName ?? ''}>{detailRecord.accountName ?? '--'}</p>
                  </div>
                  <div className="text-center rounded-lg bg-white dark:bg-surface-900 border border-surface-100 dark:border-surface-800 py-2 px-1">
                    <p className="text-[10px] font-medium text-surface-400 dark:text-surface-500 uppercase">Task</p>
                    <p className="text-sm font-semibold text-surface-800 dark:text-surface-100 mt-0.5 truncate" title={detailRecord.task ?? ''}>{detailRecord.task ?? '--'}</p>
                  </div>
                  <div className="text-center rounded-lg bg-white dark:bg-surface-900 border border-surface-100 dark:border-surface-800 py-2 px-1">
                    <p className="text-[10px] font-medium text-surface-400 dark:text-surface-500 uppercase">Stage</p>
                    <p className="text-sm font-semibold text-surface-800 dark:text-surface-100 mt-0.5 truncate">{detailRecord.stage ?? '--'}</p>
                  </div>
                  <div className="text-center rounded-lg bg-white dark:bg-surface-900 border border-surface-100 dark:border-surface-800 py-2 px-1">
                    <p className="text-[10px] font-medium text-surface-400 dark:text-surface-500 uppercase">Reports To</p>
                    <p className="text-sm font-semibold text-surface-800 dark:text-surface-100 mt-0.5 truncate" title={detailRecord.reportsTo ?? ''}>{detailRecord.reportsTo ?? '--'}</p>
                  </div>
                  <div className="text-center rounded-lg bg-white dark:bg-surface-900 border border-surface-100 dark:border-surface-800 py-2 px-1">
                    <p className="text-[10px] font-medium text-surface-400 dark:text-surface-500 uppercase">Pay</p>
                    <p className="text-sm font-semibold text-surface-800 dark:text-surface-100 mt-0.5">{detailRecord.payType ?? '--'}</p>
                  </div>
                </div>
              </div>

              {/* Hours */}
              <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 p-4">
                <p className="text-[10px] font-semibold text-surface-400 dark:text-surface-500 uppercase tracking-wider mb-3">Hours</p>
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {([
                    { label: 'SCH', val: detailRecord.scheduledHours },
                    { label: 'SDBT', val: detailRecord.sdbtHours },
                    { label: 'ACT', val: detailRecord.actualHours },
                    { label: 'ADBT', val: detailRecord.adbtHours },
                  ] as const).map((item) => (
                    <div key={item.label} className="text-center rounded-lg bg-white dark:bg-surface-900 border border-surface-100 dark:border-surface-800 py-2 px-1">
                      <p className="text-[10px] font-medium text-surface-400 dark:text-surface-500 uppercase">{item.label}</p>
                      <p className={`text-sm font-semibold tabular-nums mt-0.5 ${(item.val ?? 0) > 0 ? 'text-surface-800 dark:text-surface-100' : 'text-surface-300'}`}>{fmtHours(item.val)}</p>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-wider mb-2">Payable</p>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                  {([
                    { label: 'P-REG', val: detailRecord.regHours, color: 'brand' },
                    { label: 'P-N15%', val: detailRecord.n15Hours, color: 'violet' },
                    { label: 'P-X35%', val: detailRecord.x35Hours, color: 'amber' },
                    { label: 'P-X100%', val: detailRecord.x100Hours, color: 'red' },
                    { label: 'P-HDY', val: detailRecord.hdyHours, color: 'emerald' },
                    { label: 'P-DNP', val: detailRecord.payType === 'DNP' ? (detailRecord.actualHours ?? 0) - (detailRecord.adbtHours ?? 0) : 0, color: 'surface' },
                    { label: 'P-RVW', val: detailRecord.payableRvwHours, color: 'red' },
                  ] as { label: string; val: number | null | undefined; color: string }[]).map((item) => {
                    const isNonZero = (item.val ?? 0) > 0
                    const badgeBg = isNonZero
                      ? item.color === 'brand' ? 'bg-blue-50 border-blue-200 text-blue-700'
                        : item.color === 'violet' ? 'bg-violet-50 border-violet-200 text-violet-700'
                        : item.color === 'amber' ? 'bg-amber-50 border-amber-200 text-amber-700'
                        : item.color === 'red' ? 'bg-red-50 border-red-200 text-red-700'
                        : item.color === 'emerald' ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        : 'bg-surface-50 dark:bg-surface-900 border-surface-200 dark:border-surface-700 text-surface-500 dark:text-surface-400 dark:text-surface-500'
                      : 'bg-white dark:bg-surface-900 border-surface-100 dark:border-surface-800 text-surface-300'
                    return (
                      <div key={item.label} className={`text-center rounded-lg border py-2 px-1 ${badgeBg}`}>
                        <p className="text-[10px] font-medium uppercase">{item.label}</p>
                        <p className="text-sm font-semibold tabular-nums mt-0.5">{fmtHours(item.val)}</p>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Comments */}
              {detailRecord.comments && (
                <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 p-4">
                  <p className="text-[10px] font-semibold text-surface-400 dark:text-surface-500 uppercase tracking-wider mb-2">Comments</p>
                  <p className="text-sm text-surface-700 dark:text-surface-200">{detailRecord.comments}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
