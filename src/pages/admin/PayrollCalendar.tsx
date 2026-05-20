import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addMonths, subMonths, isSameMonth, isWithinInterval, isSameDay } from 'date-fns'
import { ChevronLeft, ChevronRight, Calculator, CalendarDays, Calendar, Clock, DollarSign } from 'lucide-react'
import { getPayrollPeriods, type PayrollPeriod } from '@/lib/apiAdmin'
import AdminSelect from '@/components/AdminSelect'
import { PageHeader } from '@/components/PageHeader'

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function fmtPeriodDate(d: string): string {
  // Input: YYYY-MM-DD → Output: MMM-DD-YYYY
  if (!d || d.length < 10) return d
  const [y, m, day] = d.split('-')
  return `${MONTHS_SHORT[parseInt(m, 10) - 1]}-${day}-${y}`
}

export default function AdminPayrollCalendar() {
  const navigate = useNavigate()
  const currentYear = new Date().getFullYear()
  const [periodsYear, setPeriodsYear] = useState(currentYear)
  const [periods, setPeriods] = useState<PayrollPeriod[]>([])
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedFrom, setSelectedFrom] = useState<string | null>(null)
  const [selectedTo, setSelectedTo] = useState<string | null>(null)

  useEffect(() => {
    getPayrollPeriods(periodsYear).then(setPeriods).catch(() => setPeriods([]))
  }, [periodsYear])

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })
  const weeks: Date[][] = []
  let d = new Date(calStart)
  while (d <= calEnd) {
    const week: Date[] = []
    for (let i = 0; i < 7; i++) {
      week.push(new Date(d))
      d.setDate(d.getDate() + 1)
    }
    weeks.push(week)
  }

  function selectWeek(weekStart: Date, weekEnd: Date) {
    setSelectedFrom(format(weekStart, 'yyyy-MM-dd'))
    setSelectedTo(format(weekEnd, 'yyyy-MM-dd'))
  }

  function runPayroll() {
    if (selectedFrom && selectedTo) {
      navigate(`/admin/payroll?from=${selectedFrom}&to=${selectedTo}`)
    }
  }

  const weekDayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  function runPayrollForPeriod(periodFrom: string, periodTo: string) {
    navigate(`/admin/payroll?from=${periodFrom}&to=${periodTo}`)
  }

  const today = new Date()

  return (
    <div className="page">
      <PageHeader
        title="Payroll calendar"
        subtitle="Choose a TSS bi-weekly period or pick any custom week."
        icon={<Calendar className="w-5 h-5" />}
      />

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 sm:gap-5">
        {/* Bi-weekly periods - spans 3 cols on xl */}
        <div className="card xl:col-span-3 overflow-hidden flex flex-col">
          <div className="card-header">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-brand-50 border border-brand-100 text-brand-600 flex items-center justify-center shrink-0">
                <CalendarDays className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-surface-900 dark:text-surface-50">Bi-weekly periods</h2>
                <p className="text-[11px] text-surface-500 dark:text-surface-400 dark:text-surface-500 mt-0.5">TSS calendar pay periods · run payroll for a cycle</p>
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
                <p className="empty-state-description">Pick a year above or use the calendar to choose a custom week.</p>
              </div>
            ) : (
              <div className="overflow-auto max-h-[420px]">
                <table className="w-full min-w-[520px] text-left border-collapse">
                  <thead className="sticky top-0 bg-surface-50/95 backdrop-blur-sm shadow-[0_1px_0_0_theme(colors.surface.200)] z-10">
                    <tr>
                      <th className="px-4 py-2.5 text-[10px] font-semibold text-surface-500 dark:text-surface-400 dark:text-surface-500 uppercase tracking-wider">Cycle</th>
                      <th className="px-4 py-2.5 text-[10px] font-semibold text-surface-500 dark:text-surface-400 dark:text-surface-500 uppercase tracking-wider">Period</th>
                      <th className="px-4 py-2.5 text-[10px] font-semibold text-surface-500 dark:text-surface-400 dark:text-surface-500 uppercase tracking-wider">Pay date</th>
                      <th className="px-4 py-2.5 text-[10px] font-semibold text-surface-500 dark:text-surface-400 dark:text-surface-500 uppercase tracking-wider text-center">Payment #</th>
                      <th className="px-4 py-2.5 w-28" />
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
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => runPayrollForPeriod(p.periodFrom, p.periodTo)}
                              className="btn-primary btn-sm"
                            >
                              <Calculator className="w-3.5 h-3.5" />
                              Run
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
        </div>

        {/* Calendar picker - spans 2 cols on xl */}
        <div className="card xl:col-span-2 overflow-hidden flex flex-col">
          <div className="card-header">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-violet-50 border border-violet-100 text-violet-600 flex items-center justify-center shrink-0">
                <Calendar className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-surface-900 dark:text-surface-50">Custom week</h2>
                <p className="text-[11px] text-surface-500 dark:text-surface-400 dark:text-surface-500 mt-0.5">Pick a week to set the pay period</p>
              </div>
            </div>
          </div>

          <div className="p-4">
            {/* Month navigation */}
            <div className="flex items-center justify-between mb-4">
              <button
                type="button"
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                className="btn-icon text-surface-500 dark:text-surface-400 dark:text-surface-500 hover:text-surface-900 dark:text-surface-50 hover:bg-surface-100 dark:hover:bg-surface-700 dark:bg-surface-800"
                aria-label="Previous month"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <p className="text-sm font-semibold text-surface-900 dark:text-surface-50 tabular-nums">{format(currentMonth, 'MMMM yyyy')}</p>
              <button
                type="button"
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                className="btn-icon text-surface-500 dark:text-surface-400 dark:text-surface-500 hover:text-surface-900 dark:text-surface-50 hover:bg-surface-100 dark:hover:bg-surface-700 dark:bg-surface-800"
                aria-label="Next month"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Weekday labels */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {weekDayNames.map((day) => (
                <div key={day} className="text-[10px] font-semibold text-surface-400 dark:text-surface-500 uppercase tracking-wider text-center py-1">
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="flex flex-col gap-1">
              {weeks.map((week, wi) => {
                const weekStart = startOfWeek(week[0], { weekStartsOn: 0 })
                const weekEnd = endOfWeek(week[0], { weekStartsOn: 0 })
                const weekSelected =
                  selectedFrom &&
                  selectedTo &&
                  isSameDay(weekStart, new Date(selectedFrom))
                return (
                  <div
                    key={wi}
                    className={`grid grid-cols-7 gap-1 rounded-xl p-0.5 transition-colors cursor-pointer ${
                      weekSelected ? 'bg-brand-50 ring-1 ring-brand-300' : 'hover:bg-surface-50 dark:hover:bg-surface-800 dark:bg-surface-900'
                    }`}
                    onClick={() => selectWeek(weekStart, weekEnd)}
                    role="button"
                    tabIndex={0}
                  >
                    {week.map((day) => {
                      const inMonth = isSameMonth(day, currentMonth)
                      const isToday = isSameDay(day, today)
                      const isInSelected =
                        selectedFrom &&
                        selectedTo &&
                        isWithinInterval(day, { start: new Date(selectedFrom), end: new Date(selectedTo) })
                      return (
                        <div
                          key={day.toISOString()}
                          className="flex items-center justify-center"
                        >
                          <div
                            className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-medium transition-colors ${
                              !inMonth
                                ? 'text-surface-300'
                                : isInSelected
                                  ? 'bg-brand-600 text-white shadow-sm'
                                  : isToday
                                    ? 'text-brand-700 font-bold ring-1 ring-brand-300 bg-brand-50'
                                    : 'text-surface-700 dark:text-surface-200'
                            }`}
                          >
                            {format(day, 'd')}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>

            <p className="text-[11px] text-surface-400 dark:text-surface-500 mt-3 text-center">
              <Clock className="w-3 h-3 inline mr-1 -mt-0.5" />
              Click any row to select that week
            </p>
          </div>

          {selectedFrom && selectedTo && (
            <div className="border-t border-surface-100 dark:border-surface-800 bg-brand-50/40 p-4">
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-brand-700 uppercase tracking-wider">Selected period</span>
                  <button
                    type="button"
                    onClick={() => { setSelectedFrom(null); setSelectedTo(null) }}
                    className="text-[11px] text-surface-500 dark:text-surface-400 dark:text-surface-500 hover:text-surface-700 dark:text-surface-200 font-medium"
                  >
                    Clear
                  </button>
                </div>
                <p className="text-sm font-semibold text-surface-900 dark:text-surface-50 tabular-nums">
                  {format(new Date(selectedFrom), 'MMM d')} – {format(new Date(selectedTo), 'MMM d, yyyy')}
                </p>
                <button
                  type="button"
                  onClick={runPayroll}
                  className="btn-primary w-full"
                >
                  <Calculator className="w-4 h-4 shrink-0" />
                  Run payroll for this period
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
