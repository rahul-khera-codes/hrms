import { useState, useEffect } from 'react'
import { Wallet, CalendarDays, DollarSign, TrendingDown, ArrowDownRight, Briefcase, Clock, Gift } from 'lucide-react'
import { getPayrollPeriods, type PayrollPeriod } from '@/lib/apiAdmin'
import { getMyPayroll, type MyPayrollResult } from '@/lib/apiEmployee'
import AdminSelect from '@/components/AdminSelect'
import { PageHeader } from '@/components/PageHeader'

function fmt(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtHrs(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

interface SectionProps {
  title: string
  icon: React.ReactNode
  iconBg: string
  children: React.ReactNode
}

function Section({ title, icon, iconBg, children }: SectionProps) {
  return (
    <div className="card overflow-hidden">
      <div className="card-header">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${iconBg}`}>
            {icon}
          </div>
          <h3 className="text-sm font-semibold text-surface-900">{title}</h3>
        </div>
      </div>
      <div className="p-4 sm:p-5">
        {children}
      </div>
    </div>
  )
}

interface LineProps {
  label: string
  value: string
  bold?: boolean
  highlight?: boolean
  sub?: boolean
}

function Line({ label, value, bold, highlight, sub }: LineProps) {
  return (
    <div className={`flex items-center justify-between py-1.5 ${sub ? 'pl-4' : ''} ${bold ? 'border-t border-surface-200 pt-2.5 mt-1' : ''}`}>
      <span className={`text-xs ${bold ? 'font-semibold text-surface-900' : sub ? 'text-surface-500' : 'text-surface-700'}`}>
        {label}
      </span>
      <span className={`text-xs tabular-nums ${bold ? 'font-bold' : 'font-medium'} ${highlight ? 'text-brand-700' : bold ? 'text-surface-900' : 'text-surface-700'}`}>
        {value}
      </span>
    </div>
  )
}

export default function EmployeeMyPayroll() {
  const currentYear = new Date().getFullYear()
  const [periodsYear, setPeriodsYear] = useState(currentYear)
  const [periods, setPeriods] = useState<PayrollPeriod[]>([])
  const [selectedCycle, setSelectedCycle] = useState('')
  const [result, setResult] = useState<MyPayrollResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getPayrollPeriods(periodsYear).then((data) => {
      setPeriods(data)
      // Auto-select the current cycle
      const today = new Date()
      const current = data.find((p) => {
        const from = new Date(p.periodFrom)
        const to = new Date(p.periodTo)
        return today >= from && today <= to
      })
      if (current) {
        setSelectedCycle(current.cycleCode)
      } else if (data.length > 0) {
        // Pick most recent period
        setSelectedCycle(data[data.length - 1].cycleCode)
      } else {
        setSelectedCycle('')
      }
    }).catch(() => {
      setPeriods([])
      setSelectedCycle('')
    })
  }, [periodsYear])

  useEffect(() => {
    if (!selectedCycle) {
      setResult(null)
      return
    }
    setLoading(true)
    setError(null)
    getMyPayroll(selectedCycle)
      .then((data) => {
        setResult(data)
      })
      .catch((e) => {
        setResult(null)
        if (e instanceof Error && e.message.includes('not found')) {
          setError(null) // Not calculated yet, show empty state
        } else {
          setError(e instanceof Error ? e.message : 'Failed to load payroll data')
        }
      })
      .finally(() => setLoading(false))
  }, [selectedCycle])

  const selectedPeriod = periods.find((p) => p.cycleCode === selectedCycle)

  return (
    <div className="page">
      <PageHeader
        title="My Payroll"
        subtitle="View your payroll calculations and payment history."
        icon={<Wallet className="w-5 h-5" />}
      />

      {/* Cycle Selector */}
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
              options={[currentYear - 1, currentYear, currentYear + 1].map((y) => ({ value: String(y), label: y }))}
            />
          </div>
          <div className="flex-1 min-w-[200px] max-w-sm">
            <label className="label">Cycle</label>
            <AdminSelect
              value={selectedCycle}
              onChange={setSelectedCycle}
              options={periods.map((p) => ({
                value: p.cycleCode,
                label: `${p.cycleCode} (${p.periodFrom} - ${p.periodTo})`,
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

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Error state */}
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

      {/* Payroll Detail */}
      {!loading && result && (
        <div className="space-y-4">
          {/* Summary Banner */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800 p-5 sm:p-6 shadow-lg shadow-brand-500/20">
            <div className="relative z-10 grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-brand-200 text-[10px] font-semibold uppercase tracking-wider">Gross Salary</p>
                <p className="text-xl sm:text-2xl font-bold text-white mt-0.5 tabular-nums">${fmt(result.grossSalary)}</p>
              </div>
              <div>
                <p className="text-brand-200 text-[10px] font-semibold uppercase tracking-wider">Total Deductions</p>
                <p className="text-xl sm:text-2xl font-bold text-white mt-0.5 tabular-nums">${fmt(result.totalDeductions)}</p>
              </div>
              <div className="col-span-2 sm:col-span-2">
                <p className="text-brand-200 text-[10px] font-semibold uppercase tracking-wider">Net Salary</p>
                <p className="text-2xl sm:text-3xl font-bold text-white mt-0.5 tabular-nums">${fmt(result.netSalary)}</p>
              </div>
            </div>
            <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Earnings */}
            <Section
              title="Earnings"
              icon={<DollarSign className="w-4 h-4" />}
              iconBg="bg-emerald-50 border-emerald-100 text-emerald-600"
            >
              <div className="space-y-0.5">
                <Line label="Regular Hours (HREG)" value={`${fmtHrs(result.hreg)} hrs`} />
                <Line label="Ordinary Salary" value={`$${fmt(result.ordinarySalary)}`} />
                {result.vpl > 0 && <Line label="Leave Pay (VPL)" value={`$${fmt(result.vpl)}`} />}
                {result.vacation > 0 && <Line label="Vacation" value={`$${fmt(result.vacation)}`} sub />}
                {result.matrimony > 0 && <Line label="Matrimony" value={`$${fmt(result.matrimony)}`} sub />}
                {result.maternity > 0 && <Line label="Maternity" value={`$${fmt(result.maternity)}`} sub />}
                {result.paternity > 0 && <Line label="Paternity" value={`$${fmt(result.paternity)}`} sub />}
                {result.bereavement > 0 && <Line label="Bereavement" value={`$${fmt(result.bereavement)}`} sub />}
                {result.medical > 0 && <Line label="Medical" value={`$${fmt(result.medical)}`} sub />}
                {result.commissions > 0 && <Line label="Commissions" value={`$${fmt(result.commissions)}`} />}
              </div>
            </Section>

            {/* Overtime */}
            <Section
              title="Overtime"
              icon={<Clock className="w-4 h-4" />}
              iconBg="bg-amber-50 border-amber-100 text-amber-600"
            >
              <div className="space-y-0.5">
                {result.hn15Hours > 0 && <Line label={`Night 15% (${fmtHrs(result.hn15Hours)} hrs)`} value={`$${fmt(result.hn15Amount)}`} />}
                {result.hx35Hours > 0 && <Line label={`OT 35% (${fmtHrs(result.hx35Hours)} hrs)`} value={`$${fmt(result.hx35Amount)}`} />}
                {result.hx100Hours > 0 && <Line label={`OT 100% (${fmtHrs(result.hx100Hours)} hrs)`} value={`$${fmt(result.hx100Amount)}`} />}
                {result.hholHours > 0 && <Line label={`Holiday (${fmtHrs(result.hholHours)} hrs)`} value={`$${fmt(result.hholAmount)}`} />}
                <Line label="Overtime Total" value={`$${fmt(result.overtimeTotal)}`} bold />
              </div>
              {result.overtimeTotal === 0 && (
                <p className="text-xs text-surface-400 mt-2">No overtime hours this cycle.</p>
              )}
            </Section>

            {/* Bonuses & Incentives */}
            <Section
              title="Bonuses & Incentives"
              icon={<Gift className="w-4 h-4" />}
              iconBg="bg-violet-50 border-violet-100 text-violet-600"
            >
              <div className="space-y-0.5">
                {result.collaboration > 0 && <Line label="Collaboration Bonus" value={`$${fmt(result.collaboration)}`} />}
                {result.recruiting > 0 && <Line label="Recruiting Bonus" value={`$${fmt(result.recruiting)}`} />}
                {result.profitSharing > 0 && <Line label="Profit Sharing" value={`$${fmt(result.profitSharing)}`} />}
                <Line label="Bonuses Total" value={`$${fmt(result.bonusesTotal)}`} bold />
                {result.attendanceIncentive > 0 && <Line label="Attendance Incentive" value={`$${fmt(result.attendanceIncentive)}`} />}
                {result.kpiIncentive > 0 && <Line label="KPI Incentive" value={`$${fmt(result.kpiIncentive)}`} />}
                <Line label="Incentives Total" value={`$${fmt(result.incentivesTotal)}`} bold />
                {result.subsidio > 0 && <Line label="Subsidio" value={`$${fmt(result.subsidio)}`} />}
                {result.reembolso > 0 && <Line label="Reembolso" value={`$${fmt(result.reembolso)}`} />}
              </div>
              {result.bonusesTotal === 0 && result.incentivesTotal === 0 && result.subsidio === 0 && result.reembolso === 0 && (
                <p className="text-xs text-surface-400 mt-2">No bonuses or incentives this cycle.</p>
              )}
            </Section>

            {/* Gross Salary */}
            <Section
              title="Gross Salary"
              icon={<Briefcase className="w-4 h-4" />}
              iconBg="bg-brand-50 border-brand-100 text-brand-600"
            >
              <div className="space-y-0.5">
                <Line label="Ordinary Salary" value={`$${fmt(result.ordinarySalary)}`} />
                <Line label="Leave Pay (VPL)" value={`$${fmt(result.vpl)}`} />
                <Line label="Commissions" value={`$${fmt(result.commissions)}`} />
                <Line label="Overtime" value={`$${fmt(result.overtimeTotal)}`} />
                <Line label="Bonuses" value={`$${fmt(result.bonusesTotal)}`} />
                <Line label="Incentives" value={`$${fmt(result.incentivesTotal)}`} />
                <Line label="Other Income" value={`$${fmt(result.totalOtherIncome)}`} />
                <Line label="Gross Salary" value={`$${fmt(result.grossSalary)}`} bold highlight />
              </div>
            </Section>

            {/* Government Deductions */}
            <Section
              title="Government Deductions"
              icon={<TrendingDown className="w-4 h-4" />}
              iconBg="bg-rose-50 border-rose-100 text-rose-600"
            >
              <div className="space-y-0.5">
                <Line label="AFP (Pension)" value={`$${fmt(result.afp)}`} />
                <Line label="SFS (Health)" value={`$${fmt(result.sfs)}`} />
                {result.tssDependents > 0 && <Line label="TSS Dependents" value={`$${fmt(result.tssDependents)}`} />}
                <Line label="INFOTEP" value={`$${fmt(result.infotep)}`} />
                <Line label="ISR (Tax)" value={`$${fmt(result.isrRetention)}`} />
                <Line label="Gov. Deductions Total" value={`$${fmt(result.govDeductionsTotal)}`} bold />
              </div>
            </Section>

            {/* Other Deductions */}
            <Section
              title="Other Deductions"
              icon={<ArrowDownRight className="w-4 h-4" />}
              iconBg="bg-orange-50 border-orange-100 text-orange-600"
            >
              <div className="space-y-0.5">
                {result.payLater > 0 && <Line label="PayLater / Loans" value={`$${fmt(result.payLater)}`} />}
                {result.gym > 0 && <Line label="Gym" value={`$${fmt(result.gym)}`} />}
                {result.insuranceDed > 0 && <Line label="Insurance" value={`$${fmt(result.insuranceDed)}`} />}
                {result.cafeteria > 0 && <Line label="Cafeteria" value={`$${fmt(result.cafeteria)}`} />}
                {result.adminDeduction > 0 && <Line label="Admin Deduction" value={`$${fmt(result.adminDeduction)}`} />}
                <Line label="Other Deductions Total" value={`$${fmt(result.otherDeductionsTotal)}`} bold />
              </div>
              {result.otherDeductionsTotal === 0 && (
                <p className="text-xs text-surface-400 mt-2">No other deductions this cycle.</p>
              )}
            </Section>
          </div>

          {/* Net Salary Summary */}
          <div className="card overflow-hidden">
            <div className="p-4 sm:p-5 space-y-0.5">
              <Line label="Gross Salary" value={`$${fmt(result.grossSalary)}`} />
              <Line label="Government Deductions" value={`-$${fmt(result.govDeductionsTotal)}`} />
              <Line label="Other Deductions" value={`-$${fmt(result.otherDeductionsTotal)}`} />
              <Line label="Total Deductions" value={`-$${fmt(result.totalDeductions)}`} bold />
              <div className="flex items-center justify-between py-3 mt-2 border-t-2 border-brand-200">
                <span className="text-sm font-bold text-surface-900">Net Salary</span>
                <span className="text-lg font-bold text-brand-700 tabular-nums">${fmt(result.netSalary)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
