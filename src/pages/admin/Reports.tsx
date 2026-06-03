import { useState, useEffect, useCallback, useMemo } from 'react'
import { format, subDays } from 'date-fns'
// 03JUN2026 — clock-in/out times go through the AST 12-hour helper
import { fmtTimeWithSeconds } from '@/lib/timeFormat'
import { BarChart3, Download, Search, LayoutGrid, Table2, Clock, TrendingUp, Moon } from 'lucide-react'
import { getAdminAttendance, getReportsSummary } from '@/lib/apiAdmin'
import type { AttendanceRecord } from '@/types'
import AdminSelect from '@/components/AdminSelect'
import { PageHeader } from '@/components/PageHeader'

const statusColors: Record<string, string> = {
  present: 'badge-success',
  active: 'badge-warning',
  absent: 'badge-danger',
  leave: 'badge-info',
  adjusted: 'badge-brand',
}

function formatDurationFromHours(hours: number) {
  const totalSeconds = Math.max(0, Math.round(hours * 3600))
  const hh = Math.floor(totalSeconds / 3600)
  const mm = Math.floor((totalSeconds % 3600) / 60)
  const ss = totalSeconds % 60
  return [hh, mm, ss].map((v) => String(v).padStart(2, '0')).join(':')
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
}

export default function AdminReports() {
  const [reportType, setReportType] = useState<'attendance' | 'payroll'>('attendance')
  const [range, setRange] = useState<'week' | 'month'>('week')
  const [attendanceData, setAttendanceData] = useState<AttendanceRecord[]>([])
  const [summaryData, setSummaryData] = useState<{
    period: string
    regularHours: number
    overtimeHours: number
    nightHours: number
    totalHours: number
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'card' | 'table'>('table')

  const toDate = new Date()
  const fromDate = range === 'week' ? subDays(toDate, 7) : subDays(toDate, 30)
  const fromStr = format(fromDate, 'yyyy-MM-dd')
  const toStr = format(toDate, 'yyyy-MM-dd')

  const rangeLabel = format(fromDate, 'MMM d') + ' – ' + format(toDate, 'MMM d, yyyy')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      if (reportType === 'attendance') {
        const list = await getAdminAttendance({ from: fromStr, to: toStr })
        setAttendanceData(list)
        setSummaryData(null)
      } else {
        const summary = await getReportsSummary({ from: fromStr, to: toStr })
        setSummaryData(summary)
        setAttendanceData([])
      }
    } catch {
      setAttendanceData([])
      setSummaryData(null)
    } finally {
      setLoading(false)
    }
  }, [reportType, range, fromStr, toStr])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const filteredAttendance = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return attendanceData
    return attendanceData.filter((r) => r.employeeName.toLowerCase().includes(q))
  }, [attendanceData, search])

  function handleExport() {
    if (reportType === 'attendance') {
      const headers = ['Employee', 'Date', 'Clock In', 'Clock Out', 'Regular', 'Overtime', 'Night', 'Total', 'Status']
      const rows = filteredAttendance.map((r) => [
        r.employeeName,
        r.date,
        r.clockIn ? fmtTimeWithSeconds(r.clockIn) : '',
        r.clockOut ? fmtTimeWithSeconds(r.clockOut) : '',
        formatDurationFromHours(r.regularHours),
        formatDurationFromHours(r.overtimeHours),
        formatDurationFromHours(r.nightHours),
        formatDurationFromHours(r.regularHours + r.overtimeHours),
        r.status,
      ])
      const csv = [headers.join(','), ...rows.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n')
      downloadCsv(`attendance-report-${fromStr}-to-${toStr}.csv`, csv)
    } else if (summaryData) {
      const csv = [
        'Report,Period,Regular,Overtime,Night,Total',
        `Payroll summary,${summaryData.period},${formatDurationFromHours(summaryData.regularHours)},${formatDurationFromHours(summaryData.overtimeHours)},${formatDurationFromHours(summaryData.nightHours)},${formatDurationFromHours(summaryData.totalHours)}`,
      ].join('\n')
      downloadCsv(`payroll-summary-${fromStr}-to-${toStr}.csv`, csv)
    }
  }

  const isAttendance = reportType === 'attendance'

  return (
    <div className="page overflow-x-hidden">
      <PageHeader
        title="Reports"
        subtitle="Generate and export payroll-ready reports."
        icon={<BarChart3 className="w-5 h-5" />}
        actions={
          <button
            type="button"
            onClick={handleExport}
            disabled={loading || (isAttendance && filteredAttendance.length === 0) || (!isAttendance && !summaryData)}
            className="btn-primary"
          >
            <Download className="w-4 h-4 shrink-0" />
            Export CSV
          </button>
        }
      />

      {/* Unified toolbar: search + filters + view toggle */}
      <div className="toolbar">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 dark:text-surface-500 shrink-0" />
          <input
            type="text"
            placeholder="Search by employee name"
            className="input pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={!isAttendance}
          />
        </div>
        <div className="w-full sm:w-48">
          <AdminSelect
            value={reportType}
            onChange={(val) => setReportType(val as 'attendance' | 'payroll')}
            options={[
              { value: 'attendance', label: 'Attendance summary' },
              { value: 'payroll', label: 'Payroll summary' },
            ]}
          />
        </div>
        <div className="w-full sm:w-36">
          <AdminSelect
            value={range}
            onChange={(val) => setRange(val as 'week' | 'month')}
            options={[
              { value: 'week', label: 'Last 7 days' },
              { value: 'month', label: 'Last 30 days' },
            ]}
          />
        </div>
        {isAttendance && (
          <div className="segmented self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setViewMode('card')}
              className={`segmented-item ${viewMode === 'card' ? 'segmented-item-active' : ''}`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Card
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`segmented-item ${viewMode === 'table' ? 'segmented-item-active' : ''}`}
            >
              <Table2 className="w-3.5 h-3.5" />
              Table
            </button>
          </div>
        )}
      </div>

      {/* Report body */}
      <div className="card overflow-hidden">
        <div className="card-header">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-brand-50 border border-brand-100 text-brand-600 flex items-center justify-center shrink-0">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-surface-900 dark:text-surface-50">
                {isAttendance ? 'Attendance summary' : 'Payroll summary'}
              </h2>
              <p className="text-[11px] text-surface-500 dark:text-surface-400 dark:text-surface-500 mt-0.5 tabular-nums">{rangeLabel}</p>
            </div>
          </div>
          {isAttendance && !loading && (
            <span className="badge-neutral text-[11px]">{filteredAttendance.length} records</span>
          )}
        </div>

        {loading ? (
          <div className="p-4 sm:p-5 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 rounded-lg bg-surface-200/60 animate-pulse" />
            ))}
          </div>
        ) : !isAttendance ? (
          <div className="p-4 sm:p-5">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 sm:gap-4">
              <div className="stat-card flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-50 border border-brand-100 text-brand-600 flex items-center justify-center shrink-0">
                  <Clock className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="stat-label">Regular</p>
                  <p className="stat-value">{formatDurationFromHours(summaryData?.regularHours ?? 0)}</p>
                </div>
              </div>
              <div className="stat-card flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="stat-label">Overtime</p>
                  <p className="stat-value">{formatDurationFromHours(summaryData?.overtimeHours ?? 0)}</p>
                </div>
              </div>
              <div className="stat-card flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                  <Moon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="stat-label">Night</p>
                  <p className="stat-value">{formatDurationFromHours(summaryData?.nightHours ?? 0)}</p>
                </div>
              </div>
              <div className="stat-card bg-brand-50/50 border-brand-200/70 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center shrink-0">
                  <Clock className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="stat-label text-brand-700">Total</p>
                  <p className="stat-value">{formatDurationFromHours(summaryData?.totalHours ?? 0)}</p>
                </div>
              </div>
            </div>
          </div>
        ) : filteredAttendance.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><BarChart3 className="w-5 h-5" /></div>
            <p className="empty-state-title">{search ? 'No matches' : 'No records'}</p>
            <p className="empty-state-description">
              {search ? 'Try a different search term.' : 'No attendance records in the selected period.'}
            </p>
          </div>
        ) : viewMode === 'table' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-surface-50/95 backdrop-blur-sm shadow-[0_1px_0_0_theme(colors.surface.200)] z-10">
                <tr>
                  <th className="px-3 py-2.5 text-[10px] font-semibold text-surface-500 dark:text-surface-400 dark:text-surface-500 uppercase tracking-wider whitespace-nowrap">Employee</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold text-surface-500 dark:text-surface-400 dark:text-surface-500 uppercase tracking-wider whitespace-nowrap">Date</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold text-surface-500 dark:text-surface-400 dark:text-surface-500 uppercase tracking-wider whitespace-nowrap">Clock In</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold text-surface-500 dark:text-surface-400 dark:text-surface-500 uppercase tracking-wider whitespace-nowrap">Clock Out</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold text-surface-500 dark:text-surface-400 dark:text-surface-500 uppercase tracking-wider whitespace-nowrap text-right">Hours</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold text-surface-500 dark:text-surface-400 dark:text-surface-500 uppercase tracking-wider whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredAttendance.map((r) => (
                  <tr key={r.id} className="border-b border-surface-100 dark:border-surface-800 hover:bg-brand-50/30 transition-colors">
                    <td className="px-3 py-2.5 text-xs font-medium text-surface-900 dark:text-surface-50 whitespace-nowrap">{r.employeeName}</td>
                    <td className="px-3 py-2.5 text-xs text-surface-700 dark:text-surface-200 tabular-nums whitespace-nowrap">{r.date}</td>
                    <td className="px-3 py-2.5 text-xs font-mono text-surface-700 dark:text-surface-200 tabular-nums whitespace-nowrap">
                      {r.clockIn ? fmtTimeWithSeconds(r.clockIn) : '-'}
                    </td>
                    <td className="px-3 py-2.5 text-xs font-mono text-surface-700 dark:text-surface-200 tabular-nums whitespace-nowrap">
                      {r.clockOut ? fmtTimeWithSeconds(r.clockOut) : '-'}
                    </td>
                    <td className="px-3 py-2.5 text-xs font-mono text-surface-700 dark:text-surface-200 tabular-nums whitespace-nowrap text-right">
                      {formatDurationFromHours(r.regularHours + r.overtimeHours)}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={`${statusColors[r.status] ?? 'badge-neutral'} capitalize`}>{r.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ul className="p-3 sm:p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredAttendance.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-3 p-3 rounded-xl border border-surface-200/70 bg-white dark:bg-surface-900 hover:shadow-card-hover hover:border-brand-200/70 transition-all"
              >
                <div className="w-9 h-9 rounded-lg bg-surface-100 dark:bg-surface-800 flex items-center justify-center text-surface-500 dark:text-surface-400 dark:text-surface-500 text-xs font-semibold shrink-0">
                  {r.employeeName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-surface-900 dark:text-surface-50 truncate">{r.employeeName}</p>
                  <p className="text-[11px] text-surface-500 dark:text-surface-400 dark:text-surface-500 mt-0.5 tabular-nums">
                    {r.date} · {formatDurationFromHours(r.regularHours + r.overtimeHours)}
                  </p>
                </div>
                <span className={`${statusColors[r.status] ?? 'badge-neutral'} capitalize shrink-0`}>{r.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
