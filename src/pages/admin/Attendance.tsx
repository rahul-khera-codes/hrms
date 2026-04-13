import { useState, useEffect, useMemo, useCallback } from 'react'
import { format, subDays } from 'date-fns'
import { Search, Download, X, ArrowUp, ArrowDown, Filter, Clock } from 'lucide-react'
import { getAdminAttendance, updateAttendanceRecord } from '@/lib/apiAdmin'
import type { AttendanceRecord } from '@/types'
import AdminDatePicker from '@/components/AdminDatePicker'
import { PageHeader } from '@/components/PageHeader'

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
  'REVIEW',
] as const

const PAY_OPTIONS = ['Regular', 'X35%', 'X100%', 'Holiday', 'DNP'] as const
const BILL_OPTIONS = ['Regular', 'Premium', 'Holiday', 'DNB', 'Review'] as const
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

const statusColors: Record<string, string> = {
  Present: 'bg-emerald-100 text-emerald-700',
  Absent: 'bg-red-100 text-red-700',
  Late: 'bg-amber-100 text-amber-700',
  'Left Early': 'bg-amber-100 text-amber-700',
  'Late & Left Early': 'bg-amber-100 text-amber-700',
  'Time Off': 'bg-sky-100 text-sky-700',
  'System Issues': 'bg-orange-100 text-orange-700',
  Terminated: 'bg-rose-100 text-rose-700',
  Prenotice: 'bg-violet-100 text-violet-700',
  Breastfeeding: 'bg-pink-100 text-pink-700',
  REVIEW: 'bg-indigo-100 text-indigo-700',
  // Legacy lowercase mappings
  present: 'bg-emerald-100 text-emerald-700',
  absent: 'bg-red-100 text-red-700',
  active: 'bg-amber-100 text-amber-700',
  leave: 'bg-sky-100 text-sky-700',
  adjusted: 'bg-indigo-100 text-indigo-700',
  // Legacy capitalized mappings
  'Late In': 'bg-amber-100 text-amber-700',
  'Early Out': 'bg-amber-100 text-amber-700',
  'Late In-Early Out': 'bg-amber-100 text-amber-700',
  Review: 'bg-indigo-100 text-indigo-700',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtTime(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  try {
    return format(new Date(dateStr), 'HH:mm')
  } catch {
    return ''
  }
}

function fmtDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  try {
    return format(new Date(dateStr), 'MM/dd HH:mm')
  } catch {
    return ''
  }
}

function fmtFullDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  try {
    return format(new Date(dateStr), 'yyyy-MM-dd hh:mm a')
  } catch {
    return ''
  }
}

