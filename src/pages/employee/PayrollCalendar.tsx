import { useState, useEffect } from 'react'
import { CalendarDays, Calendar, DollarSign } from 'lucide-react'
import { getEmployeePayrollPeriods, type PayrollPeriod } from '@/lib/apiEmployee'
import AdminSelect from '@/components/AdminSelect'
import { PageHeader } from '@/components/PageHeader'

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function fmtPeriodDate(d: string): string {
  if (!d || d.length < 10) return d
  const [y, m, day] = d.split('-')
  return `${MONTHS_SHORT[parseInt(m, 10) - 1]}-${day}-${y}`
}

export default function EmployeePayrollCalendar() {
  const currentYear = new Date().getFullYear()
  const [periodsYear, setPeriodsYear] = useState(currentYear)
  const [periods, setPeriods] = useState<PayrollPeriod[]>([])

  useEffect(() => {
    getEmployeePayrollPeriods(periodsYear).then(setPeriods).catch(() => setPeriods([]))
  }, [periodsYear])

  const today = new Date()

  return (
    <div className="page">
      <PageHeader
        title="Payroll Calendar"
        subtitle="View payroll cycle dates and payment schedule."
        icon={<Calendar className="w-5 h-5" />}
      />

      <div className="card overflow-hidden flex flex-col">
        <div className="card-header">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-brand-50 border border-brand-100 text-brand-600 flex items-center justify-center shrink-0">
              <CalendarDays className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-surface-900 dark:text-surface-50">Bi-weekly periods</h2>
              <p className="text-[11px] text-surface-500 dark:text-surface-400 dark:text-surface-500 mt-0.5">TSS calendar pay periods</p>
            </div>
          </div>
          <div className="w-24 shrink-0">
            <AdminSelect
              value={String(periodsYear)}
              onChange={(val) => setPeriodsYear(parseInt(val, 10))}
              options={[2025, 2026, 2027, 2028, 2029, 2030].map((y) => ({ value: String(y), label: y }))}
            />
          </div>
        </div>
        <div className="flex-1 overflow-hidden flex flex-col">
          {periods.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon"><CalendarDays className="w-5 h-5" /></div>
              <p className="empty-state-title">No periods for {periodsYear}</p>
              <p className="empty-state-description">Pick a year above to view payroll periods.</p>
            </div>
          ) : (
            <div className="overflow-auto max-h-[600px]">
              <table className="w-full min-w-[480px] text-left border-collapse">
                <thead className="sticky top-0 bg-surface-50/95 backdrop-blur-sm shadow-[0_1px_0_0_theme(colors.surface.200)] z-10">
                  <tr>
                    <th className="px-4 py-2.5 text-[10px] font-semibold text-surface-500 dark:text-surface-400 dark:text-surface-500 uppercase tracking-wider">Cycle</th>
                    <th className="px-4 py-2.5 text-[10px] font-semibold text-surface-500 dark:text-surface-400 dark:text-surface-500 uppercase tracking-wider">Period</th>
                    <th className="px-4 py-2.5 text-[10px] font-semibold text-surface-500 dark:text-surface-400 dark:text-surface-500 uppercase tracking-wider">Pay date</th>
                    <th className="px-4 py-2.5 text-[10px] font-semibold text-surface-500 dark:text-surface-400 dark:text-surface-500 uppercase tracking-wider text-center">Payment #</th>
                  </tr>
                </thead>
                <tbody>
                  {periods.map((p) => {
                    const fromD = new Date(p.periodFrom)
                    const toD = new Date(p.periodTo)
                    const isCurrent = today >= fromD && today <= toD
                    return (
                      <tr key={p.cycleCode} className={`border-t border-surface-100 dark:border-surface-800 transition-colors ${p.isSpecial ? 'bg-red-50/60 hover:bg-red-50' : 'hover:bg-brand-50/30'}`}>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-mono font-semibold ${p.isSpecial ? 'text-red-700' : 'text-surface-900 dark:text-surface-50'}`}>{p.cycleCode}</span>
                            {isCurrent && <span className="badge-brand">Current</span>}
                            {p.isSpecial && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-700 border border-red-200">27th cycle</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-surface-700 dark:text-surface-200 whitespace-nowrap tabular-nums">{fmtPeriodDate(p.periodFrom)} – {fmtPeriodDate(p.periodTo)}</td>
                        <td className="px-4 py-3 text-xs text-surface-700 dark:text-surface-200 whitespace-nowrap tabular-nums">
                          <span className="inline-flex items-center gap-1.5">
                            <DollarSign className="w-3 h-3 text-emerald-500" />
                            {fmtPeriodDate(p.payDate)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-surface-700 dark:text-surface-200 whitespace-nowrap tabular-nums text-center">
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-surface-100 dark:bg-surface-800 text-surface-700 dark:text-surface-200 font-semibold text-[11px]">
                            {p.bs ?? '-'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
