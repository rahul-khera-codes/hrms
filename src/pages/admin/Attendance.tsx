import { useState, useEffect, useMemo, useCallback } from 'react'
import { format, subDays } from 'date-fns'
import { Search, Download, X } from 'lucide-react'
import { getAdminAttendance, updateAttendanceRecord } from '@/lib/apiAdmin'
import type { AttendanceRecord } from '@/types'
import AdminDatePicker from '@/components/AdminDatePicker'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_OPTIONS = [
  'Present',
  'Absent',
  'Late In',
  'Early Out',
  'Late In-Early Out',
  'Time Off',
  'Shift Error',
  'Technical Issue',
  'Suspended',
  'Terminated',
  'Prenotice',
  'Review',
] as const

const PAY_OPTIONS = ['Regular', 'X35%', 'X100%', 'Holiday', 'DNP'] as const
const BILL_OPTIONS = ['Regular', 'Premium', 'Holiday', 'DNB', 'Review'] as const
const STAGE_OPTIONS = ['Production', 'Nesting', 'Training'] as const
const TASK_OPTIONS = [
  'Admin',
  'Auth. Support',
  'Billing Support',
  'Contact Center',
  'Collections',
  'Coord. Support',
  'HR Support',
  'Floater',
  'EVV',
  'On Call',
  'HHAX App',
] as const

