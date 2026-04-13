import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addMonths, subMonths, isSameMonth, isWithinInterval } from 'date-fns'
import { ChevronLeft, ChevronRight, Calculator, CalendarDays, Calendar } from 'lucide-react'
import { getPayrollPeriods, type PayrollPeriod } from '@/lib/apiAdmin'
import AdminSelect from '@/components/AdminSelect'
import { PageHeader } from '@/components/PageHeader'


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
    const week: Date[]=[]
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

  return (
    <div className="page">
      <PageHeader
        title="Payroll calendar"
        subtitle="Bi-weekly periods (DR) or pick a week on the calendar."
        icon={<Calendar className="w-5 h-5" />}
      />

      <div className="rounded-xl sm:rounded-2xl border border-surface-200/80 bg-white p-4 sm:p-6 shadow-sm">
        <h2 className="text-sm sm:text-base font-semibold text-surface-900 mb-1 flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-surface-600" />
          Bi-weekly periods
        </h2>
        <p className="text-xs sm:text-sm text-surface-500 mb-4">Pay periods and pay dates per TSS calendar. Run payroll for a period.</p>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-4">
          <label className="label mb-0">Year</label>
          <div className="w-28">
            <AdminSelect
              value={String(periodsYear)}
              onChange={(val) => setPeriodsYear(parseInt(val, 10))}
              options={[currentYear - 1, currentYear, currentYear + 1].map((y) => ({
                value: String(y),
                label: y,
              }))}
            />
          </div>
        </div>
        {periods.length === 0 ? (
          <div className="p-6 text-center text-surface-500 text-sm rounded-xl bg-surface-50/80 border border-surface-100">No bi-weekly periods loaded for this year. Use the calendar below to pick a week.</div>
        ) : (
          <div className="overflow-x-auto max-h-[320px] overflow-y-auto border border-surface-100 rounded-xl">
            <table className="w-full min-w-[620px] text-sm border-collapse">
              <thead className="sticky top-0 bg-surface-50">
                <tr>
                  <th className="py-3 px-4 text-left font-medium text-surface-700">Cycle</th>
                  <th className="py-3 px-4 text-left font-medium text-surface-700">Period</th>
                  <th className="py-3 px-4 text-left font-medium text-surface-700">Pay date</th>
                  <th className="py-3 px-4 w-36" />
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => (
                  <tr key={p.cycleCode} className="border-t border-surface-100 transition-colors duration-150 hover:bg-surface-50/80">
                    <td className="py-3 px-4 font-medium text-surface-900">{p.cycleCode}</td>
                    <td className="py-3 px-4 text-surface-600">{p.periodFrom} – {p.periodTo}</td>
                    <td className="py-3 px-4 text-surface-600">{p.payDate}</td>
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        onClick={() => runPayrollForPeriod(p.periodFrom, p.periodTo)}
                        className="btn-primary flex items-center justify-center gap-2 rounded-xl min-h-[2.5rem] px-3 text-sm transition-all duration-200 hover:shadow-md active:scale-[0.98]"
                      >
                        <Calculator className="w-4 h-4" />
                        Run payroll
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl sm:rounded-2xl border border-surface-200/80 bg-white p-5 sm:p-6 shadow-sm min-w-0">
        <h2 className="text-base sm:text-lg font-bold text-surface-900 mb-0.5">Or pick a week on the calendar</h2>
        <p className="text-sm text-surface-500 mb-5">Select a week to set the pay period, then run payroll.</p>

        <div className="flex items-center justify-between gap-2 mb-5">
          <button
            type="button"
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="flex items-center justify-center w-10 h-10 rounded-lg text-surface-600 hover:bg-surface-100 hover:text-surface-900 active:scale-95 transition-all duration-200"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <p className="text-base sm:text-lg font-semibold text-surface-900 tabular-nums text-center">{format(currentMonth, 'MMMM yyyy')}</p>
          <button
            type="button"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="flex items-center justify-center w-10 h-10 rounded-lg text-surface-600 hover:bg-surface-100 hover:text-surface-900 active:scale-95 transition-all duration-200"
            aria-label="Next month"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse" role="grid" aria-label="Calendar">
            <thead>
              <tr>
                {weekDayNames.map((day) => (
                  <th key={day} className="py-2.5 text-center text-sm font-medium text-surface-600">
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((week, wi) => (
                <tr key={wi}>
                  {week.map((day) => {
                    const inMonth = isSameMonth(day, currentMonth)
                    const weekStart = startOfWeek(day, { weekStartsOn: 0 })
                    const weekEnd = endOfWeek(day, { weekStartsOn: 0 })
                    const isSelected =
                      selectedFrom &&
                      selectedTo &&
                      isWithinInterval(day, { start: new Date(selectedFrom), end: new Date(selectedTo) })
                    return (
                      <td
                        key={day.toISOString()}
                        className={`p-0.5 sm:p-1 text-center align-middle ${
                          !inMonth ? 'text-surface-400' : 'text-surface-900'
                        } ${isSelected ? 'bg-brand-100' : ''}`}
                      >
                        <button
                          type="button"
                          onClick={() => selectWeek(weekStart, weekEnd)}
                          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center mx-auto text-sm font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 hover:scale-110 active:scale-95 ${
                            !inMonth
                              ? 'text-surface-400 hover:bg-surface-100 hover:text-surface-500'
                              : isSelected
                                ? 'bg-brand-100 text-brand-700 ring-1 ring-brand-500/50 hover:bg-brand-200 hover:shadow-sm'
                                : 'hover:bg-surface-200 hover:shadow-sm'
                          }`}
                        >
                          {format(day, 'd')}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selectedFrom && selectedTo && (
          <div className="mt-5 p-4 rounded-xl bg-surface-50 border border-surface-200 transition-shadow duration-200 hover:shadow-md">
            <p className="text-sm text-surface-700">
              Selected period: <strong>{selectedFrom}</strong> – <strong>{selectedTo}</strong>
            </p>
            <button
              type="button"
              onClick={runPayroll}
              className="btn-primary flex items-center justify-center gap-2 rounded-xl min-h-[2.75rem] px-4 mt-3 w-full sm:w-auto transition-all duration-200 hover:shadow-md active:scale-[0.98]"
            >
              <Calculator className="w-4 h-4 shrink-0" />
              Run payroll for this period
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