function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  try {
    return format(new Date(dateStr), 'yyyy-MM-dd')
  } catch {
    return dateStr ?? ''
  }
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
  const [dateFrom, setDateFrom] = useState(() => format(subDays(new Date(), 7), 'yyyy-MM-dd'))
  const [dateTo, setDateTo] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [savingId, setSavingId] = useState<string | null>(null)
  const [detailRecord, setDetailRecord] = useState<AttendanceRecord | null>(null)

  // Sort & Filter state
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({})
  const [filterOpen, setFilterOpen] = useState<string | null>(null)

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
    async (record: AttendanceRecord, field: string, value: string) => {
      const sessionId = record.sessionId ?? record.id
      setSavingId(sessionId)
      try {
        // Map front-end field names to API payload keys
        const payload: Record<string, string | null> = {}
        if (field === 'status') payload.statusOverride = value || null
        else if (field === 'payType') payload.payType = value
        else if (field === 'billType') payload.billType = value
        else if (field === 'stage') payload.stage = value || null
        else if (field === 'task') payload.task = value || null
        else if (field === 'comments') payload.comments = value || null

        const updated = await updateAttendanceRecord(sessionId, payload)

        setRecords((prev) =>
          prev.map((r) => {
            const rSid = r.sessionId ?? r.id
            return rSid === sessionId ? { ...r, ...updated } : r
          }),
        )
      } catch (err) {
        console.error('Failed to update attendance record', err)
      } finally {
        setSavingId(null)
      }
    },
    [],
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
      'REG',
      'N15%',
      'X35%',
      'X100%',
      'HDY',
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
      ['late', 'left early', 'late & left early', 'late in', 'early out', 'late in-early out'].includes(
        r.status.toLowerCase(),
      ),
    ).length
    const timeOff = records.filter(
      (r) => r.status.toLowerCase() === 'time off',
    ).length
    // Payable hours
    const totalReg = records.reduce((a, r) => a + (r.regHours ?? 0), 0)
    const totalN15 = records.reduce((a, r) => a + (r.n15Hours ?? 0), 0)
    const totalX35 = records.reduce((a, r) => a + (r.x35Hours ?? 0), 0)
    const totalX100 = records.reduce((a, r) => a + (r.x100Hours ?? 0), 0)
    const totalHdy = records.reduce((a, r) => a + (r.hdyHours ?? 0), 0)
    const totalDnp = records.filter((r) => r.payType === 'DNP').reduce((a, r) => a + (r.actualHours ?? 0) - (r.adbtHours ?? 0), 0)
    // Billable hours
    const billReg = records.filter((r) => r.billType === 'Regular').reduce((a, r) => a + (r.actualHours ?? 0) - (r.adbtHours ?? 0), 0)
    const billPremium = records.filter((r) => r.billType === 'Premium').reduce((a, r) => a + (r.actualHours ?? 0) - (r.adbtHours ?? 0), 0)
    const billHoliday = records.filter((r) => r.billType === 'Holiday').reduce((a, r) => a + (r.actualHours ?? 0) - (r.adbtHours ?? 0), 0)
    const billDnb = records.filter((r) => r.billType === 'DNB').reduce((a, r) => a + (r.actualHours ?? 0) - (r.adbtHours ?? 0), 0)
    const billReview = records.filter((r) => r.billType === 'Review').reduce((a, r) => a + (r.actualHours ?? 0) - (r.adbtHours ?? 0), 0)
    return {
      total, present, absent, late, timeOff,
      totalReg, totalN15, totalX35, totalX100, totalHdy, totalDnp,
      billReg, billPremium, billHoliday, billDnb, billReview,
    }
  }, [records])

  // -----------------------------------------------------------------------
  // Sort & Filter helpers
  // -----------------------------------------------------------------------

  const colAccessor = useCallback((r: AttendanceRecord, col: string): string | number => {
    switch (col) {
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
      case 'REG': return r.regHours ?? 0
      case 'N15%': return r.n15Hours ?? 0
      case 'X35%': return r.x35Hours ?? 0
      case 'X100%': return r.x100Hours ?? 0
      case 'HDY': return r.hdyHours ?? 0
      case 'Comments': return (r.comments ?? '').toLowerCase()
      default: return ''
    }
  }, [])

  const filteredAndSorted = useMemo(() => {
    let result = [...records]

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
  }, [records, columnFilters, sortCol, sortDir, colAccessor])

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
          <button
            type="button"
            onClick={exportCSV}
            disabled={loading || records.length === 0}
            className="btn-secondary"
          >
            <Download className="w-4 h-4 shrink-0" />
            Export CSV
          </button>
        }
      />

      {/* Filters */}
      <div className="toolbar">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 shrink-0" />
          <input
            type="text"
            placeholder="Search by name"
            className="input pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 flex-wrap sm:flex-nowrap">
          <div className="flex-1 min-w-[140px]">
            <AdminDatePicker value={dateFrom} onChange={(val) => setDateFrom(val)} />
          </div>
          <div className="flex-1 min-w-[140px]">
            <AdminDatePicker value={dateTo} onChange={(val) => setDateTo(val)} />
          </div>
        </div>
      </div>

      {/* Summary cards - Row 1: Counts */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <SummaryCard label="Records" value={summary.total} />
        <SummaryCard label="Present" value={summary.present} color="brand" />
        <SummaryCard label="Absent" value={summary.absent} color="red" />
        <SummaryCard label="Late / Early" value={summary.late} color="amber" />
        <SummaryCard label="Time Off" value={summary.timeOff} color="sky" />
      </div>

      {/* Summary cards - Row 2: Payable Hours */}
      <div>
        <p className="text-[10px] sm:text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Payable Hours</p>
        <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          <SummaryCard label="Regular" value={fmtHours(summary.totalReg)} color="brand" />
          <SummaryCard label="Night (15%)" value={fmtHours(summary.totalN15)} color="violet" />
          <SummaryCard label="X35%" value={fmtHours(summary.totalX35)} color="amber" />
          <SummaryCard label="X100%" value={fmtHours(summary.totalX100)} color="red" />
          <SummaryCard label="Holiday" value={fmtHours(summary.totalHdy)} color="emerald" />
          <SummaryCard label="DNP" value={fmtHours(summary.totalDnp)} color="surface" />
        </div>
      </div>

      {/* Summary cards - Row 3: Billable Hours */}
      <div>
        <p className="text-[10px] sm:text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Billable Hours</p>
        <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          <SummaryCard label="Regular" value={fmtHours(summary.billReg)} color="brand" />
          <SummaryCard label="Premium" value={fmtHours(summary.billPremium)} color="violet" />
          <SummaryCard label="Holiday" value={fmtHours(summary.billHoliday)} color="emerald" />
          <SummaryCard label="DNB" value={fmtHours(summary.billDnb)} color="surface" />
          <SummaryCard label="Review" value={fmtHours(summary.billReview)} color="indigo" />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl sm:rounded-2xl border border-surface-200/80 bg-white overflow-hidden shadow-sm min-w-0">
        {loading ? (
          <div className="p-12 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : records.length === 0 ? (
          <div className="p-8 sm:p-16 text-center">
            <p className="text-surface-500 text-xs sm:text-sm">
              No records match your filters.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto" onClick={(e) => { if ((e.target as HTMLElement).closest('select, input')) e.stopPropagation() }}>
            <table className="min-w-[2000px] w-full text-left border-collapse">
              {/* Header */}
              <thead className="sticky top-0 z-10 bg-surface-50">
                <tr>
                  {[
                    'EID',
                    'Employee',
                    'Account',
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
                    'REG',
                    'N15%',
                    'X35%',
                    'X100%',
                    'HDY',
                    'Comments',
                  ].map((col) => (
                    <th
                      key={col}
                      className="px-2 py-1 text-[10px] font-semibold text-surface-500 uppercase tracking-wider whitespace-nowrap border-b border-surface-200"
                    >
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          className="flex items-center gap-0.5 hover:text-surface-700 transition-colors"
                          onClick={() => handleSort(col)}
                        >
                          {col}
                          {sortCol === col && (
                            sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                          )}
                        </button>
                        <button
                          type="button"
                          className={`p-0.5 rounded hover:bg-surface-200/60 transition-colors ${columnFilters[col] ? 'text-brand-600' : 'text-surface-400'}`}
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
                            className="w-full text-[10px] font-normal normal-case tracking-normal border border-surface-200 rounded px-1.5 py-1 bg-white focus:ring-1 focus:ring-brand-300 outline-none"
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
                {filteredAndSorted.map((r) => {
                  const sid = r.sessionId ?? r.id
                  const isSaving = savingId === sid
                  return (
                    <tr
                      key={sid}
                      className={`border-b border-surface-100 hover:bg-surface-50/60 transition-colors cursor-pointer ${isSaving ? 'opacity-60' : ''}`}
                      onClick={() => setDetailRecord(r)}
                    >
                      {/* EID */}
                      <td className="px-2 py-1.5 text-xs text-surface-700 tabular-nums whitespace-nowrap">
                        {r.employeeCmid ?? ''}
                      </td>
                      {/* Employee */}
                      <td className="px-2 py-1.5 text-xs font-medium text-surface-900 whitespace-nowrap max-w-[140px] truncate">
                        {r.employeeName}
                      </td>
                      {/* Account */}
                      <td className="px-2 py-1.5 text-xs text-surface-700 whitespace-nowrap">
                        {r.accountName ?? ''}
                      </td>
                      {/* Shift Start */}
                      <td className="px-2 py-1.5 text-xs font-mono text-surface-700 tabular-nums whitespace-nowrap">
                        {fmtDateTime(r.shiftStart)}
                      </td>
                      {/* Clock In */}
                      <td className="px-2 py-1.5 text-xs font-mono text-surface-700 tabular-nums whitespace-nowrap">
                        {fmtDateTime(r.clockIn)}
                      </td>
                      {/* Shift End */}
                      <td className="px-2 py-1.5 text-xs font-mono text-surface-700 tabular-nums whitespace-nowrap">
                        {fmtDateTime(r.shiftEnd)}
                      </td>
                      {/* Clock Out */}
                      <td className="px-2 py-1.5 text-xs font-mono text-surface-700 tabular-nums whitespace-nowrap">
                        {fmtDateTime(r.clockOut)}
                      </td>
                      {/* Stage (editable) */}
                      <td className="px-2 py-1.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <InlineSelect
                          value={r.stage ?? ''}
                          options={STAGE_OPTIONS}
                          onChange={(v) => handleFieldUpdate(r, 'stage', v)}
                        />
                      </td>
                      {/* Reports To */}
                      <td className="px-2 py-1.5 text-xs text-surface-700 whitespace-nowrap">
                        {r.reportsTo ?? ''}
                      </td>
                      {/* Task (editable) */}
                      <td className="px-2 py-1.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <InlineSelect
                          value={r.task ?? ''}
                          options={TASK_OPTIONS}
                          onChange={(v) => handleFieldUpdate(r, 'task', v)}
                        />
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
                        />
                      </td>
                      {/* Bill (editable) */}
                      <td className="px-2 py-1.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <InlineSelect
                          value={r.billType ?? ''}
                          options={BILL_OPTIONS}
                          onChange={(v) => handleFieldUpdate(r, 'billType', v)}
                        />
                      </td>
                      {/* SCH */}
                      <td className={`px-2 py-1.5 text-xs tabular-nums whitespace-nowrap text-right ${(r.scheduledHours ?? 0) > 0 ? 'text-surface-700 font-medium' : 'text-surface-300'}`}>
                        {fmtHours(r.scheduledHours)}
                      </td>
                      {/* SDBT */}
                      <td className={`px-2 py-1.5 text-xs tabular-nums whitespace-nowrap text-right ${(r.sdbtHours ?? 0) > 0 ? 'text-surface-700 font-medium' : 'text-surface-300'}`}>
                        {fmtHours(r.sdbtHours)}
                      </td>
                      {/* ACT */}
                      <td className={`px-2 py-1.5 text-xs tabular-nums whitespace-nowrap text-right ${(r.actualHours ?? 0) > 0 ? 'text-surface-700 font-medium' : 'text-surface-300'}`}>
                        {fmtHours(r.actualHours)}
                      </td>
                      {/* ADBT */}
                      <td className={`px-2 py-1.5 text-xs tabular-nums whitespace-nowrap text-right ${(r.adbtHours ?? 0) > 0 ? 'text-surface-700 font-medium' : 'text-surface-300'}`}>
                        {fmtHours(r.adbtHours)}
                      </td>
                      {/* REG */}
                      <td className={`px-2 py-1.5 text-xs tabular-nums whitespace-nowrap text-right font-medium ${(r.regHours ?? 0) > 0 ? 'text-brand-600' : 'text-surface-300'}`}>
                        {fmtHours(r.regHours)}
                      </td>
                      {/* N15% */}
                      <td className={`px-2 py-1.5 text-xs tabular-nums whitespace-nowrap text-right font-medium ${(r.n15Hours ?? 0) > 0 ? 'text-violet-600' : 'text-surface-300'}`}>
                        {fmtHours(r.n15Hours)}
                      </td>
                      {/* X35% */}
                      <td className={`px-2 py-1.5 text-xs tabular-nums whitespace-nowrap text-right font-medium ${(r.x35Hours ?? 0) > 0 ? 'text-amber-600' : 'text-surface-300'}`}>
                        {fmtHours(r.x35Hours)}
                      </td>
                      {/* X100% */}
                      <td className={`px-2 py-1.5 text-xs tabular-nums whitespace-nowrap text-right font-medium ${(r.x100Hours ?? 0) > 0 ? 'text-red-600' : 'text-surface-300'}`}>
                        {fmtHours(r.x100Hours)}
                      </td>
                      {/* HDY */}
                      <td className={`px-2 py-1.5 text-xs tabular-nums whitespace-nowrap text-right font-medium ${(r.hdyHours ?? 0) > 0 ? 'text-emerald-600' : 'text-surface-300'}`}>
                        {fmtHours(r.hdyHours)}
                      </td>
                      {/* Comments (editable) */}
                      <td className="px-2 py-1.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <InlineInput
                          value={r.comments ?? ''}
                          onSave={(v) => handleFieldUpdate(r, 'comments', v)}
                        />
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
          <div className="relative z-10 w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-surface-200 bg-white shadow-xl">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-white border-b border-surface-200 px-6 py-4 rounded-t-2xl">
              <button
                type="button"
                onClick={() => setDetailRecord(null)}
                className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-surface-100 transition-colors"
              >
                <X className="w-5 h-5 text-surface-400" />
              </button>
              <h2 className="text-lg font-semibold text-surface-900">{detailRecord.employeeName}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-surface-100 text-xs font-mono font-medium text-surface-600">
                  CMID {detailRecord.employeeCmid ?? '-'}
                </span>
                {detailRecord.accountName && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-surface-100 text-xs font-medium text-surface-600">
                    {detailRecord.accountName}
                  </span>
                )}
              </div>
            </div>

            <div className="p-6 space-y-5">
              {/* Shift & Clock - 2x2 grid */}
              <div className="rounded-xl border border-surface-200 bg-surface-50 p-4">
                <p className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider mb-3">Shift & Clock</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-white border border-surface-100 p-2.5">
                    <p className="text-[10px] font-medium text-surface-400 uppercase tracking-wider">Shift Start</p>
                    <p className="text-sm font-medium text-surface-900 tabular-nums mt-0.5">{fmtFullDateTime(detailRecord.shiftStart) || '-'}</p>
                  </div>
                  <div className="rounded-lg bg-white border border-surface-100 p-2.5">
                    <p className="text-[10px] font-medium text-surface-400 uppercase tracking-wider">Clock In</p>
                    <p className="text-sm font-medium text-surface-900 tabular-nums mt-0.5">{fmtFullDateTime(detailRecord.clockIn) || '-'}</p>
                  </div>
                  <div className="rounded-lg bg-white border border-surface-100 p-2.5">
                    <p className="text-[10px] font-medium text-surface-400 uppercase tracking-wider">Shift End</p>
                    <p className="text-sm font-medium text-surface-900 tabular-nums mt-0.5">{fmtFullDateTime(detailRecord.shiftEnd) || '-'}</p>
                  </div>
                  <div className="rounded-lg bg-white border border-surface-100 p-2.5">
                    <p className="text-[10px] font-medium text-surface-400 uppercase tracking-wider">Clock Out</p>
                    <p className="text-sm font-medium text-surface-900 tabular-nums mt-0.5">{fmtFullDateTime(detailRecord.clockOut) || '-'}</p>
                  </div>
                </div>
              </div>

              {/* Hours */}
              <div className="rounded-xl border border-surface-200 bg-surface-50 p-4">
                <p className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider mb-3">Hours</p>
                <div className="grid grid-cols-4 gap-2 mb-2">
                  {([
                    { label: 'SCH', val: detailRecord.scheduledHours },
                    { label: 'SDBT', val: detailRecord.sdbtHours },
                    { label: 'ACT', val: detailRecord.actualHours },
                    { label: 'ADBT', val: detailRecord.adbtHours },
                  ] as const).map((item) => (
                    <div key={item.label} className="text-center rounded-lg bg-white border border-surface-100 py-2 px-1">
                      <p className="text-[10px] font-medium text-surface-400 uppercase">{item.label}</p>
                      <p className={`text-sm font-semibold tabular-nums mt-0.5 ${(item.val ?? 0) > 0 ? 'text-surface-800' : 'text-surface-300'}`}>{fmtHours(item.val)}</p>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {([
                    { label: 'REG', val: detailRecord.regHours, color: 'brand' },
                    { label: 'N15%', val: detailRecord.n15Hours, color: 'violet' },
                    { label: 'X35%', val: detailRecord.x35Hours, color: 'amber' },
                    { label: 'X100%', val: detailRecord.x100Hours, color: 'red' },
                    { label: 'HDY', val: detailRecord.hdyHours, color: 'emerald' },
                  ] as const).map((item) => {
                    const isNonZero = (item.val ?? 0) > 0
                    const badgeBg = isNonZero
                      ? item.color === 'brand' ? 'bg-blue-50 border-blue-200 text-blue-700'
                        : item.color === 'violet' ? 'bg-violet-50 border-violet-200 text-violet-700'
                        : item.color === 'amber' ? 'bg-amber-50 border-amber-200 text-amber-700'
                        : item.color === 'red' ? 'bg-red-50 border-red-200 text-red-700'
                        : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : 'bg-white border-surface-100 text-surface-300'
                    return (
                      <div key={item.label} className={`text-center rounded-lg border py-2 px-1 ${badgeBg}`}>
                        <p className="text-[10px] font-medium uppercase opacity-70">{item.label}</p>
                        <p className="text-sm font-semibold tabular-nums mt-0.5">{fmtHours(item.val)}</p>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Editable Classification */}
              <div className="rounded-xl border border-surface-200 bg-surface-50 p-4">
                <p className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider mb-3">Classification (Editable)</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
                  <div>
                    <label className="text-[10px] font-medium text-surface-400 uppercase block mb-1">Account</label>
                    <p className="text-sm font-medium text-surface-900">{detailRecord.accountName ?? '-'}</p>
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-surface-400 uppercase block mb-1">Status</label>
                    <select
                      value={detailRecord.status}
                      onChange={(e) => {
                        const val = e.target.value
                        handleFieldUpdate(detailRecord, 'status', val)
                        setDetailRecord({ ...detailRecord, status: val })
                      }}
                      className="text-sm border border-surface-200 rounded-lg px-2 py-1.5 w-full bg-white focus:ring-1 focus:ring-brand-300 outline-none"
                    >
                      <option value="">--</option>
                      {STATUS_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-surface-400 uppercase block mb-1">Pay</label>
                    <select
                      value={detailRecord.payType ?? ''}
                      onChange={(e) => {
                        const val = e.target.value
                        handleFieldUpdate(detailRecord, 'payType', val)
                        setDetailRecord({ ...detailRecord, payType: val })
                      }}
                      className="text-sm border border-surface-200 rounded-lg px-2 py-1.5 w-full bg-white focus:ring-1 focus:ring-brand-300 outline-none"
                    >
                      <option value="">--</option>
                      {PAY_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-surface-400 uppercase block mb-1">Bill</label>
                    <select
                      value={detailRecord.billType ?? ''}
                      onChange={(e) => {
                        const val = e.target.value
                        handleFieldUpdate(detailRecord, 'billType', val)
                        setDetailRecord({ ...detailRecord, billType: val })
                      }}
                      className="text-sm border border-surface-200 rounded-lg px-2 py-1.5 w-full bg-white focus:ring-1 focus:ring-brand-300 outline-none"
                    >
                      <option value="">--</option>
                      {BILL_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-surface-400 uppercase block mb-1">Stage</label>
                    <select
                      value={detailRecord.stage ?? ''}
                      onChange={(e) => {
                        const val = e.target.value
                        handleFieldUpdate(detailRecord, 'stage', val)
                        setDetailRecord({ ...detailRecord, stage: val })
                      }}
                      className="text-sm border border-surface-200 rounded-lg px-2 py-1.5 w-full bg-white focus:ring-1 focus:ring-brand-300 outline-none"
                    >
                      <option value="">--</option>
                      {STAGE_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-surface-400 uppercase block mb-1">Task</label>
                    <select
                      value={detailRecord.task ?? ''}
                      onChange={(e) => {
                        const val = e.target.value
                        handleFieldUpdate(detailRecord, 'task', val)
                        setDetailRecord({ ...detailRecord, task: val })
                      }}
                      className="text-sm border border-surface-200 rounded-lg px-2 py-1.5 w-full bg-white focus:ring-1 focus:ring-brand-300 outline-none"
                    >
                      <option value="">--</option>
                      {TASK_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-surface-400 uppercase block mb-1">Reports To</label>
                    <p className="text-sm font-medium text-surface-900 mt-0.5">{detailRecord.reportsTo ?? '-'}</p>
                  </div>
                </div>
              </div>

              {/* Comments (editable) */}
              <div className="rounded-xl border border-surface-200 bg-surface-50 p-4">
                <label className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider block mb-2">Comments</label>
                <ModalCommentInput
                  value={detailRecord.comments ?? ''}
                  onSave={(v) => {
                    handleFieldUpdate(detailRecord, 'comments', v)
                    setDetailRecord({ ...detailRecord, comments: v })
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
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
  surface: { border: 'border-surface-200/80', bg: 'bg-surface-50/50', label: 'text-surface-500' },
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
      className={`rounded-xl border ${c?.border ?? 'border-surface-200/70'} ${c?.bg ?? 'bg-white'} p-3 sm:p-3.5 shadow-card`}
    >
      <p
        className={`text-[10px] sm:text-[11px] font-semibold ${c?.label ?? 'text-surface-500'} uppercase tracking-wider`}
      >
        {label}
      </p>
      <p className="mt-0.5 text-base sm:text-lg font-bold text-surface-900 tabular-nums tracking-tight">
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
      className={`text-xs bg-transparent border-0 outline-none cursor-pointer py-0 px-0 pr-4 rounded ${colorClass || 'text-surface-700'} focus:ring-1 focus:ring-brand-300`}
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

  // Sync if parent value changes (e.g. from poll refresh)
  useEffect(() => {
    setLocal(value)
  }, [value])

  return (
    <input
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
      className="text-xs bg-transparent border-0 outline-none w-[120px] py-0 px-0 text-surface-700 placeholder:text-surface-300 focus:ring-1 focus:ring-brand-300 rounded"
      placeholder="Add comment..."
    />
  )
}

function ModalCommentInput({
  value,
  onSave,
}: {
  value: string
  onSave: (val: string) => void
}) {
  const [local, setLocal] = useState(value)

  useEffect(() => {
    setLocal(value)
  }, [value])

  return (
    <textarea
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        if (local !== value) onSave(local)
      }}
      rows={2}
      className="text-sm border border-surface-200 rounded-lg px-3 py-2 w-full bg-white focus:ring-1 focus:ring-brand-300 outline-none resize-none"
      placeholder="Add comment..."
    />
  )
}