const statusColors: Record<string, string> = {
  Present: 'bg-emerald-100 text-emerald-700',
  Absent: 'bg-red-100 text-red-700',
  'Late In': 'bg-amber-100 text-amber-700',
  'Early Out': 'bg-amber-100 text-amber-700',
  'Late In-Early Out': 'bg-amber-100 text-amber-700',
  'Time Off': 'bg-sky-100 text-sky-700',
  'Shift Error': 'bg-orange-100 text-orange-700',
  'Technical Issue': 'bg-orange-100 text-orange-700',
  Suspended: 'bg-rose-100 text-rose-700',
  Terminated: 'bg-rose-100 text-rose-700',
  Prenotice: 'bg-violet-100 text-violet-700',
  Review: 'bg-indigo-100 text-indigo-700',
  // Legacy lowercase mappings
  present: 'bg-emerald-100 text-emerald-700',
  absent: 'bg-red-100 text-red-700',
  active: 'bg-amber-100 text-amber-700',
  leave: 'bg-sky-100 text-sky-700',
  adjusted: 'bg-indigo-100 text-indigo-700',
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
      ['late in', 'early out', 'late in-early out'].includes(
        r.status.toLowerCase(),
      ),
    ).length
    const timeOff = records.filter(
      (r) => r.status.toLowerCase() === 'time off',
    ).length
    const totalReg = records.reduce((a, r) => a + (r.regHours ?? 0), 0)
    const totalN15 = records.reduce((a, r) => a + (r.n15Hours ?? 0), 0)
    const totalX35 = records.reduce((a, r) => a + (r.x35Hours ?? 0), 0)
    const totalX100 = records.reduce((a, r) => a + (r.x100Hours ?? 0), 0)
    const totalHdy = records.reduce((a, r) => a + (r.hdyHours ?? 0), 0)
    return { total, present, absent, late, timeOff, totalReg, totalN15, totalX35, totalX100, totalHdy }
  }, [records])

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="space-y-4 sm:space-y-6 overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-surface-900 tracking-tight">
            Attendance
          </h1>
          <p className="text-surface-500 mt-1 text-xs sm:text-sm">
            Excel-style attendance log. Inline-edit Status, Pay, Bill, Stage,
            Task and Comments.
          </p>
        </div>
        <button
          type="button"
          onClick={exportCSV}
          disabled={loading || records.length === 0}
          className="btn-secondary flex items-center justify-center gap-2 rounded-xl w-full sm:w-auto min-h-[2.75rem] disabled:opacity-50"
        >
          <Download className="w-4 h-4 shrink-0" />
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="rounded-xl sm:rounded-2xl border border-surface-200/80 bg-white p-3 sm:p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 sm:left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 shrink-0" />
            <input
              type="text"
              placeholder="Search by name"
              className="input pl-9 sm:pl-10 rounded-xl min-h-[2.75rem] w-full"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <div className="flex-1 min-w-[140px]">
              <AdminDatePicker
                value={dateFrom}
                onChange={(val) => setDateFrom(val)}
              />
            </div>
            <div className="flex-1 min-w-[140px]">
              <AdminDatePicker
                value={dateTo}
                onChange={(val) => setDateTo(val)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 xl:grid-cols-10 gap-3 sm:gap-4">
        <SummaryCard label="Records" value={summary.total} />
        <SummaryCard
          label="Present"
          value={summary.present}
          color="brand"
        />
        <SummaryCard label="Absent" value={summary.absent} color="red" />
        <SummaryCard label="Late / Early" value={summary.late} color="amber" />
        <SummaryCard
          label="Time Off"
          value={summary.timeOff}
          color="sky"
        />
        <SummaryCard
          label="REG"
          value={fmtHours(summary.totalReg)}
          color="emerald"
        />
        <SummaryCard
          label="N15%"
          value={fmtHours(summary.totalN15)}
          color="indigo"
        />
        <SummaryCard
          label="X35%"
          value={fmtHours(summary.totalX35)}
          color="amber"
        />
        <SummaryCard
          label="X100%"
          value={fmtHours(summary.totalX100)}
          color="red"
        />
        <SummaryCard
          label="HDY"
          value={fmtHours(summary.totalHdy)}
          color="sky"
        />
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
                      className="px-2 py-2 text-[10px] font-semibold text-surface-500 uppercase tracking-wider whitespace-nowrap border-b border-surface-200"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>

              {/* Body */}
              <tbody>
                {records.map((r) => {
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
                      <td className="px-2 py-1.5 text-xs text-surface-700 tabular-nums whitespace-nowrap text-right">
                        {fmtHours(r.scheduledHours)}
                      </td>
                      {/* SDBT */}
                      <td className="px-2 py-1.5 text-xs text-surface-700 tabular-nums whitespace-nowrap text-right">
                        {fmtHours(r.sdbtHours)}
                      </td>
                      {/* ACT */}
                      <td className="px-2 py-1.5 text-xs text-surface-700 tabular-nums whitespace-nowrap text-right">
                        {fmtHours(r.actualHours)}
                      </td>
                      {/* ADBT */}
                      <td className="px-2 py-1.5 text-xs text-surface-700 tabular-nums whitespace-nowrap text-right">
                        {fmtHours(r.adbtHours)}
                      </td>
                      {/* REG */}
                      <td className="px-2 py-1.5 text-xs text-surface-700 tabular-nums whitespace-nowrap text-right">
                        {fmtHours(r.regHours)}
                      </td>
                      {/* N15% */}
                      <td className="px-2 py-1.5 text-xs text-surface-700 tabular-nums whitespace-nowrap text-right">
                        {fmtHours(r.n15Hours)}
                      </td>
                      {/* X35% */}
                      <td className="px-2 py-1.5 text-xs text-surface-700 tabular-nums whitespace-nowrap text-right">
                        {fmtHours(r.x35Hours)}
                      </td>
                      {/* X100% */}
                      <td className="px-2 py-1.5 text-xs text-surface-700 tabular-nums whitespace-nowrap text-right">
                        {fmtHours(r.x100Hours)}
                      </td>
                      {/* HDY */}
                      <td className="px-2 py-1.5 text-xs text-surface-700 tabular-nums whitespace-nowrap text-right">
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

      {/* Detail Modal */}
      {detailRecord && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={() => setDetailRecord(null)}
            aria-label="Close"
          />
          <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-surface-200 bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-surface-900">Attendance Details</h2>
              <button type="button" onClick={() => setDetailRecord(null)} className="p-1 rounded-lg hover:bg-surface-100 transition-colors">
                <X className="w-5 h-5 text-surface-500" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Employee Info */}
              <div className="rounded-xl border border-surface-200 bg-surface-50/80 p-3">
                <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Employee</p>
                <div className="grid grid-cols-2 gap-1.5 text-sm">
                  <span className="text-surface-500">Name</span>
                  <span className="font-medium text-surface-900">{detailRecord.employeeName}</span>
                  <span className="text-surface-500">EID</span>
                  <span className="tabular-nums text-surface-900">{detailRecord.employeeCmid ?? '-'}</span>
                  <span className="text-surface-500">Account</span>
                  <span className="text-surface-900">{detailRecord.accountName ?? '-'}</span>
                </div>
              </div>

              {/* Shift */}
              <div className="rounded-xl border border-surface-200 bg-surface-50/80 p-3">
                <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Shift</p>
                <div className="grid grid-cols-2 gap-1.5 text-sm">
                  <span className="text-surface-500">Start</span>
                  <span className="tabular-nums text-surface-900">{fmtFullDateTime(detailRecord.shiftStart)}</span>
                  <span className="text-surface-500">End</span>
                  <span className="tabular-nums text-surface-900">{fmtFullDateTime(detailRecord.shiftEnd)}</span>
                </div>
              </div>

              {/* Clock */}
              <div className="rounded-xl border border-surface-200 bg-surface-50/80 p-3">
                <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Clock</p>
                <div className="grid grid-cols-2 gap-1.5 text-sm">
                  <span className="text-surface-500">In</span>
                  <span className="tabular-nums text-surface-900">{fmtFullDateTime(detailRecord.clockIn)}</span>
                  <span className="text-surface-500">Out</span>
                  <span className="tabular-nums text-surface-900">{fmtFullDateTime(detailRecord.clockOut)}</span>
                </div>
              </div>

              {/* Hours */}
              <div className="rounded-xl border border-surface-200 bg-surface-50/80 p-3">
                <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Hours</p>
                <div className="grid grid-cols-2 gap-1.5 text-sm">
                  <span className="text-surface-500">SCH</span>
                  <span className="tabular-nums text-surface-900">{fmtHours(detailRecord.scheduledHours)}</span>
                  <span className="text-surface-500">SDBT</span>
                  <span className="tabular-nums text-surface-900">{fmtHours(detailRecord.sdbtHours)}</span>
                  <span className="text-surface-500">ACT</span>
                  <span className="tabular-nums text-surface-900">{fmtHours(detailRecord.actualHours)}</span>
                  <span className="text-surface-500">ADBT</span>
                  <span className="tabular-nums text-surface-900">{fmtHours(detailRecord.adbtHours)}</span>
                </div>
              </div>

              {/* Classification */}
              <div className="rounded-xl border border-surface-200 bg-surface-50/80 p-3">
                <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Classification</p>
                <div className="grid grid-cols-2 gap-1.5 text-sm">
                  <span className="text-surface-500">REG</span>
                  <span className="tabular-nums text-surface-900">{fmtHours(detailRecord.regHours)}</span>
                  <span className="text-surface-500">N15%</span>
                  <span className="tabular-nums text-surface-900">{fmtHours(detailRecord.n15Hours)}</span>
                  <span className="text-surface-500">X35%</span>
                  <span className="tabular-nums text-surface-900">{fmtHours(detailRecord.x35Hours)}</span>
                  <span className="text-surface-500">X100%</span>
                  <span className="tabular-nums text-surface-900">{fmtHours(detailRecord.x100Hours)}</span>
                  <span className="text-surface-500">HDY</span>
                  <span className="tabular-nums text-surface-900">{fmtHours(detailRecord.hdyHours)}</span>
                </div>
              </div>

              {/* Meta */}
              <div className="rounded-xl border border-surface-200 bg-surface-50/80 p-3">
                <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Meta</p>
                <div className="grid grid-cols-2 gap-1.5 text-sm">
                  <span className="text-surface-500">Stage</span>
                  <span className="text-surface-900">{detailRecord.stage ?? '-'}</span>
                  <span className="text-surface-500">Reports To</span>
                  <span className="text-surface-900">{detailRecord.reportsTo ?? '-'}</span>
                  <span className="text-surface-500">Task</span>
                  <span className="text-surface-900">{detailRecord.task ?? '-'}</span>
                  <span className="text-surface-500">Status</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[detailRecord.status] || 'bg-surface-100 text-surface-600'}`}>
                    {detailRecord.status}
                  </span>
                  <span className="text-surface-500">Pay</span>
                  <span className="text-surface-900">{detailRecord.payType ?? '-'}</span>
                  <span className="text-surface-500">Bill</span>
                  <span className="text-surface-900">{detailRecord.billType ?? '-'}</span>
                </div>
              </div>

              {/* Comments */}
              {detailRecord.comments && (
                <div className="rounded-xl border border-surface-200 bg-surface-50/80 p-3">
                  <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Comments</p>
                  <p className="text-sm text-surface-900">{detailRecord.comments}</p>
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setDetailRecord(null)}
                className="btn-secondary rounded-xl px-4 py-2"
              >
                Close
              </button>
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

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string
  value: string | number
  color?: string
}) {
  const borderColor = color
    ? `border-${color}-200/80`
    : 'border-surface-200/80'
  const bgColor = color ? `bg-${color}-50/50` : 'bg-white'
  const labelColor = color
    ? `text-${color}-700`
    : 'text-surface-500'

  return (
    <div
      className={`rounded-lg sm:rounded-xl border ${borderColor} ${bgColor} p-3 sm:p-4 shadow-sm`}
    >
      <p
        className={`text-[10px] sm:text-xs font-medium ${labelColor} uppercase tracking-wider`}
      >
        {label}
      </p>
      <p className="mt-1 text-lg sm:text-xl font-semibold text-surface-900 tabular-nums">
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
