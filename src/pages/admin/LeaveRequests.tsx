import { useEffect, useMemo, useState } from 'react'
import { CalendarCheck2, Lock, Plus, Calendar, Clock3, Download, LayoutGrid, Table2, X } from 'lucide-react'
import {
  getAdminLeaveRequests,
  getLeaveReviewContext,
  reviewAdminLeaveRequest,
  createAdminLeaveRequest,
  getEmployees,
  getPayrollPeriods,
  type AdminLeaveRequest,
  type LeaveReviewContext,
  type EmployeeRecord,
  type PayrollPeriod,
} from '@/lib/apiAdmin'
import AdminSelect from '@/components/AdminSelect'

const statusColors: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
}

type LeaveCalcType = 'non_payable' | 'hourly_salary' | 'monthly_salary'

const CATEGORY_LABELS: Record<string, string> = {
  marriage: 'Matrimonio',
  bereavement: 'Duelo',
  time_off: 'Tiempo Libre',
  maternity: 'Maternidad',
  paternity: 'Paternidad',
  medical_license: 'Licencia Médica',
  vacation: 'Vacaciones',
}

const leaveCategoryOptions = [
  { value: 'marriage', label: 'Matrimonio' },
  { value: 'bereavement', label: 'Duelo' },
  { value: 'time_off', label: 'Tiempo Libre' },
  { value: 'maternity', label: 'Maternidad' },
  { value: 'paternity', label: 'Paternidad' },
  { value: 'medical_license', label: 'Licencia Médica' },
  { value: 'vacation', label: 'Vacaciones' },
]

const assetOptions = ['Access Card', 'Uber', 'O-365', 'G-Suite']
const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function hourlyRateFromEmployee(
  salaryType: 'hourly' | 'monthly',
  baseSalary: number,
  wd: number,
  hd: number
) {
  const n = Number(baseSalary) || 0
  if (salaryType === 'monthly') return n / wd / hd
  return n
}

/** Mirrors backend `leavePayComputation.js` for live preview. */
function previewLeavePay(
  salaryType: 'hourly' | 'monthly',
  baseSalary: number,
  workingDaysPerMonth: number,
  hoursPerDay: number,
  calculationType: LeaveCalcType,
  payableDays: number
) {
  const wd = Number(workingDaysPerMonth) || 23.83
  const hd = Number(hoursPerDay) || 8
  const base = Number(baseSalary) || 0
  if (calculationType === 'non_payable') {
    const hr = hourlyRateFromEmployee(salaryType, base, wd, hd)
    return {
      hourlyRate: Math.round(hr * 10000) / 10000,
      dailyHours: hd,
      dailySalary: 0,
      payableAmount: 0,
    }
  }
  let dailySalary = 0
  if (calculationType === 'hourly_salary') {
    dailySalary = hourlyRateFromEmployee(salaryType, base, wd, hd) * hd
  } else {
    dailySalary = salaryType === 'monthly' ? base / wd : base * hd
  }
  const pd = Math.max(0, payableDays || 0)
  return {
    hourlyRate: Math.round(hourlyRateFromEmployee(salaryType, base, wd, hd) * 10000) / 10000,
    dailyHours: hd,
    dailySalary: Math.round(dailySalary * 10000) / 10000,
    payableAmount: Math.round(dailySalary * pd * 100) / 100,
  }
}

