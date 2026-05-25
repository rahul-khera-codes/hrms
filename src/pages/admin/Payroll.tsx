import { useState, useEffect, useMemo, useCallback } from 'react'
import { Calculator, Download, Search, AlertTriangle, Users, DollarSign, Building2, Loader2, X, FileText, CheckSquare, Square, Eye, EyeOff } from 'lucide-react'
import AdminSelect from '@/components/AdminSelect'
import { PageHeader } from '@/components/PageHeader'
import { SkeletonTableRows } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { buildCycleOptions } from '@/lib/cycleOptions'
import {
  getPayrollPeriods,
  getPayrollCalcResults,
  calculatePayroll,
  updatePayrollResultField,
  getPaystubUrl,
  getEmployees,
  type PayrollPeriod,
  type PayrollCalcResult,
} from '@/lib/apiAdmin'

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const money = (v: number): string =>
  `RD$ ${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const hrs = (v: number): string => `${v.toFixed(2)} H`

/* ------------------------------------------------------------------ */
/*  Column definitions for the wide table                              */
/* ------------------------------------------------------------------ */

interface ColDef {
  key: string
  label: string
  type: 'money' | 'hours' | 'text' | 'bool'
  accessor: (r: PayrollCalcResult) => string | number | boolean
}

interface SectionDef {
  name: string
  bg: string
  headerText: string
  columns: ColDef[]
}

const PAY_METHOD_OPTIONS = ['', 'Deposito', 'Cheque']

const sections: SectionDef[] = [
  {
    name: 'Employee',
    bg: 'bg-surface-50 dark:bg-surface-900',
    headerText: 'text-surface-700 dark:text-surface-200',
    columns: [
      { key: 'cmid', label: 'CMID', type: 'text', accessor: (r) => r.employeeCmid ?? '-' },
      { key: 'employeeName', label: 'Name', type: 'text', accessor: (r) => r.employeeName },
      { key: 'governmentId', label: 'Gov. ID', type: 'text', accessor: (r) => r.governmentId ?? '' },
      { key: 'account', label: 'Account', type: 'text', accessor: (r) => r.account ?? '' },
      { key: 'salaryType', label: 'Salary Type', type: 'text', accessor: (r) => r.salaryType },
      { key: 'salary', label: 'Salary', type: 'money', accessor: (r) => r.salary },
      { key: 'hourlySalary', label: 'Hourly Rate', type: 'money', accessor: (r) => r.hourlySalary },
      { key: 'contractStatus', label: 'Status', type: 'text', accessor: (r) => r.contractStatus ?? '' },
      { key: 'bank', label: 'Bank', type: 'text', accessor: (r) => r.bank ?? '' },
      { key: 'bankAccount', label: 'Bank Account', type: 'text', accessor: (r) => r.bankAccount ?? '' },
      { key: 'payMethod', label: 'Pay Method', type: 'text', accessor: (r) => r.payMethod ?? '' },
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
    bg: 'bg-surface-50 dark:bg-surface-900',
    headerText: 'text-surface-700 dark:text-surface-200',
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
    bg: 'bg-surface-50 dark:bg-surface-900',
    headerText: 'text-surface-700 dark:text-surface-200',
    columns: [
      { key: 'hn15Hours', label: 'N15% Hrs', type: 'hours', accessor: (r) => r.hn15Hours },
      { key: 'hn15Amount', label: 'N15% $', type: 'money', accessor: (r) => r.hn15Amount },
      { key: 'hx35Hours', label: 'X35% Hrs', type: 'hours', accessor: (r) => r.hx35Hours },
      { key: 'hx35Amount', label: 'X35% $', type: 'money', accessor: (r) => r.hx35Amount },
      { key: 'hx100Hours', label: 'X100% Hrs', type: 'hours', accessor: (r) => r.hx100Hours },
      { key: 'hx100Amount', label: 'X100% $', type: 'money', accessor: (r) => r.hx100Amount },
      { key: 'hholHours', label: 'Holiday Hrs', type: 'hours', accessor: (r) => r.hholHours },
      { key: 'hholAmount', label: 'Holiday $', type: 'money', accessor: (r) => r.hholAmount },
      { key: 'overtimeTotal', label: 'Total OT', type: 'money', accessor: (r) => r.overtimeTotal },
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
    bg: 'bg-surface-50 dark:bg-surface-900',
    headerText: 'text-surface-700 dark:text-surface-200',
    columns: [
      { key: 'attendanceIncentive', label: 'Attendance', type: 'money', accessor: (r) => r.attendanceIncentive },
      { key: 'kpiIncentive', label: 'KPI', type: 'money', accessor: (r) => r.kpiIncentive },
      { key: 'incentivesTotal', label: 'Total Incent.', type: 'money', accessor: (r) => r.incentivesTotal },
    ],
  },
  {
    name: 'Other Income',
    bg: 'bg-emerald-50',
    headerText: 'text-emerald-800',
    columns: [
      { key: 'subsidio', label: 'Subsidy', type: 'money', accessor: (r) => r.subsidio ?? 0 },
      { key: 'reembolso', label: 'Reimbursement', type: 'money', accessor: (r) => r.reembolso ?? 0 },
      { key: 'totalOtherIncome', label: 'Total Other', type: 'money', accessor: (r) => r.totalOtherIncome ?? 0 },
    ],
  },
  {
    name: 'Salary Classification',
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
      { key: 'govDeductionsTotal', label: 'Total Gov.', type: 'money', accessor: (r) => r.govDeductionsTotal },
    ],
  },
  {
    name: 'Other Deductions',
    bg: 'bg-red-50',
    headerText: 'text-red-800',
    columns: [
      { key: 'tssDependents', label: 'TSS Dep.', type: 'money', accessor: (r) => r.tssDependents },
      { key: 'payLater', label: 'PayLater', type: 'money', accessor: (r) => r.payLater },
      { key: 'gym', label: 'Gym', type: 'money', accessor: (r) => r.gym },
      { key: 'insuranceDed', label: 'Insurance', type: 'money', accessor: (r) => r.insuranceDed },
      { key: 'cafeteria', label: 'Cafeteria', type: 'money', accessor: (r) => r.cafeteria },
      { key: 'adminDeduction', label: 'Admin', type: 'money', accessor: (r) => r.adminDeduction },
      { key: 'deduccionX', label: 'Ded. X', type: 'money', accessor: (r) => r.deduccionX },
      { key: 'otherDeductionsSpare', label: 'Ded. Y', type: 'money', accessor: (r) => r.otherDeductionsSpare },
      { key: 'otherDeductionsTotal', label: 'Total Other', type: 'money', accessor: (r) => r.otherDeductionsTotal },
    ],
  },
  {
    name: 'Payroll Summary',
    bg: 'bg-emerald-50',
    headerText: 'text-emerald-800',
    columns: [
      { key: 'deductionValidation', label: 'Validation', type: 'bool', accessor: (r) => r.deductionValidation },
      { key: 'totalDeductions', label: 'Total Ded.', type: 'money', accessor: (r) => r.totalDeductions },
      { key: 'netSalary', label: 'Net Salary', type: 'money', accessor: (r) => r.netSalary },
    ],
  },
  {
    name: 'Employer Cost',
    bg: 'bg-surface-50 dark:bg-surface-900',
    headerText: 'text-surface-700 dark:text-surface-200',
    columns: [
      { key: 'afpEmployer', label: 'AFP', type: 'money', accessor: (r) => r.afpEmployer },
      { key: 'sfsEmployer', label: 'SFS', type: 'money', accessor: (r) => r.sfsEmployer },
      { key: 'arl', label: 'ARL', type: 'money', accessor: (r) => r.arl },
      { key: 'infotepEmployer', label: 'INFOTEP', type: 'money', accessor: (r) => r.infotepEmployer },
    ],
  },
  {
    name: 'Notes & CC',
    bg: 'bg-amber-50',
    headerText: 'text-amber-800',
    columns: [
      { key: 'notes', label: 'Notes', type: 'text', accessor: (r) => r.notes ?? '' },
      { key: 'ccEmail', label: 'CC Email', type: 'text', accessor: (r) => r.ccEmail ?? '' },
    ],
  },
]

const allColumns = sections.flatMap((s) => s.columns)

/* ------------------------------------------------------------------ */
/*  Detail modal section color mapping (matches table headers)         */
/* ------------------------------------------------------------------ */

const sectionColorMap: Record<string, { bg: string; text: string; totalText: string }> = {
  'Employee': { bg: 'bg-surface-50 dark:bg-surface-900', text: 'text-surface-700 dark:text-surface-200', totalText: 'text-surface-700 dark:text-surface-200' },
  'Ordinary Salary': { bg: 'bg-emerald-50/40', text: 'text-emerald-800', totalText: 'text-emerald-700' },
  'Leaves (VPL)': { bg: 'bg-surface-50 dark:bg-surface-900', text: 'text-surface-700 dark:text-surface-200', totalText: 'text-surface-700 dark:text-surface-200' },
  'Commissions': { bg: 'bg-emerald-50/40', text: 'text-emerald-800', totalText: 'text-emerald-700' },
  'Overtime': { bg: 'bg-surface-50 dark:bg-surface-900', text: 'text-surface-700 dark:text-surface-200', totalText: 'text-surface-700 dark:text-surface-200' },
  'Bonuses': { bg: 'bg-emerald-50/40', text: 'text-emerald-800', totalText: 'text-emerald-700' },
  'Incentives': { bg: 'bg-surface-50 dark:bg-surface-900', text: 'text-surface-700 dark:text-surface-200', totalText: 'text-surface-700 dark:text-surface-200' },
  'Other Income': { bg: 'bg-emerald-50/40', text: 'text-emerald-800', totalText: 'text-emerald-700' },
  'Salary Classification': { bg: 'bg-sky-50/40', text: 'text-sky-800', totalText: 'text-sky-700' },
  'Gov. Deductions': { bg: 'bg-red-50/40', text: 'text-red-800', totalText: 'text-red-700' },
  'Other Deductions': { bg: 'bg-red-50/40', text: 'text-red-800', totalText: 'text-red-700' },
  'Payroll Summary': { bg: 'bg-emerald-50/40', text: 'text-emerald-800', totalText: 'text-emerald-700' },
  'Employer Cost': { bg: 'bg-surface-50 dark:bg-surface-900', text: 'text-surface-700 dark:text-surface-200', totalText: 'text-surface-700 dark:text-surface-200' },
  'Notes & CC': { bg: 'bg-amber-50/40', text: 'text-amber-800', totalText: 'text-amber-700' },
}

/* Section total key: maps to last "total" money column in each section */
const sectionTotalKey: Record<string, string> = {
  'Ordinary Salary': 'ordinarySalary',
  'Leaves (VPL)': 'vpl',
  'Commissions': 'commissions',
  'Overtime': 'overtimeTotal',
  'Bonuses': 'bonusesTotal',
  'Incentives': 'incentivesTotal',
  'Other Income': 'totalOtherIncome',
  'Gov. Deductions': 'govDeductionsTotal',
  'Other Deductions': 'otherDeductionsTotal',
  'Employer Cost': '_employerTotal',
}

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
  const [incomeFilter, setIncomeFilter] = useState<'all' | 'positive' | 'zero' | 'negative'>('positive')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  /* Filters */
  const [accountFilter, setAccountFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [locationFilter, setLocationFilter] = useState('all')
  const [supervisorFilter, setSupervisorFilter] = useState('all')

  /* Employee lookup for location/supervisor enrichment */
  const [empLookup, setEmpLookup] = useState<Record<string, { location?: string | null; reportsToName?: string | null }>>({})

  /* ---------- Load payroll periods + employees on mount ---------- */
  useEffect(() => {
    let cancelled = false
    async function init() {
      setLoading(true)
      try {
        const [periods, emps] = await Promise.all([getPayrollPeriods(), getEmployees()])
        if (cancelled) return
        setPayrollPeriods(periods)
        const lookup: Record<string, { location?: string | null; reportsToName?: string | null }> = {}
        for (const e of emps) lookup[e.id] = { location: e.location, reportsToName: e.reportsToName }
        setEmpLookup(lookup)
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
        if (!cancelled) {
          setResults(data)
          setSelectedIds(new Set())
        }
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
      setSelectedIds(new Set())
      toast.success(`Payroll calculated for ${selectedCycle} — ${data.length} employees`)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Calculation failed')
    } finally {
      setCalculating(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCycle])

  /* ---------- Inline edit handler ---------- */
  const handleInlineUpdate = useCallback(
    async (row: PayrollCalcResult, field: 'payMethod' | 'notes' | 'ccEmail', value: string) => {
      try {
        const updated = await updatePayrollResultField(row.id, { [field]: value })
        setResults((prev) => prev.map((r) => (r.id === row.id ? updated : r)))
        if (detailRow?.id === row.id) setDetailRow(updated)
      } catch {
        toast.error('Failed to update field')
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [detailRow],
  )

  /* ---------- Unique filter values ---------- */
  const uniqueAccounts = useMemo(() => {
    const s = new Set(results.map(r => r.account).filter(Boolean) as string[])
    return Array.from(s).sort()
  }, [results])

  const uniqueStatuses = useMemo(() => {
    const s = new Set(results.map(r => r.contractStatus).filter(Boolean) as string[])
    return Array.from(s).sort()
  }, [results])

  const uniqueLocations = useMemo(() => {
    const s = new Set(results.map(r => empLookup[r.userId]?.location).filter(Boolean) as string[])
    return Array.from(s).sort()
  }, [results, empLookup])

  const uniqueSupervisors = useMemo(() => {
    const s = new Set(results.map(r => empLookup[r.userId]?.reportsToName).filter(Boolean) as string[])
    return Array.from(s).sort()
  }, [results, empLookup])

  /* ---------- Filtered rows ---------- */
  const displayedRows = useMemo(() => {
    let rows = results
    if (incomeFilter === 'positive') rows = rows.filter(r => r.netSalary > 0 || r.grossSalary > 0)
    if (incomeFilter === 'zero') rows = rows.filter(r => r.netSalary === 0 && r.grossSalary === 0)
    if (incomeFilter === 'negative') rows = rows.filter(r => r.netSalary < 0)
    if (accountFilter !== 'all') rows = rows.filter(r => r.account === accountFilter)
    if (statusFilter !== 'all') rows = rows.filter(r => r.contractStatus === statusFilter)
    if (locationFilter !== 'all') rows = rows.filter(r => empLookup[r.userId]?.location === locationFilter)
    if (supervisorFilter !== 'all') rows = rows.filter(r => empLookup[r.userId]?.reportsToName === supervisorFilter)
    const q = search.trim().toLowerCase()
    if (q) {
      rows = rows.filter((r) =>
        r.employeeName.toLowerCase().includes(q) ||
        (r.account ?? '').toLowerCase().includes(q) ||
        (r.contractStatus ?? '').toLowerCase().includes(q) ||
        (r.governmentId ?? '').toLowerCase().includes(q) ||
        String(r.employeeCmid ?? '').includes(q),
      )
    }
    return rows
  }, [results, search, incomeFilter, accountFilter, statusFilter, locationFilter, supervisorFilter, empLookup])

  /* ---------- Selection ---------- */
  const allSelected = displayedRows.length > 0 && displayedRows.every(r => selectedIds.has(r.id))
  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(displayedRows.map(r => r.id)))
    }
  }
  const toggleOne = (id: string) => {
    setSelectedIds(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  /* ---------- Summary stats ---------- */
  const summary = useMemo(() => {
    const rows = displayedRows
    const sum = (fn: (r: PayrollCalcResult) => number) => rows.reduce((a, r) => a + fn(r), 0)
    return {
      employees: rows.length,
      salary: sum(r => r.ordinarySalary),
      vpl: sum(r => r.vpl),
      commissions: sum(r => r.commissions),
      overtime: sum(r => r.overtimeTotal),
      bonuses: sum(r => r.bonusesTotal),
      incentives: sum(r => r.incentivesTotal),
      otherIncome: sum(r => r.totalOtherIncome ?? 0),
      grossIncome: sum(r => r.grossSalary),
      tssSalary: sum(r => r.tssSalary),
      govDeductions: sum(r => r.govDeductionsTotal),
      otherDeductions: sum(r => r.otherDeductionsTotal),
      netSalary: sum(r => r.netSalary),
      employerCost: sum(r => r.afpEmployer + r.sfsEmployer + r.arl + r.infotepEmployer),
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

  /* ---------- Paystub actions ---------- */
  const openPaystub = (id: string) => {
    window.open(getPaystubUrl(id), '_blank')
  }
  const openSelectedPaystubs = () => {
    Array.from(selectedIds).forEach(id => {
      const a = document.createElement('a')
      a.href = getPaystubUrl(id)
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    })
  }

  /* ---------- Cycle selector options ---------- */
  const cycleOptions = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    // Future + still-running cycles only — but we still want the current cycle highlighted
    // green when it appears in the list (per 19MAY2026 meeting).
    return buildCycleOptions(payrollPeriods.filter((p) => p.payDate >= today))
  }, [payrollPeriods])

  /* ---------- Detail modal: get section total value ---------- */
  const getSectionTotal = (s: SectionDef, row: PayrollCalcResult): number | null => {
    const key = sectionTotalKey[s.name]
    if (!key) return null
    if (key === '_employerTotal') return row.afpEmployer + row.sfsEmployer + row.arl + row.infotepEmployer
    const val = (row as unknown as Record<string, unknown>)[key]
    return typeof val === 'number' ? val : null
  }

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
            {selectedIds.size > 0 && (
              <button
                type="button"
                onClick={openSelectedPaystubs}
                className="btn-secondary"
              >
                <FileText className="w-4 h-4 shrink-0" />
                PayStubs ({selectedIds.size})
              </button>
            )}
            <button
              type="button"
              onClick={exportCSV}
              disabled={loading || displayedRows.length === 0}
              className="btn-secondary"
            >
              <Download className="w-4 h-4 shrink-0" />
              Export CSV
            </button>
            {(() => {
              // 21MAY2026 client video: disable the Calculate button on closed cycles.
              // Cycle is closed once today is past pay_date.
              const cycle = payrollPeriods.find((p) => p.cycleCode === selectedCycle)
              const todayStr = new Date().toISOString().slice(0, 10)
              const closed = cycle ? cycle.payDate < todayStr : false
              return (
                <button
                  type="button"
                  onClick={handleCalculate}
                  disabled={!selectedCycle || calculating || closed}
                  title={closed ? 'This cycle is closed — calculation is locked.' : undefined}
                  className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {calculating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Calculator className="w-4 h-4" />
                  )}
                  {calculating ? 'Calculating...' : closed ? 'Cycle closed' : 'Calculate Payroll'}
                </button>
              )
            })()}
          </>
        }
      />

      {/* -- Stat cards -- */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 sm:gap-3">
        <div className="stat-card">
          <div className="flex items-center gap-1.5 mb-1">
            <Users className="w-3.5 h-3.5 text-surface-400 dark:text-surface-500" />
            <p className="stat-label text-[10px]">Employees</p>
          </div>
          <p className="stat-value text-base">{summary.employees}</p>
        </div>
        <div className="stat-card border-emerald-200/70 bg-emerald-50/30">
          <p className="stat-label text-[10px] text-emerald-700 mb-1">Salary</p>
          <p className="stat-value text-sm">{money(summary.salary)}</p>
        </div>
        <div className="stat-card border-emerald-200/70 bg-emerald-50/30">
          <p className="stat-label text-[10px] text-emerald-700 mb-1">VPL</p>
          <p className="stat-value text-sm">{money(summary.vpl)}</p>
        </div>
        <div className="stat-card border-emerald-200/70 bg-emerald-50/30">
          <p className="stat-label text-[10px] text-emerald-700 mb-1">Commissions</p>
          <p className="stat-value text-sm">{money(summary.commissions)}</p>
        </div>
        <div className="stat-card border-emerald-200/70 bg-emerald-50/30">
          <p className="stat-label text-[10px] text-emerald-700 mb-1">Overtime</p>
          <p className="stat-value text-sm">{money(summary.overtime)}</p>
        </div>
        <div className="stat-card border-emerald-200/70 bg-emerald-50/30">
          <p className="stat-label text-[10px] text-emerald-700 mb-1">Bonuses</p>
          <p className="stat-value text-sm">{money(summary.bonuses)}</p>
        </div>
        <div className="stat-card border-emerald-200/70 bg-emerald-50/30">
          <p className="stat-label text-[10px] text-emerald-700 mb-1">Incentives</p>
          <p className="stat-value text-sm">{money(summary.incentives)}</p>
        </div>
        <div className="stat-card border-emerald-200/70 bg-emerald-50/30">
          <p className="stat-label text-[10px] text-emerald-700 mb-1">Other Income</p>
          <p className="stat-value text-sm">{money(summary.otherIncome)}</p>
        </div>
        <div className="stat-card border-brand-200/70 bg-brand-50/40">
          <div className="flex items-center gap-1.5 mb-1">
            <DollarSign className="w-3.5 h-3.5 text-brand-500" />
            <p className="stat-label text-[10px] text-brand-700">Gross Income</p>
          </div>
          <p className="stat-value text-sm">{money(summary.grossIncome)}</p>
        </div>
        <div className="stat-card border-sky-200/70 bg-sky-50/30">
          <p className="stat-label text-[10px] text-sky-700 mb-1">TSS Salary</p>
          <p className="stat-value text-sm">{money(summary.tssSalary)}</p>
        </div>
        <div className="stat-card border-red-200/70 bg-red-50/30">
          <p className="stat-label text-[10px] text-red-700 mb-1">Gov Deductions</p>
          <p className="stat-value text-sm">{money(summary.govDeductions)}</p>
        </div>
        <div className="stat-card border-red-200/70 bg-red-50/30">
          <p className="stat-label text-[10px] text-red-700 mb-1">Other Deductions</p>
          <p className="stat-value text-sm">{money(summary.otherDeductions)}</p>
        </div>
        <div className="stat-card border-emerald-300/70 bg-emerald-50/60">
          <div className="flex items-center gap-1.5 mb-1">
            <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
            <p className="stat-label text-[10px] text-emerald-800">Net Salary</p>
          </div>
          <p className="stat-value text-sm font-bold text-emerald-700">{money(summary.netSalary)}</p>
        </div>
        <div className="stat-card border-surface-200/70 bg-surface-50/40">
          <div className="flex items-center gap-1.5 mb-1">
            <Building2 className="w-3.5 h-3.5 text-surface-500 dark:text-surface-400 dark:text-surface-500" />
            <p className="stat-label text-[10px] text-surface-600 dark:text-surface-300">Employer Cost</p>
          </div>
          <p className="stat-value text-sm">{money(summary.employerCost)}</p>
        </div>
      </div>

      {/* -- Toolbar -- */}
      <div className="toolbar flex-wrap">
        {/* Row 1: cycle + search + income toggle */}
        <div className="w-full sm:w-48 shrink-0">
          <AdminSelect
            value={selectedCycle}
            onChange={(val) => setSelectedCycle(val)}
            options={cycleOptions}
            placeholder="Select cycle..."
            disabled={loading && payrollPeriods.length === 0}
          />
        </div>
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 dark:text-surface-500 shrink-0" />
          <input
            type="text"
            placeholder="Search name, CMID, Gov ID, account..."
            className="input pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={() => setIncomeFilter(f => f === 'all' ? 'positive' : f === 'positive' ? 'zero' : f === 'zero' ? 'negative' : 'all')}
          className={`btn-secondary text-xs whitespace-nowrap shrink-0 ${
            incomeFilter === 'positive' ? 'bg-amber-50 border-amber-300 text-amber-700' :
            incomeFilter === 'zero' ? 'bg-blue-50 border-blue-300 text-blue-700' :
            incomeFilter === 'negative' ? 'bg-red-50 border-red-300 text-red-700' : ''
          }`}
          title={
            incomeFilter === 'all' ? 'Showing all employees' :
            incomeFilter === 'positive' ? 'Showing only employees with income' :
            incomeFilter === 'zero' ? 'Showing only zero-income employees' :
            'Showing only negative-income employees'
          }
        >
          {incomeFilter === 'positive' ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {incomeFilter === 'all' ? 'Show all' : incomeFilter === 'positive' ? 'Income > 0' : incomeFilter === 'zero' ? 'Income = 0' : 'Income < 0'}
        </button>
        {/* Force break between rows */}
        <div className="w-full h-0" />
        {/* Row 2: secondary filters */}
        <div className="w-full sm:w-36 shrink-0">
          <AdminSelect
            value={accountFilter}
            onChange={setAccountFilter}
            options={[{ value: 'all', label: 'All accounts' }, ...uniqueAccounts.map(a => ({ value: a, label: a }))]}
          />
        </div>
        <div className="w-full sm:w-36 shrink-0">
          <AdminSelect
            value={statusFilter}
            onChange={setStatusFilter}
            options={[{ value: 'all', label: 'All statuses' }, ...uniqueStatuses.map(s => ({ value: s, label: s }))]}
          />
        </div>
        <div className="w-full sm:w-36 shrink-0">
          <AdminSelect
            value={locationFilter}
            onChange={setLocationFilter}
            options={[{ value: 'all', label: 'All locations' }, ...uniqueLocations.map(l => ({ value: l, label: l }))]}
          />
        </div>
        <div className="w-full sm:w-36 shrink-0">
          <AdminSelect
            value={supervisorFilter}
            onChange={setSupervisorFilter}
            options={[{ value: 'all', label: 'All supervisors' }, ...uniqueSupervisors.map(s => ({ value: s, label: s }))]}
          />
        </div>
      </div>

      {/* -- Table -- */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: '5400px' }}>
            <thead>
              {/* Row 1: section group headers */}
              <tr>
                <th className="px-2 py-2 text-xs bg-surface-50 dark:bg-surface-900 border-b border-surface-200 dark:border-surface-700 w-10">&nbsp;</th>
                {sections.map((s) => (
                  <th
                    key={s.name}
                    colSpan={s.columns.length}
                    className={`px-3 py-2 text-xs font-semibold text-center border-b border-surface-200 dark:border-surface-700 ${s.bg} ${s.headerText}`}
                  >
                    {s.name}
                  </th>
                ))}
                <th className="px-2 py-2 text-xs bg-surface-50 dark:bg-surface-900 border-b border-surface-200 dark:border-surface-700 w-16 text-center">Actions</th>
              </tr>
              {/* Row 2: individual column headers */}
              <tr>
                <th className="px-2 py-2.5 border-b border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900">
                  <button type="button" onClick={toggleAll} className="text-surface-500 dark:text-surface-400 dark:text-surface-500 hover:text-brand-600">
                    {allSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                  </button>
                </th>
                {sections.map((s) =>
                  s.columns.map((col) => (
                    <th
                      key={col.key}
                      className={`px-3 py-2.5 text-xs font-medium whitespace-nowrap border-b border-surface-200 dark:border-surface-700 ${
                        col.type === 'money' || col.type === 'hours' || col.type === 'bool'
                          ? 'text-right'
                          : 'text-left'
                      } ${s.bg} ${s.headerText}`}
                    >
                      {col.label}
                    </th>
                  )),
                )}
                <th className="px-2 py-2.5 text-xs border-b border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 text-center">PayStub</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <SkeletonTableRows rows={8} cols={allColumns.length + 2} />
              ) : displayedRows.length === 0 ? (
                <tr>
                  <td colSpan={allColumns.length + 2} className="py-16 text-center text-surface-400 dark:text-surface-500">
                    <div className="flex flex-col items-center gap-3">
                      <Calculator className="w-10 h-10 text-surface-300" />
                      <p className="text-base font-medium text-surface-500 dark:text-surface-400 dark:text-surface-500">No payroll data</p>
                      <p className="text-sm text-surface-400 dark:text-surface-500">
                        Select a payroll cycle and click Calculate Payroll
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                displayedRows.map((r) => (
                  <tr
                    key={r.id}
                    className={`border-b border-surface-100 dark:border-surface-800 hover:bg-surface-50/70 transition-colors cursor-pointer ${selectedIds.has(r.id) ? 'bg-brand-50/30' : 'bg-white dark:bg-surface-900'}`}
                    onClick={() => setDetailRow(r)}
                  >
                    {/* Checkbox */}
                    <td className="px-2 py-1 text-center" onClick={(e) => e.stopPropagation()}>
                      <button type="button" onClick={() => toggleOne(r.id)} className="text-surface-400 dark:text-surface-500 hover:text-brand-600">
                        {selectedIds.has(r.id) ? <CheckSquare className="w-4 h-4 text-brand-600" /> : <Square className="w-4 h-4" />}
                      </button>
                    </td>
                    {sections.map((s) =>
                      s.columns.map((col) => {
                        const val = col.accessor(r)

                        /* Inline-editable: Payment Method (select dropdown) */
                        if (col.key === 'payMethod') {
                          return (
                            <td key={col.key} className="py-1 px-1 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                              <select
                                className="w-full text-xs border border-surface-200 dark:border-surface-700 rounded px-1.5 py-1.5 bg-white dark:bg-surface-900 text-surface-700 dark:text-surface-200 focus:ring-1 focus:ring-brand-400 focus:border-brand-400 outline-none"
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

                        /* Inline-editable: Notes */
                        if (col.key === 'notes') {
                          return (
                            <td key={col.key} className="py-1 px-1 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="text"
                                className="w-full text-xs border border-surface-200 dark:border-surface-700 rounded px-1.5 py-1.5 bg-white dark:bg-surface-900 text-surface-700 dark:text-surface-200 focus:ring-1 focus:ring-brand-400 outline-none min-w-[100px]"
                                defaultValue={String(val)}
                                placeholder="Note..."
                                onBlur={(e) => { if (e.target.value !== String(val)) handleInlineUpdate(r, 'notes', e.target.value) }}
                                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                              />
                            </td>
                          )
                        }

                        /* Inline-editable: CC Email */
                        if (col.key === 'ccEmail') {
                          return (
                            <td key={col.key} className="py-1 px-1 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="email"
                                className="w-full text-xs border border-surface-200 dark:border-surface-700 rounded px-1.5 py-1.5 bg-white dark:bg-surface-900 text-surface-700 dark:text-surface-200 focus:ring-1 focus:ring-brand-400 outline-none min-w-[120px]"
                                defaultValue={String(val)}
                                placeholder="cc@email.com"
                                onBlur={(e) => { if (e.target.value !== String(val)) handleInlineUpdate(r, 'ccEmail', e.target.value) }}
                                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                              />
                            </td>
                          )
                        }

                        /* Employee name — sticky left */
                        if (col.key === 'employeeName') {
                          return (
                            <td
                              key={col.key}
                              className="py-3 px-3 text-surface-900 dark:text-surface-50 font-medium whitespace-nowrap sticky left-0 bg-white dark:bg-surface-900 z-10 border-r border-surface-100 dark:border-surface-800"
                            >
                              {String(val)}
                            </td>
                          )
                        }

                        /* Boolean: deductionValidation — show Valid/Invalid */
                        if (col.type === 'bool') {
                          const isInvalid = val === true
                          return (
                            <td key={col.key} className="py-3 px-3 text-right whitespace-nowrap">
                              {isInvalid ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                                  <AlertTriangle className="w-3 h-3" />
                                  Invalid
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                                  Valid
                                </span>
                              )}
                            </td>
                          )
                        }

                        /* Money */
                        if (col.type === 'money') {
                          return (
                            <td key={col.key} className="py-3 px-3 text-right tabular-nums whitespace-nowrap text-surface-700 dark:text-surface-200">
                              {money(val as number)}
                            </td>
                          )
                        }

                        /* Hours */
                        if (col.type === 'hours') {
                          return (
                            <td key={col.key} className="py-3 px-3 text-right tabular-nums whitespace-nowrap text-surface-700 dark:text-surface-200">
                              {hrs(val as number)}
                            </td>
                          )
                        }

                        /* Text (default) */
                        return (
                          <td key={col.key} className="py-3 px-3 text-surface-700 dark:text-surface-200 whitespace-nowrap">
                            {String(val) || <span className="text-surface-300">--</span>}
                          </td>
                        )
                      }),
                    )}
                    {/* PayStub action */}
                    <td className="px-2 py-1 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => openPaystub(r.id)}
                        className="p-1 rounded hover:bg-brand-50 text-brand-600 hover:text-brand-700"
                        title="View PayStub"
                      >
                        <FileText className="w-4 h-4" />
                      </button>
                    </td>
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
            className="bg-white dark:bg-surface-900 rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200 dark:border-surface-700">
              <div>
                <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-50">{detailRow.employeeName}</h2>
                <p className="text-sm text-surface-500 dark:text-surface-400 dark:text-surface-500">
                  {[
                    detailRow.governmentId ? `Cédula ${detailRow.governmentId}` : null,
                    detailRow.employeeCmid != null ? `CMID ${detailRow.employeeCmid}` : null,
                    detailRow.contractStatus || null,
                    detailRow.payrollCycleCode || null,
                  ].filter(Boolean).join(' | ')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openPaystub(detailRow.id)}
                  className="btn-secondary text-xs py-1.5 px-3"
                  title="View PayStub"
                >
                  <FileText className="w-3.5 h-3.5" />
                  PayStub
                </button>
                <button type="button" onClick={() => setDetailRow(null)} className="p-1 rounded hover:bg-surface-100 dark:hover:bg-surface-700 dark:bg-surface-800">
                  <X className="w-5 h-5 text-surface-500 dark:text-surface-400 dark:text-surface-500" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="px-6 py-4 space-y-3">
              {sections.map((s) => {
                const colors = sectionColorMap[s.name] || { bg: 'bg-surface-50 dark:bg-surface-900', text: 'text-surface-700 dark:text-surface-200', totalText: 'text-surface-700 dark:text-surface-200' }
                const totalVal = getSectionTotal(s, detailRow)

                // For "Salary Classification" and "Payroll Summary" — no total in header
                const showHeaderTotal = totalVal != null && s.name !== 'Salary Classification' && s.name !== 'Payroll Summary' && s.name !== 'Employee' && s.name !== 'Notes & CC'

                // Columns to render inside the section (skip the "total" column since shown in header)
                const totalKey = sectionTotalKey[s.name]
                const displayCols = totalKey && totalKey !== '_employerTotal'
                  ? s.columns.filter(c => c.key !== totalKey)
                  : s.columns

                return (
                  <div key={s.name} className={`rounded-xl border border-surface-200 dark:border-surface-700 p-3 ${colors.bg}`}>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className={`text-xs font-semibold uppercase tracking-wider ${colors.text}`}>{s.name}</h3>
                      {showHeaderTotal && (
                        <span className={`text-xs font-bold tabular-nums ${colors.totalText}`}>
                          {money(totalVal!)}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1">
                      {displayCols.map((col) => {
                        const val = col.accessor(detailRow)
                        let display: React.ReactNode

                        /* Payment Method — editable */
                        if (col.key === 'payMethod') {
                          display = (
                            <select
                              className="text-sm font-medium border border-surface-200 dark:border-surface-700 rounded px-1.5 py-0.5 bg-white dark:bg-surface-900 text-surface-800 dark:text-surface-100 focus:ring-1 focus:ring-brand-400 outline-none"
                              value={String(val)}
                              onChange={(e) => {
                                handleInlineUpdate(detailRow, 'payMethod', e.target.value)
                              }}
                            >
                              {PAY_METHOD_OPTIONS.map((m) => (
                                <option key={m} value={m}>{m || '--'}</option>
                              ))}
                            </select>
                          )
                        } else if (col.key === 'notes') {
                          return (
                            <div key={col.key} className="col-span-3 flex flex-col gap-1 py-0.5">
                              <span className="text-xs text-surface-500 dark:text-surface-400 dark:text-surface-500">{col.label}</span>
                              <textarea
                                className="text-sm border border-surface-200 dark:border-surface-700 rounded px-2 py-1.5 bg-white dark:bg-surface-900 text-surface-800 dark:text-surface-100 focus:ring-1 focus:ring-brand-400 outline-none w-full resize-none"
                                rows={2}
                                defaultValue={String(val)}
                                placeholder="Optional note..."
                                onBlur={(e) => { if (e.target.value !== String(val)) handleInlineUpdate(detailRow, 'notes', e.target.value) }}
                              />
                            </div>
                          )
                        } else if (col.key === 'ccEmail') {
                          return (
                            <div key={col.key} className="col-span-3 flex flex-col gap-1 py-0.5">
                              <span className="text-xs text-surface-500 dark:text-surface-400 dark:text-surface-500">{col.label}</span>
                              <input
                                type="email"
                                className="text-sm border border-surface-200 dark:border-surface-700 rounded px-2 py-1.5 bg-white dark:bg-surface-900 text-surface-800 dark:text-surface-100 focus:ring-1 focus:ring-brand-400 outline-none w-full"
                                defaultValue={String(val)}
                                placeholder="cc@email.com"
                                onBlur={(e) => { if (e.target.value !== String(val)) handleInlineUpdate(detailRow, 'ccEmail', e.target.value) }}
                                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                              />
                            </div>
                          )
                        } else if (col.type === 'money') {
                          display = <span className="text-surface-800 dark:text-surface-100 font-medium tabular-nums">{money(val as number)}</span>
                        } else if (col.type === 'hours') {
                          display = <span className="text-surface-800 dark:text-surface-100 font-medium tabular-nums">{hrs(val as number)}</span>
                        } else if (col.type === 'bool') {
                          const isInvalid = val === true
                          display = isInvalid ? (
                            <span className="inline-flex items-center gap-1 text-red-700 font-semibold text-sm">
                              <AlertTriangle className="w-3.5 h-3.5" /> Invalid
                            </span>
                          ) : (
                            <span className="text-emerald-700 font-semibold text-sm">Valid</span>
                          )
                        } else {
                          display = <span className="text-surface-800 dark:text-surface-100 font-medium">{String(val) || '--'}</span>
                        }

                        return (
                          <div key={col.key} className="flex justify-between text-sm py-0.5">
                            <span className="text-surface-500 dark:text-surface-400 dark:text-surface-500">{col.label}</span>
                            {display}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* 22MAY2026 client video: explicit Save (+ Lock) buttons on the
                payroll calculator detail modal. Fields auto-save on blur (notes,
                ccEmail, payMethod) — Save is the visual confirmation + exit. */}
            <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 px-6 py-4 border-t border-surface-200 dark:border-surface-700">
              <button type="button" onClick={() => setDetailRow(null)} className="btn-secondary">
                Cancel
              </button>
              <button type="button" onClick={() => setDetailRow(null)} className="btn-primary">
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
