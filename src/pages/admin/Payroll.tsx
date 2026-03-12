import { useState } from 'react'
import { format, subDays } from 'date-fns'
import { Download, Calculator, Calendar, Clock, TrendingUp, DollarSign, Moon, Settings2 } from 'lucide-react'
import { getPayroll, updateEmployeeSalary, type PayrollResponse, type PayrollEmployeeRow } from '@/lib/apiAdmin'

export default function AdminPayroll() {
  const [periodStart, setPeriodStart] = useState(format(subDays(new Date(), 14), 'yyyy-MM-dd'))
  const [periodEnd, setPeriodEnd] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [payroll, setPayroll] = useState<PayrollResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editEmployee, setEditEmployee] = useState<PayrollEmployeeRow | null>(null)
  const [editSalaryType, setEditSalaryType] = useState<'hourly' | 'monthly'>('hourly')
  const [editBaseSalary, setEditBaseSalary] = useState('')
  const [savingSalary, setSavingSalary] = useState(false)

  async function handleCalculate() {
    setError(null)
    setLoading(true)
    try {
      const data = await getPayroll({ from: periodStart, to: periodEnd })
      setPayroll(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load payroll')
    } finally {
      setLoading(false)
    }
  }

  function openEditSalary(row: PayrollEmployeeRow) {
    setEditEmployee(row)
    setEditSalaryType((row.salaryType === 'monthly' ? 'monthly' : 'hourly') as 'hourly' | 'monthly')
    if (row.salaryType === 'monthly') {
      const monthly = row.hourlyRate * 23.83 * 8
      setEditBaseSalary(String(Math.round(monthly * 100) / 100))
    } else {
      setEditBaseSalary(row.hourlyRate > 0 ? String(row.hourlyRate) : '')
    }
  }

  async function handleSaveSalary() {
    if (!editEmployee) return
    const base = parseFloat(editBaseSalary)
    if (Number.isNaN(base) || base < 0) return
    setSavingSalary(true)
    try {
      await updateEmployeeSalary(editEmployee.employeeId, {
        salaryType: editSalaryType,
        baseSalary: base,
      })
      setEditEmployee(null)
      if (payroll) await handleCalculate()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update salary')
    } finally {
      setSavingSalary(false)
    }
  }

  function exportPayrollCSV() {
    if (!payroll?.employees?.length) return
    const headers = [
      'Employee',
      'Salary type',
      'Hourly rate',
      'Regular hours',
      'OT 35% hours',
      'OT 100% hours',
      'Night hours',
      'Total hours',
      'Regular pay',
      'OT 35% pay',
      'OT 100% pay',
      'Night pay',
      'Total pay',
    ]
    const rows = payroll.employees.map((e) => [
      e.employeeName,
      e.salaryType,
      e.hourlyRate,
      e.regularHours,
      e.ot35Hours,
      e.ot100Hours,
      e.nightHours,
      e.totalHours,
      e.regularPay,
      e.ot35Pay,
      e.ot100Pay,
      e.nightPay,
      e.totalPay,
    ])
    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `payroll-${payroll.from}-to-${payroll.to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const summary = payroll?.summary

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
          <button
            type="button"
            onClick={handleCalculate}
            disabled={loading}
            className="btn-primary flex items-center justify-center gap-2 rounded-xl w-full sm:w-auto min-h-[2.75rem] disabled:opacity-60"
          >
            <Calculator className="w-4 h-4 shrink-0" />
            {loading ? 'Calculating…' : 'Calculate payroll'}
          </button>
        </div>
        {error && (
          <p className="mt-3 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
      </div>

      {summary && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
            <div className="rounded-lg sm:rounded-xl border border-surface-200/80 bg-white p-3 sm:p-5 shadow-sm min-w-0">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl bg-surface-100 flex items-center justify-center shrink-0">
                  <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-surface-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-xs font-medium text-surface-500 uppercase tracking-wider truncate">Period</p>
                  <p className="text-xs sm:text-sm font-semibold text-surface-900 mt-0.5 leading-tight truncate">{payroll.period}</p>
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
                    {summary.totalRegularHours}h
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
                  <p className="text-[10px] sm:text-xs font-medium text-surface-500 uppercase tracking-wider truncate">OT 35%</p>
                  <p className="text-lg sm:text-xl font-semibold text-surface-900 mt-0.5 tabular-nums truncate">
                    {summary.totalOt35Hours}h
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg sm:rounded-xl border border-surface-200/80 bg-white p-3 sm:p-5 shadow-sm min-w-0">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl bg-orange-50 flex items-center justify-center shrink-0">
                  <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-xs font-medium text-surface-500 uppercase tracking-wider truncate">OT 100%</p>
                  <p className="text-lg sm:text-xl font-semibold text-surface-900 mt-0.5 tabular-nums truncate">
                    {summary.totalOt100Hours}h
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg sm:rounded-xl border border-surface-200/80 bg-white p-3 sm:p-5 shadow-sm min-w-0">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                  <Moon className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-xs font-medium text-surface-500 uppercase tracking-wider truncate">Night</p>
                  <p className="text-lg sm:text-xl font-semibold text-surface-900 mt-0.5 tabular-nums truncate">
                    {summary.totalNightHours}h
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-lg sm:rounded-xl border border-brand-200/80 bg-brand-50/50 p-3 sm:p-5 shadow-sm min-w-0">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl bg-brand-100 flex items-center justify-center shrink-0">
                <DollarSign className="w-4 h-4 sm:w-5 sm:h-5 text-brand-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs font-medium text-brand-700 uppercase tracking-wider truncate">Total amount</p>
                <p className="text-lg sm:text-xl font-semibold text-surface-900 mt-0.5 tabular-nums truncate">
                  ${summary.totalPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl sm:rounded-2xl border border-surface-200/80 bg-white p-4 sm:p-6 shadow-sm overflow-x-auto">
            <h2 className="text-sm sm:text-base font-semibold text-surface-900 mb-3">Employee payroll</h2>
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-surface-200">
                  <th className="py-2 pr-2 font-medium text-surface-700">Employee</th>
                  <th className="py-2 pr-2 font-medium text-surface-700 text-right">Rate</th>
                  <th className="py-2 pr-2 font-medium text-surface-700 text-right">Regular h</th>
                  <th className="py-2 pr-2 font-medium text-surface-700 text-right">OT 35% h</th>
                  <th className="py-2 pr-2 font-medium text-surface-700 text-right">OT 100% h</th>
                  <th className="py-2 pr-2 font-medium text-surface-700 text-right">Night h</th>
                  <th className="py-2 pr-2 font-medium text-surface-700 text-right">Total h</th>
                  <th className="py-2 pr-2 font-medium text-surface-700 text-right">Regular pay</th>
                  <th className="py-2 pr-2 font-medium text-surface-700 text-right">OT 35% pay</th>
                  <th className="py-2 pr-2 font-medium text-surface-700 text-right">OT 100% pay</th>
                  <th className="py-2 pr-2 font-medium text-surface-700 text-right">Night pay</th>
                  <th className="py-2 pr-2 font-medium text-surface-700 text-right">Total pay</th>
                  <th className="py-2 pl-2 w-10" aria-label="Edit salary" />
                </tr>
              </thead>
              <tbody>
                {payroll.employees.map((row) => (
                  <tr key={row.employeeId} className="border-b border-surface-100">
                    <td className="py-2 pr-2 text-surface-900">{row.employeeName}</td>
                    <td className="py-2 pr-2 text-right tabular-nums text-surface-700">
                      ${row.hourlyRate.toFixed(2)} ({row.salaryType})
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums">{row.regularHours}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{row.ot35Hours}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{row.ot100Hours}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{row.nightHours}</td>
                    <td className="py-2 pr-2 text-right tabular-nums font-medium">{row.totalHours}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">${row.regularPay.toFixed(2)}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">${row.ot35Pay.toFixed(2)}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">${row.ot100Pay.toFixed(2)}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">${row.nightPay.toFixed(2)}</td>
                    <td className="py-2 pr-2 text-right tabular-nums font-semibold">${row.totalPay.toFixed(2)}</td>
                    <td className="py-2 pl-2">
                      <button
                        type="button"
                        onClick={() => openEditSalary(row)}
                        className="p-1.5 rounded-lg text-surface-500 hover:bg-surface-100 hover:text-surface-700"
                        title="Edit salary"
                      >
                        <Settings2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl sm:rounded-2xl border border-surface-200/80 bg-white p-4 sm:p-6 shadow-sm">
            <h2 className="text-sm sm:text-base font-semibold text-surface-900 mb-0.5 sm:mb-1">Export</h2>
            <p className="text-xs sm:text-sm text-surface-500 mb-4 sm:mb-5">
              Export payroll data for your accounting or payroll system.
            </p>
            <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3">
              <button
                type="button"
                onClick={exportPayrollCSV}
                className="btn-secondary flex items-center justify-center gap-2 rounded-xl w-full sm:w-auto min-h-[2.75rem]"
              >
                <Download className="w-4 h-4 shrink-0" />
                Export CSV
              </button>
            </div>
          </div>
        </>
      )}

      {editEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" role="dialog" aria-modal="true" aria-labelledby="edit-salary-title">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <h2 id="edit-salary-title" className="text-lg font-semibold text-surface-900 mb-4">
              Set salary — {editEmployee.employeeName}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="label">Salary type</label>
                <select
                  value={editSalaryType}
                  onChange={(e) => setEditSalaryType(e.target.value as 'hourly' | 'monthly')}
                  className="input w-full rounded-xl min-h-[2.75rem]"
                >
                  <option value="hourly">Hourly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              <div>
                <label className="label">
                  {editSalaryType === 'monthly' ? 'Monthly salary' : 'Hourly rate'}
                </label>
                <input
                  type="number"
                  min={0}
                  step={editSalaryType === 'monthly' ? 100 : 0.01}
                  className="input w-full rounded-xl min-h-[2.75rem]"
                  value={editBaseSalary}
                  onChange={(e) => setEditBaseSalary(e.target.value)}
                  placeholder={editSalaryType === 'monthly' ? 'e.g. 25000' : 'e.g. 150'}
                />
              </div>
            </div>
            <div className="mt-6 flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setEditEmployee(null)}
                className="btn-secondary rounded-xl min-h-[2.75rem] px-4"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveSalary}
                disabled={savingSalary || !editBaseSalary || parseFloat(editBaseSalary) < 0}
                className="btn-primary rounded-xl min-h-[2.75rem] px-4 disabled:opacity-60"
              >
                {savingSalary ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