export default function AdminLeaveRequests() {
  const [rows, setRows] = useState<AdminLeaveRequest[]>([])
  const [allRows, setAllRows] = useState<AdminLeaveRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending')
  const [notice, setNotice] = useState('')
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [reviewContext, setReviewContext] = useState<LeaveReviewContext | null>(null)
  const [contextLoading, setContextLoading] = useState(false)
  const [reviewStatus, setReviewStatus] = useState<'approved' | 'rejected'>('approved')
  const [reviewNote, setReviewNote] = useState('')
  const [calculationType, setCalculationType] = useState<LeaveCalcType>('hourly_salary')
  const [payableDaysInput, setPayableDaysInput] = useState('0')
  const [saving, setSaving] = useState(false)

  // View mode and detail modal
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card')
  const [detailRow, setDetailRow] = useState<AdminLeaveRequest | null>(null)

  // New leave creation states
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [employees, setEmployees] = useState<EmployeeRecord[]>([])
  const [payrollPeriods, setPayrollPeriods] = useState<PayrollPeriod[]>([])
  const [createEmployeeId, setCreateEmployeeId] = useState('')
  const [createLeaveCategory, setCreateLeaveCategory] = useState('time_off')
  const [createCalcType, setCreateCalcType] = useState<'non_payable' | 'hourly_salary' | 'monthly_salary'>('non_payable')
  const [createPayableDays, setCreatePayableDays] = useState('')
  const [createHourlyRate, setCreateHourlyRate] = useState('')
  const [createDailyHours, setCreateDailyHours] = useState('')
  const [createMonthlyRate, setCreateMonthlyRate] = useState('')
  const [createDaysOff, setCreateDaysOff] = useState<string[]>(['Sun', 'Sat'])
  const [createStartDate, setCreateStartDate] = useState('')
  const [createStartTime, setCreateStartTime] = useState('08:00')
  const [createEndDate, setCreateEndDate] = useState('')
  const [createEndTime, setCreateEndTime] = useState('17:00')
  const [createReturnDate, setCreateReturnDate] = useState('')
  const [createReturnTime, setCreateReturnTime] = useState('08:00')
  const [createAssetDeactivation, setCreateAssetDeactivation] = useState<string[]>([])
  const [createPayrollCycleCode, setCreatePayrollCycleCode] = useState('')
  const [createReason, setCreateReason] = useState('')
  const [createSaving, setCreateSaving] = useState(false)

  async function load(showLoader = true) {
    if (showLoader) setLoading(true)
    try {
      const [filteredData, allData] = await Promise.all([
        getAdminLeaveRequests(filterStatus),
        getAdminLeaveRequests('all'),
      ])
      setRows(filteredData)
      setAllRows(allData)
    } catch {
      setRows([])
      setAllRows([])
    } finally {
      if (showLoader) setLoading(false)
    }
  }

  useEffect(() => {
    load(true)
    getEmployees().then(setEmployees).catch(() => {})
    getPayrollPeriods().then(setPayrollPeriods).catch(() => {})

    const handleVisibilityChange = () => {
      if (document.hidden) return
      load(false)
    }

    const intervalId = window.setInterval(() => {
      if (!document.hidden) {
        load(false)
      }
    }, 1000)

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [filterStatus])

  useEffect(() => {
    if (!notice) return
    const timeoutId = window.setTimeout(() => setNotice(''), 2200)
    return () => window.clearTimeout(timeoutId)
  }, [notice])

  const summary = useMemo(() => {
    return {
      total: allRows.length,
      pending: allRows.filter((r) => r.status === 'pending').length,
      approved: allRows.filter((r) => r.status === 'approved').length,
      rejected: allRows.filter((r) => r.status === 'rejected').length,
    }
  }, [allRows])

  const preview = useMemo(() => {
    if (!reviewContext) return null
    const { employee, settings } = reviewContext
    const isUnpaid = reviewContext.leave.leaveType === 'unpaid'
    const ct: LeaveCalcType = isUnpaid ? 'non_payable' : calculationType
    const pd = parseFloat(payableDaysInput)
    return previewLeavePay(
      employee.salaryType,
      employee.baseSalary,
      settings.workingDaysPerMonth,
      settings.hoursPerDay,
      ct,
      Number.isFinite(pd) ? pd : 0
    )
  }, [reviewContext, calculationType, payableDaysInput])

  const createPreview = useMemo(() => {
    if (createCalcType === 'non_payable') return { dailySalary: 0, payableAmount: 0 }
    const pd = parseFloat(createPayableDays) || 0
    let dailySalary = 0
    if (createCalcType === 'hourly_salary') {
      dailySalary = (parseFloat(createHourlyRate) || 0) * (parseFloat(createDailyHours) || 0)
    } else if (createCalcType === 'monthly_salary') {
      dailySalary = (parseFloat(createMonthlyRate) || 0) / 23.83
    }
    return {
      dailySalary: Math.round(dailySalary * 100) / 100,
      payableAmount: Math.round(dailySalary * pd * 100) / 100,
    }
  }, [createCalcType, createPayableDays, createHourlyRate, createDailyHours, createMonthlyRate])

  const calendarDays = useMemo(() => {
    if (!createStartDate || !createEndDate) return 0
    const start = new Date(createStartDate + 'T12:00:00')
    const end = new Date(createEndDate + 'T12:00:00')
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return 0
    let count = 0
    const d = new Date(start)
    while (d <= end) { count++; d.setDate(d.getDate() + 1) }
    return count
  }, [createStartDate, createEndDate])

  async function handleCreateLeave() {
    if (!createEmployeeId || !createStartDate || !createEndDate) {
      setNotice('Employee, start date, and end date are required.')
      return
    }
    setCreateSaving(true)
    try {
      const leaveType = createLeaveCategory === 'time_off' ? 'unpaid' : 'paid'
      await createAdminLeaveRequest({
        employeeId: createEmployeeId,
        leaveType,
        leaveCategory: createLeaveCategory,
        calculationType: createCalcType,
        payableDays: createCalcType !== 'non_payable' ? parseFloat(createPayableDays) || 0 : 0,
        hourlyRate: createCalcType === 'hourly_salary' ? parseFloat(createHourlyRate) || 0 : undefined,
        dailyHours: createCalcType === 'hourly_salary' ? parseFloat(createDailyHours) || 0 : undefined,
        monthlyRate: createCalcType === 'monthly_salary' ? parseFloat(createMonthlyRate) || 0 : undefined,
        associateDaysOff: createDaysOff,
        startDate: createStartDate,
        endDate: createEndDate,
        returnDate: createReturnDate || undefined,
        startTime: createStartTime || undefined,
        endTime: createEndTime || undefined,
        returnTime: createReturnTime || undefined,
        assetDeactivation: createAssetDeactivation.length > 0 ? createAssetDeactivation : undefined,
        payrollCycleCode: createCalcType !== 'non_payable' && createPayrollCycleCode ? createPayrollCycleCode : undefined,
        reason: createReason.trim() || undefined,
      })
      setNotice('Leave created successfully.')
      setShowCreateModal(false)
      // Reset form
      setCreateEmployeeId('')
      setCreateLeaveCategory('time_off')
      setCreateCalcType('non_payable')
      setCreatePayableDays('')
      setCreateHourlyRate('')
      setCreateDailyHours('')
      setCreateMonthlyRate('')
      setCreateDaysOff(['Sun', 'Sat'])
      setCreateStartDate('')
      setCreateStartTime('08:00')
      setCreateEndDate('')
      setCreateEndTime('17:00')
      setCreateReturnDate('')
      setCreateReturnTime('08:00')
      setCreateAssetDeactivation([])
      setCreatePayrollCycleCode('')
      setCreateReason('')
      await load(false)
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as Error).message) : 'Failed to create leave.'
      setNotice(msg)
    } finally {
      setCreateSaving(false)
    }
  }

  function openReview(row: AdminLeaveRequest) {
    setReviewingId(row.id)
    setReviewStatus('approved')
    setReviewNote('')
    setReviewContext(null)
    setContextLoading(true)
    void getLeaveReviewContext(row.id)
      .then((ctx) => {
        setReviewContext(ctx)
        if (ctx.leave.leaveType === 'unpaid') {
          setCalculationType('non_payable')
        } else if (ctx.leave.calculationType && ['non_payable', 'hourly_salary', 'monthly_salary'].includes(ctx.leave.calculationType)) {
          setCalculationType(ctx.leave.calculationType as LeaveCalcType)
        } else {
          setCalculationType(
            ctx.defaultCalculationType === 'monthly_salary' ? 'monthly_salary' : 'hourly_salary'
          )
        }
        setPayableDaysInput(String(ctx.suggestedPayableDays))
      })
      .catch(() => {
        setNotice('Could not load review details.')
        setReviewingId(null)
      })
      .finally(() => setContextLoading(false))
  }

  async function submitReview() {
    if (!reviewingId) return
    setSaving(true)
    try {
      if (reviewStatus === 'rejected') {
        await reviewAdminLeaveRequest(reviewingId, {
          status: 'rejected',
          reviewedNote: reviewNote.trim() || undefined,
        })
      } else {
        if (!reviewContext) {
          setNotice('Missing review context.')
          setSaving(false)
          return
        }
        const pd = parseFloat(payableDaysInput)
        if (reviewContext.leave.leaveType === 'paid') {
          if (!Number.isFinite(pd) || pd < 0 || pd > 366) {
            setNotice('Payable days must be between 0 and 366.')
            setSaving(false)
            return
          }
          await reviewAdminLeaveRequest(reviewingId, {
            status: 'approved',
            reviewedNote: reviewNote.trim() || undefined,
            calculationType,
            payableDays: pd,
          })
        } else {
          await reviewAdminLeaveRequest(reviewingId, {
            status: 'approved',
            reviewedNote: reviewNote.trim() || undefined,
            payableDays: 0,
          })
        }
      }
      setNotice('Leave request updated.')
      setReviewingId(null)
      setReviewContext(null)
      await load(false)
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err ? String((err as Error).message) : 'Failed to update leave request.'
      setNotice(msg)
    } finally {
      setSaving(false)
    }
  }

  function exportCSV() {
    if (!rows.length) return
    const headers = [
      'Employee',
      'Category',
      'Type',
      'Start Date',
      'End Date',
      'Return Date',
      'Days Off',
      'Calculation',
      'Payable Days',
      'Daily Salary',
      'Payable Amount',
      'Status',
      'Payroll Cycle',
      'Comments',
    ]
    const csvRows = rows.map((r) => [
      r.employeeName,
      CATEGORY_LABELS[r.leaveCategory ?? ''] || r.leaveCategory || '',
      r.leaveType === 'paid' ? 'Paid' : 'Unpaid',
      r.startDate ?? '',
      r.endDate ?? '',
      r.returnDate ?? '',
      r.leaveAssociateDaysOff ?? '',
      r.leaveCalculationType === 'non_payable' ? 'Non Payable' : r.leaveCalculationType === 'hourly_salary' ? 'Hourly Salary' : r.leaveCalculationType === 'monthly_salary' ? 'Monthly Salary' : '',
      r.leavePayableDays != null ? String(r.leavePayableDays) : '',
      r.dailySalary != null ? r.dailySalary.toFixed(2) : '',
      r.leavePayableAmount != null ? r.leavePayableAmount.toFixed(2) : '',
      r.status,
      r.payrollCycleCode ?? '',
      r.reason ?? '',
    ])
    const csv = [
      headers.join(','),
      ...csvRows.map((row) =>
        row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','),
      ),
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `leave-requests-${filterStatus}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const isPaidLeave = reviewContext?.leave.leaveType === 'paid'

  return (
    <div className="space-y-6 sm:space-y-8 overflow-x-hidden">
      {notice && (
        <div className="fixed right-4 top-4 z-50 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 shadow-lg">
          {notice}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-surface-900 tracking-tight">Leave requests</h1>
          <p className="text-surface-500 mt-1 text-xs sm:text-sm">Review and approve employee leave requests.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="btn-primary flex items-center justify-center gap-2 rounded-xl min-h-[2.75rem]"
        >
          <Plus className="w-4 h-4" />
          New Leave
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-lg sm:rounded-xl border border-surface-200/80 bg-white p-3 sm:p-4 shadow-sm">
          <p className="text-[10px] sm:text-xs font-medium text-surface-500 uppercase tracking-wider">Total</p>
          <p className="mt-1 text-lg sm:text-xl font-semibold text-surface-900 tabular-nums">{summary.total}</p>
        </div>
        <div className="rounded-lg sm:rounded-xl border border-amber-200/80 bg-amber-50/50 p-3 sm:p-4 shadow-sm">
          <p className="text-[10px] sm:text-xs font-medium text-amber-700 uppercase tracking-wider">Pending</p>
          <p className="mt-1 text-lg sm:text-xl font-semibold text-surface-900 tabular-nums">{summary.pending}</p>
        </div>
        <div className="rounded-lg sm:rounded-xl border border-emerald-200/80 bg-emerald-50/50 p-3 sm:p-4 shadow-sm">
          <p className="text-[10px] sm:text-xs font-medium text-emerald-700 uppercase tracking-wider">Approved</p>
          <p className="mt-1 text-lg sm:text-xl font-semibold text-surface-900 tabular-nums">{summary.approved}</p>
        </div>
        <div className="rounded-lg sm:rounded-xl border border-red-200/80 bg-red-50/50 p-3 sm:p-4 shadow-sm">
          <p className="text-[10px] sm:text-xs font-medium text-red-700 uppercase tracking-wider">Rejected</p>
          <p className="mt-1 text-lg sm:text-xl font-semibold text-surface-900 tabular-nums">{summary.rejected}</p>
        </div>
      </div>

      <div className="rounded-xl sm:rounded-2xl border border-surface-200/80 bg-white p-3 sm:p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="w-full sm:w-64">
            <label className="label">Filter status</label>
            <AdminSelect
              value={filterStatus}
              onChange={(val) => setFilterStatus(val as 'all' | 'pending' | 'approved' | 'rejected')}
              options={[
                { value: 'pending', label: 'Pending' },
                { value: 'approved', label: 'Approved' },
                { value: 'rejected', label: 'Rejected' },
                { value: 'all', label: 'All' },
              ]}
            />
          </div>
          <div className="flex items-center gap-2 sm:ml-auto">
            <div className="flex rounded-xl overflow-hidden border border-surface-200">
              <button
                type="button"
                onClick={() => setViewMode('card')}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${viewMode === 'card' ? 'bg-brand-600 text-white' : 'bg-surface-50 text-surface-600 hover:bg-surface-100'}`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                Card
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${viewMode === 'table' ? 'bg-brand-600 text-white' : 'bg-surface-50 text-surface-600 hover:bg-surface-100'}`}
              >
                <Table2 className="w-3.5 h-3.5" />
                Table
              </button>
            </div>
            <button
              type="button"
              onClick={exportCSV}
              disabled={loading || rows.length === 0}
              className="btn-secondary flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl sm:rounded-2xl border border-surface-200/80 bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-surface-500 text-sm">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-surface-500 text-sm">No leave requests found.</div>
        ) : viewMode === 'card' ? (
          <ul className="p-3 sm:p-4 grid grid-cols-1 gap-3">
            {rows.map((r) => (
              <li
                key={r.id}
                className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 sm:p-5 rounded-xl border border-surface-200/80 bg-white transition-all hover:shadow-md hover:border-brand-200/80 cursor-pointer"
                onClick={() => r.status === 'pending' ? openReview(r) : setDetailRow(r)}
              >
                <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
                  <CalendarCheck2 className="w-5 h-5 text-brand-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-surface-900">{r.employeeName}</p>
                  <p className="text-xs text-surface-500 mt-0.5">
                    {r.startDate} - {r.endDate} · {r.leaveType === 'paid' ? 'Paid leave' : 'Unpaid leave'}
                    {r.leaveCategory ? ` · ${CATEGORY_LABELS[r.leaveCategory] || r.leaveCategory}` : ''}
                  </p>
                  {r.reason ? <p className="text-xs text-surface-500 mt-0.5">Reason: {r.reason}</p> : null}
                  {r.reviewedNote ? <p className="text-xs text-surface-500 mt-0.5">Note: {r.reviewedNote}</p> : null}
                  {r.status === 'approved' &&
                  r.leavePayableAmount != null &&
                  r.leavePayableAmount > 0 ? (
                    <p className="text-xs font-medium text-brand-700 mt-0.5 tabular-nums">
                      Approved leave pay: ${r.leavePayableAmount.toFixed(2)}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[r.status] || 'bg-surface-100 text-surface-600'}`}
                  >
                    {r.status}
                  </span>
                  {r.status === 'pending' && (
                    <button type="button" onClick={(e) => { e.stopPropagation(); openReview(r) }} className="btn-secondary rounded-xl px-3 py-2 text-xs">
                      Review
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1600px] w-full text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-surface-50">
                <tr>
                  {[
                    'Employee',
                    'Category',
                    'Type',
                    'Start Date',
                    'End Date',
                    'Return Date',
                    'Days Off',
                    'Calculation',
                    'Payable Days',
                    'Daily Salary',
                    'Payable Amount',
                    'Status',
                    'Payroll Cycle',
                    'Comments',
                  ].map((col) => (
                    <th
                      key={col}
                      className="px-2 py-2 text-[10px] font-semibold text-surface-500 uppercase tracking-wider whitespace-nowrap border-b border-surface-200"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-surface-100 hover:bg-surface-50/60 transition-colors cursor-pointer"
                    onClick={() => r.status === 'pending' ? openReview(r) : setDetailRow(r)}
                  >
                    <td className="px-2 py-1.5 text-xs font-medium text-surface-900 whitespace-nowrap">{r.employeeName}</td>
                    <td className="px-2 py-1.5 text-xs text-surface-700 whitespace-nowrap">{CATEGORY_LABELS[r.leaveCategory ?? ''] || r.leaveCategory || '-'}</td>
                    <td className="px-2 py-1.5 text-xs text-surface-700 whitespace-nowrap">{r.leaveType === 'paid' ? 'Paid' : 'Unpaid'}</td>
                    <td className="px-2 py-1.5 text-xs font-mono text-surface-700 tabular-nums whitespace-nowrap">{r.startDate ?? ''}{r.startTime ? ` ${r.startTime}` : ''}</td>
                    <td className="px-2 py-1.5 text-xs font-mono text-surface-700 tabular-nums whitespace-nowrap">{r.endDate ?? ''}{r.endTime ? ` ${r.endTime}` : ''}</td>
                    <td className="px-2 py-1.5 text-xs font-mono text-surface-700 tabular-nums whitespace-nowrap">{r.returnDate ?? ''}{r.returnTime ? ` ${r.returnTime}` : ''}</td>
                    <td className="px-2 py-1.5 text-xs text-surface-700 whitespace-nowrap">{r.leaveAssociateDaysOff ?? '-'}</td>
                    <td className="px-2 py-1.5 text-xs text-surface-700 whitespace-nowrap">
                      {r.leaveCalculationType === 'non_payable' ? 'Non Payable' : r.leaveCalculationType === 'hourly_salary' ? 'Hourly Salary' : r.leaveCalculationType === 'monthly_salary' ? 'Monthly Salary' : '-'}
                    </td>
                    <td className="px-2 py-1.5 text-xs text-surface-700 tabular-nums whitespace-nowrap text-right">{r.leavePayableDays != null ? r.leavePayableDays : '-'}</td>
                    <td className="px-2 py-1.5 text-xs text-surface-700 tabular-nums whitespace-nowrap text-right">{r.dailySalary != null ? `$${r.dailySalary.toFixed(2)}` : '-'}</td>
                    <td className="px-2 py-1.5 text-xs text-surface-700 tabular-nums whitespace-nowrap text-right">{r.leavePayableAmount != null ? `$${r.leavePayableAmount.toFixed(2)}` : '-'}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[r.status] || 'bg-surface-100 text-surface-600'}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-xs text-surface-700 whitespace-nowrap">{r.payrollCycleCode ?? '-'}</td>
                    <td className="px-2 py-1.5 text-xs text-surface-700 whitespace-nowrap max-w-[200px] truncate">{r.reason ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-black/40" onClick={() => setShowCreateModal(false)} aria-label="Close" />
          <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-surface-200 bg-white p-5 shadow-xl">
            <h2 className="text-base font-semibold text-surface-900">New Leave</h2>
            <p className="mt-1 text-sm text-surface-500">Create a leave on behalf of an employee.</p>

            <div className="mt-4 space-y-4">
              {/* Employee Selection */}
              <div>
                <label className="label">Employee</label>
                <AdminSelect
                  value={createEmployeeId}
                  onChange={(val) => setCreateEmployeeId(val)}
                  options={[
                    { value: '', label: 'Select employee' },
                    ...employees.map((e) => ({ value: e.id, label: e.name })),
                  ]}
                />
              </div>

              {/* Leave Type */}
              <div>
                <label className="label">Leave Type</label>
                <AdminSelect
                  value={createLeaveCategory}
                  onChange={(val) => setCreateLeaveCategory(val)}
                  options={leaveCategoryOptions}
                />
              </div>

              {/* Calculation Type - toggle buttons */}
              <div>
                <label className="label">Calculation</label>
                <div className="flex gap-0 rounded-xl overflow-hidden border border-surface-200">
                  {([
                    { value: 'non_payable' as const, label: 'Non Payable' },
                    { value: 'hourly_salary' as const, label: 'Hourly Salary' },
                    { value: 'monthly_salary' as const, label: 'Monthly Salary' },
                  ]).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setCreateCalcType(opt.value)}
                      className={`flex-1 px-3 py-2.5 text-xs sm:text-sm font-medium transition-colors ${
                        createCalcType === opt.value
                          ? 'bg-brand-600 text-white'
                          : 'bg-surface-50 text-surface-600 hover:bg-surface-100'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Conditional: Payable Days (shown when hourly or monthly) */}
              {createCalcType !== 'non_payable' && (
                <div>
                  <label className="label">Payable Days</label>
                  <input
                    type="number" min={0} max={366} step={0.5}
                    className="input w-full rounded-xl"
                    value={createPayableDays}
                    onChange={(e) => setCreatePayableDays(e.target.value)}
                    placeholder="Number of payable days"
                  />
                </div>
              )}

              {/* Conditional: Hourly Rate + Daily Hours (shown when hourly) */}
              {createCalcType === 'hourly_salary' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label">Hourly Rate</label>
                    <input
                      type="number" min={0} step={0.01}
                      className="input w-full rounded-xl"
                      value={createHourlyRate}
                      onChange={(e) => setCreateHourlyRate(e.target.value)}
                      placeholder="e.g. 150"
                    />
                  </div>
                  <div>
                    <label className="label">Daily Hours</label>
                    <input
                      type="number" min={0} max={24} step={0.5}
                      className="input w-full rounded-xl"
                      value={createDailyHours}
                      onChange={(e) => setCreateDailyHours(e.target.value)}
                      placeholder="e.g. 8"
                    />
                  </div>
                </div>
              )}

              {/* Conditional: Monthly Rate (shown when monthly) */}
              {createCalcType === 'monthly_salary' && (
                <div>
                  <label className="label">Monthly Rate</label>
                  <input
                    type="number" min={0} step={100}
                    className="input w-full rounded-xl"
                    value={createMonthlyRate}
                    onChange={(e) => setCreateMonthlyRate(e.target.value)}
                    placeholder="e.g. 50000"
                  />
                </div>
              )}

              {/* Days Off */}
              <div>
                <label className="label">Days Off</label>
                <div className="flex flex-wrap gap-2">
                  {DAYS_OF_WEEK.map((day) => (
                    <button
                      key={day} type="button"
                      onClick={() => setCreateDaysOff((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day])}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        createDaysOff.includes(day) ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-surface-600 border-surface-200 hover:bg-surface-50'
                      }`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Start Date & Time</label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="relative">
                      <Calendar className="w-4 h-4 text-surface-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input type="date" value={createStartDate} onChange={(e) => setCreateStartDate(e.target.value)} className="input w-full rounded-xl pl-9" />
                    </div>
                    <div className="relative">
                      <Clock3 className="w-4 h-4 text-surface-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input type="time" value={createStartTime} onChange={(e) => setCreateStartTime(e.target.value)} className="input w-full rounded-xl pl-9" />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="label">End Date & Time</label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="relative">
                      <Calendar className="w-4 h-4 text-surface-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input type="date" value={createEndDate} onChange={(e) => setCreateEndDate(e.target.value)} className="input w-full rounded-xl pl-9" />
                    </div>
                    <div className="relative">
                      <Clock3 className="w-4 h-4 text-surface-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input type="time" value={createEndTime} onChange={(e) => setCreateEndTime(e.target.value)} className="input w-full rounded-xl pl-9" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Calendar Days (auto-calc) */}
              <div>
                <label className="label">Calendar Days</label>
                <input type="text" className="input w-full rounded-xl bg-surface-50 text-surface-500" value={calendarDays > 0 ? calendarDays : ''} readOnly disabled placeholder="Auto-calculated" />
              </div>

              {/* Return Date */}
              <div>
                <label className="label">Return Date & Time</label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="relative">
                    <Calendar className="w-4 h-4 text-surface-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input type="date" value={createReturnDate} onChange={(e) => setCreateReturnDate(e.target.value)} className="input w-full rounded-xl pl-9" />
                  </div>
                  <div className="relative">
                    <Clock3 className="w-4 h-4 text-surface-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input type="time" value={createReturnTime} onChange={(e) => setCreateReturnTime(e.target.value)} className="input w-full rounded-xl pl-9" />
                  </div>
                </div>
              </div>

              {/* Asset Deactivation */}
              <div>
                <label className="label">Asset Deactivation</label>
                <div className="flex flex-wrap gap-2">
                  {assetOptions.map((asset) => (
                    <button
                      key={asset} type="button"
                      onClick={() => setCreateAssetDeactivation((prev) => prev.includes(asset) ? prev.filter((a) => a !== asset) : [...prev, asset])}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        createAssetDeactivation.includes(asset) ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-surface-600 border-surface-200 hover:bg-surface-50'
                      }`}
                    >
                      {asset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Conditional: Daily Salary + Payable Amount + Payroll Cycle (shown when payable) */}
              {createCalcType !== 'non_payable' && (
                <>
                  <div className="rounded-xl border border-surface-200 p-3 space-y-2 text-sm bg-surface-50/50">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <span className="text-surface-500">Daily Salary</span>
                      <span className="tabular-nums text-right font-medium">${createPreview.dailySalary.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      <span className="text-surface-500 font-medium">Payable Amount</span>
                      <span className="tabular-nums text-right font-semibold text-surface-900">${createPreview.payableAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  </div>

                  <div>
                    <label className="label">Payroll Cycle</label>
                    <AdminSelect
                      value={createPayrollCycleCode}
                      onChange={(val) => setCreatePayrollCycleCode(val)}
                      options={[
                        { value: '', label: 'Select payroll cycle' },
                        ...payrollPeriods.map((p) => ({ value: p.cycleCode, label: `${p.cycleCode} (${p.periodFrom} - ${p.periodTo})` })),
                      ]}
                    />
                  </div>
                </>
              )}

              {/* Reason */}
              <div>
                <label className="label">Reason (optional)</label>
                <textarea value={createReason} onChange={(e) => setCreateReason(e.target.value)} rows={2} className="input w-full rounded-xl" placeholder="Short reason" />
              </div>
            </div>

            <div className="mt-5 flex flex-col-reverse sm:flex-row justify-end gap-2">
              <button type="button" onClick={() => setShowCreateModal(false)} className="btn-secondary rounded-xl px-4 py-2" disabled={createSaving}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleCreateLeave()}
                className="btn-primary rounded-xl px-4 py-2"
                disabled={createSaving || !createEmployeeId || !createStartDate || !createEndDate}
              >
                {createSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {reviewingId && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={() => {
              setReviewingId(null)
              setReviewContext(null)
            }}
            aria-label="Close"
          />
          <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-surface-200 bg-white p-5 shadow-xl">
            <h2 className="text-base font-semibold text-surface-900">Review leave request</h2>
            <p className="mt-1 text-sm text-surface-500">Approve or reject. Pay fields apply when approving.</p>

            {contextLoading || !reviewContext ? (
              <div className="py-10 text-center text-sm text-surface-500">Loading details…</div>
            ) : (
              <>
                <div className="mt-4 rounded-xl border border-surface-200 bg-surface-50/80 p-3 text-sm space-y-1">
                  <p>
                    <span className="text-surface-500">Employee:</span>{' '}
                    <span className="font-medium text-surface-900">{reviewContext.leave.employeeName}</span>
                  </p>
                  {reviewContext.leave.leaveCategory ? (
                    <p>
                      <span className="text-surface-500">Leave Type:</span>{' '}
                      {CATEGORY_LABELS[reviewContext.leave.leaveCategory] || reviewContext.leave.leaveCategory}
                    </p>
                  ) : null}
                  <p>
                    <span className="text-surface-500">Period:</span>{' '}
                    <span className="tabular-nums">
                      {reviewContext.leave.startDate}{reviewContext.leave.startTime ? ` ${reviewContext.leave.startTime}` : ''} → {reviewContext.leave.endDate}{reviewContext.leave.endTime ? ` ${reviewContext.leave.endTime}` : ''}
                    </span>
                  </p>
                  {reviewContext.leave.returnDate ? (
                    <p>
                      <span className="text-surface-500">Return:</span>{' '}
                      <span className="tabular-nums">{reviewContext.leave.returnDate}{reviewContext.leave.returnTime ? ` ${reviewContext.leave.returnTime}` : ''}</span>
                    </p>
                  ) : null}
                  <p>
                    <span className="text-surface-500">Type:</span>{' '}
                    {reviewContext.leave.leaveType === 'paid' ? 'Paid' : 'Unpaid'}
                  </p>
                  {reviewContext.leave.associateDaysOff ? (
                    <p>
                      <span className="text-surface-500">Days Off:</span>{' '}
                      {reviewContext.leave.associateDaysOff}
                    </p>
                  ) : null}
                  {reviewContext.leave.calculationType ? (
                    <p>
                      <span className="text-surface-500">Requested Calculation:</span>{' '}
                      {reviewContext.leave.calculationType === 'non_payable' ? 'Non Payable' : reviewContext.leave.calculationType === 'hourly_salary' ? 'Hourly Salary' : 'Monthly Salary'}
                    </p>
                  ) : null}
                  <p>
                    <span className="text-surface-500">Salary:</span>{' '}
                    {reviewContext.employee.salaryType} · base ${reviewContext.employee.baseSalary.toFixed(2)}
                  </p>
                  {reviewContext.leave.reason ? (
                    <p className="text-xs text-surface-600 pt-1 border-t border-surface-200/80">{reviewContext.leave.reason}</p>
                  ) : null}
                </div>

                <div className="mt-4 space-y-3">
                  <AdminSelect
                    value={reviewStatus}
                    onChange={(val) => setReviewStatus(val as 'approved' | 'rejected')}
                    options={[
                      { value: 'approved', label: 'Approve' },
                      { value: 'rejected', label: 'Reject' },
                    ]}
                  />

                  {reviewStatus === 'approved' && (
                    <>
                      {isPaidLeave ? (
                        <>
                          <div>
                            <label className="label">Calculation</label>
                            <AdminSelect
                              value={calculationType}
                              onChange={(val) => setCalculationType(val as LeaveCalcType)}
                              options={[
                                { value: 'non_payable', label: 'Non-payable' },
                                { value: 'hourly_salary', label: 'Hourly salary' },
                                { value: 'monthly_salary', label: 'Monthly salary' },
                              ]}
                            />
                          </div>
                          <div>
                            <label className="label">Payable days</label>
                            <input
                              type="number"
                              min={0}
                              max={366}
                              step={0.5}
                              value={payableDaysInput}
                              onChange={(e) => setPayableDaysInput(e.target.value)}
                              className="input w-full rounded-xl"
                            />
                            <p className="text-[10px] text-surface-500 mt-1">
                              Suggested (calendar span): {reviewContext.suggestedPayableDays}
                            </p>
                          </div>
                        </>
                      ) : (
                        <p className="text-xs text-surface-600 rounded-lg border border-surface-200 bg-surface-50 px-3 py-2">
                          Unpaid leave — stored pay amount will be $0.
                        </p>
                      )}

                      {preview && (isPaidLeave || reviewContext.leave.leaveType === 'unpaid') ? (
                        <div className="rounded-xl border border-surface-200 p-3 space-y-2 text-sm">
                          <p className="text-xs font-semibold text-surface-700 uppercase tracking-wide">Pay preview (locked)</p>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <span className="text-surface-500">Hourly rate</span>
                            <span className="tabular-nums text-right flex items-center justify-end gap-1">
                              <Lock className="w-3 h-3 text-surface-400" />${preview.hourlyRate.toFixed(4)}
                            </span>
                            <span className="text-surface-500">Daily hours</span>
                            <span className="tabular-nums text-right flex items-center justify-end gap-1">
                              <Lock className="w-3 h-3 text-surface-400" />
                              {preview.dailyHours}
                            </span>
                            <span className="text-surface-500">Daily salary</span>
                            <span className="tabular-nums text-right flex items-center justify-end gap-1">
                              <Lock className="w-3 h-3 text-surface-400" />${preview.dailySalary.toFixed(2)}
                            </span>
                            <span className="text-surface-500 font-medium">Payable amount</span>
                            <span className="tabular-nums text-right font-semibold text-surface-900 flex items-center justify-end gap-1">
                              <Lock className="w-3 h-3 text-surface-400" />${preview.payableAmount.toFixed(2)}
                            </span>
                          </div>
                          <p className="text-[10px] text-surface-500">Payable amount = daily salary × payable days (computed on save).</p>
                        </div>
                      ) : null}
                    </>
                  )}

                  <textarea
                    value={reviewNote}
                    onChange={(e) => setReviewNote(e.target.value)}
                    rows={3}
                    className="input w-full rounded-xl"
                    placeholder="Optional note"
                  />
                </div>
              </>
            )}

            <div className="mt-5 flex flex-col-reverse sm:flex-row justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setReviewingId(null)
                  setReviewContext(null)
                }}
                className="btn-secondary rounded-xl px-4 py-2"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitReview()}
                className="btn-primary rounded-xl px-4 py-2"
                disabled={saving || contextLoading || !reviewContext}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal (read-only, for approved/rejected) */}
      {detailRow && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={() => setDetailRow(null)}
            aria-label="Close"
          />
          <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-surface-200 bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-surface-900">Leave Request Details</h2>
              <button type="button" onClick={() => setDetailRow(null)} className="p-1 rounded-lg hover:bg-surface-100 transition-colors">
                <X className="w-5 h-5 text-surface-500" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Employee & Category */}
              <div className="rounded-xl border border-surface-200 bg-surface-50/80 p-3">
                <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">General</p>
                <div className="grid grid-cols-2 gap-1.5 text-sm">
                  <span className="text-surface-500">Employee</span>
                  <span className="font-medium text-surface-900">{detailRow.employeeName}</span>
                  <span className="text-surface-500">Category</span>
                  <span className="text-surface-900">{CATEGORY_LABELS[detailRow.leaveCategory ?? ''] || detailRow.leaveCategory || '-'}</span>
                  <span className="text-surface-500">Type</span>
                  <span className="text-surface-900">{detailRow.leaveType === 'paid' ? 'Paid' : 'Unpaid'}</span>
                  <span className="text-surface-500">Status</span>
                  <span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[detailRow.status] || 'bg-surface-100 text-surface-600'}`}>
                      {detailRow.status}
                    </span>
                  </span>
                </div>
              </div>

              {/* Dates */}
              <div className="rounded-xl border border-surface-200 bg-surface-50/80 p-3">
                <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Dates</p>
                <div className="grid grid-cols-2 gap-1.5 text-sm">
                  <span className="text-surface-500">Start</span>
                  <span className="tabular-nums text-surface-900">{detailRow.startDate ?? '-'}{detailRow.startTime ? ` ${detailRow.startTime}` : ''}</span>
                  <span className="text-surface-500">End</span>
                  <span className="tabular-nums text-surface-900">{detailRow.endDate ?? '-'}{detailRow.endTime ? ` ${detailRow.endTime}` : ''}</span>
                  <span className="text-surface-500">Return</span>
                  <span className="tabular-nums text-surface-900">{detailRow.returnDate ?? '-'}{detailRow.returnTime ? ` ${detailRow.returnTime}` : ''}</span>
                  <span className="text-surface-500">Days Off</span>
                  <span className="text-surface-900">{detailRow.leaveAssociateDaysOff ?? '-'}</span>
                </div>
              </div>

              {/* Pay Details */}
              <div className="rounded-xl border border-surface-200 bg-surface-50/80 p-3">
                <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Pay Details</p>
                <div className="grid grid-cols-2 gap-1.5 text-sm">
                  <span className="text-surface-500">Calculation</span>
                  <span className="text-surface-900">
                    {detailRow.leaveCalculationType === 'non_payable' ? 'Non Payable' : detailRow.leaveCalculationType === 'hourly_salary' ? 'Hourly Salary' : detailRow.leaveCalculationType === 'monthly_salary' ? 'Monthly Salary' : '-'}
                  </span>
                  <span className="text-surface-500">Payable Days</span>
                  <span className="tabular-nums text-surface-900">{detailRow.leavePayableDays != null ? detailRow.leavePayableDays : '-'}</span>
                  <span className="text-surface-500">Daily Salary</span>
                  <span className="tabular-nums text-surface-900">{detailRow.dailySalary != null ? `$${detailRow.dailySalary.toFixed(2)}` : '-'}</span>
                  <span className="text-surface-500 font-medium">Payable Amount</span>
                  <span className="tabular-nums font-semibold text-surface-900">{detailRow.leavePayableAmount != null ? `$${detailRow.leavePayableAmount.toFixed(2)}` : '-'}</span>
                </div>
              </div>

              {/* Asset & Payroll */}
              <div className="rounded-xl border border-surface-200 bg-surface-50/80 p-3">
                <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Other</p>
                <div className="grid grid-cols-2 gap-1.5 text-sm">
                  <span className="text-surface-500">Asset Deactivation</span>
                  <span className="text-surface-900">{detailRow.assetDeactivation ?? '-'}</span>
                  <span className="text-surface-500">Payroll Cycle</span>
                  <span className="text-surface-900">{detailRow.payrollCycleCode ?? '-'}</span>
                </div>
              </div>

              {/* Review Info */}
              <div className="rounded-xl border border-surface-200 bg-surface-50/80 p-3">
                <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Review</p>
                <div className="grid grid-cols-2 gap-1.5 text-sm">
                  <span className="text-surface-500">Reviewed By</span>
                  <span className="text-surface-900">{detailRow.reviewedByName ?? '-'}</span>
                  <span className="text-surface-500">Review Note</span>
                  <span className="text-surface-900">{detailRow.reviewedNote ?? '-'}</span>
                </div>
              </div>

              {/* Reason */}
              {detailRow.reason && (
                <div className="rounded-xl border border-surface-200 bg-surface-50/80 p-3">
                  <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Reason</p>
                  <p className="text-sm text-surface-900">{detailRow.reason}</p>
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setDetailRow(null)}
                className="btn-secondary rounded-xl px-4 py-2"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
