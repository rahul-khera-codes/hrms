import { useEffect, useMemo, useState } from 'react'
import { CalendarCheck2, Lock, Unlock, Plus, Calendar, Clock3, Download, LayoutGrid, Table2, Search, ArrowUp, ArrowDown, Filter, Pencil, XCircle } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import {
  getAdminLeaveRequests,
  getLeaveReviewContext,
  reviewAdminLeaveRequest,
  createAdminLeaveRequest,
  setLeaveRequestLocked,
  getEmployees,
  getPayrollPeriods,
  type AdminLeaveRequest,
  type LeaveReviewContext,
  type EmployeeRecord,
  type PayrollPeriod,
} from '@/lib/apiAdmin'
import AdminSelect from '@/components/AdminSelect'
import { DetailModalHeader } from '@/components/DetailModalHeader'
import { SkeletonTableRows } from '@/components/Skeleton'
import { BulkActionBar } from '@/components/BulkActionBar'
import { useToast } from '@/components/Toast'

// Background+text pair for status pills assembled with inline-flex wrappers below.
// Prefer `statusBadgeClass(status)` from @/lib/badges for new code.
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
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')
  const [filterLeaveType, setFilterLeaveType] = useState<string>('all')
  const [search, setSearch] = useState('')
  // Per-column sort/filter (standard from 14APR2026 — "every table")
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({})
  const [filterOpen, setFilterOpen] = useState<string | null>(null)

  const leaveColAccessor = (r: AdminLeaveRequest, col: string): string | number => {
    switch (col) {
      case 'CMID': return r.employeeCmid ?? 0
      case 'Employee Name': return r.employeeName.toLowerCase()
      case 'Account': return (r.accountName ?? '').toLowerCase()
      case 'Leave Type': return (CATEGORY_LABELS[r.leaveCategory ?? ''] || r.leaveCategory || '').toLowerCase()
      case 'Approval Status': return r.status
      case 'Calculation': return (r.leaveCalculationType ?? '').toLowerCase()
      case 'Start Date': return r.startDate ?? ''
      case 'End Date': return r.endDate ?? ''
      case 'Days Off': return (r.leaveAssociateDaysOff ?? '').toLowerCase()
      case 'Return Date': return r.returnDate ?? ''
      case 'Payable Days': return r.leavePayableDays ?? 0
      case 'Daily Salary': return r.dailySalary ?? 0
      case 'Payable Amount': return r.leavePayableAmount ?? 0
      case 'Payroll Cycle': return (r.payrollCycleCode ?? '').toLowerCase()
      default: return ''
    }
  }

  function handleLeaveSort(col: string) {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortCol(col); setSortDir('asc') }
  }
  function handleLeaveColumnFilter(col: string, value: string) {
    setColumnFilters((prev) => ({ ...prev, [col]: value }))
  }
  const toast = useToast()
  // Keep `setNotice` API for minimal migration churn — auto-detect error vs success
  // by message content. Any string starting with "Could not", "Failed", contains "must",
  // or "No eligible" is treated as an error/warning.
  const setNotice = (msg: string) => {
    const m = String(msg ?? '').trim()
    if (!m) return
    const lower = m.toLowerCase()
    if (lower.startsWith('could not') || lower.startsWith('failed') || lower.includes(' failed') || lower.includes('error')) {
      toast.error(m)
    } else if (lower.includes('must ') || lower.includes('no eligible') || lower.includes('missing ')) {
      toast.warning(m)
    } else {
      toast.success(m)
    }
  }
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [reviewContext, setReviewContext] = useState<LeaveReviewContext | null>(null)
  const [contextLoading, setContextLoading] = useState(false)
  const [reviewStatus, setReviewStatus] = useState<'approved' | 'rejected'>('approved')
  const [reviewNote, setReviewNote] = useState('')
  const [calculationType, setCalculationType] = useState<LeaveCalcType>('hourly_salary')
  const [payableDaysInput, setPayableDaysInput] = useState('0')
  const [saving, setSaving] = useState(false)
  const [reviewLocked, setReviewLocked] = useState(false)

  // View mode and detail modal
  const [viewMode, setViewMode] = useState<'card' | 'table'>('table')
  const [detailRow, setDetailRow] = useState<AdminLeaveRequest | null>(null)

  // Bulk selection (table view only)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkSaving, setBulkSaving] = useState(false)
  function clearSelection() { setSelectedIds(new Set()) }
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

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

  const summary = useMemo(() => {
    return {
      total: allRows.length,
      pending: allRows.filter((r) => r.status === 'pending').length,
      approved: allRows.filter((r) => r.status === 'approved').length,
      rejected: allRows.filter((r) => r.status === 'rejected').length,
    }
  }, [allRows])

  // Apply client-side search + leave-type filter + per-column filters + sort
  const displayedRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    let result = rows.filter((r) => {
      if (filterLeaveType !== 'all' && r.leaveCategory !== filterLeaveType) return false
      if (!q) return true
      return (
        r.employeeName.toLowerCase().includes(q) ||
        (r.employeeCmid != null && String(r.employeeCmid).includes(q)) ||
        (r.accountName ?? '').toLowerCase().includes(q)
      )
    })
    // Per-column filters
    for (const [col, val] of Object.entries(columnFilters)) {
      if (!val) continue
      const lower = val.toLowerCase()
      result = result.filter((r) => String(leaveColAccessor(r, col)).toLowerCase().includes(lower))
    }
    // Sort
    if (sortCol) {
      result = [...result].sort((a, b) => {
        const av = leaveColAccessor(a, sortCol)
        const bv = leaveColAccessor(b, sortCol)
        if (typeof av === 'number' && typeof bv === 'number') {
          return sortDir === 'asc' ? av - bv : bv - av
        }
        const cmp = String(av).localeCompare(String(bv))
        return sortDir === 'asc' ? cmp : -cmp
      })
    }
    return result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, search, filterLeaveType, columnFilters, sortCol, sortDir])

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
    setReviewLocked(row.isLocked ?? false)
    // Default to the row's existing decision so re-review is a diff, not a reset.
    setReviewStatus(row.status === 'rejected' ? 'rejected' : 'approved')
    setReviewNote(row.reviewedNote ?? '')
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
        // Prefer the previously-saved payable days when re-reviewing; fall back to suggested.
        const existingPD = ctx.leave.payableDays
        setPayableDaysInput(
          existingPD != null && Number.isFinite(existingPD)
            ? String(existingPD)
            : String(ctx.suggestedPayableDays)
        )
        // Also pick up saved note if row snapshot didn't have it.
        if (!row.reviewedNote && ctx.leave.reviewedNote) {
          setReviewNote(ctx.leave.reviewedNote)
        }
      })
      .catch(() => {
        setNotice('Could not load review details.')
        setReviewingId(null)
      })
      .finally(() => setContextLoading(false))
  }

  async function bulkSetLocked(locked: boolean) {
    if (selectedIds.size === 0) return
    setBulkSaving(true)
    let ok = 0
    let failed = 0
    for (const id of Array.from(selectedIds)) {
      try {
        await setLeaveRequestLocked(id, locked)
        ok++
      } catch {
        failed++
      }
    }
    setBulkSaving(false)
    setNotice(failed === 0
      ? `${ok} request${ok === 1 ? '' : 's'} ${locked ? 'locked' : 'unlocked'}.`
      : `${ok} updated, ${failed} failed.`)
    clearSelection()
    await load(false)
  }

  async function bulkReject() {
    if (selectedIds.size === 0) return
    const eligibleIds = Array.from(selectedIds).filter((id) => {
      const row = rows.find((r) => r.id === id)
      return row && !row.isLocked && row.status !== 'rejected'
    })
    if (eligibleIds.length === 0) {
      setNotice('No eligible requests selected (locked or already rejected).')
      return
    }
    setBulkSaving(true)
    let ok = 0
    let failed = 0
    for (const id of eligibleIds) {
      try {
        await reviewAdminLeaveRequest(id, { status: 'rejected', reviewedNote: 'Bulk rejected' })
        ok++
      } catch {
        failed++
      }
    }
    setBulkSaving(false)
    setNotice(failed === 0
      ? `${ok} request${ok === 1 ? '' : 's'} rejected.`
      : `${ok} rejected, ${failed} failed.`)
    clearSelection()
    await load(false)
  }

  async function handleToggleLock(id: string, currentlyLocked: boolean) {
    try {
      await setLeaveRequestLocked(id, !currentlyLocked)
      setNotice(currentlyLocked ? 'Leave unlocked.' : 'Leave locked.')
      await load(false)
      if (detailRow && detailRow.id === id) {
        setDetailRow((prev) => (prev ? { ...prev, isLocked: !currentlyLocked } : prev))
      }
      // Update the review modal's lock state in real-time
      if (reviewingId === id) {
        setReviewLocked(!currentlyLocked)
      }
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as Error).message) : 'Failed to toggle lock.'
      setNotice(msg)
    }
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
    if (!displayedRows.length) return
    const headers = [
      'CMID',
      'Employee Name',
      'Account',
      'Leave Type',
      'Approval Status',
      'Calculation',
      'Start Date',
      'End Date',
      'Days Off',
      'Return Date',
      'Payable Days',
      'Daily Salary',
      'Payable Amount',
      'Payroll Cycle',
    ]
    const csvRows = displayedRows.map((r) => [
      r.employeeCmid != null ? String(r.employeeCmid) : '',
      r.employeeName,
      r.accountName ?? '',
      CATEGORY_LABELS[r.leaveCategory ?? ''] || r.leaveCategory || '',
      r.status,
      r.leaveCalculationType === 'non_payable' ? 'Non Payable' : r.leaveCalculationType === 'hourly_salary' ? 'Hourly Salary' : r.leaveCalculationType === 'monthly_salary' ? 'Monthly Salary' : '',
      r.startDate ?? '',
      r.endDate ?? '',
      r.leaveAssociateDaysOff ?? '',
      r.returnDate ?? '',
      r.leavePayableDays != null ? String(r.leavePayableDays) : '',
      r.dailySalary != null ? r.dailySalary.toFixed(2) : '',
      r.leavePayableAmount != null ? r.leavePayableAmount.toFixed(2) : '',
      r.payrollCycleCode ?? '',
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
    <div className="page overflow-x-hidden">
      <PageHeader
        title="Leave requests"
        subtitle="Review and approve employee leave requests."
        icon={<CalendarCheck2 className="w-5 h-5" />}
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
            <button type="button" onClick={() => setShowCreateModal(true)} className="btn-primary">
              <Plus className="w-4 h-4" />
              New Leave
            </button>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="stat-card">
          <p className="stat-label">Total</p>
          <p className="stat-value">{summary.total}</p>
        </div>
        <div className="stat-card border-amber-200/70 bg-amber-50/40">
          <p className="stat-label text-amber-700">Pending</p>
          <p className="stat-value">{summary.pending}</p>
        </div>
        <div className="stat-card border-emerald-200/70 bg-emerald-50/40">
          <p className="stat-label text-emerald-700">Approved</p>
          <p className="stat-value">{summary.approved}</p>
        </div>
        <div className="stat-card border-red-200/70 bg-red-50/40">
          <p className="stat-label text-red-700">Rejected</p>
          <p className="stat-value">{summary.rejected}</p>
        </div>
      </div>

      <div className="toolbar">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 shrink-0" />
          <input
            type="text"
            placeholder="Search by employee, CMID, or account"
            className="input pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-44">
          <AdminSelect
            value={filterLeaveType}
            onChange={(val) => setFilterLeaveType(val)}
            options={[
              { value: 'all', label: 'All leave types' },
              ...leaveCategoryOptions.map((opt) => ({ value: opt.value, label: opt.label })),
            ]}
          />
        </div>
        <div className="w-full sm:w-44">
          <AdminSelect
            value={filterStatus}
            onChange={(val) => setFilterStatus(val as 'all' | 'pending' | 'approved' | 'rejected')}
            options={[
              { value: 'all', label: 'All status' },
              { value: 'pending', label: 'Pending' },
              { value: 'approved', label: 'Approved' },
              { value: 'rejected', label: 'Rejected' },
            ]}
          />
        </div>
        <div className="flex items-center gap-2 sm:ml-auto">
          <div className="segmented">
            <button
              type="button"
              onClick={() => setViewMode('card')}
              className={`segmented-item ${viewMode === 'card' ? 'segmented-item-active' : ''}`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Card
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`segmented-item ${viewMode === 'table' ? 'segmented-item-active' : ''}`}
            >
              <Table2 className="w-3.5 h-3.5" />
              Table
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl sm:rounded-2xl border border-surface-200/80 bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <tbody>
                <SkeletonTableRows rows={6} cols={6} />
              </tbody>
            </table>
          </div>
        ) : displayedRows.length === 0 ? (
          <div className="p-8 text-center text-surface-500 text-sm">
            {search ? 'No matches for your search.' : 'No leave requests found.'}
          </div>
        ) : viewMode === 'card' ? (
          <ul className="p-3 sm:p-4 grid grid-cols-1 gap-3">
            {displayedRows.map((r) => (
              <li
                key={r.id}
                className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 sm:p-5 rounded-xl border border-surface-200/80 bg-white transition-all hover:shadow-md hover:border-brand-200/80 cursor-pointer"
                onClick={() => (r.isLocked ? setDetailRow(r) : openReview(r))}
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
                  {r.isLocked && (
                    <span className="badge-neutral" title="Locked"><Lock className="w-3 h-3" /> Locked</span>
                  )}
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[r.status] || 'bg-surface-100 text-surface-600'}`}
                  >
                    {r.status}
                  </span>
                  {r.status === 'pending' && !r.isLocked && (
                    <button type="button" onClick={(e) => { e.stopPropagation(); openReview(r) }} className="btn-secondary rounded-xl px-3 py-2 text-xs">
                      Review
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="overflow-x-auto scroll-fade-x">
            <table className="min-w-[1600px] w-full text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-surface-50 border-b border-surface-200">
                <tr>
                  <th className="px-3 py-1.5 w-10 border-b border-surface-200">
                    <input
                      type="checkbox"
                      aria-label="Select all visible"
                      className="w-3.5 h-3.5 rounded border-surface-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                      checked={displayedRows.length > 0 && displayedRows.every((r) => selectedIds.has(r.id))}
                      ref={(el) => {
                        if (!el) return
                        const total = displayedRows.length
                        const sel = displayedRows.filter((r) => selectedIds.has(r.id)).length
                        el.indeterminate = sel > 0 && sel < total
                      }}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedIds(new Set(displayedRows.map((r) => r.id)))
                        else clearSelection()
                      }}
                    />
                  </th>
                  {[
                    'CMID',
                    'Employee Name',
                    'Account',
                    'Leave Type',
                    'Approval Status',
                    'Calculation',
                    'Start Date',
                    'End Date',
                    'Days Off',
                    'Return Date',
                    'Payable Days',
                    'Daily Salary',
                    'Payable Amount',
                    'Payroll Cycle',
                    'Actions',
                  ].map((col) => (
                    <th
                      key={col}
                      className={`px-3 py-1.5 text-[10px] font-semibold text-surface-500 uppercase tracking-wider whitespace-nowrap border-b border-surface-200 ${['Payable Days', 'Daily Salary', 'Payable Amount'].includes(col) ? 'text-right' : col === 'Actions' ? 'text-right' : ''}`}
                    >
                      {col === 'Actions' ? col : (
                        <>
                          <div className="flex items-center gap-0.5">
                            <button type="button" className="flex items-center gap-0.5 hover:text-surface-700 transition-colors" onClick={() => handleLeaveSort(col)}>
                              {col}
                              {sortCol === col && (sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                            </button>
                            <button type="button" className={`p-0.5 rounded hover:bg-surface-200/60 transition-colors ${columnFilters[col] ? 'text-brand-600' : 'text-surface-400'}`} onClick={(e) => { e.stopPropagation(); setFilterOpen(filterOpen === col ? null : col) }}>
                              <Filter className="w-2.5 h-2.5" />
                            </button>
                          </div>
                          {filterOpen === col && (
                            <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                              <input type="text" value={columnFilters[col] ?? ''} onChange={(e) => handleLeaveColumnFilter(col, e.target.value)} placeholder={`Filter ${col}...`} className="w-full text-[10px] font-normal normal-case tracking-normal border border-surface-200 rounded px-1.5 py-1 bg-white focus:ring-1 focus:ring-brand-300 outline-none" autoFocus />
                            </div>
                          )}
                        </>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayedRows.map((r) => (
                  <tr
                    key={r.id}
                    className={`border-b border-surface-100 hover:bg-brand-50/40 transition-colors cursor-pointer group ${selectedIds.has(r.id) ? 'bg-brand-50/30' : ''}`}
                    onClick={() => (r.isLocked ? setDetailRow(r) : openReview(r))}
                  >
                    <td className="px-3 py-2 w-10" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${r.employeeName}`}
                        className="w-3.5 h-3.5 rounded border-surface-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                        checked={selectedIds.has(r.id)}
                        onChange={() => toggleSelect(r.id)}
                      />
                    </td>
                    <td className="px-3 py-2 text-xs font-mono text-surface-700 tabular-nums whitespace-nowrap">{r.employeeCmid ?? '-'}</td>
                    <td className="px-3 py-2 text-xs font-medium text-surface-900 whitespace-nowrap">{r.employeeName}</td>
                    <td className="px-3 py-2 text-xs text-surface-700 whitespace-nowrap">{r.accountName ?? '-'}</td>
                    <td className="px-3 py-2 text-xs text-surface-700 whitespace-nowrap">{CATEGORY_LABELS[r.leaveCategory ?? ''] || r.leaveCategory || '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusColors[r.status] || 'bg-surface-100 text-surface-600'}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-surface-700 whitespace-nowrap">
                      {r.leaveCalculationType === 'non_payable' ? 'Non Payable' : r.leaveCalculationType === 'hourly_salary' ? 'Hourly Salary' : r.leaveCalculationType === 'monthly_salary' ? 'Monthly Salary' : '-'}
                    </td>
                    <td className="px-3 py-2 text-xs font-mono text-surface-700 tabular-nums whitespace-nowrap">{r.startDate ?? ''}{r.startTime ? ` ${r.startTime}` : ''}</td>
                    <td className="px-3 py-2 text-xs font-mono text-surface-700 tabular-nums whitespace-nowrap">{r.endDate ?? ''}{r.endTime ? ` ${r.endTime}` : ''}</td>
                    <td className="px-3 py-2 text-xs text-surface-700 whitespace-nowrap">{r.leaveAssociateDaysOff ?? '-'}</td>
                    <td className="px-3 py-2 text-xs font-mono text-surface-700 tabular-nums whitespace-nowrap">{r.returnDate ?? ''}{r.returnTime ? ` ${r.returnTime}` : ''}</td>
                    <td className="px-3 py-2 text-xs text-surface-700 tabular-nums whitespace-nowrap text-right">{r.leavePayableDays != null ? r.leavePayableDays : '-'}</td>
                    <td className="px-3 py-2 text-xs text-surface-700 tabular-nums whitespace-nowrap text-right font-medium">{r.dailySalary != null ? `$${r.dailySalary.toFixed(2)}` : '-'}</td>
                    <td className={`px-3 py-2 text-xs tabular-nums whitespace-nowrap text-right font-semibold ${r.leavePayableAmount != null && r.leavePayableAmount > 0 ? 'text-brand-700' : 'text-surface-400'}`}>
                      {r.leavePayableAmount != null ? `$${r.leavePayableAmount.toFixed(2)}` : '-'}
                    </td>
                    <td className="px-3 py-2 text-xs font-mono text-surface-700 tabular-nums whitespace-nowrap">{r.payrollCycleCode ?? '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => (r.isLocked ? setDetailRow(r) : openReview(r))}
                        className="p-1.5 rounded-lg text-surface-500 hover:bg-surface-100"
                        title={r.isLocked ? 'View (locked)' : 'Edit / review'}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </td>
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
          <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-surface-200 bg-white shadow-xl">
            {/* Employee header — matches attendance modal layout */}
            {(() => {
              const reviewRow = rows.find((r) => r.id === reviewingId)
              return (
                <div className="sticky top-0 z-10 bg-white rounded-t-2xl">
                  <DetailModalHeader
                    employeeName={reviewContext?.leave.employeeName ?? reviewRow?.employeeName ?? ''}
                    cmid={reviewRow?.employeeCmid}
                    reportsTo={reviewRow?.reportsTo}
                    onClose={() => { setReviewingId(null); setReviewContext(null) }}
                    extra={
                      reviewContext && reviewContext.leave.status !== 'pending' ? (
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${statusColors[reviewContext.leave.status] || 'bg-surface-100 text-surface-600'}`}>
                          {reviewContext.leave.status}
                        </span>
                      ) : null
                    }
                  />
                </div>
              )
            })()}

            {contextLoading || !reviewContext ? (
              <div className="py-10 text-center text-sm text-surface-500">Loading details…</div>
            ) : (
              <>
                {reviewLocked && (
                  <div className="mx-5 mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-3 flex items-center gap-2 text-amber-800">
                    <Lock className="w-4 h-4 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">This record is locked</p>
                      <p className="text-[11px] opacity-80">Unlock it from the bottom to make changes.</p>
                    </div>
                  </div>
                )}
                {reviewContext.leave.status !== 'pending' && !reviewLocked ? (
                  <div className="mx-5 mt-4 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-800">
                    Re-reviewing an already <strong className="capitalize">{reviewContext.leave.status}</strong> request. Saving will overwrite the existing decision.
                  </div>
                ) : null}
                <div className="mx-5 mt-4 rounded-xl border border-surface-200 bg-surface-50/80 p-3 text-sm">
                  <p className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider mb-3">Leave Info</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
                    {reviewContext.leave.leaveCategory ? (
                      <div>
                        <p className="text-[10px] font-medium text-surface-400 uppercase">Leave Type</p>
                        <p className="font-medium text-surface-900 mt-0.5">{CATEGORY_LABELS[reviewContext.leave.leaveCategory] || reviewContext.leave.leaveCategory}</p>
                      </div>
                    ) : null}
                    <div>
                      <p className="text-[10px] font-medium text-surface-400 uppercase">Type</p>
                      <p className="font-medium text-surface-900 mt-0.5">{reviewContext.leave.leaveType === 'paid' ? 'Paid' : 'Unpaid'}</p>
                    </div>
                    {reviewContext.leave.calculationType ? (
                      <div>
                        <p className="text-[10px] font-medium text-surface-400 uppercase">Calculation</p>
                        <p className="font-medium text-surface-900 mt-0.5">
                          {reviewContext.leave.calculationType === 'non_payable' ? 'Non Payable' : reviewContext.leave.calculationType === 'hourly_salary' ? 'Hourly Salary' : 'Monthly Salary'}
                        </p>
                      </div>
                    ) : null}
                    {reviewContext.leave.associateDaysOff ? (
                      <div>
                        <p className="text-[10px] font-medium text-surface-400 uppercase">Days Off</p>
                        <p className="font-medium text-surface-900 mt-0.5">{reviewContext.leave.associateDaysOff}</p>
                      </div>
                    ) : null}
                    <div>
                      <p className="text-[10px] font-medium text-surface-400 uppercase">Salary</p>
                      <p className="font-medium text-surface-900 mt-0.5">{reviewContext.employee.salaryType} · base ${reviewContext.employee.baseSalary.toFixed(2)}</p>
                    </div>
                    <div className="col-span-2 sm:col-span-3">
                      <p className="text-[10px] font-medium text-surface-400 uppercase">Period</p>
                      <p className="font-medium text-surface-900 tabular-nums mt-0.5">
                        {reviewContext.leave.startDate}{reviewContext.leave.startTime ? ` ${reviewContext.leave.startTime}` : ''}
                        <span className="text-surface-400 mx-1.5">&rarr;</span>
                        {reviewContext.leave.endDate}{reviewContext.leave.endTime ? ` ${reviewContext.leave.endTime}` : ''}
                      </p>
                    </div>
                    {reviewContext.leave.returnDate ? (
                      <div>
                        <p className="text-[10px] font-medium text-surface-400 uppercase">Return Date</p>
                        <p className="font-medium text-surface-900 tabular-nums mt-0.5">{reviewContext.leave.returnDate}{reviewContext.leave.returnTime ? ` ${reviewContext.leave.returnTime}` : ''}</p>
                      </div>
                    ) : null}
                  </div>
                  {reviewContext.leave.reason ? (
                    <p className="text-xs text-surface-600 pt-2 mt-3 border-t border-surface-200/80">{reviewContext.leave.reason}</p>
                  ) : null}
                </div>

                <div className={`mx-5 mt-4 space-y-3 ${reviewLocked ? 'opacity-50 pointer-events-none' : ''}`}>
                  <AdminSelect
                    value={reviewStatus}
                    onChange={(val) => setReviewStatus(val as 'approved' | 'rejected')}
                    disabled={reviewLocked}
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
                              disabled={reviewLocked}
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
                              disabled={reviewLocked}
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
                    disabled={reviewLocked}
                    className="input w-full rounded-xl"
                    placeholder="Optional note"
                  />
                </div>
              </>
            )}

            {/* Lock toggle — same pattern as attendance modal */}
            {reviewingId && (
              <div className="mx-5 mt-4 flex items-center justify-between rounded-xl border border-surface-200 bg-surface-50 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-surface-900 flex items-center gap-2">
                    {reviewLocked ? <Lock className="w-4 h-4 text-amber-600" /> : <Unlock className="w-4 h-4 text-surface-400" />}
                    {reviewLocked ? 'Record is locked' : 'Record is editable'}
                  </p>
                  <p className="text-[11px] text-surface-500 mt-0.5">
                    Locking prevents further changes until an admin unlocks it.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleToggleLock(reviewingId, reviewLocked)}
                  className={reviewLocked ? 'btn-secondary btn-sm' : 'btn-danger btn-sm'}
                  disabled={saving}
                >
                  {reviewLocked ? <><Unlock className="w-3.5 h-3.5" /> Unlock</> : <><Lock className="w-3.5 h-3.5" /> Lock</>}
                </button>
              </div>
            )}

            <div className="mx-5 mt-4 mb-5 flex flex-col-reverse sm:flex-row justify-end gap-2">
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
                disabled={saving || contextLoading || !reviewContext || reviewLocked}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal (for locked records — shows info + Unlock button) */}
      {detailRow && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={() => setDetailRow(null)}
            aria-label="Close"
          />
          <div className="relative z-10 w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-surface-200 bg-white shadow-xl">
            {/* Client standard header (14APR2026): Name + CMID + Reports To */}
            <div className="sticky top-0 z-10 bg-white rounded-t-2xl">
              <DetailModalHeader
                employeeName={detailRow.employeeName}
                cmid={detailRow.employeeCmid}
                reportsTo={detailRow.reportsTo}
                onClose={() => setDetailRow(null)}
                extra={
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${statusColors[detailRow.status] || 'bg-surface-100 text-surface-600'}`}>
                    {detailRow.status}
                  </span>
                }
              />
            </div>

            <div className="p-5 space-y-4">
              {/* Leave Info */}
              <div className="rounded-xl border border-surface-200 bg-surface-50 p-4">
                <p className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider mb-3">Leave Info</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 text-sm">
                  <div>
                    <p className="text-[10px] font-medium text-surface-400 uppercase">Leave Type</p>
                    <p className="font-medium text-surface-900 mt-0.5">{CATEGORY_LABELS[detailRow.leaveCategory ?? ''] || detailRow.leaveCategory || '-'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium text-surface-400 uppercase">Calculation</p>
                    <p className="font-medium text-surface-900 mt-0.5">
                      {detailRow.leaveCalculationType === 'non_payable' ? 'Non Payable' : detailRow.leaveCalculationType === 'hourly_salary' ? 'Hourly Salary' : detailRow.leaveCalculationType === 'monthly_salary' ? 'Monthly Salary' : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium text-surface-400 uppercase">Days Off</p>
                    <p className="font-medium text-surface-900 mt-0.5">{detailRow.leaveAssociateDaysOff ?? '-'}</p>
                  </div>
                  <div className="col-span-2 sm:col-span-3">
                    <p className="text-[10px] font-medium text-surface-400 uppercase">Period</p>
                    <p className="font-medium text-surface-900 tabular-nums mt-0.5">
                      {detailRow.startDate ?? '-'}{detailRow.startTime ? ` ${detailRow.startTime}` : ''}
                      <span className="text-surface-400 mx-1.5">&rarr;</span>
                      {detailRow.endDate ?? '-'}{detailRow.endTime ? ` ${detailRow.endTime}` : ''}
                    </p>
                  </div>
                  {detailRow.returnDate && (
                    <div>
                      <p className="text-[10px] font-medium text-surface-400 uppercase">Return Date</p>
                      <p className="font-medium text-surface-900 tabular-nums mt-0.5">{detailRow.returnDate}{detailRow.returnTime ? ` ${detailRow.returnTime}` : ''}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Pay Details - highlighted card for payable leaves */}
              {detailRow.leaveCalculationType !== 'non_payable' && detailRow.leavePayableAmount != null && detailRow.leavePayableAmount > 0 ? (
                <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-4">
                  <p className="text-[10px] font-semibold text-brand-500 uppercase tracking-wider mb-3">Pay Details</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-lg bg-white/80 border border-brand-100 p-2.5 text-center">
                      <p className="text-[10px] font-medium text-surface-400 uppercase">Calculation</p>
                      <p className="text-xs font-semibold text-surface-900 mt-1">
                        {detailRow.leaveCalculationType === 'hourly_salary' ? 'Hourly' : detailRow.leaveCalculationType === 'monthly_salary' ? 'Monthly' : '-'}
                      </p>
                    </div>
                    <div className="rounded-lg bg-white/80 border border-brand-100 p-2.5 text-center">
                      <p className="text-[10px] font-medium text-surface-400 uppercase">Payable Days</p>
                      <p className="text-xs font-semibold text-surface-900 tabular-nums mt-1">{detailRow.leavePayableDays ?? '-'}</p>
                    </div>
                    <div className="rounded-lg bg-white/80 border border-brand-100 p-2.5 text-center">
                      <p className="text-[10px] font-medium text-surface-400 uppercase">Daily Salary</p>
                      <p className="text-xs font-semibold text-surface-900 tabular-nums mt-1">{detailRow.dailySalary != null ? `$${detailRow.dailySalary.toFixed(2)}` : '-'}</p>
                    </div>
                    <div className="rounded-lg bg-white/80 border border-brand-100 p-2.5 text-center">
                      <p className="text-[10px] font-medium text-surface-400 uppercase">Payable Amount</p>
                      <p className="text-sm font-bold text-brand-700 tabular-nums mt-1">{detailRow.leavePayableAmount != null ? `$${detailRow.leavePayableAmount.toFixed(2)}` : '-'}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-surface-200 bg-surface-50 p-4">
                  <p className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider mb-2">Pay Details</p>
                  <p className="text-xs text-surface-500">
                    {detailRow.leaveCalculationType === 'non_payable' ? 'Non Payable' : 'No pay amount recorded'}
                  </p>
                </div>
              )}

              {/* Additional */}
              <div className="rounded-xl border border-surface-200 bg-surface-50 p-4">
                <p className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider mb-3">Additional</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2.5 text-sm">
                  <div>
                    <p className="text-[10px] font-medium text-surface-400 uppercase">Asset Deactivation</p>
                    <p className="font-medium text-surface-900 mt-0.5">{detailRow.assetDeactivation ?? '-'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium text-surface-400 uppercase">Payroll Cycle</p>
                    <p className="font-medium text-surface-900 mt-0.5">{detailRow.payrollCycleCode ?? '-'}</p>
                  </div>
                  {detailRow.reason && (
                    <div className="col-span-2 sm:col-span-3">
                      <p className="text-[10px] font-medium text-surface-400 uppercase">Reason</p>
                      <p className="text-surface-700 mt-0.5 leading-relaxed">{detailRow.reason}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Review */}
              <div className={`rounded-xl border p-4 ${detailRow.status === 'approved' ? 'border-emerald-200 bg-emerald-50/50' : detailRow.status === 'rejected' ? 'border-red-200 bg-red-50/50' : 'border-surface-200 bg-surface-50'}`}>
                <p className={`text-[10px] font-semibold uppercase tracking-wider mb-3 ${detailRow.status === 'approved' ? 'text-emerald-500' : detailRow.status === 'rejected' ? 'text-red-500' : 'text-surface-400'}`}>Review</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
                  <div>
                    <p className="text-[10px] font-medium text-surface-400 uppercase">Reviewed By</p>
                    <p className="font-medium text-surface-900 mt-0.5">{detailRow.reviewedByName ?? '-'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium text-surface-400 uppercase">Review Note</p>
                    <p className="text-surface-700 mt-0.5">{detailRow.reviewedNote ?? '-'}</p>
                  </div>
                </div>
              </div>

              {/* Locked banner + Unlock action */}
              {detailRow.isLocked && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-amber-800">
                    <Lock className="w-4 h-4 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold">Record locked</p>
                      <p className="text-xs opacity-80">No further changes can be made until unlocked.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleToggleLock(detailRow.id, true)}
                    className="btn-secondary btn-sm shrink-0"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    Unlock
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <BulkActionBar count={selectedIds.size} onClear={clearSelection}>
        <button
          type="button"
          onClick={() => void bulkSetLocked(true)}
          disabled={bulkSaving}
          className="btn-secondary btn-sm"
          title="Lock selected"
        >
          <Lock className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Lock</span>
        </button>
        <button
          type="button"
          onClick={() => void bulkSetLocked(false)}
          disabled={bulkSaving}
          className="btn-secondary btn-sm"
          title="Unlock selected"
        >
          <Unlock className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Unlock</span>
        </button>
        <button
          type="button"
          onClick={() => void bulkReject()}
          disabled={bulkSaving}
          className="btn-danger btn-sm"
          title="Reject selected (skips locked / already-rejected)"
        >
          <XCircle className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Reject</span>
        </button>
      </BulkActionBar>
    </div>
  )
}
