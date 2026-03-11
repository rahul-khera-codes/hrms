import { useState } from 'react'
import { format, subDays } from 'date-fns'
import { BarChart3, Download } from 'lucide-react'
import { mockAttendanceRecords, mockPayrollSummary } from '@/data/mock'
import type { AttendanceRecord } from '@/types'

const statusColors: Record<AttendanceRecord['status'], string> = {
  present: 'bg-brand-100 text-brand-700',
  absent: 'bg-amber-100 text-amber-700',
  leave: 'bg-surface-100 text-surface-600',
  adjusted: 'bg-indigo-100 text-indigo-700',
}

export default function AdminReports() {
  const [reportType, setReportType] = useState<'attendance' | 'payroll'>('attendance')
  const [range, setRange] = useState<'week' | 'month'>('week')

  const sampleData = reportType === 'attendance'
    ? mockAttendanceRecords.slice(0, 10)
    : []

  const rangeLabel =
    range === 'week'
      ? format(subDays(new Date(), 7), 'MMM d') + ' – ' + format(new Date(), 'MMM d, yyyy')
      : format(subDays(new Date(), 30), 'MMM d') + ' – ' + format(new Date(), 'MMM d, yyyy')

  return (
    <div className="space-y-6 sm:space-y-8 overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-surface-900 tracking-tight">Reports</h1>
          <p className="text-surface-500 mt-1 text-xs sm:text-sm">Generate and export payroll-ready reports.</p>
        </div>
        <button type="button" className="btn-primary flex items-center justify-center gap-2 w-full sm:w-fit rounded-xl min-h-[2.75rem]">
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
            <select
              className="input w-full sm:w-48 rounded-xl min-h-[2.75rem]"
              value={reportType}
              onChange={(e) => setReportType(e.target.value as 'attendance' | 'payroll')}
            >
              <option value="attendance">Attendance summary</option>
              <option value="payroll">Payroll summary</option>
            </select>
          </div>
          <div className="flex-1 min-w-0 sm:flex-initial">
            <label className="label">Date range</label>
            <select
              className="input w-full sm:w-48 rounded-xl min-h-[2.75rem]"
              value={range}
              onChange={(e) => setRange(e.target.value as 'week' | 'month')}
            >
              <option value="week">Last 7 days</option>
              <option value="month">Last 30 days</option>
            </select>
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
        {reportType === 'payroll' ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className="rounded-lg sm:rounded-xl border border-surface-200/80 p-4 sm:p-5 shadow-sm">
              <p className="text-[10px] sm:text-xs font-medium text-surface-500 uppercase tracking-wider">Total regular hours</p>
              <p className="text-xl sm:text-2xl font-semibold text-surface-900 mt-1 tabular-nums">
                {mockPayrollSummary.regularHours}h
              </p>
            </div>
            <div className="rounded-lg sm:rounded-xl border border-surface-200/80 p-4 sm:p-5 shadow-sm">
              <p className="text-[10px] sm:text-xs font-medium text-surface-500 uppercase tracking-wider">Total overtime</p>
              <p className="text-xl sm:text-2xl font-semibold text-surface-900 mt-1 tabular-nums">
                {mockPayrollSummary.overtimeHours}h
              </p>
            </div>
            <div className="rounded-lg sm:rounded-xl border border-brand-200/80 bg-brand-50/50 p-4 sm:p-5 shadow-sm">
              <p className="text-[10px] sm:text-xs font-medium text-brand-700 uppercase tracking-wider">Total amount</p>
              <p className="text-xl sm:text-2xl font-semibold text-surface-900 mt-1 tabular-nums">
                ${mockPayrollSummary.amount?.toLocaleString() ?? '—'}
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
                {sampleData.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-surface-100 last:border-0 hover:bg-surface-50/50 transition-colors"
                  >
                    <td className="px-3 py-2.5 sm:px-5 sm:py-3.5 text-xs sm:text-sm font-medium text-surface-900 truncate max-w-[100px] sm:max-w-none">{r.employeeName}</td>
                    <td className="px-3 py-2.5 sm:px-5 sm:py-3.5 text-xs sm:text-sm text-surface-700 tabular-nums whitespace-nowrap">{r.date}</td>
                    <td className="px-3 py-2.5 sm:px-5 sm:py-3.5 text-xs sm:text-sm text-surface-700 tabular-nums">
                      {r.regularHours + r.overtimeHours}h
                    </td>
                    <td className="px-3 py-2.5 sm:px-5 sm:py-3.5">
                      <span className={`inline-flex items-center px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium ${statusColors[r.status]}`}>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
