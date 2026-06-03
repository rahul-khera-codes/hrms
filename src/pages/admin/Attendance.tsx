import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { format, startOfWeek, endOfWeek } from 'date-fns'
import { Search, Download, X, ArrowUp, ArrowDown, Filter, Clock, Plus, Lock, Unlock, Pencil } from 'lucide-react'
import { getAdminAttendance, updateAttendanceRecord, createAttendanceRecord, getEmployees, getClients, getPayrollPeriods, setAttendanceReviewed, type EmployeeRecord, type Client, type PayrollPeriod } from '@/lib/apiAdmin'
import { buildCycleOptions } from '@/lib/cycleOptions'
import type { AttendanceRecord } from '@/types'
import DateRangePicker from '@/components/DateRangePicker'
import AdminSelect from '@/components/AdminSelect'
import { PageHeader } from '@/components/PageHeader'
import { DetailModalHeader } from '@/components/DetailModalHeader'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_OPTIONS = [
  'Present',
  'Absent',
  'Late',
  'Left Early',
  'Late & Left Early',
  'Time Off',
  'System Issues',
  'Terminated',
  'Prenotice',
  'Breastfeeding',
] as const

const PAY_OPTIONS = ['Regular', 'X35%', 'X100%', 'Holiday', 'DNP', 'Review'] as const
const BILL_OPTIONS = ['Regular', 'Premium', 'DNB', 'Review'] as const
const STAGE_OPTIONS = ['Production', 'Nesting', 'Training'] as const
const TASK_OPTIONS = [
  'Admin',
  'Authorizations',
  'Billing Support',
  'Call Center',
  'CDPAP Prebilling',
  'Care Manager',
  'Collections',
  'Coord Support',
  'Coordination',
  'COVID Screening',
  'Cross Training',
  'Customer Support',
  'Data Entry',
  'Document Coord',
  'EVV',
  'Floater',
  'Flu Shot',
  'Follow ups',
  'Help Desk',
  'HHAX App',
  'HR Project',
  'HR Support',
  'Inflowcare',
  'Intake Support',
  'Lead Generator',
  'LIHTC Support',
  'Medical Billing',
  'Nursing Support',
  'On Call',
  'Operator',
  'Pre-Billing',
  'Property Mgmt',
  'Receptionist',
  'Recruitment',
  'Sales Support',
  'Service Follow up',
  'Special Project',
  'Staffing',
  'VOC Surveys',
  'Sales Support T1',
  'OB Sales',
  'Junior Trainer',
  'Senior Trainer',
  'Accountant',
] as const

// Color scheme per 19MAY2026 client video:
// "Present this green, absent this red, late/left early/everything in between this orange,
// Time off goes this color [sky]. And system issues, terminated, prenotice, breastfeeding,
// you can have all of those in red as well. Or maybe just gray, I guess gray to avoid conflicts."
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
  // Legacy lowercase mappings (backward compat with old data)
  present: 'bg-emerald-100 text-emerald-700',
  absent: 'bg-red-100 text-red-700',
  active: 'bg-amber-100 text-amber-700',
  leave: 'bg-sky-100 text-sky-700',
  adjusted: 'bg-indigo-100 text-indigo-700',
  late_in: 'bg-amber-100 text-amber-700',
  early_out: 'bg-amber-100 text-amber-700',
  late_in_early_out: 'bg-amber-100 text-amber-700',
  // Legacy capitalized mappings
  'Late In': 'bg-amber-100 text-amber-700',
  'Early Out': 'bg-amber-100 text-amber-700',
  'Late In-Early Out': 'bg-amber-100 text-amber-700',
  Review: 'bg-indigo-100 text-indigo-700',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// 03JUN2026 — all time formatting goes through the shared AST 12-hour helpers
// so Attendance matches every other screen (universal UTC-4, hh:mm AM/PM).
import { fmtTime, fmtDateTime, toDateTimeLocal, fromDateTimeLocal, fmtDateISO, fmtFullDateTime } from '@/lib/timeFormat'

function fmtDate(dateStr: string | null | undefined): string {
  // AST-anchored ISO date — keeps the row's date column matching the AST clock_in.
  return fmtDateISO(dateStr) || (dateStr ?? '')
}

