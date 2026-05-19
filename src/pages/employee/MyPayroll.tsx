import { useState, useEffect, useMemo } from 'react'
import { Wallet, CalendarDays, Download, FileText, Eye, Loader2 } from 'lucide-react'
import { getMyPayroll, getEmployeePayrollPeriods, type MyPayrollResult, type PayrollPeriod } from '@/lib/apiEmployee'
import { fetchMyPayrollSlipPdfBlob, downloadMyPayrollSlipPdf } from '@/lib/apiSessions'
import AdminSelect from '@/components/AdminSelect'
import { PageHeader } from '@/components/PageHeader'

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function money(n: number | null | undefined): string {
  const v = Number(n ?? 0)
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function hours(n: number | null | undefined): string {
  const v = Number(n ?? 0)
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ---------------------------------------------------------------------------
// Column groups — mirror admin Payroll.tsx for "same table same labels same view"
// per 18MAY2026 client video.
// ---------------------------------------------------------------------------

type ColType = 'money' | 'hours' | 'text'
interface Col {
  key: string
  label: string
  type: ColType
  accessor: (r: MyPayrollResult) => number | string
}
interface Group {
  name: string
  bg: string
  headerText: string
  cols: Col[]
}

const GROUPS: Group[] = [
  {
    name: 'Ordinary Salary',
    bg: 'bg-emerald-50',
    headerText: 'text-emerald-800',
    cols: [
      { key: 'hreg1', label: 'HREG1', type: 'hours', accessor: (r) => r.hreg1 },
      { key: 'hreg2', label: 'HREG2', type: 'hours', accessor: (r) => r.hreg2 },
      { key: 'hreg', label: 'HREG', type: 'hours', accessor: (r) => r.hreg },
      { key: 'ordinarySalary', label: 'Salary', type: 'money', accessor: (r) => r.ordinarySalary },
    ],
  },
  {
    name: 'Leaves (VPL)',
    bg: 'bg-surface-50',
    headerText: 'text-surface-700',
    cols: [
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
    cols: [
      { key: 'commissions', label: 'Commissions', type: 'money', accessor: (r) => r.commissions },
    ],
  },
  {
    name: 'Overtime',
    bg: 'bg-surface-50',
    headerText: 'text-surface-700',
    cols: [
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
    cols: [
      { key: 'collaboration', label: 'Collaboration', type: 'money', accessor: (r) => r.collaboration },
      { key: 'recruiting', label: 'Recruiting', type: 'money', accessor: (r) => r.recruiting },
      { key: 'profitSharing', label: 'Profit Sharing', type: 'money', accessor: (r) => r.profitSharing },
      { key: 'bonusesTotal', label: 'Total Bonuses', type: 'money', accessor: (r) => r.bonusesTotal },
    ],
  },
  {
    name: 'Incentives',
    bg: 'bg-surface-50',
    headerText: 'text-surface-700',
    cols: [
      { key: 'attendanceIncentive', label: 'Attendance', type: 'money', accessor: (r) => r.attendanceIncentive },
      { key: 'kpiIncentive', label: 'KPI', type: 'money', accessor: (r) => r.kpiIncentive },
      { key: 'incentivesTotal', label: 'Total Incent.', type: 'money', accessor: (r) => r.incentivesTotal },
    ],
  },
  {
    name: 'Other Income',
    bg: 'bg-emerald-50',
    headerText: 'text-emerald-800',
    cols: [
      { key: 'subsidio', label: 'Subsidy', type: 'money', accessor: (r) => r.subsidio ?? 0 },
      { key: 'reembolso', label: 'Reimbursement', type: 'money', accessor: (r) => r.reembolso ?? 0 },
      { key: 'totalOtherIncome', label: 'Total Other', type: 'money', accessor: (r) => r.totalOtherIncome ?? 0 },
    ],
  },
  {
    name: 'Salary Classification',
    bg: 'bg-sky-50',
    headerText: 'text-sky-800',
    cols: [
      { key: 'grossSalary', label: 'Gross Salary', type: 'money', accessor: (r) => r.grossSalary },
      { key: 'tssSalary', label: 'TSS Salary', type: 'money', accessor: (r) => r.tssSalary },
      { key: 'isrSalary', label: 'ISR Salary', type: 'money', accessor: (r) => r.isrSalary },
    ],
  },
  {
    name: 'Gov. Deductions',
    bg: 'bg-red-50',
    headerText: 'text-red-800',
    cols: [
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
    cols: [
      { key: 'tssDependents', label: 'TSS Dep.', type: 'money', accessor: (r) => r.tssDependents },
      { key: 'payLater', label: 'PayLater', type: 'money', accessor: (r) => r.payLater },
      { key: 'gym', label: 'Gym', type: 'money', accessor: (r) => r.gym },
      { key: 'insuranceDed', label: 'Insurance', type: 'money', accessor: (r) => r.insuranceDed },
      { key: 'cafeteria', label: 'Cafeteria', type: 'money', accessor: (r) => r.cafeteria },
      { key: 'adminDeduction', label: 'Admin', type: 'money', accessor: (r) => r.adminDeduction },
      { key: 'otherDeductionsTotal', label: 'Total Other', type: 'money', accessor: (r) => r.otherDeductionsTotal },
    ],
  },
  {
    name: 'Payroll Summary',
    bg: 'bg-emerald-50',
    headerText: 'text-emerald-800',
    cols: [
      { key: 'totalDeductions', label: 'Total Ded.', type: 'money', accessor: (r) => r.totalDeductions },
      { key: 'netSalary', label: 'Net Salary', type: 'money', accessor: (r) => r.netSalary },
    ],
  },
]

function formatCell(col: Col, r: MyPayrollResult): string {
  const v = col.accessor(r)
  if (col.type === 'money') return `RD$ ${money(Number(v))}`
  if (col.type === 'hours') return `${hours(Number(v))} H`
  return String(v ?? '')
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EmployeeMyPayroll() {
  const currentYear = new Date().getFullYear()
  const [periodsYear, setPeriodsYear] = useState(currentYear)
  const [periods, setPeriods] = useState<PayrollPeriod[]>([])
  const [selectedCycle, setSelectedCycle] = useState('')
  const [result, setResult] = useState<MyPayrollResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [payslipLoading, setPayslipLoading] = useState(false)
  const [payslipPreviewUrl, setPayslipPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    getEmployeePayrollPeriods(periodsYear).then((data) => {
      setPeriods(data)
      const today = new Date().toISOString().slice(0, 10)
      const current = data.find((p) => p.periodFrom <= today && today <= p.periodTo)
      if (current && !selectedCycle) setSelectedCycle(current.cycleCode)
    }).catch(() => setPeriods([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodsYear])

  useEffect(() => {
    if (!selectedCycle) return
    setLoading(true)
    setError(null)
    getMyPayroll(selectedCycle)
      .then(setResult)
      .catch((e) => {
        setResult(null)
        if (e instanceof Error && e.message.includes('not found')) setError(null)
        else setError(e instanceof Error ? e.message : 'Failed to load payroll data')
      })
      .finally(() => setLoading(false))
  }, [selectedCycle])

  const selectedPeriod = periods.find((p) => p.cycleCode === selectedCycle)
  const cycleCurrent = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const cur = periods.find((p) => p.periodFrom <= today && today <= p.periodTo)
    return cur ? cur.cycleCode : null
  }, [periods])

  async function handlePreviewPayslip() {
    if (!selectedPeriod) return
    setPayslipLoading(true)
    try {
      const blob = await fetchMyPayrollSlipPdfBlob({
        from: selectedPeriod.periodFrom,
        to: selectedPeriod.periodTo,
      })
      const url = URL.createObjectURL(blob)
      setPayslipPreviewUrl(url)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load pay slip')
    } finally {
      setPayslipLoading(false)
    }
  }

  async function handleDownloadPayslip() {
    if (!selectedPeriod) return
    setPayslipLoading(true)
    try {
      await downloadMyPayrollSlipPdf({
        from: selectedPeriod.periodFrom,
        to: selectedPeriod.periodTo,
      })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to download pay slip')
    } finally {
      setPayslipLoading(false)
    }
  }

  function exportCSV() {
    if (!result) return
    const allCols = GROUPS.flatMap((g) => g.cols)
    const headers = ['Cycle', 'Period From', 'Period To', 'Pay Date', ...allCols.map((c) => c.label)]
    const row = [
      result.payrollCycleCode,
      result.periodFrom,
      result.periodTo,
      result.payDate ?? '',
      ...allCols.map((c) => String(c.accessor(result))),
    ]
    const csv = [headers.join(','), row.join(',')].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mypayroll-${result.payrollCycleCode}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="page">
      <PageHeader
        title="My Payroll"
        subtitle="View your payroll calculations and payment history."
        icon={<Wallet className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={exportCSV}
              disabled={!result}
              className="btn-secondary rounded-xl disabled:opacity-50"
              title="Export this cycle to CSV"
            >
              <Download className="w-4 h-4" /> Export CSV
            </button>
            <button
              type="button"
              onClick={() => void handlePreviewPayslip()}
              disabled={!result || payslipLoading}
              className="btn-primary rounded-xl disabled:opacity-50"
              title="Preview your pay stub"
            >
              {payslipLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              Pay Stub
            </button>
          </div>
        }
      />

      {/* Cycle selector */}
      <div className="card overflow-hidden">
        <div className="card-header">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-brand-50 border border-brand-100 text-brand-600 flex items-center justify-center shrink-0">
              <CalendarDays className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-surface-900">Payroll period</h2>
              <p className="text-[11px] text-surface-500 mt-0.5">Select a cycle to view your payroll details</p>
            </div>
          </div>
        </div>
        <div className="p-4 sm:p-5 flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="w-24 shrink-0">
            <label className="label">Year</label>
            <AdminSelect
              value={String(periodsYear)}
              onChange={(val) => setPeriodsYear(parseInt(val, 10))}
              options={[currentYear - 1, currentYear, currentYear + 1, currentYear + 2].map((y) => ({ value: String(y), label: String(y) }))}
            />
          </div>
          <div className="flex-1 min-w-[200px] max-w-md">
            <label className="label">Cycle</label>
            <AdminSelect
              value={selectedCycle}
              onChange={setSelectedCycle}
              options={periods.map((p) => ({
                value: p.cycleCode,
                label: cycleCurrent === p.cycleCode ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span>{p.cycleCode} ({p.periodFrom} – {p.periodTo})</span>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider bg-emerald-100 text-emerald-700">current</span>
                  </span>
                ) : (
                  <span>{p.cycleCode} ({p.periodFrom} – {p.periodTo})</span>
                ),
              }))}
              placeholder="Select a cycle..."
            />
          </div>
          {selectedPeriod && (
            <div className="text-xs text-surface-500 pb-1">
              Pay date: <span className="font-semibold text-surface-700">{selectedPeriod.payDate}</span>
            </div>
          )}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="alert-error"><span>{error}</span></div>
      )}

      {/* Empty state */}
      {!loading && !error && !result && selectedCycle && (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon"><Wallet className="w-5 h-5" /></div>
            <p className="empty-state-title">No payroll data</p>
            <p className="empty-state-description">
              Payroll has not been calculated for this cycle yet. Check back after your payroll is processed.
            </p>
          </div>
        </div>
      )}

      {/* Wide horizontal table — mirrors admin Payroll layout (per 18MAY2026 client video) */}
      {!loading && result && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-[1800px] w-full text-left border-collapse">
              <thead>
                {/* Group header row */}
                <tr>
                  {GROUPS.map((g) => (
                    <th
                      key={g.name}
                      colSpan={g.cols.length}
                      className={`px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wider border-b border-surface-200 ${g.bg} ${g.headerText}`}
                    >
                      {g.name}
                    </th>
                  ))}
                </tr>
                {/* Column label row */}
                <tr>
                  {GROUPS.flatMap((g) =>
                    g.cols.map((c) => (
                      <th
                        key={c.key}
                        className="px-3 py-1.5 text-[10px] font-semibold text-surface-500 uppercase tracking-wider whitespace-nowrap border-b border-surface-200 bg-surface-50"
                      >
                        {c.label}
                      </th>
                    ))
                  )}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-surface-100">
                  {GROUPS.flatMap((g) =>
                    g.cols.map((c) => (
                      <td
                        key={c.key}
                        className="px-3 py-2.5 text-xs text-surface-700 tabular-nums whitespace-nowrap text-right font-medium"
                      >
                        {formatCell(c, result)}
                      </td>
                    ))
                  )}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PayStub preview modal */}
      {payslipPreviewUrl && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <button type="button" className="absolute inset-0" onClick={() => {
            URL.revokeObjectURL(payslipPreviewUrl)
            setPayslipPreviewUrl(null)
          }} aria-label="Close" />
          <div className="relative z-10 w-[95vw] max-w-5xl h-[90vh] rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col">
            <div className="modal-header">
              <h2 className="text-base font-semibold text-surface-900">Pay Stub Preview</h2>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => void handleDownloadPayslip()} className="btn-secondary rounded-xl text-sm">
                  <Download className="w-4 h-4" /> Download PDF
                </button>
                <button type="button" onClick={() => {
                  URL.revokeObjectURL(payslipPreviewUrl)
                  setPayslipPreviewUrl(null)
                }} className="btn-icon" aria-label="Close">
                  <Eye className="w-4 h-4" />
                </button>
              </div>
            </div>
            <iframe src={payslipPreviewUrl} title="Pay Stub" className="flex-1 w-full border-0" />
          </div>
        </div>
      )}
    </div>
  )
}
