import { useState, useEffect, useCallback } from 'react'
import { format, subDays } from 'date-fns'
import { BarChart3, Download } from 'lucide-react'
import { getAdminAttendance, getReportsSummary } from '@/lib/apiAdmin'
import type { AttendanceRecord } from '@/types'
import AdminSelect from '@/components/AdminSelect'

const statusColors: Record<string, string> = {
  present: 'bg-brand-100 text-brand-700',
  active: 'bg-amber-100 text-amber-700',
  absent: 'bg-amber-100 text-amber-700',
  leave: 'bg-surface-100 text-surface-600',
  adjusted: 'bg-indigo-100 text-indigo-700',
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

  const toDate = new Date()
  const fromDate = range === 'week' ? subDays(toDate, 7) : subDays(toDate, 30)
  const fromStr = format(fromDate, 'yyyy-MM-dd')
  const toStr = format(toDate, 'yyyy-MM-dd')

  const rangeLabel =
    range === 'week'
      ? format(fromDate, 'MMM d') + ' – ' + format(toDate, 'MMM d, yyyy')
      : format(fromDate, 'MMM d') + ' – ' + format(toDate, 'MMM d, yyyy')

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

  function handleExport() {
    if (reportType === 'attendance') {
      const headers = ['Employee', 'Date', 'Clock In', 'Clock Out', 'Regular (h)', 'Overtime (h)', 'Night (h)', 'Total (h)', 'Status']
      const rows = attendanceData.map((r) => [
        r.employeeName,
        r.date,
        r.clockIn ? format(new Date(r.clockIn), 'HH:mm') : '',
        r.clockOut ? format(new Date(r.clockOut), 'HH:mm') : '',
        r.regularHours,
        r.overtimeHours,
        r.nightHours,
        (r.regularHours + r.overtimeHours + r.nightHours).toFixed(1),
        r.status,
      ])
      const csv = [headers.join(','), ...rows.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n')
      downloadCsv(`attendance-report-${fromStr}-to-${toStr}.csv`, csv)
    } else if (summaryData) {
      const csv = [
        'Report,Period,Regular (h),Overtime (h),Night (h),Total (h)',
        `Payroll summary,${summaryData.period},${summaryData.regularHours},${summaryData.overtimeHours},${summaryData.nightHours},${summaryData.totalHours}`,
      ].join('\n')
      downloadCsv(`payroll-summary-${fromStr}-to-${toStr}.csv`, csv)
    }
  }

  return (
    <div className="space-y-6 sm:space-y-8 overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-surface-900 tracking-tight">Reports</h1>
          <p className="text-surface-500 mt-1 text-xs sm:text-sm">Generate and export payroll-ready reports.</p>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={loading || (reportType === 'attendance' && attendanceData.length === 0) || (reportType === 'payroll' && !summaryData)}
          className="btn-primary flex items-center justify-center gap-2 w-full sm:w-fit rounded-xl min-h-[2.75rem] disabled:opacity-50"
        >
          <Download className="w-4 h-4 shrink-0" />
          Export report
        </button>
      </div>

      <div className="rounded-xl sm:rounded-2xl border border-surface-200/80 bg-white p-4 sm:p-6 shadow-sm">
        <h2 className="text-sm sm:text-base font-semibold text-surface-900 mb-0.5 sm:mb-1">Report options</h2>
        <p className="text-xs sm:text-sm text-surface-500 mb-4 sm:mb-5">Choose type and date range</p>
        <div className="flex flex-col sm:flex-row flex-wrap gap-4 sm:gap-6">
          <div className="flex-1 min-w-0 sm:flex-initial">
            <label className="label">Report type</label>
            <AdminSelect
              value={reportType}
              onChange={(val) => setReportType(val as 'attendance' | 'payroll')}
              options={[
                { value: 'attendance', label: 'Attendance summary' },
                { value: 'payroll', label: 'Payroll summary' },
              ]}
            />
          </div>
          <div className="flex-1 min-w-0 sm:flex-initial">
            <label className="label">Date range</label>
            <AdminSelect
              value={range}
              onChange={(val) => setRange(val as 'week' | 'month')}
              options={[
                { value: 'week', label: 'Last 7 days' },
                { value: 'month', label: 'Last 30 days' },
              ]}
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl sm:rounded-2xl border border-surface-200/80 bg-white p-4 sm:p-6 shadow-sm min-w-0">
        <div className="flex flex-col sm:flex-row items-start gap-3 mb-4 sm:mb-6">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
            <BarChart3 className="w-5 h-5 text-brand-600" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-semibold text-surface-900">
              {reportType === 'attendance' ? 'Attendance summary' : 'Payroll summary'}
            </h2>
            <p className="text-xs sm:text-sm text-surface-500 mt-0.5 truncate">{rangeLabel}</p>
          </div>
        </div>
        {loading ? (
          <div className="py-8 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : reportType === 'payroll' ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className="rounded-lg sm:rounded-xl border border-surface-200/80 p-4 sm:p-5 shadow-sm">
              <p className="text-[10px] sm:text-xs font-medium text-surface-500 uppercase tracking-wider">Total regular hours</p>
              <p className="text-xl sm:text-2xl font-semibold text-surface-900 mt-1 tabular-nums">
                {summaryData?.regularHours ?? 0}h
              </p>
            </div>
            <div className="rounded-lg sm:rounded-xl border border-surface-200/80 p-4 sm:p-5 shadow-sm">
              <p className="text-[10px] sm:text-xs font-medium text-surface-500 uppercase tracking-wider">Total overtime</p>
              <p className="text-xl sm:text-2xl font-semibold text-surface-900 mt-1 tabular-nums">
                {summaryData?.overtimeHours ?? 0}h
              </p>
            </div>
            <div className="rounded-lg sm:rounded-xl border border-brand-200/80 bg-brand-50/50 p-4 sm:p-5 shadow-sm">
              <p className="text-[10px] sm:text-xs font-medium text-brand-700 uppercase tracking-wider">Total hours</p>
              <p className="text-xl sm:text-2xl font-semibold text-surface-900 mt-1 tabular-nums">
                {summaryData?.totalHours ?? 0}h
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg sm:rounded-xl border border-surface-200/80 overflow-hidden -mx-px">
            <table className="w-full text-left min-w-[420px]">
              <thead>
                <tr className="border-b border-surface-100 bg-surface-50/80">
                  <th className="px-3 py-2.5 sm:px-5 sm:py-3.5 text-[10px] sm:text-xs font-semibold text-surface-500 uppercase tracking-wider">
                    Employee
                  </th>
                  <th className="px-3 py-2.5 sm:px-5 sm:py-3.5 text-[10px] sm:text-xs font-semibold text-surface-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-3 py-2.5 sm:px-5 sm:py-3.5 text-[10px] sm:text-xs font-semibold text-surface-500 uppercase tracking-wider">
                    Hours
                  </th>
                  <th className="px-3 py-2.5 sm:px-5 sm:py-3.5 text-[10px] sm:text-xs font-semibold text-surface-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {attendanceData.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-surface-100 last:border-0 hover:bg-surface-50/50 transition-colors"
                  >
                    <td className="px-3 py-2.5 sm:px-5 sm:py-3.5 text-xs sm:text-sm font-medium text-surface-900 truncate max-w-[100px] sm:max-w-none">{r.employeeName}</td>
                    <td className="px-3 py-2.5 sm:px-5 sm:py-3.5 text-xs sm:text-sm text-surface-700 tabular-nums whitespace-nowrap">{r.date}</td>
                    <td className="px-3 py-2.5 sm:px-5 sm:py-3.5 text-xs sm:text-sm text-surface-700 tabular-nums">
                      {(r.regularHours + r.overtimeHours + r.nightHours).toFixed(1)}h
                    </td>
                    <td className="px-3 py-2.5 sm:px-5 sm:py-3.5">
                      <span className={`inline-flex items-center px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium ${statusColors[r.status] ?? 'bg-surface-100 text-surface-600'}`}>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {attendanceData.length === 0 && (
              <div className="p-8 text-center text-surface-500 text-sm">No attendance records in this period.</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