function fmtHours(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return '0.00'
  return val.toFixed(2)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminAttendance() {
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  // Default date range = current week Sunday → Saturday (client's standard)
  const [dateFrom, setDateFrom] = useState(() => format(startOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd'))
  const [dateTo, setDateTo] = useState(() => format(endOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd'))

  function handleDateRangeChange(start: string, end: string) {
    setDateFrom(start)
    setDateTo(end)
  }
  const [savingId, setSavingId] = useState<string | null>(null)
  const [detailRecord, setDetailRecord] = useState<AttendanceRecord | null>(null)

  // Sort & Filter state
  // 25MAY client: default sort = Record ID desc (most recent on top)
  const [sortCol, setSortCol] = useState<string | null>('Record ID')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({})
  const [filterOpen, setFilterOpen] = useState<string | null>(null)

  // Dropdown lookup data for editable modal fields
  const [allEmployees, setAllEmployees] = useState<EmployeeRecord[]>([])
  const [allClients, setAllClients] = useState<Client[]>([])

  // Account filter
  const [filterAccount, setFilterAccount] = useState('')
  const [filterStatus, setFilterStatus] = useState('') // '' = all, 'blank' = unclassified, 'Present' etc

  // Reviewed filter — 19MAY2026 Scheduler Demos meeting.
  // '' = all, 'pending' = needs review, 'done' = already reviewed
  const [filterReviewed, setFilterReviewed] = useState('')

  // Payroll cycle filter
  const [payrollPeriods, setPayrollPeriods] = useState<PayrollPeriod[]>([])
  const [filterCycle, setFilterCycle] = useState('')

  // Add Attendance Record modal
  const [showAddModal, setShowAddModal] = useState(false)

  // -----------------------------------------------------------------------
  // Fetch
  // -----------------------------------------------------------------------

  const fetchAttendance = useCallback(async () => {
    try {
      const list = await getAdminAttendance({
        from: dateFrom,
        to: dateTo,
        search: search.trim() || undefined,
      })
      setRecords(list)
      setLoading(false)
    } catch {
      setRecords([])
      setLoading(false)
    }
  }, [dateFrom, dateTo, search])

  useEffect(() => {
    // Fetch lookup data once for modal dropdowns
    getEmployees().then(setAllEmployees).catch(() => setAllEmployees([]))
    getClients().then(setAllClients).catch(() => setAllClients([]))
    getPayrollPeriods().then(setPayrollPeriods).catch(() => setPayrollPeriods([]))
  }, [])

  useEffect(() => {
    fetchAttendance()

    const intervalId = window.setInterval(() => {
      if (!document.hidden) {
        fetchAttendance()
      }
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
  // Inline edit
  // -----------------------------------------------------------------------

  const handleFieldUpdate = useCallback(
    async (record: AttendanceRecord, field: string, value: string | boolean) => {
      const sessionId = record.sessionId ?? record.id
      setSavingId(sessionId)
      try {
        const payload: Record<string, unknown> = {}
        if (field === 'status') payload.statusOverride = (value as string) || null
        else if (field === 'payType') payload.payType = value
        else if (field === 'billType') payload.billType = value
        else if (field === 'stage') payload.stage = (value as string) || null
        else if (field === 'task') payload.task = (value as string) || null
        else if (field === 'comments') payload.comments = (value as string) || null
        else if (field === 'shiftStart') payload.shiftStart = (value as string) || null
        else if (field === 'shiftEnd') payload.shiftEnd = (value as string) || null
        else if (field === 'clockIn') payload.clockIn = (value as string) || null
        else if (field === 'clockOut') payload.clockOut = (value as string) || null
        else if (field === 'reportsToOverride') payload.reportsToOverride = (value as string) || null
        else if (field === 'accountOverride') payload.accountOverride = (value as string) || null
        else if (field === 'isLocked') payload.isLocked = Boolean(value)

        const updated = await updateAttendanceRecord(sessionId, payload)

        setRecords((prev) =>
          prev.map((r) => {
            const rSid = r.sessionId ?? r.id
            return rSid === sessionId ? { ...r, ...updated } : r
          }),
        )
        if (detailRecord && (detailRecord.sessionId ?? detailRecord.id) === sessionId) {
          setDetailRecord((prev) => (prev ? { ...prev, ...updated } : prev))
        }
      } catch (err) {
        console.error('Failed to update attendance record', err)
      } finally {
        setSavingId(null)
      }
    },
    [detailRecord],
  )

  // -----------------------------------------------------------------------
  // CSV export
  // -----------------------------------------------------------------------

  function exportCSV() {
    if (!records.length) return
    const headers = [
      'EID',
      'Employee',
      'Account',
      'Date',
      'Shift Start',
      'Clock In',
      'Shift End',
      'Clock Out',
      'Stage',
      'Reports To',
      'Task',
      'Status',
      'Pay',
      'Bill',
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
      'B-REG',
      'B-PRM',
      'B-RVW',
      'Comments',
    ]
    const rows = records.map((r) => [
      r.employeeCmid ?? '',
      r.employeeName,
      r.accountName ?? '',
      fmtDate(r.date),
      fmtTime(r.shiftStart),
      fmtTime(r.clockIn),
      fmtTime(r.shiftEnd),
      fmtTime(r.clockOut),
      r.stage ?? '',
      r.reportsTo ?? '',
      r.task ?? '',
      r.status,
      r.payType ?? '',
      r.billType ?? '',
      fmtHours(r.scheduledHours),
      fmtHours(r.sdbtHours),
      fmtHours(r.actualHours),
      fmtHours(r.adbtHours),
      fmtHours(r.regHours),
      fmtHours(r.n15Hours),
      fmtHours(r.x35Hours),
      fmtHours(r.x100Hours),
      fmtHours(r.hdyHours),
      fmtHours(r.payableRvwHours),
      fmtHours(r.billableRegHours),
      fmtHours(r.billablePrmHours),
      fmtHours(r.billableRvwHours),
      r.comments ?? '',
    ])
    const csv = [
      headers.join(','),
      ...rows.map((row) =>
        row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','),
      ),
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `attendance-${dateFrom}-to-${dateTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // -----------------------------------------------------------------------
  // Summary stats
  // -----------------------------------------------------------------------

  const summary = useMemo(() => {
    const total = records.length
    const present = records.filter(
      (r) => r.status.toLowerCase() === 'present',
    ).length
    const absent = records.filter(
      (r) => r.status.toLowerCase() === 'absent',
    ).length
    const late = records.filter((r) =>
      r.status.toLowerCase().includes('late'),
    ).length
    const leftEarly = records.filter((r) =>
      r.status.toLowerCase().includes('left early'),
    ).length
    const timeOff = records.filter(
      (r) => r.status.toLowerCase() === 'time off',
    ).length
    const systemIssues = records.filter(
      (r) => r.status.toLowerCase() === 'system issues',
    ).length
    // Payable hours
    const totalReg = records.reduce((a, r) => a + (r.regHours ?? 0), 0)
    const totalN15 = records.reduce((a, r) => a + (r.n15Hours ?? 0), 0)
    const totalX35 = records.reduce((a, r) => a + (r.x35Hours ?? 0), 0)
    const totalX100 = records.reduce((a, r) => a + (r.x100Hours ?? 0), 0)
    const totalHdy = records.reduce((a, r) => a + (r.hdyHours ?? 0), 0)
    const totalDnp = records.filter((r) => r.payType === 'DNP').reduce((a, r) => a + (r.actualHours ?? 0) - (r.adbtHours ?? 0), 0)
    const totalPayableRvw = records.reduce((a, r) => a + (r.payableRvwHours ?? 0), 0)
    // Billable hours
    const totalBillableReg = records.reduce((a, r) => a + (r.billableRegHours ?? 0), 0)
    const totalBillablePrm = records.reduce((a, r) => a + (r.billablePrmHours ?? 0), 0)
    const totalBillableRvw = records.reduce((a, r) => a + (r.billableRvwHours ?? 0), 0)
    // DNB shows actual hours (no break deduction) — for tracking purposes
    const billDnb = records.filter((r) => r.billType === 'DNB').reduce((a, r) => a + (r.actualHours ?? 0), 0)
    return {
      total, present, absent, late, leftEarly, timeOff, systemIssues,
      totalReg, totalN15, totalX35, totalX100, totalHdy, totalDnp, totalPayableRvw,
      totalBillableReg, totalBillablePrm, totalBillableRvw, billDnb,
    }
  }, [records])

  // -----------------------------------------------------------------------
  // Sort & Filter helpers
  // -----------------------------------------------------------------------

  const colAccessor = useCallback((r: AttendanceRecord, col: string): string | number => {
    switch (col) {
      case 'Record ID': return r.recordId ?? ''
      case 'EID': return r.employeeCmid ?? 0
      case 'Employee': return r.employeeName.toLowerCase()
      case 'Account': return (r.accountName ?? '').toLowerCase()
      case 'Shift Start': return r.shiftStart ?? ''
      case 'Clock In': return r.clockIn ?? ''
      case 'Shift End': return r.shiftEnd ?? ''
      case 'Clock Out': return r.clockOut ?? ''
      case 'Stage': return (r.stage ?? '').toLowerCase()
      case 'Reports To': return (r.reportsTo ?? '').toLowerCase()
      case 'Task': return (r.task ?? '').toLowerCase()
      case 'Status': return r.status.toLowerCase()
      case 'Pay': return (r.payType ?? '').toLowerCase()
      case 'Bill': return (r.billType ?? '').toLowerCase()
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
      case 'B-REG': return r.billableRegHours ?? 0
      case 'B-PRM': return r.billablePrmHours ?? 0
      case 'B-RVW': return r.billableRvwHours ?? 0
      case 'Comments': return (r.comments ?? '').toLowerCase()
      default: return ''
    }
  }, [])

  const filteredAndSorted = useMemo(() => {
    let result = [...records]

    // Apply account filter
    if (filterAccount) {
      result = result.filter((r) => (r.accountName ?? '') === filterAccount)
    }

    // Apply status filter (per 19MAY2026 client video — including 'blank' to find unclassified records)
    if (filterStatus) {
      if (filterStatus === 'blank') {
        result = result.filter((r) => !r.status || r.status.trim() === '')
      } else {
        result = result.filter((r) => (r.status ?? '') === filterStatus)
      }
    }

    // Apply Reviewed/Normalized filter — 19MAY2026 Scheduler Demos meeting.
    if (filterReviewed === 'pending') {
      result = result.filter((r) => !r.reviewed)
    } else if (filterReviewed === 'done') {
      result = result.filter((r) => !!r.reviewed)
    }

    // Apply column filters
    for (const [col, filterVal] of Object.entries(columnFilters)) {
      if (!filterVal) continue
      const lower = filterVal.toLowerCase()
      result = result.filter((r) => {
        const val = colAccessor(r, col)
        return String(val).toLowerCase().includes(lower)
      })
    }

    // Apply sort
    if (sortCol) {
      result.sort((a, b) => {
        const aVal = colAccessor(a, sortCol)
        const bVal = colAccessor(b, sortCol)
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortDir === 'asc' ? aVal - bVal : bVal - aVal
        }
        const cmp = String(aVal).localeCompare(String(bVal))
        return sortDir === 'asc' ? cmp : -cmp
      })
    }
    return result
  }, [records, filterAccount, filterStatus, filterReviewed, columnFilters, sortCol, sortDir, colAccessor])

  function handleSort(col: string) {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
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
        title="Attendance"
        subtitle="Excel-style log. Inline-edit Status, Pay, Bill, Stage, Task and Comments."
        icon={<Clock className="w-5 h-5" />}
        actions={
          <>
            <button
              type="button"
              onClick={exportCSV}
              disabled={loading || records.length === 0}
              className="btn-secondary"
            >
              <Download className="w-4 h-4 shrink-0" />
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="btn-primary"
            >
              <Plus className="w-4 h-4" />
              Add record
            </button>
          </>
        }
      />

      {/* Filters */}
      <div className="toolbar">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 dark:text-surface-500 shrink-0" />
          <input
            type="text"
            placeholder="Search by name"
            className="input pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-auto sm:min-w-[320px]">
          <DateRangePicker startDate={dateFrom} endDate={dateTo} onChange={handleDateRangeChange} />
        </div>
        <div className="w-full sm:w-auto sm:min-w-[180px]">
          <select
            value={filterAccount}
            onChange={(e) => setFilterAccount(e.target.value)}
            className="input text-sm w-full"
          >
            <option value="">All accounts</option>
            {allClients.map((c) => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="w-full sm:w-auto sm:min-w-[180px]">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="input text-sm w-full"
          >
            <option value="">All statuses</option>
            <option value="blank">— (no status, needs classification)</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="w-full sm:w-auto sm:min-w-[180px]">
          <select
            value={filterReviewed}
            onChange={(e) => setFilterReviewed(e.target.value)}
            className="input text-sm w-full"
          >
            <option value="">All review states</option>
            <option value="pending">Needs review</option>
            <option value="done">Reviewed</option>
          </select>
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

      {/* Summary cards - Row 3: Billable Hours.
          22MAY UI sweep: use the same 7-column grid as Payable Hours above so
          card widths stay consistent across rows (4 cards + 3 empty slots). */}
      <div>
        <p className="text-[10px] sm:text-xs font-semibold text-surface-500 dark:text-surface-400 dark:text-surface-500 uppercase tracking-wider mb-2">Billable Hours</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 sm:gap-4">
          <SummaryCard label="Regular" value={fmtHours(summary.totalBillableReg)} color="brand" />
          <SummaryCard label="Premium" value={fmtHours(summary.totalBillablePrm)} color="violet" />
          <SummaryCard label="DNB" value={fmtHours(summary.billDnb)} color="surface" />
          <SummaryCard label="Review" value={fmtHours(summary.totalBillableRvw)} color="red" />
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
            <p className="text-surface-500 dark:text-surface-400 dark:text-surface-500 text-xs sm:text-sm">
              No records match your filters.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto" onClick={(e) => { if ((e.target as HTMLElement).closest('select, input')) e.stopPropagation() }}>
            <table className="min-w-[2400px] w-full text-left border-collapse">
              {/* Header */}
              <thead className="sticky top-0 z-10 bg-surface-50 dark:bg-surface-900">
                {/* Group header row */}
                <tr>
                  <th colSpan={3} className="px-2 py-1 text-[9px] font-bold text-brand-600 uppercase tracking-wider whitespace-nowrap border-b border-surface-200 dark:border-surface-700 bg-brand-50/40 text-center">Employee</th>
                  <th colSpan={4} className="px-2 py-1 text-[9px] font-bold text-violet-600 uppercase tracking-wider whitespace-nowrap border-b border-surface-200 dark:border-surface-700 bg-violet-50/40 text-center">Shift</th>
                  <th colSpan={5} className="px-2 py-1 text-[9px] font-bold text-amber-600 uppercase tracking-wider whitespace-nowrap border-b border-surface-200 dark:border-surface-700 bg-amber-50/40 text-center">Shift Classification</th>
                  <th colSpan={4} className="px-2 py-1 text-[9px] font-bold text-surface-500 dark:text-surface-400 dark:text-surface-500 uppercase tracking-wider whitespace-nowrap border-b border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 text-center">Time</th>
                  <th colSpan={6} className="px-2 py-1 text-[9px] font-bold text-blue-600 uppercase tracking-wider whitespace-nowrap border-b border-surface-200 dark:border-surface-700 bg-blue-50/40 text-center">Payable Hours</th>
                  <th colSpan={3} className="px-2 py-1 text-[9px] font-bold text-emerald-600 uppercase tracking-wider whitespace-nowrap border-b border-surface-200 dark:border-surface-700 bg-emerald-50/40 text-center">Billable Hours</th>
                  <th colSpan={2} className="px-2 py-1 text-[9px] font-bold text-surface-500 dark:text-surface-400 dark:text-surface-500 uppercase tracking-wider whitespace-nowrap border-b border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 text-center">&nbsp;</th>
                </tr>
                {/* Column header row */}
                <tr>
                  {[
                    'Record ID',
                    'EID',
                    'Employee',
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
                    'B-REG',
                    'B-PRM',
                    'B-RVW',
                    'Comments',
                    'Actions',
                  ].map((col) => (
                    <th
                      key={col}
                      className={`px-2 py-1 text-[10px] font-semibold text-surface-500 dark:text-surface-400 dark:text-surface-500 uppercase tracking-wider whitespace-nowrap border-b border-surface-200 dark:border-surface-700 ${col === 'Actions' ? 'text-right' : ''}`}
                    >
                      {col === 'Actions' ? col : (
                      <>
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
                      </>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>

              {/* Body */}
              <tbody>
                {filteredAndSorted.map((r) => {
                  const sid = r.sessionId ?? r.id
                  const isSaving = savingId === sid
                  return (
                    <tr
                      key={sid}
                      className={`border-b border-surface-100 dark:border-surface-800 hover:bg-surface-50/60 transition-colors cursor-pointer ${isSaving ? 'opacity-60' : ''}`}
                      onClick={() => setDetailRecord(r)}
                    >
                      {/* Record ID (SES-####) — 25MAY client follow-up */}
                      <td className="px-2 py-1.5 text-xs font-mono text-surface-700 dark:text-surface-200 tabular-nums whitespace-nowrap">
                        {r.recordId ?? '-'}
                      </td>
                      {/* EID */}
                      <td className="px-2 py-1.5 text-xs text-surface-700 dark:text-surface-200 tabular-nums whitespace-nowrap">
                        {r.employeeCmid ?? ''}
                      </td>
                      {/* Employee */}
                      <td className="px-2 py-1.5 text-xs font-medium text-surface-900 dark:text-surface-50 whitespace-nowrap max-w-[140px] truncate">
                        {r.employeeName}
                      </td>
                      {/* Account */}
                      <td className="px-2 py-1.5 text-xs text-surface-700 dark:text-surface-200 whitespace-nowrap">
                        {r.accountName ?? ''}
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
                      {/* Status (editable) */}
                      <td className="px-2 py-1.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <InlineSelect
                          value={r.status}
                          options={STATUS_OPTIONS}
                          onChange={(v) => handleFieldUpdate(r, 'status', v)}
                          colorMap={statusColors}
                        />
                      </td>
                      {/* Pay (editable) */}
                      <td className="px-2 py-1.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <InlineSelect
                          value={r.payType ?? ''}
                          options={PAY_OPTIONS}
                          onChange={(v) => handleFieldUpdate(r, 'payType', v)}
                          colorMap={{ Review: 'text-red-600 font-semibold' }}
                        />
                      </td>
                      {/* Bill (editable) */}
                      <td className="px-2 py-1.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <InlineSelect
                          value={r.billType ?? ''}
                          options={BILL_OPTIONS}
                          onChange={(v) => handleFieldUpdate(r, 'billType', v)}
                          colorMap={{ Review: 'text-red-600 font-semibold' }}
                        />
                      </td>
                      {/* Stage (editable) */}
                      <td className="px-2 py-1.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <InlineSelect
                          value={r.stage ?? ''}
                          options={STAGE_OPTIONS}
                          onChange={(v) => handleFieldUpdate(r, 'stage', v)}
                        />
                      </td>
                      {/* Task (editable) */}
                      <td className="px-2 py-1.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <InlineSelect
                          value={r.task ?? ''}
                          options={TASK_OPTIONS}
                          onChange={(v) => handleFieldUpdate(r, 'task', v)}
                        />
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
                      {/* B-REG */}
                      <td className={`px-2 py-1.5 text-xs tabular-nums whitespace-nowrap text-right font-medium ${(r.billableRegHours ?? 0) > 0 ? 'text-brand-600' : 'text-surface-300'}`}>
                        {fmtHours(r.billableRegHours)}
                      </td>
                      {/* B-PRM */}
                      <td className={`px-2 py-1.5 text-xs tabular-nums whitespace-nowrap text-right font-medium ${(r.billablePrmHours ?? 0) > 0 ? 'text-violet-600' : 'text-surface-300'}`}>
                        {fmtHours(r.billablePrmHours)}
                      </td>
                      {/* B-RVW */}
                      <td className={`px-2 py-1.5 text-xs tabular-nums whitespace-nowrap text-right font-medium ${(r.billableRvwHours ?? 0) > 0 ? 'text-red-600' : 'text-surface-300'}`}>
                        {fmtHours(r.billableRvwHours)}
                      </td>
                      {/* Comments (editable) */}
                      <td className="px-2 py-1.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <InlineInput
                          value={r.comments ?? ''}
                          onSave={(v) => handleFieldUpdate(r, 'comments', v)}
                        />
                      </td>
                      {/* Actions — Edit pencil */}
                      <td className="px-2 py-1.5 whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => setDetailRecord(r)}
                          className="p-1.5 rounded-lg text-surface-500 dark:text-surface-400 dark:text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-700 dark:bg-surface-800"
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail / Edit Modal */}
      {detailRecord && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={() => setDetailRecord(null)}
            aria-label="Close"
          />
          <div className="relative z-10 w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 shadow-xl">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-white dark:bg-surface-900 rounded-t-2xl">
              {/* Client standard header (14APR2026): Name + CMID + Reports To */}
              <DetailModalHeader
                employeeName={detailRecord.employeeName}
                cmid={detailRecord.employeeCmid}
                reportsTo={detailRecord.reportsTo}
                recordId={detailRecord.recordId}
                onClose={() => setDetailRecord(null)}
              />
            </div>

            <div className="p-6 space-y-5">
              {/* Locked banner */}
              {detailRecord.isLocked && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 flex items-center gap-2 text-amber-800">
                  <Lock className="w-4 h-4 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">This record is locked</p>
                    <p className="text-[11px] opacity-80">Unlock it from the footer to make changes.</p>
                  </div>
                </div>
              )}

              {/* Shift & Clock — editable datetime-local inputs */}
              <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 p-4">
                <p className="text-[10px] font-semibold text-surface-400 dark:text-surface-500 uppercase tracking-wider mb-3">Shift & Clock (Editable)</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ShiftTimeInput
                    label="Shift Start"
                    value={toDateTimeLocal(detailRecord.shiftStart)}
                    disabled={detailRecord.isLocked ?? false}
                    onSave={(v) => handleFieldUpdate(detailRecord, 'shiftStart', fromDateTimeLocal(v) ?? '')}
                  />
                  <ShiftTimeInput
                    label="Clock In"
                    value={toDateTimeLocal(detailRecord.clockIn)}
                    disabled={detailRecord.isLocked ?? false}
                    onSave={(v) => handleFieldUpdate(detailRecord, 'clockIn', fromDateTimeLocal(v) ?? '')}
                  />
                  <ShiftTimeInput
                    label="Shift End"
                    value={toDateTimeLocal(detailRecord.shiftEnd)}
                    disabled={detailRecord.isLocked ?? false}
                    onSave={(v) => handleFieldUpdate(detailRecord, 'shiftEnd', fromDateTimeLocal(v) ?? '')}
                  />
                  <ShiftTimeInput
                    label="Clock Out"
                    value={toDateTimeLocal(detailRecord.clockOut)}
                    disabled={detailRecord.isLocked ?? false}
                    onSave={(v) => handleFieldUpdate(detailRecord, 'clockOut', fromDateTimeLocal(v) ?? '')}
                  />
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
                      <p className="label">{item.label}</p>
                      <p className={`text-sm font-semibold tabular-nums mt-0.5 ${(item.val ?? 0) > 0 ? 'text-surface-800 dark:text-surface-100' : 'text-surface-300'}`}>{fmtHours(item.val)}</p>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-wider mb-2">Payable</p>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 mb-3">
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
                        <p className="text-[10px] font-medium uppercase opacity-70">{item.label}</p>
                        <p className="text-sm font-semibold tabular-nums mt-0.5">{fmtHours(item.val)}</p>
                      </div>
                    )
                  })}
                </div>
                <p className="text-[10px] font-semibold text-emerald-500 uppercase tracking-wider mb-2">Billable</p>
                <div className="grid grid-cols-4 gap-2">
                  {([
                    { label: 'B-REG', val: detailRecord.billableRegHours, color: 'brand' },
                    { label: 'B-PRM', val: detailRecord.billablePrmHours, color: 'violet' },
                    { label: 'B-DNB', val: detailRecord.billType === 'DNB' ? (detailRecord.actualHours ?? 0) : 0, color: 'surface' },
                    { label: 'B-RVW', val: detailRecord.billableRvwHours, color: 'red' },
                  ] as { label: string; val: number | null | undefined; color: string }[]).map((item) => {
                    const isNonZero = (item.val ?? 0) > 0
                    const badgeBg = isNonZero
                      ? item.color === 'brand' ? 'bg-blue-50 border-blue-200 text-blue-700'
                        : item.color === 'violet' ? 'bg-violet-50 border-violet-200 text-violet-700'
                        : item.color === 'surface' ? 'bg-surface-50 dark:bg-surface-900 border-surface-200 dark:border-surface-700 text-surface-500 dark:text-surface-400 dark:text-surface-500'
                        : 'bg-red-50 border-red-200 text-red-700'
                      : 'bg-white dark:bg-surface-900 border-surface-100 dark:border-surface-800 text-surface-300'
                    return (
                      <div key={item.label} className={`text-center rounded-lg border py-2 px-1 ${badgeBg}`}>
                        <p className="text-[10px] font-medium uppercase opacity-70">{item.label}</p>
                        <p className="text-sm font-semibold tabular-nums mt-0.5">{fmtHours(item.val)}</p>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Editable Shift Classification */}
              <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 p-4">
                <p className="text-[10px] font-semibold text-surface-400 dark:text-surface-500 uppercase tracking-wider mb-3">Shift Classification (Editable)</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-3">
                  <div>
                    <label className="label">Status</label>
                    <select
                      value={detailRecord.status}
                      disabled={detailRecord.isLocked ?? false}
                      onChange={(e) => handleFieldUpdate(detailRecord, 'status', e.target.value)}
                      className="text-sm border border-surface-200 dark:border-surface-700 rounded-lg px-2 py-1.5 w-full bg-white dark:bg-surface-900 focus:ring-1 focus:ring-brand-300 outline-none disabled:opacity-60"
                    >
                      <option value="">--</option>
                      {STATUS_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Account</label>
                    <AdminSelect
                      value={detailRecord.accountId ?? ''}
                      disabled={detailRecord.isLocked ?? false}
                      onChange={(val) => handleFieldUpdate(detailRecord, 'accountOverride', val)}
                      options={[
                        { value: '', label: '— None —' },
                        ...allClients.map((c) => ({ value: c.id, label: c.name })),
                      ]}
                    />
                  </div>
                  <div>
                    <label className="label">Task</label>
                    <select
                      value={detailRecord.task ?? ''}
                      disabled={detailRecord.isLocked ?? false}
                      onChange={(e) => handleFieldUpdate(detailRecord, 'task', e.target.value)}
                      className="text-sm border border-surface-200 dark:border-surface-700 rounded-lg px-2 py-1.5 w-full bg-white dark:bg-surface-900 focus:ring-1 focus:ring-brand-300 outline-none disabled:opacity-60"
                    >
                      <option value="">--</option>
                      {TASK_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>
                </div>
                {/* 22MAY2026 client video: Reviewed lives inside the classification
                    box now. Stage column shrunk so the row fits Pay + Bill +
                    Reviewed without overflowing. */}
                <div className="grid grid-cols-2 sm:grid-cols-[0.85fr_1.4fr_5rem_5rem_5.5rem] gap-x-3 gap-y-3 mt-3">
                  <div>
                    <label className="label">Stage</label>
                    <select
                      value={detailRecord.stage ?? ''}
                      disabled={detailRecord.isLocked ?? false}
                      onChange={(e) => handleFieldUpdate(detailRecord, 'stage', e.target.value)}
                      className="text-sm border border-surface-200 dark:border-surface-700 rounded-lg px-2 py-1.5 w-full bg-white dark:bg-surface-900 focus:ring-1 focus:ring-brand-300 outline-none disabled:opacity-60"
                    >
                      <option value="">--</option>
                      {STAGE_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>
                  <div className="min-w-0">
                    <label className="label">Reports To</label>
                    <AdminSelect
                      value={detailRecord.reportsToId ?? ''}
                      disabled={detailRecord.isLocked ?? false}
                      onChange={(val) => handleFieldUpdate(detailRecord, 'reportsToOverride', val)}
                      options={[
                        { value: '', label: '— None —' },
                        ...allEmployees.map((e) => ({ value: e.id, label: e.name })),
                      ]}
                    />
                  </div>
                  <div>
                    <label className="label">Pay</label>
                    <select
                      value={detailRecord.payType ?? ''}
                      disabled={detailRecord.isLocked ?? false}
                      onChange={(e) => handleFieldUpdate(detailRecord, 'payType', e.target.value)}
                      className="text-sm border border-surface-200 dark:border-surface-700 rounded-lg px-1.5 py-1.5 w-full bg-white dark:bg-surface-900 focus:ring-1 focus:ring-brand-300 outline-none disabled:opacity-60"
                    >
                      <option value="">--</option>
                      {PAY_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Bill</label>
                    <select
                      value={detailRecord.billType ?? ''}
                      disabled={detailRecord.isLocked ?? false}
                      onChange={(e) => handleFieldUpdate(detailRecord, 'billType', e.target.value)}
                      className="text-sm border border-surface-200 dark:border-surface-700 rounded-lg px-1.5 py-1.5 w-full bg-white dark:bg-surface-900 focus:ring-1 focus:ring-brand-300 outline-none disabled:opacity-60"
                    >
                      <option value="">--</option>
                      {BILL_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>
                  {/* 25MAY client: Reviewed is now a single-click checkbox
                      (was a Yes/No dropdown which took 2 clicks). */}
                  <div>
                    <label className="label">Reviewed</label>
                    <label
                      className="inline-flex items-center gap-2 h-[34px] px-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 cursor-pointer w-full"
                      title={detailRecord.reviewed
                        ? (detailRecord.reviewedByName ? `Marked by ${detailRecord.reviewedByName}` : 'Marked reviewed')
                        : 'Click to mark this timesheet reviewed.'}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-brand-600 cursor-pointer"
                        checked={detailRecord.reviewed ?? false}
                        disabled={detailRecord.isLocked ?? false}
                        onChange={async (e) => {
                          const next = e.target.checked
                          try {
                            await setAttendanceReviewed(detailRecord.id, next)
                            setDetailRecord({ ...detailRecord, reviewed: next, reviewedAt: next ? new Date().toISOString() : null })
                            setRecords((prev) => prev.map((r) => r.id === detailRecord.id ? { ...r, reviewed: next } : r))
                          } catch (err) {
                            console.error('Toggle reviewed failed', err)
                          }
                        }}
                      />
                      <span className="text-xs text-surface-700 dark:text-surface-200">{detailRecord.reviewed ? 'Reviewed' : 'Pending'}</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Comments (editable) */}
              <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 p-4">
                <label className="text-[10px] font-semibold text-surface-400 dark:text-surface-500 uppercase tracking-wider block mb-2">Comments</label>
                <ModalCommentInput
                  value={detailRecord.comments ?? ''}
                  disabled={detailRecord.isLocked ?? false}
                  onSave={(v) => handleFieldUpdate(detailRecord, 'comments', v)}
                />
              </div>

              {/* Lock toggle */}
              <div className="flex items-center justify-between rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-surface-900 dark:text-surface-50 flex items-center gap-2">
                    {detailRecord.isLocked ? <Lock className="w-4 h-4 text-amber-600" /> : <Unlock className="w-4 h-4 text-surface-400 dark:text-surface-500" />}
                    {detailRecord.isLocked ? 'Record is locked' : 'Record is editable'}
                  </p>
                  <p className="text-[11px] text-surface-500 dark:text-surface-400 dark:text-surface-500 mt-0.5">
                    Locking prevents further changes until an admin unlocks it.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleFieldUpdate(detailRecord, 'isLocked', !(detailRecord.isLocked ?? false))}
                  className={detailRecord.isLocked ? 'btn-secondary btn-sm' : 'btn-danger btn-sm'}
                >
                  {detailRecord.isLocked ? <><Unlock className="w-3.5 h-3.5" /> Unlock</> : <><Lock className="w-3.5 h-3.5" /> Lock</>}
                </button>
              </div>

              {/* 22MAY2026 client video: standalone Reviewed panel removed —
                  Reviewed now lives inside the Shift Classification grid above. */}

              {/* Audit footer — 19MAY2026 Scheduler Demos meeting. */}
              <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px] text-surface-600 dark:text-surface-300">
                <div>
                  <p className="font-semibold uppercase tracking-wider text-surface-400 dark:text-surface-500 mb-0.5">Created By</p>
                  <p className="text-surface-800 dark:text-surface-100">{detailRecord.createdByName || '—'}</p>
                </div>
                <div>
                  <p className="font-semibold uppercase tracking-wider text-surface-400 dark:text-surface-500 mb-0.5">Created On</p>
                  <p className="text-surface-800 dark:text-surface-100 tabular-nums">{detailRecord.createdOn ? fmtFullDateTime(detailRecord.createdOn) : '—'}</p>
                </div>
                <div>
                  <p className="font-semibold uppercase tracking-wider text-surface-400 dark:text-surface-500 mb-0.5">Modified By</p>
                  <p className="text-surface-800 dark:text-surface-100">{detailRecord.modifiedByName || '—'}</p>
                </div>
                <div>
                  <p className="font-semibold uppercase tracking-wider text-surface-400 dark:text-surface-500 mb-0.5">Modified On</p>
                  <p className="text-surface-800 dark:text-surface-100 tabular-nums">{detailRecord.modifiedOn ? fmtFullDateTime(detailRecord.modifiedOn) : '—'}</p>
                </div>
              </div>
            </div>

            {/* 22MAY2026 client video: explicit Save button on the edit modal.
                Fields auto-save inline as they're edited; Save is the visual
                confirmation + exit. */}
            <div className="modal-footer">
              <button type="button" onClick={() => setDetailRecord(null)} className="btn-secondary">Cancel</button>
              <button type="button" onClick={() => setDetailRecord(null)} className="btn-primary">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Attendance Record Modal */}
      {showAddModal && (
        <AddAttendanceRecordModal
          employees={allEmployees}
          clients={allClients}
          onClose={() => setShowAddModal(false)}
          onCreated={(newRecord) => {
            setRecords((prev) => [newRecord, ...prev])
            setShowAddModal(false)
            // Refresh to ensure server-side ordering/joins are applied
            void fetchAttendance()
          }}
        />
      )}
    </div>
  )
}

function AddAttendanceRecordModal({
  employees,
  clients,
  onClose,
  onCreated,
}: {
  employees: EmployeeRecord[]
  clients: Client[]
  onClose: () => void
  onCreated: (record: AttendanceRecord) => void
}) {
  const now = new Date()
  const isoLocal = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16)

  const [employeeId, setEmployeeId] = useState('')
  const [clockIn, setClockIn] = useState(isoLocal)
  const [clockOut, setClockOut] = useState(isoLocal)
  const [shiftStart, setShiftStart] = useState(isoLocal)
  const [shiftEnd, setShiftEnd] = useState(isoLocal)
  const [status, setStatus] = useState<string>('Present')
  const [payType, setPayType] = useState<string>('Regular')
  const [billType, setBillType] = useState<string>('Regular')
  const [task, setTask] = useState('')
  const [stage, setStage] = useState<string>('Production')
  const [comments, setComments] = useState('')
  const [reportsToOverride, setReportsToOverride] = useState('')
  const [accountOverride, setAccountOverride] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (!employeeId) {
      setError('Please select an employee.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const record = await createAttendanceRecord({
        employeeId,
        clockIn: fromDateTimeLocal(clockIn) || new Date().toISOString(),
        clockOut: fromDateTimeLocal(clockOut),
        shiftStart: fromDateTimeLocal(shiftStart),
        shiftEnd: fromDateTimeLocal(shiftEnd),
        statusOverride: status || null,
        payType,
        billType,
        task: task || null,
        stage: stage || null,
        comments: comments || null,
        reportsToOverride: reportsToOverride || null,
        accountOverride: accountOverride || null,
      })
      onCreated(record)
    } catch (err: unknown) {
      setError(err && typeof err === 'object' && 'message' in err ? String((err as Error).message) : 'Failed to create record')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0" onClick={onClose} aria-label="Close" />
      <div className="modal-frame-lg">
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Add Attendance Record</h2>
            <p className="text-[11px] text-surface-500 dark:text-surface-400 dark:text-surface-500 mt-0.5">Manually create an attendance entry (for supervisors filling in for absent employees, etc.)</p>
          </div>
          <button type="button" onClick={onClose} className="btn-icon text-surface-400 dark:text-surface-500 hover:text-surface-700 dark:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-700 dark:bg-surface-800" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="modal-body">
          {error && <div className="alert-error"><span>{error}</span></div>}

          <div>
            <label className="label">Employee *</label>
            <AdminSelect
              value={employeeId}
              onChange={setEmployeeId}
              options={[
                { value: '', label: 'Select employee' },
                ...employees.map((e) => ({ value: e.id, label: `${e.name}${e.cmid != null ? ` · CMID ${e.cmid}` : ''}` })),
              ]}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Shift Start</label>
              <input type="datetime-local" value={shiftStart} onChange={(e) => setShiftStart(e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">Shift End</label>
              <input type="datetime-local" value={shiftEnd} onChange={(e) => setShiftEnd(e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">Clock In *</label>
              <input type="datetime-local" value={clockIn} onChange={(e) => setClockIn(e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">Clock Out</label>
              <input type="datetime-local" value={clockOut} onChange={(e) => setClockOut(e.target.value)} className="input" />
            </div>
          </div>

          <p className="text-[10px] font-semibold text-surface-400 dark:text-surface-500 uppercase tracking-wider">Shift Classification</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="label">Status</label>
              <AdminSelect value={status} onChange={setStatus} options={STATUS_OPTIONS.map((s) => ({ value: s, label: s }))} />
            </div>
            <div>
              <label className="label">Account</label>
              <AdminSelect value={accountOverride} onChange={setAccountOverride} options={[{ value: '', label: '— None —' }, ...clients.map((c) => ({ value: c.id, label: c.name }))]} />
            </div>
            <div>
              <label className="label">Task</label>
              <AdminSelect value={task} onChange={setTask} options={[{ value: '', label: '— None —' }, ...TASK_OPTIONS.map((s) => ({ value: s, label: s }))]} />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="label">Stage</label>
              <AdminSelect value={stage} onChange={setStage} options={STAGE_OPTIONS.map((s) => ({ value: s, label: s }))} />
            </div>
            <div>
              <label className="label">Reports To</label>
              <AdminSelect value={reportsToOverride} onChange={setReportsToOverride} options={[{ value: '', label: '— None —' }, ...employees.map((e) => ({ value: e.id, label: e.name }))]} />
            </div>
            <div>
              <label className="label">Pay</label>
              <AdminSelect value={payType} onChange={setPayType} options={PAY_OPTIONS.map((s) => ({ value: s, label: s }))} />
            </div>
            <div>
              <label className="label">Bill</label>
              <AdminSelect value={billType} onChange={setBillType} options={BILL_OPTIONS.map((s) => ({ value: s, label: s }))} />
            </div>
          </div>

          <div>
            <label className="label">Comments</label>
            <textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={2} className="input" placeholder="Optional comments" />
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={saving}>Cancel</button>
          <button type="button" onClick={handleSave} className="btn-primary" disabled={saving || !employeeId || !clockIn}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const CARD_COLORS: Record<string, { border: string; bg: string; label: string }> = {
  brand: { border: 'border-brand-200/80', bg: 'bg-brand-50/50', label: 'text-brand-700' },
  red: { border: 'border-red-200/80', bg: 'bg-red-50/50', label: 'text-red-700' },
  amber: { border: 'border-amber-200/80', bg: 'bg-amber-50/50', label: 'text-amber-700' },
  emerald: { border: 'border-emerald-200/80', bg: 'bg-emerald-50/50', label: 'text-emerald-700' },
  sky: { border: 'border-sky-200/80', bg: 'bg-sky-50/50', label: 'text-sky-700' },
  violet: { border: 'border-violet-200/80', bg: 'bg-violet-50/50', label: 'text-violet-700' },
  indigo: { border: 'border-indigo-200/80', bg: 'bg-indigo-50/50', label: 'text-indigo-700' },
  surface: { border: 'border-surface-200/80', bg: 'bg-surface-50/50', label: 'text-surface-500 dark:text-surface-400 dark:text-surface-500' },
}

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string
  value: string | number
  color?: string
}) {
  const c = color && CARD_COLORS[color] ? CARD_COLORS[color] : null

  return (
    <div
      className={`rounded-xl border ${c?.border ?? 'border-surface-200/70'} ${c?.bg ?? 'bg-white dark:bg-surface-900'} p-3 sm:p-3.5 shadow-card`}
    >
      <p
        className={`text-[10px] sm:text-[11px] font-semibold ${c?.label ?? 'text-surface-500 dark:text-surface-400 dark:text-surface-500'} uppercase tracking-wider`}
      >
        {label}
      </p>
      <p className="mt-0.5 text-base sm:text-lg font-bold text-surface-900 dark:text-surface-50 tabular-nums tracking-tight">
        {value}
      </p>
    </div>
  )
}

function InlineSelect({
  value,
  options,
  onChange,
  colorMap,
}: {
  value: string
  options: readonly string[]
  onChange: (val: string) => void
  colorMap?: Record<string, string>
}) {
  const colorClass = colorMap?.[value] ?? ''
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`text-xs bg-transparent border-0 outline-none cursor-pointer py-0 px-0 pr-4 rounded ${colorClass || 'text-surface-700 dark:text-surface-200'} focus:ring-1 focus:ring-brand-300`}
    >
      <option value="">--</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  )
}

function InlineInput({
  value,
  onSave,
}: {
  value: string
  onSave: (val: string) => void
}) {
  const [local, setLocal] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync if parent value changes — but only when this input is NOT focused,
  // so an in-flight edit isn't clobbered by a polling refresh.
  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setLocal(value)
    }
  }, [value])

  return (
    <input
      ref={inputRef}
      type="text"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        if (local !== value) onSave(local)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur()
        }
      }}
      className="text-xs bg-transparent border-0 outline-none w-[120px] py-0 px-0 text-surface-700 dark:text-surface-200 placeholder:text-surface-300 focus:ring-1 focus:ring-brand-300 rounded"
      placeholder="Add comment..."
    />
  )
}

function ModalCommentInput({
  value,
  onSave,
  disabled,
}: {
  value: string
  onSave: (val: string) => void
  disabled?: boolean
}) {
  const [local, setLocal] = useState(value)
  const textRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (document.activeElement !== textRef.current) setLocal(value)
  }, [value])

  return (
    <textarea
      ref={textRef}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        if (local !== value) onSave(local)
      }}
      rows={2}
      disabled={disabled}
      className="text-sm border border-surface-200 dark:border-surface-700 rounded-lg px-3 py-2 w-full bg-white dark:bg-surface-900 focus:ring-1 focus:ring-brand-300 outline-none resize-none disabled:bg-surface-100 dark:bg-surface-800 disabled:opacity-70"
      placeholder="Add comment..."
    />
  )
}

function ShiftTimeInput({
  label,
  value,
  onSave,
  disabled,
}: {
  label: string
  value: string  // datetime-local format
  onSave: (val: string) => void
  disabled?: boolean
}) {
  const [local, setLocal] = useState(value)
  const timeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (document.activeElement !== timeRef.current) setLocal(value)
  }, [value])

  return (
    <div className="rounded-lg bg-white dark:bg-surface-900 border border-surface-100 dark:border-surface-800 p-2.5">
      <p className="label">{label}</p>
      <input
        ref={timeRef}
        type="datetime-local"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => { if (local !== value) onSave(local) }}
        disabled={disabled}
        className="w-full text-sm font-medium text-surface-900 dark:text-surface-50 tabular-nums mt-0.5 bg-transparent border-0 outline-none focus:ring-1 focus:ring-brand-300 rounded disabled:opacity-70"
      />
    </div>
  )
}
