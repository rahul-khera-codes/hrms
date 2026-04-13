import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { format, subDays } from 'date-fns'
import { Download, Calculator, Calendar, Clock, TrendingUp, DollarSign, Moon, Settings2, Plus, Trash2, ChevronDown, List, FileDown, FileText } from 'lucide-react'
import {
  getPayroll,
  updateEmployeeSalary,
  createPayrollLineItem,
  deletePayrollLineItem,
  setPayrollDeductions,
  downloadPayrollSlipPdf,
  type PayrollResponse,
  type PayrollEmployeeRow,
} from '@/lib/apiAdmin'
import AdminDatePicker from '@/components/AdminDatePicker'
import AdminSelect from '@/components/AdminSelect'
import { PageHeader } from '@/components/PageHeader'

const PAYROLL_ROWS_PER_PAGE = 10

function PayrollRow({
  row,
  onEditSalary,
  onAddItem,
  onSaveDeductions,
  onDeleteLineItem,
  onDownloadPdf,
  pdfDownloading,
  deductionSaving,
}: {
  row: PayrollEmployeeRow
  otPercent: number
  nightPercent: number
  onEditSalary: () => void
  onAddItem: (type: 'bonus' | 'incentive' | 'deduction' | 'passthrough_credit') => void
  onSaveDeductions: (row: PayrollEmployeeRow, ss: number, tax: number, infotep: number) => void
  onDeleteLineItem: (id: string) => void
  onDownloadPdf: () => void | Promise<void>
  pdfDownloading: boolean
  deductionSaving: boolean
}) {
  const [showItemDropdown, setShowItemDropdown] = useState(false)
  const [showItemsList, setShowItemsList] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const itemsListRef = useRef<HTMLDivElement>(null)
  const num = (v: unknown): string => {
    if (v === undefined || v === null) return '0.00'
    const n = Number(v)
    return Number.isNaN(n) ? '0.00' : n.toFixed(2)
  }
  const [ss, setSs] = useState(() => num(row.socialSecurity))
  const [tax, setTax] = useState(() => num(row.tax))
  const [infotep, setInfotep] = useState(() => num(row.infotep))

  useEffect(() => {
    setSs(num(row.socialSecurity))
    setTax(num(row.tax))
    setInfotep(num(row.infotep))
  }, [row.socialSecurity, row.tax, row.infotep])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowItemDropdown(false)
      }
      if (itemsListRef.current && !itemsListRef.current.contains(event.target as Node)) {
        setShowItemsList(false)
      }
    }
    if (showItemDropdown || showItemsList) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showItemDropdown, showItemsList])

  const handleDeductionsBlur = () => {
    const s = parseFloat(ss)
    const t = parseFloat(tax)
    const i = parseFloat(infotep)
    if (!Number.isNaN(s) && !Number.isNaN(t) && !Number.isNaN(i) && (s >= 0 && t >= 0 && i >= 0)) {
      onSaveDeductions(row, Number.isNaN(s) ? 0 : s, Number.isNaN(t) ? 0 : t, Number.isNaN(i) ? 0 : i)
    }
  }

  return (
    <tr className="bg-white border-b border-surface-100 hover:bg-surface-50/70 transition-colors">
      <td className="py-3.5 px-4 text-surface-900 font-medium whitespace-nowrap">{row.employeeName}</td>
      <td className="py-3.5 px-4 text-center tabular-nums text-surface-700 whitespace-nowrap">
        ${row.hourlyRate.toFixed(2)} ({row.salaryType})
      </td>
      <td className="py-3.5 px-4 text-center tabular-nums whitespace-nowrap">{row.regularHours}</td>
      <td className="py-3.5 px-4 text-center tabular-nums whitespace-nowrap">{row.ot35Hours}</td>
      <td className="py-3.5 px-4 text-center tabular-nums whitespace-nowrap">{row.ot100Hours}</td>
      <td className="py-3.5 px-4 text-center tabular-nums whitespace-nowrap">{row.nightHours}</td>
      <td className="py-3.5 px-4 text-center tabular-nums whitespace-nowrap">{row.holidayScheduledHours ?? 0}</td>
      <td className="py-3.5 px-4 text-center tabular-nums whitespace-nowrap">{row.holidayWorkedHours ?? 0}</td>
      <td className="py-3.5 px-4 text-center tabular-nums font-medium whitespace-nowrap">{row.totalHours}</td>
      <td className="py-3.5 px-4 text-center tabular-nums whitespace-nowrap">${row.regularPay.toFixed(2)}</td>
      <td className="py-3.5 px-4 text-center tabular-nums whitespace-nowrap">${row.ot35Pay.toFixed(2)}</td>
      <td className="py-3.5 px-4 text-center tabular-nums whitespace-nowrap">${row.ot100Pay.toFixed(2)}</td>
      <td className="py-3.5 px-4 text-center tabular-nums whitespace-nowrap">${row.nightPay.toFixed(2)}</td>
      <td className="py-3.5 px-4 text-center tabular-nums whitespace-nowrap">${(row.holidayPay ?? 0).toFixed(2)}</td>
      <td className="py-3.5 px-4 text-center tabular-nums font-semibold whitespace-nowrap">${row.totalPay.toFixed(2)}</td>
      <td className="py-3.5 px-4 text-center tabular-nums text-green-600 whitespace-nowrap">
        ${(row.additionsTotal ?? 0).toFixed(2)}
      </td>
      <td className="py-3.5 px-4 text-center tabular-nums text-red-600 whitespace-nowrap">
        ${(row.deductionsTotal ?? 0).toFixed(2)}
      </td>
      <td className="py-3.5 px-4 text-center">
        <input
          type="number"
          min={0}
          step={0.01}
          className="input w-20 text-center py-1.5 text-sm rounded-lg"
          value={ss}
          onChange={(e) => setSs(e.target.value)}
          onBlur={handleDeductionsBlur}
          disabled={deductionSaving}
        />
      </td>
      <td className="py-3.5 px-4 text-center">
        <input
          type="number"
          min={0}
          step={0.01}
          className="input w-20 text-center py-1.5 text-sm rounded-lg"
          value={tax}
          onChange={(e) => setTax(e.target.value)}
          onBlur={handleDeductionsBlur}
          disabled={deductionSaving}
        />
      </td>
      <td className="py-3.5 px-4 text-center">
        <input
          type="number"
          min={0}
          step={0.01}
          className="input w-20 text-center py-1.5 text-sm rounded-lg"
          value={infotep}
          onChange={(e) => setInfotep(e.target.value)}
          onBlur={handleDeductionsBlur}
          disabled={deductionSaving}
        />
      </td>
      <td className="py-3.5 px-4 text-center tabular-nums font-semibold whitespace-nowrap">${(row.netPay ?? row.totalPay).toFixed(2)}</td>
      <td className="py-3.5 px-4">
        <div className="flex items-center justify-start gap-1.5">
          {/* Add Item Button */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setShowItemDropdown(!showItemDropdown)}
              className="inline-flex items-center justify-center gap-1 rounded-lg border border-dashed border-surface-300 bg-surface-50/50 py-1.5 px-2.5 text-xs font-medium text-surface-600 hover:bg-brand-50 hover:border-brand-300 hover:text-brand-600 transition-colors duration-150 whitespace-nowrap"
              title="Add bonus, incentive, or deduction"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Add</span>
              <ChevronDown className={`w-3 h-3 transition-transform duration-200 shrink-0 ${showItemDropdown ? 'rotate-180' : ''}`} />
            </button>
            {showItemDropdown && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-surface-200 rounded-lg shadow-lg z-50 min-w-max">
                <button
                  type="button"
                  onClick={() => {
                    onAddItem('bonus')
                    setShowItemDropdown(false)
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-surface-700 hover:bg-surface-50 first:rounded-t-lg transition-colors"
                >
                  Bonus
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onAddItem('incentive')
                    setShowItemDropdown(false)
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-surface-700 hover:bg-surface-50 transition-colors"
                >
                  Incentive
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onAddItem('deduction')
                    setShowItemDropdown(false)
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-surface-700 hover:bg-surface-50 transition-colors"
                >
                  Deduction
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onAddItem('passthrough_credit')
                    setShowItemDropdown(false)
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-surface-700 hover:bg-surface-50 last:rounded-b-lg transition-colors"
                >
                  Passthrough credit
                </button>
              </div>
            )}
          </div>

          {/* View Items Button */}
          {(row.lineItems ?? []).length > 0 && (
            <div className="relative" ref={itemsListRef}>
              <button
                type="button"
                onClick={() => setShowItemsList(!showItemsList)}
                className="relative inline-flex items-center justify-center p-1.5 rounded-lg text-surface-500 hover:bg-surface-100 hover:text-surface-700 transition-colors"
                title="View added items"
              >
                <List className="w-4 h-4" />
                <span className="absolute top-0 right-0 flex items-center justify-center w-4 h-4 bg-brand-500 text-white text-xs rounded-full font-semibold">
                  {(row.lineItems ?? []).length}
                </span>
              </button>
              {showItemsList && (
                <div className="absolute top-full right-0 mt-1 bg-white border border-surface-200 rounded-lg shadow-lg z-50 w-80 max-h-72 overflow-y-auto">
                  <div className="sticky top-0 bg-surface-50 p-3 border-b border-surface-100 rounded-t-lg">
                    <h3 className="text-xs font-semibold text-surface-900">Added Items ({(row.lineItems ?? []).length})</h3>
                  </div>
                  <div className="divide-y divide-surface-100">
                    {(row.lineItems ?? []).map((it) => (
                      <div key={it.id} className="p-3 flex items-start justify-between gap-2 hover:bg-surface-50 transition-colors">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-surface-700 capitalize">
                            {it.type.replace(/_/g, ' ')}
                          </p>
                          {it.label && <p className="text-xs text-surface-600 truncate">{it.label}</p>}
                          <p className="text-xs font-semibold text-surface-900 mt-1">
                            ${Math.abs(it.amount).toFixed(2)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            onDeleteLineItem(it.id)
                            setShowItemsList(false)
                          }}
                          className="shrink-0 p-1.5 rounded text-surface-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                          title="Delete item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </td>
      <td className="py-3.5 px-4">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onDownloadPdf}
            disabled={pdfDownloading}
            className="p-2 rounded-lg text-surface-500 hover:bg-surface-100 hover:text-brand-600 disabled:opacity-50"
            title="Download PDF pay slip"
          >
            {pdfDownloading ? (
              <span className="inline-block w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              <FileDown className="w-4 h-4" />
            )}
          </button>
          <button type="button" onClick={onEditSalary} className="p-2 rounded-lg text-surface-500 hover:bg-surface-100 hover:text-surface-700" title="Edit salary">
            <Settings2 className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  )
}

export default function AdminPayroll() {
  const [searchParams] = useSearchParams()
  const fromParam = searchParams.get('from')
  const toParam = searchParams.get('to')
  const [periodStart, setPeriodStart] = useState(format(subDays(new Date(), 14), 'yyyy-MM-dd'))
  const [periodEnd, setPeriodEnd] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [payroll, setPayroll] = useState<PayrollResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editEmployee, setEditEmployee] = useState<PayrollEmployeeRow | null>(null)
  const [editSalaryType, setEditSalaryType] = useState<'hourly' | 'monthly'>('hourly')
  const [editBaseSalary, setEditBaseSalary] = useState('')
  const [savingSalary, setSavingSalary] = useState(false)
  const [addItemRow, setAddItemRow] = useState<PayrollEmployeeRow | null>(null)
  const [itemType, setItemType] = useState<'bonus' | 'incentive' | 'deduction' | 'passthrough_credit'>('bonus')
  const [itemLabel, setItemLabel] = useState('')
  const [itemAmount, setItemAmount] = useState('')
  const [savingItem, setSavingItem] = useState(false)
  const [deductionSaving, setDeductionSaving] = useState<string | null>(null)
  const [pdfLoadingEmployeeId, setPdfLoadingEmployeeId] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => {
    if (fromParam && toParam) {
      setPeriodStart(fromParam)
      setPeriodEnd(toParam)
    }
  }, [fromParam, toParam])

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

  async function handleSaveDeductions(row: PayrollEmployeeRow, socialSecurity: number, tax: number, infotep: number) {
    if (!payroll) return
    setDeductionSaving(row.employeeId)
    try {
      await setPayrollDeductions({
        employeeId: row.employeeId,
        periodFrom: payroll.from,
        periodTo: payroll.to,
        socialSecurity,
        tax,
        infotep,
      })
      await handleCalculate()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save deductions')
    } finally {
      setDeductionSaving(null)
    }
  }

  async function handleAddLineItem() {
    if (!addItemRow || !payroll) return
    const amount = parseFloat(itemAmount)
    if (Number.isNaN(amount)) return
    setSavingItem(true)
    try {
      await createPayrollLineItem({
        employeeId: addItemRow.employeeId,
        periodFrom: payroll.from,
        periodTo: payroll.to,
        type: itemType,
        label: itemLabel.trim() || undefined,
        amount,
      })
      setAddItemRow(null)
      setItemLabel('')
      setItemAmount('')
      await handleCalculate()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to add item')
    } finally {
      setSavingItem(false)
    }
  }

  async function handleDeleteLineItem(itemId: string) {
    try {
      await deletePayrollLineItem(itemId)
      if (payroll) await handleCalculate()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete item')
    }
  }

  async function handleDownloadPaySlip(employeeId: string) {
    if (!payroll) return
    setPdfLoadingEmployeeId(employeeId)
    setError(null)
    try {
      await downloadPayrollSlipPdf({
        employeeId,
        from: payroll.from,
        to: payroll.to,
      })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to download pay slip')
    } finally {
      setPdfLoadingEmployeeId(null)
    }
  }

  function exportPayrollCSV() {
    if (!payroll?.employees?.length) return
    const otPct = payroll?.rulesUsed ? Math.round((payroll.rulesUsed.otMultiplier - 1) * 100) : 35
    const nightPct = payroll?.rulesUsed ? Math.round((payroll.rulesUsed.nightMultiplier - 1) * 100) : 15
    const headers = [
      'Employee',
      'Salary type',
      'Hourly rate',
      'Regular hours',
      `OT ${otPct}% hours`,
      'OT 100% hours',
      `Night ${nightPct}% hours`,
      'Holiday scheduled hours',
      'Holiday worked hours',
      'Total hours',
      'Regular pay',
      `OT ${otPct}% pay`,
      'OT 100% pay',
      `Night ${nightPct}% pay`,
      'Holiday pay',
      'Total pay',
      'Additions',
      'Deductions',
      'Social Security',
      'Tax',
      'INFOTEP',
      'Net pay',
    ]
    const rows = payroll.employees.map((e) => [
      e.employeeName,
      e.salaryType,
      e.hourlyRate,
      e.regularHours,
      e.ot35Hours,
      e.ot100Hours,
      e.nightHours,
      e.holidayScheduledHours ?? 0,
      e.holidayWorkedHours ?? 0,
      e.totalHours,
      e.regularPay,
      e.ot35Pay,
      e.ot100Pay,
      e.nightPay,
      e.holidayPay ?? 0,
      e.totalPay,
      e.additionsTotal ?? 0,
      e.deductionsTotal ?? 0,
      e.socialSecurity ?? 0,
      e.tax ?? 0,
      e.infotep ?? 0,
      e.netPay ?? e.totalPay,
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
  const otPercent = payroll?.rulesUsed ? Math.round((payroll.rulesUsed.otMultiplier - 1) * 100) : 35
  const nightPercent = payroll?.rulesUsed ? Math.round((payroll.rulesUsed.nightMultiplier - 1) * 100) : 15
  const payrollEmployees = payroll?.employees ?? []
  const totalPages = Math.max(1, Math.ceil(payrollEmployees.length / PAYROLL_ROWS_PER_PAGE))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const pageStart = (safeCurrentPage - 1) * PAYROLL_ROWS_PER_PAGE
  const paginatedEmployees = payrollEmployees.slice(pageStart, pageStart + PAYROLL_ROWS_PER_PAGE)

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  return (
    <div className="page overflow-x-hidden">
      <PageHeader
        title="Payroll"
        subtitle="Calculate and export payroll from attendance data."
        icon={<FileText className="w-5 h-5" />}
      />


      <div className="rounded-xl sm:rounded-2xl border border-surface-200/80 bg-white p-4 sm:p-6 shadow-sm">
        <h2 className="text-sm sm:text-base font-semibold text-surface-900 mb-0.5 sm:mb-1">Pay period</h2>
        <p className="text-xs sm:text-sm text-surface-500 mb-4 sm:mb-5">Select the date range to calculate</p>
        <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4 items-stretch sm:items-end">
          <div className="flex-1 sm:flex-initial min-w-0">
            <label className="label">Start date</label>
            <div className="sm:w-40">
              <AdminDatePicker value={periodStart} onChange={(val) => setPeriodStart(val)} />
            </div>
          </div>
          <div className="flex-1 sm:flex-initial min-w-0">
            <label className="label">End date</label>
            <div className="sm:w-40">
              <AdminDatePicker value={periodEnd} onChange={(val) => setPeriodEnd(val)} />
            </div>
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
                  <p className="text-[10px] sm:text-xs font-medium text-surface-500 uppercase tracking-wider truncate">OT {otPercent}%</p>
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
                  <p className="text-[10px] sm:text-xs font-medium text-surface-500 uppercase tracking-wider truncate">Night {nightPercent}%</p>
                  <p className="text-lg sm:text-xl font-semibold text-surface-900 mt-0.5 tabular-nums truncate">
                    {summary.totalNightHours}h
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg sm:rounded-xl border border-surface-200/80 bg-white p-3 sm:p-5 shadow-sm min-w-0">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl bg-rose-50 flex items-center justify-center shrink-0">
                  <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-rose-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-xs font-medium text-surface-500 uppercase tracking-wider truncate">Holiday pay</p>
                  <p className="text-lg sm:text-xl font-semibold text-surface-900 mt-0.5 tabular-nums truncate">
                    ${Number(summary.totalHolidayPay ?? 0).toFixed(2)}
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
                <p className="text-[10px] sm:text-xs font-medium text-brand-700 uppercase tracking-wider truncate">Total gross</p>
                <p className="text-lg sm:text-xl font-semibold text-surface-900 mt-0.5 tabular-nums truncate">
                  ${summary.totalPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </div>
          {summary.totalNetPay != null && (
            <div className="rounded-lg sm:rounded-xl border border-green-200/80 bg-green-50/50 p-3 sm:p-5 shadow-sm min-w-0">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-xs font-medium text-green-700 uppercase tracking-wider truncate">Total net pay</p>
                  <p className="text-lg sm:text-xl font-semibold text-surface-900 mt-0.5 tabular-nums truncate">
                    ${summary.totalNetPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                  {(summary.totalAdditions !== undefined && summary.totalAdditions > 0) ||
                   (summary.totalDeductions !== undefined && summary.totalDeductions > 0) ||
                   (summary.totalGovDeductions !== undefined && summary.totalGovDeductions > 0) ? (
                    <p className="text-xs text-surface-500 mt-1">
                      +Additions ${(summary.totalAdditions ?? 0).toFixed(2)} −Deductions ${(summary.totalDeductions ?? 0).toFixed(2)} −Gov ${(summary.totalGovDeductions ?? 0).toFixed(2)}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          )}

          <div className="rounded-xl sm:rounded-2xl border border-surface-200/80 bg-white p-4 sm:p-6 shadow-sm">
            <h2 className="text-sm sm:text-base font-semibold text-surface-900 mb-0.5 sm:mb-1">Employee payroll</h2>
            <p className="text-xs sm:text-sm text-surface-500 mb-4">SS and Tax are auto-calculated per DR rules (TSS/DGII 2026). </p>
            <div className="w-full overflow-x-auto -mx-4 sm:-mx-6 rounded-xl border border-surface-200/80">
            <table className="w-full min-w-max text-left text-sm">
              <thead className="sticky top-0 z-10 bg-surface-50/95 backdrop-blur supports-[backdrop-filter]:bg-surface-50/80 border-b border-surface-200">
                <tr>
                  <th className="py-3 px-4 font-semibold text-surface-700 whitespace-nowrap">Employee</th>
                  <th className="py-3 px-4 font-semibold text-surface-700 text-center whitespace-nowrap">Rate</th>
                  <th className="py-3 px-4 font-semibold text-surface-700 text-center whitespace-nowrap">Regular h</th>
                  <th className="py-3 px-4 font-semibold text-surface-700 text-center whitespace-nowrap">OT {otPercent}% h</th>
                  <th className="py-3 px-4 font-semibold text-surface-700 text-center whitespace-nowrap">OT 100% h</th>
                  <th className="py-3 px-4 font-semibold text-surface-700 text-center whitespace-nowrap">Night {nightPercent}% h</th>
                  <th className="py-3 px-4 font-semibold text-surface-700 text-center whitespace-nowrap">Holiday sched h</th>
                  <th className="py-3 px-4 font-semibold text-surface-700 text-center whitespace-nowrap">Holiday worked h</th>
                  <th className="py-3 px-4 font-semibold text-surface-700 text-center whitespace-nowrap">Total h</th>
                  <th className="py-3 px-4 font-semibold text-surface-700 text-center whitespace-nowrap">Regular pay</th>
                  <th className="py-3 px-4 font-semibold text-surface-700 text-center whitespace-nowrap">OT {otPercent}% pay</th>
                  <th className="py-3 px-4 font-semibold text-surface-700 text-center whitespace-nowrap">OT 100% pay</th>
                  <th className="py-3 px-4 font-semibold text-surface-700 text-center whitespace-nowrap">Night {nightPercent}% pay</th>
                  <th className="py-3 px-4 font-semibold text-surface-700 text-center whitespace-nowrap">Holiday pay</th>
                  <th className="py-3 px-4 font-semibold text-surface-700 text-center whitespace-nowrap">Total pay</th>
                  <th className="py-3 px-4 font-semibold text-surface-700 text-center whitespace-nowrap">Additions</th>
                  <th className="py-3 px-4 font-semibold text-surface-700 text-center whitespace-nowrap">Deductions</th>
                  <th className="py-3 px-4 font-semibold text-surface-700 text-center whitespace-nowrap">SS</th>
                  <th className="py-3 px-4 font-semibold text-surface-700 text-center whitespace-nowrap">Tax</th>
                  <th className="py-3 px-4 font-semibold text-surface-700 text-center whitespace-nowrap">INFOTEP</th>
                  <th className="py-3 px-4 font-semibold text-surface-700 text-center whitespace-nowrap">Net pay</th>
                  <th className="py-3 px-4 font-semibold text-surface-700 whitespace-nowrap">Items</th>
                  <th className="py-3 px-4 w-24" aria-label="PDF and edit salary">Slip</th>
                </tr>
              </thead>
              <tbody>
                {paginatedEmployees.map((row) => (
                  <PayrollRow
                    key={row.employeeId}
                    row={row}
                    otPercent={otPercent}
                    nightPercent={nightPercent}
                    onEditSalary={() => openEditSalary(row)}
                    onAddItem={(type) => {
                      setAddItemRow(row)
                      setItemType(type)
                      setItemLabel('')
                      setItemAmount('')
                    }}
                    onSaveDeductions={handleSaveDeductions}
                    onDeleteLineItem={handleDeleteLineItem}
                    onDownloadPdf={() => handleDownloadPaySlip(row.employeeId)}
                    pdfDownloading={pdfLoadingEmployeeId === row.employeeId}
                    deductionSaving={deductionSaving === row.employeeId}
                  />
                ))}
              </tbody>
            </table>
            </div>

            {payrollEmployees.length > 0 && (
              <div className="mt-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <p className="text-xs sm:text-sm text-surface-500">
                  Showing {pageStart + 1}-{Math.min(pageStart + PAYROLL_ROWS_PER_PAGE, payrollEmployees.length)} of {payrollEmployees.length}
                </p>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={safeCurrentPage === 1}
                    className="btn-secondary rounded-xl min-h-[2.5rem] px-3 disabled:opacity-50 flex-1 sm:flex-none"
                  >
                    Previous
                  </button>
                  <span className="text-xs sm:text-sm text-surface-600 min-w-[80px] text-center flex-none">
                    Page {safeCurrentPage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safeCurrentPage === totalPages}
                    className="btn-secondary rounded-xl min-h-[2.5rem] px-3 disabled:opacity-50 flex-1 sm:flex-none"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl sm:rounded-2xl border border-surface-200/80 bg-white p-4 sm:p-6 shadow-sm">
            <h2 className="text-sm sm:text-base font-semibold text-surface-900 mb-0.5 sm:mb-1">Export</h2>
            <p className="text-xs sm:text-sm text-surface-500 mb-4">
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
                <AdminSelect
                  value={editSalaryType}
                  onChange={(val) => setEditSalaryType(val as 'hourly' | 'monthly')}
                  options={[
                    { value: 'hourly', label: 'Hourly' },
                    { value: 'monthly', label: 'Monthly' },
                  ]}
                />
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
            <div className="mt-6 flex flex-col-reverse sm:flex-row gap-3 justify-end">
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

      {addItemRow && payroll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" role="dialog" aria-modal="true" aria-labelledby="add-item-title">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <h2 id="add-item-title" className="text-lg font-semibold text-surface-900 mb-4">
              Add payable item — {addItemRow.employeeName}
            </h2>
            <p className="text-xs sm:text-sm text-surface-500 mb-4">Bonuses, incentives, or deductions (e.g. passthrough credits) for this period.</p>
            <div className="space-y-4">
              <div>
                <label className="label">Type</label>
                <AdminSelect
                  value={itemType}
                  onChange={(val) =>
                    setItemType(val as 'bonus' | 'incentive' | 'deduction' | 'passthrough_credit')
                  }
                  options={[
                    { value: 'bonus', label: 'Bonus' },
                    { value: 'incentive', label: 'Incentive' },
                    { value: 'deduction', label: 'Deduction' },
                    { value: 'passthrough_credit', label: 'Passthrough credit' },
                  ]}
                />
              </div>
              <div>
                <label className="label">Label (optional)</label>
                <input
                  type="text"
                  className="input w-full rounded-xl min-h-[2.75rem]"
                  value={itemLabel}
                  onChange={(e) => setItemLabel(e.target.value)}
                  placeholder="e.g. Performance bonus"
                />
              </div>
              <div>
                <label className="label">Amount</label>
                <input
                  type="number"
                  step={0.01}
                  min={0}
                  className="input w-full rounded-xl min-h-[2.75rem]"
                  value={itemAmount}
                  onChange={(e) => setItemAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="mt-6 flex flex-col-reverse sm:flex-row gap-3 justify-end">
              <button type="button" onClick={() => setAddItemRow(null)} className="btn-secondary rounded-xl min-h-[2.75rem] px-4">Cancel</button>
              <button
                type="button"
                onClick={handleAddLineItem}
                disabled={savingItem || itemAmount === '' || parseFloat(itemAmount) < 0}
                className="btn-primary rounded-xl min-h-[2.75rem] px-4 disabled:opacity-60"
              >
                {savingItem ? 'Saving…' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
