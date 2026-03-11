import { useState } from 'react'
import { format, subDays } from 'date-fns'
import { FileText, Download, Calculator, Calendar, Clock, TrendingUp, DollarSign } from 'lucide-react'
import { mockPayrollSummary } from '@/data/mock'

export default function AdminPayroll() {
  const [periodStart, setPeriodStart] = useState(format(subDays(new Date(), 14), 'yyyy-MM-dd'))
  const [periodEnd, setPeriodEnd] = useState(format(new Date(), 'yyyy-MM-dd'))

  return (
    <div className="space-y-6 sm:space-y-8 overflow-x-hidden">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-surface-900 tracking-tight">Payroll</h1>
        <p className="text-surface-500 mt-1 text-xs sm:text-sm">Calculate and export payroll from attendance data.</p>
      </div>

      <div className="rounded-xl sm:rounded-2xl border border-surface-200/80 bg-white p-4 sm:p-6 shadow-sm">
        <h2 className="text-sm sm:text-base font-semibold text-surface-900 mb-0.5 sm:mb-1">Pay period</h2>
        <p className="text-xs sm:text-sm text-surface-500 mb-4 sm:mb-5">Select the date range to calculate</p>
        <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4 items-stretch sm:items-end">
          <div className="flex-1 sm:flex-initial min-w-0">
            <label className="label">Start date</label>
            <input
              type="date"
              className="input w-full sm:w-40 rounded-xl min-h-[2.75rem]"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
            />
          </div>
          <div className="flex-1 sm:flex-initial min-w-0">
            <label className="label">End date</label>
            <input
              type="date"
              className="input w-full sm:w-40 rounded-xl min-h-[2.75rem]"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
            />
          </div>
          <button type="button" className="btn-primary flex items-center justify-center gap-2 rounded-xl w-full sm:w-auto min-h-[2.75rem]">
            <Calculator className="w-4 h-4 shrink-0" />
            Calculate payroll
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-lg sm:rounded-xl border border-surface-200/80 bg-white p-3 sm:p-5 shadow-sm min-w-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl bg-surface-100 flex items-center justify-center shrink-0">
              <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-surface-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] sm:text-xs font-medium text-surface-500 uppercase tracking-wider truncate">Period</p>
              <p className="text-xs sm:text-sm font-semibold text-surface-900 mt-0.5 leading-tight truncate">{mockPayrollSummary.period}</p>
            </div>
          </div>
        </div>
        <div className="rounded-lg sm:rounded-xl border border-surface-200/80 bg-white p-3 sm:p-5 shadow-sm min-w-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-brand-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] sm:text-xs font-medium text-surface-500 uppercase tracking-wider truncate">Regular hours</p>
              <p className="text-lg sm:text-xl font-semibold text-surface-900 mt-0.5 tabular-nums truncate">
                {mockPayrollSummary.regularHours}h
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-lg sm:rounded-xl border border-surface-200/80 bg-white p-3 sm:p-5 shadow-sm min-w-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
              <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] sm:text-xs font-medium text-surface-500 uppercase tracking-wider truncate">Overtime</p>
              <p className="text-lg sm:text-xl font-semibold text-surface-900 mt-0.5 tabular-nums truncate">
                {mockPayrollSummary.overtimeHours}h
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-lg sm:rounded-xl border border-brand-200/80 bg-brand-50/50 p-3 sm:p-5 shadow-sm min-w-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl bg-brand-100 flex items-center justify-center shrink-0">
              <DollarSign className="w-4 h-4 sm:w-5 sm:h-5 text-brand-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] sm:text-xs font-medium text-brand-700 uppercase tracking-wider truncate">Est. amount</p>
              <p className="text-lg sm:text-xl font-semibold text-surface-900 mt-0.5 tabular-nums truncate">
                ${mockPayrollSummary.amount?.toLocaleString() ?? '—'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl sm:rounded-2xl border border-surface-200/80 bg-white p-4 sm:p-6 shadow-sm">
        <h2 className="text-sm sm:text-base font-semibold text-surface-900 mb-0.5 sm:mb-1">Export</h2>
        <p className="text-xs sm:text-sm text-surface-500 mb-4 sm:mb-5">
          Export payroll data for your accounting or payroll system.
        </p>
        <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3">
          <button type="button" className="btn-secondary flex items-center justify-center gap-2 rounded-xl w-full sm:w-auto min-h-[2.75rem]">
            <Download className="w-4 h-4 shrink-0" />
            Export CSV
          </button>
          <button type="button" className="btn-secondary flex items-center justify-center gap-2 rounded-xl w-full sm:w-auto min-h-[2.75rem]">
            <FileText className="w-4 h-4 shrink-0" />
            Export PDF report
          </button>
        </div>
      </div>
    </div>
  )
}
