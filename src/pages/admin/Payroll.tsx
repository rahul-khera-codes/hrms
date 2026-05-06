import { useState, useEffect, useMemo, useCallback } from 'react'
import { Calculator, Download, Search, AlertTriangle, Users, DollarSign, TrendingDown, Building2, Loader2, X } from 'lucide-react'
import AdminSelect from '@/components/AdminSelect'
import { PageHeader } from '@/components/PageHeader'
import { SkeletonTableRows } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import {
  getPayrollPeriods,
  getPayrollCalcResults,
  calculatePayroll,
  updatePayrollResultField,
  type PayrollPeriod,
  type PayrollCalcResult,
} from '@/lib/apiAdmin'

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const money = (v: number): string =>
  `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const hrs = (v: number): string => v.toFixed(2)

/* ------------------------------------------------------------------ */
/*  Column definitions for the wide table                              */
/* ------------------------------------------------------------------ */

interface ColDef {
  key: string
  label: string
  /** 'money' | 'hours' | 'text' | 'bool' */
  type: 'money' | 'hours' | 'text' | 'bool'
  accessor: (r: PayrollCalcResult) => string | number | boolean
}

interface SectionDef {
  name: string
  bg: string          // tailwind bg class for header
  headerText: string  // tailwind text class for header
  columns: ColDef[]
}

/** Bank dropdown options */
const BANK_OPTIONS = [
  '', 'Banreservas', 'Popular', 'BHD Leon', 'Scotiabank', 'Santa Cruz',
  'Promerica', 'Caribe', 'Lopez de Haro', 'Ademi', 'BDI', 'Vimenca',
]

/** Payment method dropdown options */
const PAY_METHOD_OPTIONS = ['', 'Deposito', 'Cheque']

const sections: SectionDef[] = [
  {
    name: 'Employee',
    bg: 'bg-surface-50',
    headerText: 'text-surface-700',
    columns: [
      { key: 'cmid', label: 'CMID', type: 'text', accessor: (r) => r.employeeCmid ?? '-' },
      { key: 'employeeName', label: 'Name', type: 'text', accessor: (r) => r.employeeName },
      { key: 'account', label: 'Account', type: 'text', accessor: (r) => r.account ?? '' },
      { key: 'salaryType', label: 'Salary Type', type: 'text', accessor: (r) => r.salaryType },
      { key: 'salary', label: 'Salary', type: 'money', accessor: (r) => r.salary },
      { key: 'hourlySalary', label: 'Hourly Rate', type: 'money', accessor: (r) => r.hourlySalary },
      { key: 'contractStatus', label: 'Status', type: 'text', accessor: (r) => r.contractStatus ?? '' },
      { key: 'bank', label: 'Bank', type: 'text', accessor: (r) => r.bank ?? '' },
      { key: 'bankAccount', label: 'Bank Account', type: 'text', accessor: (r) => r.bankAccount ?? '' },
      { key: 'payMethod', label: 'Payment Method', type: 'text', accessor: (r) => r.payMethod ?? '' },
    ],
  },
  {
    name: 'Ordinary Salary',
    bg: 'bg-emerald-50',
    headerText: 'text-emerald-800',
    columns: [
      { key: 'hreg1', label: 'HREG1', type: 'hours', accessor: (r) => r.hreg1 },
      { key: 'hreg2', label: 'HREG2', type: 'hours', accessor: (r) => r.hreg2 },
      { key: 'hreg', label: 'HREG', type: 'hours', accessor: (r) => r.hreg },
      { key: 'ordinarySalary', label: 'Salary', type: 'money', accessor: (r) => r.ordinarySalary },
    ],
  },
  {
    name: 'Leaves (VPL)',
    bg: 'bg-white',
    headerText: 'text-surface-700',
    columns: [
      { key: 'vacation', label: 'Vacation', type: 'money', accessor: (r) => r.vacation },
      { key: 'matrimony', label: 'Matrimony', type: 'money', accessor: (r) => r.matrimony },
      { key: 'maternity', label: 'Maternity', type: 'money', accessor: (r) => r.maternity },
      { key: 'paternity', label: 'Paternity', type: 'money', accessor: (r) => r.paternity },
      { key: 'bereavement', label: 'Bereavement', type: 'money', accessor: (r) => r.bereavement },
      { key: 'medical', label: 'Medical', type: 'money', accessor: (r) => r.medical },
      { key: 'vpl', label: 'Total VPL', type: 'money', accessor: (r) => r.vpl },
    ],
  },
  {
    name: 'Commissions',
    bg: 'bg-emerald-50',
    headerText: 'text-emerald-800',
    columns: [
      { key: 'commissions', label: 'Commissions', type: 'money', accessor: (r) => r.commissions },
    ],
  },
  {
    name: 'Overtime',
    bg: 'bg-white',
    headerText: 'text-surface-700',
    columns: [
      { key: 'hn15Hours', label: 'N15% Hrs', type: 'hours', accessor: (r) => r.hn15Hours },
      { key: 'hn15Amount', label: 'N15% $', type: 'money', accessor: (r) => r.hn15Amount },
      { key: 'hx35Hours', label: 'X35% Hrs', type: 'hours', accessor: (r) => r.hx35Hours },
      { key: 'hx35Amount', label: 'X35% $', type: 'money', accessor: (r) => r.hx35Amount },
      { key: 'hx100Hours', label: 'X100% Hrs', type: 'hours', accessor: (r) => r.hx100Hours },
      { key: 'hx100Amount', label: 'X100% $', type: 'money', accessor: (r) => r.hx100Amount },
      { key: 'hholHours', label: 'Holiday Hrs', type: 'hours', accessor: (r) => r.hholHours },
      { key: 'hholAmount', label: 'Holiday $', type: 'money', accessor: (r) => r.hholAmount },
      { key: 'overtimeTotal', label: 'Total Overtime', type: 'money', accessor: (r) => r.overtimeTotal },
    ],
  },
  {
    name: 'Bonuses',
    bg: 'bg-emerald-50',
    headerText: 'text-emerald-800',
    columns: [
      { key: 'collaboration', label: 'Collaboration', type: 'money', accessor: (r) => r.collaboration },
      { key: 'recruiting', label: 'Recruiting', type: 'money', accessor: (r) => r.recruiting },
      { key: 'profitSharing', label: 'Profit Sharing', type: 'money', accessor: (r) => r.profitSharing },
      { key: 'bonusesTotal', label: 'Total Bonuses', type: 'money', accessor: (r) => r.bonusesTotal },
    ],
  },
  {
    name: 'Incentives',
    bg: 'bg-white',
    headerText: 'text-surface-700',
    columns: [
      { key: 'attendanceIncentive', label: 'Attendance', type: 'money', accessor: (r) => r.attendanceIncentive },
      { key: 'kpiIncentive', label: 'KPI', type: 'money', accessor: (r) => r.kpiIncentive },
      { key: 'incentivesTotal', label: 'Total Incentives', type: 'money', accessor: (r) => r.incentivesTotal },
    ],
  },
  {
    name: 'Other Income',
    bg: 'bg-emerald-50',
    headerText: 'text-emerald-800',
    columns: [
      { key: 'subsidio', label: 'Subsidio', type: 'money', accessor: (r) => r.subsidio ?? 0 },
      { key: 'reembolso', label: 'Reembolso', type: 'money', accessor: (r) => r.reembolso ?? 0 },
      { key: 'totalOtherIncome', label: 'Total Other Income', type: 'money', accessor: (r) => r.totalOtherIncome ?? 0 },
    ],
  },
  {
    name: 'Classification',
    bg: 'bg-sky-50',
    headerText: 'text-sky-800',
    columns: [
      { key: 'grossSalary', label: 'Gross Salary', type: 'money', accessor: (r) => r.grossSalary },
      { key: 'tssSalary', label: 'TSS Salary', type: 'money', accessor: (r) => r.tssSalary },
      { key: 'isrSalary', label: 'ISR Salary', type: 'money', accessor: (r) => r.isrSalary },
      { key: 'infotepSalary', label: 'INFOTEP Salary', type: 'money', accessor: (r) => r.infotepSalary ?? 0 },
    ],
  },
  {
    name: 'Gov. Deductions',
    bg: 'bg-red-50',
    headerText: 'text-red-800',
    columns: [
      { key: 'isrRetention', label: 'ISR', type: 'money', accessor: (r) => r.isrRetention },
      { key: 'afp', label: 'AFP', type: 'money', accessor: (r) => r.afp },
      { key: 'sfs', label: 'SFS', type: 'money', accessor: (r) => r.sfs },
      { key: 'infotep', label: 'INFOTEP', type: 'money', accessor: (r) => r.infotep },
      { key: 'govDeductionsTotal', label: 'Total Gov. Ded.', type: 'money', accessor: (r) => r.govDeductionsTotal },
    ],
  },
  {
    name: 'Other Deductions',
    bg: 'bg-white',
    headerText: 'text-surface-700',
    columns: [
      { key: 'tssDependents', label: 'TSS Dep.', type: 'money', accessor: (r) => r.tssDependents },
      { key: 'payLater', label: 'PayLater', type: 'money', accessor: (r) => r.payLater },
      { key: 'gym', label: 'Gym', type: 'money', accessor: (r) => r.gym },
      { key: 'insuranceDed', label: 'Insurance', type: 'money', accessor: (r) => r.insuranceDed },
      { key: 'cafeteria', label: 'Cafeteria', type: 'money', accessor: (r) => r.cafeteria },
      { key: 'adminDeduction', label: 'Admin', type: 'money', accessor: (r) => r.adminDeduction },
      { key: 'deduccionX', label: 'Deduction X', type: 'money', accessor: (r) => r.deduccionX },
      { key: 'otherDeductionsSpare', label: 'Deduction Y', type: 'money', accessor: (r) => r.otherDeductionsSpare },
      { key: 'otherDeductionsTotal', label: 'Total Other Ded.', type: 'money', accessor: (r) => r.otherDeductionsTotal },
    ],
  },
  {
    name: 'Totals',
    bg: 'bg-violet-50',
    headerText: 'text-violet-800',
    columns: [
      { key: 'deductionValidation', label: 'Validation', type: 'bool', accessor: (r) => r.deductionValidation },
      { key: 'totalDeductions', label: 'Total Deductions', type: 'money', accessor: (r) => r.totalDeductions },
      { key: 'netSalary', label: 'Net Salary', type: 'money', accessor: (r) => r.netSalary },
    ],
  },
  {
    name: 'Employer Cost',
    bg: 'bg-surface-100',
    headerText: 'text-surface-700',
    columns: [
      { key: 'afpEmployer', label: 'AFP', type: 'money', accessor: (r) => r.afpEmployer },
      { key: 'sfsEmployer', label: 'SFS', type: 'money', accessor: (r) => r.sfsEmployer },
      { key: 'arl', label: 'ARL', type: 'money', accessor: (r) => r.arl },
      { key: 'infotepEmployer', label: 'INFOTEP', type: 'money', accessor: (r) => r.infotepEmployer },
    ],
  },
]

const allColumns = sections.flatMap((s) => s.columns)

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AdminPayroll() {
  const toast = useToast()

  const [payrollPeriods, setPayrollPeriods] = useState<PayrollPeriod[]>([])
  const [selectedCycle, setSelectedCycle] = useState('')
  const [results, setResults] = useState<PayrollCalcResult[]>([])
  const [loading, setLoading] = useState(true)
  const [calculating, setCalculating] = useState(false)
  const [search, setSearch] = useState('')
  const [detailRow, setDetailRow] = useState<PayrollCalcResult | null>(null)

  /* ---------- Load payroll periods on mount ---------- */
  useEffect(() => {
    let cancelled = false
    async function init() {
      setLoading(true)
      try {
        const periods = await getPayrollPeriods()
        if (cancelled) return
        setPayrollPeriods(periods)
        if (periods.length > 0) {
          const today = new Date().toISOString().slice(0, 10)
          const openPeriods = periods.filter((p) => p.payDate >= today)
          const currentCycle = openPeriods.find((p) => p.periodFrom <= today && p.periodTo >= today)
          setSelectedCycle(
            currentCycle?.cycleCode ??
            (openPeriods.length > 0 ? openPeriods[openPeriods.length - 1].cycleCode : periods[periods.length - 1].cycleCode),
          )
        }
      } catch {
        if (!cancelled) toast.error('Failed to load payroll periods')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    init()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---------- Load results when cycle changes ---------- */
  useEffect(() => {
    if (!selectedCycle) return
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const data = await getPayrollCalcResults(selectedCycle)
        if (!cancelled) setResults(data)
      } catch {
        if (!cancelled) setResults([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [selectedCycle])

  /* ---------- Calculate payroll ---------- */
  const handleCalculate = useCallback(async () => {
    if (!selectedCycle) return
    setCalculating(true)
    try {
      const data = await calculatePayroll(selectedCycle)
      setResults(data)
      toast.success(`Payroll calculated for ${selectedCycle} — ${data.length} employees`)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Calculation failed')
    } finally {
      setCalculating(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCycle])

  /* ---------- Inline edit handler for bank / bankAccount / payMethod ---------- */
  const handleInlineUpdate = useCallback(
    async (row: PayrollCalcResult, field: 'bank' | 'bankAccount' | 'payMethod', value: string) => {
      try {
        const updated = await updatePayrollResultField(row.id, { [field]: value })
        setResults((prev) => prev.map((r) => (r.id === row.id ? updated : r)))
      } catch {
        toast.error('Failed to update field')
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  /* ---------- Filtered rows ---------- */
  const displayedRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return results
    return results.filter((r) =>
      r.employeeName.toLowerCase().includes(q) ||
      (r.account ?? '').toLowerCase().includes(q) ||
      (r.contractStatus ?? '').toLowerCase().includes(q) ||
      r.salaryType.toLowerCase().includes(q),
    )
  }, [results, search])

  /* ---------- Summary stats ---------- */
  const summary = useMemo(() => {
    const rows = displayedRows
    return {
      employees: rows.length,
      totalGross: rows.reduce((a, r) => a + r.grossSalary, 0),
      totalNet: rows.reduce((a, r) => a + r.netSalary, 0),
      totalDeductions: rows.reduce((a, r) => a + r.totalDeductions, 0),
      totalEmployerCost: rows.reduce(
        (a, r) => a + r.afpEmployer + r.sfsEmployer + r.arl + r.infotepEmployer,
        0,
      ),
    }
  }, [displayedRows])

  /* ---------- CSV export ---------- */
  function exportCSV() {
    if (!displayedRows.length) return
    const headers = allColumns.map((c) => c.label)
    const csvRows = displayedRows.map((r) =>
      allColumns.map((c) => {
        const val = c.accessor(r)
        if (typeof val === 'boolean') return val ? 'YES' : ''
        if (typeof val === 'number') return val.toString()
        return String(val)
      }),
    )
    const csv = [
      headers.join(','),
      ...csvRows.map((row) => row.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')),
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `payroll-calculator-${selectedCycle || 'export'}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  /* ---------- Cycle selector options (only open cycles where payDate >= today) ---------- */
  const cycleOptions = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return payrollPeriods
      .filter((p) => p.payDate >= today)
      .map((p) => ({ value: p.cycleCode, label: p.cycleCode }))
  }, [payrollPeriods])

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */
  return (
    <div className="page overflow-x-hidden">
      <PageHeader
        title="Payroll Calculator"
        subtitle="Run payroll calculations per cycle and review the full breakdown."
        icon={<Calculator className="w-5 h-5" />}
        actions={
          <>
            <button
              type="button"
              onClick={exportCSV}
              disabled={loading || displayedRows.length === 0}
              className="btn-secondary"
            >
              <Download className="w-4 h-4 shrink-0" />
              Export CSV
            </button>
            <button
              type="button"
              onClick={handleCalculate}
              disabled={!selectedCycle || calculating}
              className="btn-primary"
            >
              {calculating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Calculator className="w-4 h-4" />
              )}
              {calculating ? 'Calculating...' : 'Calculate Payroll'}
            </button>
          </>
        }
      />

      {/* -- Stat cards -- */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-surface-400" />
            <p className="stat-label">Employees</p>
          </div>
          <p className="stat-value">{summary.employees}</p>
        </div>
        <div className="stat-card border-brand-200/70 bg-brand-50/40">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-brand-500" />
            <p className="stat-label text-brand-700">Total Gross</p>
          </div>
          <p className="stat-value">{money(summary.totalGross)}</p>
        </div>
        <div className="stat-card border-emerald-200/70 bg-emerald-50/40">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-emerald-500" />
            <p className="stat-label text-emerald-700">Total Net</p>
          </div>
          <p className="stat-value">{money(summary.totalNet)}</p>
        </div>
        <div className="stat-card border-red-200/70 bg-red-50/40">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className="w-4 h-4 text-red-500" />
            <p className="stat-label text-red-700">Total Deductions</p>
          </div>
          <p className="stat-value">{money(summary.totalDeductions)}</p>
        </div>
        <div className="stat-card border-surface-200/70 bg-surface-50/40">
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="w-4 h-4 text-surface-500" />
            <p className="stat-label text-surface-600">Employer Cost</p>
          </div>
          <p className="stat-value">{money(summary.totalEmployerCost)}</p>
        </div>
      </div>

      {/* -- Toolbar -- */}
      <div className="toolbar">
        <div className="w-full sm:w-56">
          <AdminSelect
            value={selectedCycle}
            onChange={(val) => setSelectedCycle(val)}
            options={cycleOptions}
            placeholder="Select cycle..."
            disabled={loading && payrollPeriods.length === 0}
          />
        </div>
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 shrink-0" />
          <input
            type="text"
            placeholder="Search by name, account, status..."
            className="input pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* -- Table -- */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: '5000px' }}>
            {/* -- Two-row header -- */}
            <thead>
              {/* Row 1: section group headers */}
              <tr>
                {sections.map((s) => (
                  <th
                    key={s.name}
                    colSpan={s.columns.length}
                    className={`px-3 py-2 text-xs font-semibold text-center border-b border-surface-200 ${s.bg} ${s.headerText}`}
                  >
                    {s.name}
                  </th>
                ))}
              </tr>
              {/* Row 2: individual column headers */}
              <tr>
                {sections.map((s) =>
                  s.columns.map((col) => (
                    <th
                      key={col.key}
                      className={`px-3 py-2.5 text-xs font-medium whitespace-nowrap border-b border-surface-200 ${
                        col.type === 'money' || col.type === 'hours' || col.type === 'bool'
                          ? 'text-right'
                          : 'text-left'
                      } ${s.bg} ${s.headerText}`}
                    >
                      {col.label}
                    </th>
                  )),
                )}
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <SkeletonTableRows rows={8} cols={allColumns.length} />
              ) : displayedRows.length === 0 ? (
                <tr>
                  <td colSpan={allColumns.length} className="py-16 text-center text-surface-400">
                    <div className="flex flex-col items-center gap-3">
                      <Calculator className="w-10 h-10 text-surface-300" />
                      <p className="text-base font-medium text-surface-500">No payroll data</p>
                      <p className="text-sm text-surface-400">
                        Select a payroll cycle and click Calculate Payroll
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                displayedRows.map((r) => (
                  <tr
                    key={r.id}
                    className="bg-white border-b border-surface-100 hover:bg-surface-50/70 transition-colors cursor-pointer"
                    onClick={() => setDetailRow(r)}
                  >
                    {sections.map((s) =>
                      s.columns.map((col) => {
                        const val = col.accessor(r)

                        /* Inline-editable: Bank (select dropdown) */
                        if (col.key === 'bank') {
                          return (
                            <td key={col.key} className="py-1 px-1 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                              <select
                                className="w-full text-xs border border-surface-200 rounded px-1.5 py-1.5 bg-white text-surface-700 focus:ring-1 focus:ring-brand-400 focus:border-brand-400 outline-none"
                                value={String(val)}
                                onChange={(e) => handleInlineUpdate(r, 'bank', e.target.value)}
                              >
                                {BANK_OPTIONS.map((b) => (
                                  <option key={b} value={b}>{b || '--'}</option>
                                ))}
                              </select>
                            </td>
                          )
                        }

                        /* Inline-editable: Bank Account (text input) */
                        if (col.key === 'bankAccount') {
                          return (
                            <td key={col.key} className="py-1 px-1 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="text"
                                className="w-full text-xs border border-surface-200 rounded px-1.5 py-1.5 bg-white text-surface-700 focus:ring-1 focus:ring-brand-400 focus:border-brand-400 outline-none"
                                defaultValue={String(val)}
                                onBlur={(e) => {
                                  if (e.target.value !== String(val)) {
                                    handleInlineUpdate(r, 'bankAccount', e.target.value)
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                                }}
                              />
                            </td>
                          )
                        }

                        /* Inline-editable: Payment Method (select dropdown) */
                        if (col.key === 'payMethod') {
                          return (
                            <td key={col.key} className="py-1 px-1 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                              <select
                                className="w-full text-xs border border-surface-200 rounded px-1.5 py-1.5 bg-white text-surface-700 focus:ring-1 focus:ring-brand-400 focus:border-brand-400 outline-none"
                                value={String(val)}
                                onChange={(e) => handleInlineUpdate(r, 'payMethod', e.target.value)}
                              >
                                {PAY_METHOD_OPTIONS.map((m) => (
                                  <option key={m} value={m}>{m || '--'}</option>
                                ))}
                              </select>
                            </td>
                          )
                        }

                        /* Employee name -- sticky left */
                        if (col.key === 'employeeName') {
                          return (
                            <td
                              key={col.key}
                              className="py-3 px-3 text-surface-900 font-medium whitespace-nowrap sticky left-0 bg-white z-10 border-r border-surface-100"
                            >
                              {String(val)}
                            </td>
                          )
                        }

                        /* Boolean: deductionValidation */
                        if (col.type === 'bool') {
                          return (
                            <td key={col.key} className="py-3 px-3 text-right whitespace-nowrap">
                              {val ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                                  <AlertTriangle className="w-3 h-3" />
                                  Warning
                                </span>
                              ) : (
                                <span className="text-surface-300">--</span>
                              )}
                            </td>
                          )
                        }

                        /* Money */
                        if (col.type === 'money') {
                          return (
                            <td
                              key={col.key}
                              className="py-3 px-3 text-right tabular-nums whitespace-nowrap text-surface-700"
                            >
                              {money(val as number)}
                            </td>
                          )
                        }

                        /* Hours */
                        if (col.type === 'hours') {
                          return (
                            <td
                              key={col.key}
                              className="py-3 px-3 text-right tabular-nums whitespace-nowrap text-surface-700"
                            >
                              {hrs(val as number)}
                            </td>
                          )
                        }

                        /* Text (default) */
                        return (
                          <td
                            key={col.key}
                            className="py-3 px-3 text-surface-700 whitespace-nowrap"
                          >
                            {String(val) || <span className="text-surface-300">--</span>}
                          </td>
                        )
                      }),
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* -- Detail modal -- */}
      {detailRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setDetailRow(null)}>
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200">
              <div>
                <h2 className="text-lg font-semibold text-surface-900">{detailRow.employeeName}</h2>
                <p className="text-sm text-surface-500">
                  {detailRow.payrollCycleCode} &middot; {detailRow.salaryType} &middot; {detailRow.contractStatus ?? ''}
                </p>
              </div>
              <button type="button" onClick={() => setDetailRow(null)} className="p-1 rounded hover:bg-surface-100">
                <X className="w-5 h-5 text-surface-500" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              {sections.map((s) => (
                <div key={s.name}>
                  <h3 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${s.headerText}`}>{s.name}</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5">
                    {s.columns.map((col) => {
                      const val = col.accessor(detailRow)
                      let display: string
                      if (col.type === 'money') display = money(val as number)
                      else if (col.type === 'hours') display = hrs(val as number)
                      else if (col.type === 'bool') display = val ? 'Warning' : '--'
                      else display = String(val) || '--'
                      return (
                        <div key={col.key} className="flex justify-between text-sm py-0.5">
                          <span className="text-surface-500">{col.label}</span>
                          <span className="text-surface-800 font-medium tabular-nums">{display}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
